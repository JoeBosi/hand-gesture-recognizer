/**
 * prova-testa.ts — vedi prova-testa.html. Strumento di sviluppo, non fa parte del sito.
 */
import { CameraError, startCamera } from "./camera";
import { FaceTracker } from "./face";
import { PoseTracker, POSE } from "./pose";

const video = document.getElementById("video") as HTMLVideoElement;
const pose = await PoseTracker.create(true);
const face = await FaceTracker.create(true);
try {
  await startCamera(video);
} catch (e) {
  document.body.dataset.esito = JSON.stringify({ errore: e instanceof CameraError ? e.message : String(e) });
  throw e;
}

const r = (n: number) => Math.round(n * 1000) / 1000;
const p3 = (p: { x: number; y: number; z: number }) => [r(p.x), r(p.y), r(p.z)];
const campioni: unknown[] = [];

function giro(): void {
  requestAnimationFrame(giro);
  if (video.readyState < 2) return;
  const now = performance.now();
  const corpo = pose.detect(video, now).landmarks[0];
  const viso = face.detect(video, now);
  if (!corpo || !viso) return;
  const ids = ["NOSE", "LEFT_EYE", "RIGHT_EYE", "LEFT_EAR", "RIGHT_EAR", "MOUTH_LEFT", "MOUTH_RIGHT", "LEFT_SHOULDER", "RIGHT_SHOULDER"] as const;
  const c: Record<string, unknown> = {};
  for (const k of ids) {
    const q = corpo[POSE[k]];
    c[k] = [...p3(q), r((q as { visibility?: number }).visibility ?? 0)];
  }
  campioni.push({
    corpo: c,
    viso: {
      rightSide: p3(viso.rightSide), leftSide: p3(viso.leftSide), rightEye: p3(viso.rightEye), leftEye: p3(viso.leftEye),
      forehead: p3(viso.forehead), glabella: p3(viso.glabella), nose: p3(viso.nose), mouth: p3(viso.mouth),
      chin: p3(viso.chin), jawOpen: r(viso.jawOpen),
    },
  });
  if (campioni.length >= 6) {
    document.body.dataset.esito = JSON.stringify({ campioni: campioni.slice(-3), msPosa: Math.round(pose.avgDetectMs), msVolto: Math.round(face.avgDetectMs) });
  }
}
giro();
