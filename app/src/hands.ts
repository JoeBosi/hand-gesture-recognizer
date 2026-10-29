/**
 * hands.ts — le mani vere sulla pagina del corpo.
 *
 * Il riconoscitore del corpo, delle mani, dà quattro punti: polso, pollice, indice, mignolo. Non
 * c'è nessuna opzione per averne di più — è proprio così che è fatto il modello. Per avere le dita
 * serve un **secondo modello**, ed è questo: `HandLandmarker`, 21 articolazioni per mano.
 *
 * Perché non `GestureRecognizer`, che il progetto ha già in casa per la pagina della mano: perché
 * contiene lo stesso riconoscitore di articolazioni **più** la rete che classifica gli otto gesti,
 * che qui non servono e girerebbero a ogni fotogramma. È la documentazione stessa a dire di usare
 * Hand landmarker quando servono solo i punti.
 *
 * Far girare due modelli sullo stesso fotogramma ha tre regole, nessuna delle quali è scritta nelle
 * guide di Google — sono state ricavate dai sorgenti della libreria:
 *
 *   1. **un solo `FilesetResolver`, riusato.** Non carica niente: restituisce due indirizzi dopo
 *      aver controllato una volta se il browser supporta le istruzioni SIMD. Chiamarlo due volte
 *      non fa danni, ma non serve a nulla.
 *   2. **creazione in sequenza, mai in parallelo.** La libreria passa la funzione che costruisce il
 *      modulo WebAssembly attraverso una variabile globale, e la azzera subito dopo averla letta:
 *      due `createFromOptions()` avviati insieme se la contendono e uno dei due fallisce con
 *      «ModuleFactory not set». Aspettare il primo costa qualche decimo di secondo, una volta sola.
 *   3. **lo stesso istante per tutti e due.** Ogni task tiene il proprio contatore di tempi, quindi
 *      passare lo stesso `performance.now()` a entrambi va bene; quel che non si può fare è tornare
 *      indietro nel tempo con lo *stesso* task.
 *
 * Fonti e verifiche: docs/research/2026-09-20-due-modelli-mediapipe-stesso-fotogramma.md
 */
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { filtraRisultato } from "./vicinanza";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/hand_landmarker.task";

export type Delegate = "GPU" | "CPU";

/**
 * Il `FilesetResolver` condiviso dalle due pagine e dai due modelli (regola 1).
 * La promessa si tiene da parte: chi arriva dopo aspetta la stessa, non ne apre un'altra.
 */
let fileset: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null;

export function visionFileset(): Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> {
  fileset ??= FilesetResolver.forVisionTasks(WASM_PATH);
  return fileset;
}

export class HandsTracker {
  /** Istante dell'ultima analisi: MediaPipe pretende tempi sempre crescenti per lo stesso task. */
  private lastTimestamp = -1;

  /** Durata media di una rilevazione in millisecondi (media mobile esponenziale). */
  avgDetectMs = 0;
  detections = 0;

  private readonly landmarker: HandLandmarker;
  readonly delegate: Delegate;

  private constructor(landmarker: HandLandmarker, delegate: Delegate) {
    this.landmarker = landmarker;
    this.delegate = delegate;
  }

  /** Prepara il riconoscitore. Scarica ~7,8 MB di modello la prima volta. */
  static async create(onlyCpu = false): Promise<HandsTracker> {
    const forceCpu = onlyCpu || new URLSearchParams(location.search).get("delegate")?.toLowerCase() === "cpu";
    const vision = await visionFileset();

    const options = (delegate: Delegate) => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: "VIDEO" as const,
      numHands: 4, // se ne chiedono 4 e si tengono le 2 più vicine (vicinanza.ts)
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    if (forceCpu) return new HandsTracker(await HandLandmarker.createFromOptions(vision, options("CPU")), "CPU");
    try {
      return new HandsTracker(await HandLandmarker.createFromOptions(vision, options("GPU")), "GPU");
    } catch {
      return new HandsTracker(await HandLandmarker.createFromOptions(vision, options("CPU")), "CPU");
    }
  }

  /**
   * @param soglia quanto grande dev'essere una mano rispetto alla più grande per essere tenuta
   *        (vicinanza.ts); 0 = tenere tutte (max 4).
   */
  detect(video: HTMLVideoElement, now: number, soglia = 0.6): HandLandmarkerResult {
    const ts = now > this.lastTimestamp ? now : this.lastTimestamp + 1;
    this.lastTimestamp = ts;

    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(video, ts);
    const ms = performance.now() - t0;

    this.detections++;
    this.avgDetectMs = this.detections === 1 ? ms : this.avgDetectMs * 0.8 + ms * 0.2;

    if (soglia <= 0) return result;
    return filtraRisultato(result, video.videoWidth / video.videoHeight || 4 / 3, soglia);
  }

  close(): void {
    this.landmarker.close();
  }
}

/**
 * Le 21 coppie di punti da collegare per disegnare le ossa di una mano. È la stessa tabella che la
 * pagina della mano prende dal `GestureRecognizer`: i due modelli numerano i punti allo stesso modo.
 */
export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;
