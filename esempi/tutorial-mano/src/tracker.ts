import { FilesetResolver, GestureRecognizer, type GestureRecognizerResult } from "@mediapipe/tasks-vision";

// ONLINE EXAMPLE: runtime and model come from pinned public addresses, so the project works
// in StackBlitz without any download step. In the real site (the tutorial, chapter 3) the
// same two files are served by the site itself from /mediapipe/ (see scripts/prepare-assets.mjs
// in the main repository), because its CSP only allows requests to its own domain.
const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

export type Delegate = "GPU" | "CPU";

export class HandTracker {
  private lastTimestamp = -1;
  avgDetectMs = 0;
  detections = 0;

  private readonly recognizer: GestureRecognizer;
  readonly delegate: Delegate;

  private constructor(recognizer: GestureRecognizer, delegate: Delegate) {
    this.recognizer = recognizer;
    this.delegate = delegate;
  }

  static async create(onlyCpu = false): Promise<HandTracker> {
    // `?delegate=cpu` in the address forces the CPU: useful to diagnose without touching the code.
    const forceCpu = onlyCpu || new URLSearchParams(location.search).get("delegate")?.toLowerCase() === "cpu";
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    const options = (delegate: Delegate) => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: "VIDEO" as const,
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    if (forceCpu) return new HandTracker(await GestureRecognizer.createFromOptions(vision, options("CPU")), "CPU");
    try {
      return new HandTracker(await GestureRecognizer.createFromOptions(vision, options("GPU")), "GPU");
    } catch {
      // No usable WebGL: the CPU is slower but works everywhere.
      return new HandTracker(await GestureRecognizer.createFromOptions(vision, options("CPU")), "CPU");
    }
  }

  detect(video: HTMLVideoElement, now: number): GestureRecognizerResult {
    // MediaPipe stops with an error if it receives a time equal to or lower than the last one.
    const ts = now > this.lastTimestamp ? now : this.lastTimestamp + 1;
    this.lastTimestamp = ts;

    const t0 = performance.now();
    const result = this.recognizer.recognizeForVideo(video, ts);
    const ms = performance.now() - t0;

    // Exponential moving average of the detection time.
    this.detections++;
    this.avgDetectMs = this.detections === 1 ? ms : this.avgDetectMs * 0.8 + ms * 0.2;
    return result;
  }

  /** Frees the memory and the graphics context of the WebAssembly. */
  close(): void {
    this.recognizer.close();
  }
}

/** The code reasons in English, the interface speaks the user's language. */
export const GESTURE_LABELS: Record<string, string> = {
  Closed_Fist: "Fist",
  Open_Palm: "Open hand",
  Pointing_Up: "Pointing up",
  Thumb_Down: "Thumbs down",
  Thumb_Up: "Thumbs up",
  Victory: "Victory",
  ILoveYou: "I love you",
};

/** The 21 pairs of points to join to draw the hand skeleton, as given by MediaPipe. */
export const HAND_CONNECTIONS = GestureRecognizer.HAND_CONNECTIONS;
