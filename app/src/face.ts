/**
 * face.ts — in che posizione e in che direzione sta la testa.
 *
 * Il riconoscitore del corpo dà del viso soltanto sette punti: naso, due occhi, due orecchie, due
 * angoli della bocca. Con quelli la testa si può soltanto *indovinare*, e la versione precedente lo
 * faceva così: il centro del cranio fra le due orecchie, l'«alto» dalla linea collo→cranio, il naso
 * usato solo per capire da che parte guarda la faccia. Il difetto era strutturale: quando la
 * persona china la testa verso lo schermo — il caso più comune davanti a una webcam — il naso
 * scende rispetto alle orecchie, ma nessuna riga di codice leggeva quell'informazione, e il cranio
 * restava disegnato dritto, affondato fra le spalle.
 *
 * Per vedere la testa serve un modello fatto per vedere la testa: `FaceLandmarker`, 478 punti del
 * viso più l'apertura della bocca. Da questo file esce una cosa sola, `FacePose`: una manciata di
 * punti scelti (guance, angoli degli occhi, fronte, mento, naso) dai quali `body3d.ts` ricava la
 * terna di assi del cranio. Si passano i punti e non una matrice di rotazione già pronta di
 * proposito: la matrice dipende da convenzioni di segno e di unità da verificare, mentre i punti
 * stanno nello stesso sistema di coordinate di tutto il resto, e la terna si ricava con un
 * prodotto vettoriale il cui verso lo decide la geometria (il naso sta davanti), non una
 * convenzione.
 *
 * Una cosa che questo modello NON fa, e che la sua scheda ufficiale dichiara fuori scopo: dire chi
 * è la persona. Qui si misura dove sta la testa, mai di chi è.
 *
 * Valgono le tre regole di `hands.ts` per far girare più modelli sullo stesso fotogramma: un solo
 * `FilesetResolver`, creazione in sequenza, stesso istante per tutti.
 */
import { FaceLandmarker, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { LandmarkSmoother } from "./filter";
import { visionFileset } from "./hands";
import type { Point3 } from "./scene3d";

const MODEL_PATH = "/mediapipe/face_landmarker.task";

export type Delegate = "GPU" | "CPU";

/**
 * I punti del viso che servono a orientare il cranio, in coordinate normalizzate come tutti i
 * landmark di MediaPipe (x e y fra 0 e 1, z con la scala della x).
 *
 * «destra» e «sinistra» sono della **persona**, come i nomi dei punti della posa del corpo.
 */
export interface FacePose {
  rightSide: Point3; // guancia/orecchio destro (punto 234 della mesh)
  leftSide: Point3; // guancia/orecchio sinistro (454)
  rightEye: Point3; // angolo esterno dell'occhio destro (33)
  leftEye: Point3; // angolo esterno dell'occhio sinistro (263)
  forehead: Point3; // attaccatura alta della fronte (10)
  glabella: Point3; // fra le sopracciglia, alla radice del naso (168)
  nose: Point3; // punta del naso (1)
  mouth: Point3; // centro del labbro superiore interno (13)
  chin: Point3; // punto più basso del mento (152)
  /** Quanto la mandibola è abbassata: 0 = bocca chiusa, 1 = spalancata. */
  jawOpen: number;
}

/** Gli indici dei nove punti nella mesh da 478, nello stesso ordine della lista qui sotto. */
const MESH = [234, 454, 33, 263, 10, 168, 1, 13, 152] as const;

export class FaceTracker {
  private lastTimestamp = -1;
  avgDetectMs = 0;
  detections = 0;

  /**
   * Un filtro anti-tremolio per i nove punti. Si filtrano questi e non i 478: sono gli unici che
   * contano, e su una rotazione del cranio il tremolio si vede più che su una posizione.
   */
  private smoother: LandmarkSmoother | null = null;
  private jaw = 0;

  private readonly landmarker: FaceLandmarker;
  readonly delegate: Delegate;

  private constructor(landmarker: FaceLandmarker, delegate: Delegate) {
    this.landmarker = landmarker;
    this.delegate = delegate;
  }

  /** Prepara il riconoscitore. Scarica ~3,8 MB di modello la prima volta. */
  static async create(onlyCpu = false): Promise<FaceTracker> {
    const forceCpu = onlyCpu || new URLSearchParams(location.search).get("delegate")?.toLowerCase() === "cpu";
    const vision = await visionFileset();

    const options = (delegate: Delegate) => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: "VIDEO" as const,
      numFaces: 2, // due, per scegliere quello che sta sul corpo giusto (vedi detect)
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      // Le espressioni sono spente di default e vanno chieste: serve `jawOpen`, per far parlare il
      // cranio. La matrice di trasformazione invece NON serve (vedi la nota in cima al file).
      outputFaceBlendshapes: true,
    });

    if (forceCpu) return new FaceTracker(await FaceLandmarker.createFromOptions(vision, options("CPU")), "CPU");
    try {
      return new FaceTracker(await FaceLandmarker.createFromOptions(vision, options("GPU")), "GPU");
    } catch {
      return new FaceTracker(await FaceLandmarker.createFromOptions(vision, options("CPU")), "CPU");
    }
  }

  /**
   * @param ancora dove sta la testa secondo il corpo: si accetta solo un volto che stia lì e abbia
   *        una larghezza compatibile. Senza questo controllo poteva arrivare il volto di un'altra
   *        persona, e il teschio finiva su un corpo non suo («il mostro», audit del 08/10/2026).
   * Analizza un fotogramma e restituisce la posa della testa, oppure `null` se non c'è un volto.
   * Lo stesso istante `now` si passa a tutti i riconoscitori della pagina (vedi hands.ts).
   */
  detect(video: HTMLVideoElement, now: number, ancora?: AncoraVolto): FacePose | null {
    const ts = now > this.lastTimestamp ? now : this.lastTimestamp + 1;
    this.lastTimestamp = ts;

    const t0 = performance.now();
    const result: FaceLandmarkerResult = this.landmarker.detectForVideo(video, ts);
    const ms = performance.now() - t0;
    this.detections++;
    this.avgDetectMs = this.detections === 1 ? ms : this.avgDetectMs * 0.8 + ms * 0.2;

    const mesh = ancora ? sceltaVolto(result.faceLandmarks, ancora) : result.faceLandmarks[0];
    if (!mesh) {
      // Volto perso: il filtro si butta, così alla ricomparsa la testa non arriva strisciando.
      this.smoother = null;
      this.jaw = 0;
      return null;
    }

    this.smoother ??= new LandmarkSmoother(MESH.length);
    const p = this.smoother.smooth(
      MESH.map((i) => mesh[i]),
      now,
    );

    // `jawOpen` va da 0 a 1 ma con la bocca chiusa oscilla di qualche centesimo: un passa-basso
    // leggero evita che la mandibola «trema» quando la persona sta zitta.
    const raw = result.faceBlendshapes[0]?.categories.find((c) => c.categoryName === "jawOpen")?.score ?? 0;
    this.jaw += (raw - this.jaw) * 0.5;

    return {
      rightSide: p[0],
      leftSide: p[1],
      rightEye: p[2],
      leftEye: p[3],
      forehead: p[4],
      glabella: p[5],
      nose: p[6],
      mouth: p[7],
      chin: p[8],
      jawOpen: this.jaw,
    };
  }

  /** Si chiama quando la persona esce di scena o la camera si spegne. */
  reset(): void {
    this.smoother = null;
    this.jaw = 0;
  }

  close(): void {
    this.landmarker.close();
  }
}

/** La testa secondo la posa: naso e larghezza di riferimento, in coordinate con x × aspect. */
export interface AncoraVolto {
  x: number;
  y: number;
  /** distanza fra le orecchie (o metà delle spalle, se la testa è di profilo) */
  larghezza: number;
  aspect: number;
}

function sceltaVolto<T extends { x: number; y: number }>(volti: T[][], a: AncoraVolto): T[] | undefined {
  let migliore: T[] | undefined;
  let dMin = Infinity;
  for (const v of volti) {
    const dx = (v[234].x - v[454].x) * a.aspect;
    const largo = Math.hypot(dx, v[234].y - v[454].y);
    const cx = ((v[234].x + v[454].x) / 2) * a.aspect;
    const cy = (v[234].y + v[454].y) / 2;
    const d = Math.hypot(cx - a.x, cy - a.y);
    if (d > 0.8 * a.larghezza) continue; // troppo lontano dal naso del corpo
    if (largo < 0.5 * a.larghezza || largo > 2 * a.larghezza) continue; // grandezza incompatibile
    if (d < dMin) ((dMin = d), (migliore = v));
  }
  return migliore;
}
