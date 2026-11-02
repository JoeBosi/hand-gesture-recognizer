// src/tracker.ts
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODELLO =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

export async function creaRiconoscitore(): Promise<GestureRecognizer> {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  return GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODELLO },
    runningMode: "VIDEO",
    numHands: 2,
  });
}
