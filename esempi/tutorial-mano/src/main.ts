import "./style.css";
import { DrawingUtils } from "@mediapipe/tasks-vision";
import { CameraError, startCamera, stopCamera } from "./camera";
import { LandmarkSmoother } from "./filter";
import { HandScene, type Side } from "./hand3d";
import { GESTURE_LABELS, HAND_CONNECTIONS, HandTracker } from "./tracker";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  scene: $<HTMLCanvasElement>("scene"),
  intro: $("intro"),
  start: $<HTMLButtonElement>("start"),
  error: $("error"),
  status: $("status"),
  preview: $("preview"),
  video: $<HTMLVideoElement>("video"),
  overlay: $<HTMLCanvasElement>("overlay"),
  hud: $("hud"),
  gestures: $("gestures"),
  fps: $("fps"),
  togglePreview: $<HTMLButtonElement>("toggle-preview"),
  stop: $<HTMLButtonElement>("stop"),
};

type State = "idle" | "loading" | "running" | "error";

const scene = new HandScene(ui.scene);
const overlayCtx = ui.overlay.getContext("2d")!;
const drawing = new DrawingUtils(overlayCtx);

/** One anti-jitter filter per side, `null` when that hand is not in view. */
const smoothers: Record<Side, LandmarkSmoother | null> = { Right: null, Left: null };

/** A hand appears only after three consecutive detections (avoids ghost hands). */
const CONFIRM_FRAMES = 3;
const streak: Record<Side, number> = { Right: 0, Left: 0 };

/** With `?e2e` in the address the page exposes its state in the DOM, for automatic tests. */
const E2E = new URLSearchParams(location.search).has("e2e");

let tracker: HandTracker | null = null;
let stream: MediaStream | null = null;
let rafId = 0;
let lastVideoTime = -1;
let frames = 0;
let fpsWindowStart = performance.now();

function setState(state: State, status: string): void {
  document.body.dataset.state = state;
  ui.status.textContent = status;
  ui.status.classList.toggle("live", state === "running");
  ui.intro.hidden = state === "running";
  ui.hud.hidden = state !== "running";
  ui.preview.hidden = state !== "running" || ui.togglePreview.getAttribute("aria-pressed") !== "true";
  ui.start.disabled = state === "loading";
  ui.start.textContent = state === "loading" ? "Starting..." : "Turn on the camera";
}

/**
 * MediaPipe assumes the image is ALREADY MIRRORED, like in a video call. The raw webcam frame
 * is not, so its Left/Right label must be flipped.
 */
function realSide(label: string | undefined): Side {
  return label === "Left" ? "Right" : "Left";
}

function loop(): void {
  rafId = requestAnimationFrame(loop);
  const video = ui.video;

  // readyState >= 2 means "there is data for the current frame".
  if (tracker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();

    const result = tracker.detect(video, now); // the recognition

    // The overlay canvas has the REAL video size; the CSS then shrinks it.
    if (ui.overlay.width !== video.videoWidth) {
      ui.overlay.width = video.videoWidth;
      ui.overlay.height = video.videoHeight;
    }
    overlayCtx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);

    const seen = new Set<Side>();
    const shown: Side[] = [];
    const shownGestures: string[] = [];
    const labels: string[] = [];

    result.landmarks.forEach((landmarks, i) => {
      let side = realSide(result.handedness[i]?.[0]?.categoryName);
      // Same side given twice (rare): the second goes to the other side.
      if (seen.has(side)) side = side === "Right" ? "Left" : "Right";
      seen.add(side);
      streak[side]++;

      // The filter also works during the confirmation frames.
      smoothers[side] ??= new LandmarkSmoother();
      const smoothed = smoothers[side]!.smooth(landmarks, now);
      if (streak[side] < CONFIRM_FRAMES) return;

      // 1) the 3D hand, with the points smoothed by the filter
      scene.update(side, smoothed);

      // 2) the 2D preview, with the RAW points: they must match the image exactly
      drawing.drawConnectors(landmarks, HAND_CONNECTIONS, { color: side === "Right" ? "#38bdf8" : "#f472b6", lineWidth: 3 });
      drawing.drawLandmarks(landmarks, { color: "#ffffff", radius: 2.5, lineWidth: 1 });

      // 3) the gesture name, if the model recognizes one ("None" = none of the known ones)
      const gesture = result.gestures[i]?.[0];
      shown.push(side);
      shownGestures.push(gesture?.categoryName ?? "None");
      const name = gesture && gesture.categoryName !== "None" ? GESTURE_LABELS[gesture.categoryName] : undefined;
      labels.push(`${side}: ${name ?? "hand"}`);
    });

    // Hands not seen in this frame fade out and their counters reset.
    for (const side of ["Right", "Left"] as Side[]) {
      if (!seen.has(side)) {
        streak[side] = 0;
        scene.update(side, null);
        smoothers[side] = null;
      }
    }

    if (E2E) {
      document.body.dataset.hands = String(shown.length);
      document.body.dataset.sides = shown.join(",");
      document.body.dataset.gestures = shownGestures.join(",");
      document.body.dataset.wrist = result.landmarks[0] ? result.landmarks[0][0].x.toFixed(3) : "";
    }

    ui.gestures.textContent = labels.length ? labels.join("   -   ") : "No hand in view";
    ui.gestures.classList.toggle("empty", labels.length === 0);

    frames++;
    if (now - fpsWindowStart >= 1000) {
      ui.fps.textContent = `${Math.round((frames * 1000) / (now - fpsWindowStart))} fps - ${tracker.delegate}`;
      frames = 0;
      fpsWindowStart = now;
    }
  }

  scene.render(); // always, even without new frames, so the fades stay smooth
  void fallbackToCpuIfSlow();
}

let switching = false;

/** Safety net: if the GPU is slow (average above 150 ms after 8 detections), switch to the CPU. */
async function fallbackToCpuIfSlow(): Promise<void> {
  if (!tracker || switching || tracker.delegate !== "GPU" || tracker.detections < 8 || tracker.avgDetectMs < 150) return;
  switching = true;
  const slow = tracker;
  tracker = null; // the loop skips detections until the new one is ready
  try {
    tracker = await HandTracker.create(true); // true = CPU only
    slow.close();
    console.info(`GPU too slow (${Math.round(slow.avgDetectMs)} ms): switching to the CPU`);
  } catch {
    tracker = slow;
  } finally {
    switching = false;
  }
}

async function start(): Promise<void> {
  ui.error.hidden = true;
  setState("loading", "Starting...");
  try {
    // ORDER MATTERS: first the model (heavy, ~8 MB, asks nothing from the user), then the webcam.
    tracker ??= await HandTracker.create();
    stream = await startCamera(ui.video, stop);

    if (document.hidden) {
      stop();
      return;
    }

    scene.setFrameAspect(ui.video.videoWidth / ui.video.videoHeight);
    lastVideoTime = -1;
    setState("running", "Camera on");
    cancelAnimationFrame(rafId); // never two loops in parallel
    loop();
  } catch (e) {
    stop();
    ui.error.textContent = e instanceof CameraError ? e.message : `Error while starting: ${(e as Error).message ?? e}`;
    ui.error.hidden = false;
    setState("error", "Camera off");
  }
}

function stop(): void {
  cancelAnimationFrame(rafId);
  stopCamera(ui.video, stream);
  stream = null;
  scene.update("Right", null);
  scene.update("Left", null);
  streak.Right = streak.Left = 0;
  smoothers.Right = smoothers.Left = null;
  ui.gestures.textContent = "";
  overlayCtx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
  if (E2E) {
    document.body.dataset.hands = "0";
    document.body.dataset.sides = "";
    document.body.dataset.gestures = "";
    document.body.dataset.wrist = "";
  }

  // The main loop is stopped, but the fade lasts a tenth of a second more: draw ~20 more frames.
  let n = 20;
  const fade = () => {
    scene.render();
    if (--n > 0) requestAnimationFrame(fade);
  };
  fade();
  setState("idle", "Camera off");
}

ui.start.addEventListener("click", () => void start());
ui.stop.addEventListener("click", stop);

ui.togglePreview.addEventListener("click", () => {
  const show = ui.togglePreview.getAttribute("aria-pressed") !== "true";
  ui.togglePreview.setAttribute("aria-pressed", String(show));
  ui.togglePreview.textContent = show ? "Hide camera" : "Show camera";
  ui.preview.hidden = !show;
});

// Tab in the background: the camera turns off (privacy).
document.addEventListener("visibilitychange", () => {
  if (document.hidden && stream) stop();
});

// Leaving the page: free the camera and the recognizer.
window.addEventListener("pagehide", () => {
  stop();
  tracker?.close();
  tracker = null;
});

scene.render(); // first draw: the canvas shows the background instead of waiting for the click
