/**
 * pose.ts — il riconoscimento del corpo intero.
 *
 * È il gemello di tracker.ts: stessa struttura, stessa libreria, ma al posto del
 * `GestureRecognizer` (mano, 21 punti) usa il `PoseLandmarker` (corpo, 33 punti da testa a
 * piedi). Chi ha letto tracker.ts qui trova poche sorprese; le differenze vere sono tre e sono
 * segnalate lungo il file.
 *
 * Perché un modello diverso e non lo stesso: sono due reti neurali addestrate su cose diverse.
 * Quella della mano cerca dita in un ritaglio piccolo, quella del corpo cerca una figura intera
 * nell'inquadratura. Non si sostituiscono a vicenda; volendo si possono far girare entrambe
 * contemporaneamente, al prezzo del doppio del lavoro per fotogramma.
 *
 * Documentazione letta il 18/09/2026: docs/research/2026-09-18-mediapipe-pose-landmarker-web.md
 */
import { PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { visionFileset } from "./hands";

/** Il modello arriva dal nostro dominio, come per la mano (vedi tracker.ts); il runtime
 * WebAssembly è quello condiviso, risolto da hands.ts. */
const MODEL_PATH = "/mediapipe/pose_landmarker_lite.task";

export type Delegate = "GPU" | "CPU";

export class PoseTracker {
  /** Istante dell'ultima analisi: MediaPipe pretende tempi sempre crescenti. */
  private lastTimestamp = -1;

  /** Durata media di una rilevazione in millisecondi (media mobile esponenziale). */
  avgDetectMs = 0;
  /** Quante rilevazioni sono state fatte: serve a non giudicare la velocità sui primi fotogrammi. */
  detections = 0;

  private readonly landmarker: PoseLandmarker;
  readonly delegate: Delegate;

  private constructor(landmarker: PoseLandmarker, delegate: Delegate) {
    this.landmarker = landmarker;
    this.delegate = delegate;
  }

  /**
   * Prepara il riconoscitore. Scarica ~5,8 MB di modello la prima volta; il runtime WebAssembly
   * è lo stesso della pagina della mano, quindi se l'utente è già passato di là è già in cache.
   */
  static async create(onlyCpu = false): Promise<PoseTracker> {
    const forceCpu = onlyCpu || new URLSearchParams(location.search).get("delegate")?.toLowerCase() === "cpu";
    // Lo stesso `FilesetResolver` del riconoscitore di mani: sulla pagina del corpo girano
    // entrambi, e non ha senso ripetere il controllo del supporto SIMD (vedi hands.ts).
    const vision = await visionFileset();

    const options = (delegate: Delegate) => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: "VIDEO" as const,
      // Differenza 1: una persona sola. Il modello ne saprebbe seguire di più, ma ogni persona in
      // più è un giro completo di calcoli, e la scena 3D disegna una figura sola.
      numPoses: 2, // due, per poter scegliere la persona più vicina (corpo.ts → personaVicina)
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      // Differenza 2: niente maschera di segmentazione (la sagoma ritagliata dallo sfondo).
      // È il valore predefinito, ma vale la pena scriverlo: calcolarla costerebbe parecchio e
      // qui non serve a niente.
      outputSegmentationMasks: false,
    });

    if (forceCpu) return new PoseTracker(await PoseLandmarker.createFromOptions(vision, options("CPU")), "CPU");
    try {
      return new PoseTracker(await PoseLandmarker.createFromOptions(vision, options("GPU")), "GPU");
    } catch {
      return new PoseTracker(await PoseLandmarker.createFromOptions(vision, options("CPU")), "CPU");
    }
  }

  /**
   * Analizza un fotogramma. Differenza 3: il metodo si chiama `detectForVideo` (la mano usava
   * `recognizeForVideo`, perché oltre a trovare i punti classificava anche il gesto).
   */
  detect(video: HTMLVideoElement, now: number): PoseLandmarkerResult {
    const ts = now > this.lastTimestamp ? now : this.lastTimestamp + 1;
    this.lastTimestamp = ts;

    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(video, ts);
    const ms = performance.now() - t0;

    this.detections++;
    this.avgDetectMs = this.detections === 1 ? ms : this.avgDetectMs * 0.8 + ms * 0.2;

    return result;
  }

  close(): void {
    this.landmarker.close();
  }
}

/**
 * I 33 punti, con il nome che hanno nel modello. L'ordine è fissato: l'indice è l'identità del
 * punto, ed è così che il resto del codice li nomina (`POSE.LEFT_ELBOW` invece di `13`).
 *
 *   0 naso · 1-6 occhi · 7-8 orecchie · 9-10 bocca
 *   11-12 spalle · 13-14 gomiti · 15-16 polsi · 17-22 mani (mignolo, indice, pollice)
 *   23-24 anche · 25-26 ginocchia · 27-28 caviglie · 29-30 talloni · 31-32 punte dei piedi
 *
 * Attenzione ai nomi: "LEFT" è la sinistra **della persona ripresa**, non quella dello schermo.
 */
export const POSE = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT: 31, RIGHT_FOOT: 32,
} as const;

/**
 * I punti del viso, che `body3d.ts` usa per orientare il cranio: le orecchie danno l'asse delle
 * tempie, il naso dice da che parte guarda la faccia. Non si disegnano come punti: sono le
 * misure con cui si costruisce la testa.
 *
 * Le ossa dello scheletro non sono un elenco di collegamenti fra questi 33 punti: colonna,
 * costole e bacino non esistono fra i dati e vengono ricavati per interpolazione. Sta tutto in
 * `body3d.ts`, ed è il motivo per cui qui non c'è più nessuna tabella di ossa.
 */

/**
 * Riesportato per l'anteprima 2D, che disegna volentieri anche il viso: lì i bastoncini sono
 * sottili e sovrapposti all'immagine vera, quindi non danno fastidio.
 */
export const POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;
