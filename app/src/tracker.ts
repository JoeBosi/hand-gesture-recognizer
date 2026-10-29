/**
 * tracker.ts — il riconoscimento della mano.
 *
 * Avvolge il `GestureRecognizer` di MediaPipe Tasks Vision in una classe piccola, che si occupa
 * di tre cose che il resto dell'app non deve sapere:
 *   1. da dove si caricano runtime WebAssembly e modello (dal nostro dominio, non da una CDN);
 *   2. la scelta fra scheda grafica e processore, con ripiego automatico;
 *   3. la regola dei tempi crescenti in modalità video.
 *
 * Perché MediaPipe: è il riconoscitore di mani di Google, gira interamente nel browser (nessuna
 * immagine inviata a un server), è gratuito, e in un unico modello dà sia i 21 punti della mano
 * sia il nome di otto gesti comuni. Le alternative (TensorFlow.js handpose, modelli ONNX) sono
 * più lente o richiedono di scrivere a mano il riconoscimento dei gesti.
 *
 * Perché `GestureRecognizer` e non `HandLandmarker`: il primo contiene già il secondo e in più
 * classifica il gesto, al prezzo di un modello leggermente più grande. Se un domani i gesti non
 * servissero, basterebbe passare a HandLandmarker cambiando solo questo file.
 */
import { FilesetResolver, GestureRecognizer, type GestureRecognizerResult } from "@mediapipe/tasks-vision";
import { filtraRisultato } from "./vicinanza";

/**
 * Runtime e modello sono serviti dal sito stesso, non da una CDN. Due motivi:
 * - riservatezza: la CSP del sito permette richieste solo verso il proprio dominio, quindi la
 *   pagina non può contattare nessun altro (vedi deploy/Caddyfile.snippet);
 * - stabilità: i file arrivano dalla versione fissata nel progetto, non da quella che la CDN
 *   pubblica oggi. Li mette in `app/public/mediapipe/` lo script scripts/prepare-assets.mjs.
 */
const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/gesture_recognizer.task";

/** Dove gira il calcolo: scheda grafica o processore. */
export type Delegate = "GPU" | "CPU";

export class HandTracker {
  /** Istante dell'ultima analisi: MediaPipe pretende tempi sempre crescenti (vedi `detect`). */
  private lastTimestamp = -1;

  /** Durata media di una rilevazione in millisecondi (media mobile esponenziale). */
  avgDetectMs = 0;
  /** Quante rilevazioni sono state fatte: serve a non giudicare la velocità sui primi fotogrammi. */
  detections = 0;

  private readonly recognizer: GestureRecognizer;
  readonly delegate: Delegate;

  /** Privato: si costruisce solo con `create`, che è asincrono perché deve scaricare il modello. */
  private constructor(recognizer: GestureRecognizer, delegate: Delegate) {
    this.recognizer = recognizer;
    this.delegate = delegate;
  }

  /**
   * Prepara il riconoscitore. Scarica ~8 MB di modello e ~11 MB di WebAssembly la prima volta,
   * poi restano nella cache del browser.
   *
   * @param onlyCpu salta il tentativo con la scheda grafica (usato dal ripiego automatico).
   *                Anche `?delegate=cpu` nell'indirizzo ottiene lo stesso effetto, utile per
   *                diagnosticare problemi grafici senza toccare il codice.
   */
  static async create(onlyCpu = false): Promise<HandTracker> {
    const forceCpu = onlyCpu || new URLSearchParams(location.search).get("delegate")?.toLowerCase() === "cpu";

    // FilesetResolver guarda se il browser supporta le istruzioni SIMD e sceglie da solo fra
    // vision_wasm_internal.* e la variante nosimd, entrambe presenti in /mediapipe/wasm.
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    const options = (delegate: Delegate) => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: "VIDEO" as const, // "IMAGE" analizzerebbe ogni foto da zero, senza inseguire la mano
      numHands: 4, // se ne chiedono 4 e si tengono le 2 più vicine (vicinanza.ts)
      // Soglie: sotto queste confidenze la mano viene ignorata. 0.5 è il valore consigliato da
      // Google; alzarle riduce i falsi positivi ma fa "perdere" la mano più spesso.
      minHandDetectionConfidence: 0.5, // per accorgersi che c'è una mano
      minHandPresenceConfidence: 0.5, // per dire che c'è ancora
      minTrackingConfidence: 0.5, // per continuare a seguirla senza ricercarla da capo
    });

    if (forceCpu) return new HandTracker(await GestureRecognizer.createFromOptions(vision, options("CPU")), "CPU");
    try {
      return new HandTracker(await GestureRecognizer.createFromOptions(vision, options("GPU")), "GPU");
    } catch {
      // Niente WebGL utilizzabile (contesto grafico occupato, driver problematico): la CPU è più
      // lenta ma funziona ovunque, ed è meglio di una pagina che non parte.
      return new HandTracker(await GestureRecognizer.createFromOptions(vision, options("CPU")), "CPU");
    }
  }

  /**
   * Analizza un fotogramma. È sincrona: il calcolo avviene subito e blocca il thread principale
   * per la sua durata (pochi millisecondi con la GPU).
   *
   * In modalità VIDEO MediaPipe usa il tempo per capire quanto è passato dal fotogramma prima, e
   * rifiuta con un errore un tempo uguale o minore del precedente. Con `performance.now()` non
   * dovrebbe mai succedere, ma un +1 di sicurezza costa nulla ed evita un errore fatale.
   */
  /**
   * @param soglia quanto grande dev'essere una mano rispetto alla più grande per essere tenuta
   *        (vicinanza.ts); 0 = tenere tutte (max 4).
   */
  detect(video: HTMLVideoElement, now: number, soglia = 0.6): GestureRecognizerResult {
    const ts = now > this.lastTimestamp ? now : this.lastTimestamp + 1;
    this.lastTimestamp = ts;

    const t0 = performance.now();
    const result = this.recognizer.recognizeForVideo(video, ts);
    const ms = performance.now() - t0;

    // Media mobile esponenziale: pesa di più le misure recenti e non richiede di tenere uno
    // storico. Serve al ripiego su CPU in main.ts.
    this.detections++;
    this.avgDetectMs = this.detections === 1 ? ms : this.avgDetectMs * 0.8 + ms * 0.2;

    if (soglia <= 0) return result;
    return filtraRisultato(result, video.videoWidth / video.videoHeight || 4 / 3, soglia);
  }

  /** Libera memoria e contesto grafico del WebAssembly. Va chiamato prima di ricrearlo. */
  close(): void {
    this.recognizer.close();
  }
}

/**
 * I nomi degli otto gesti che il modello conosce, tradotti per l'interfaccia.
 * Il nono valore possibile è "None" (nessun gesto riconosciuto) e non compare qui apposta.
 */
export const GESTURE_LABELS: Record<string, string> = {
  Closed_Fist: "✊ Pugno",
  Open_Palm: "🖐️ Mano aperta",
  Pointing_Up: "☝️ Indice in su",
  Thumb_Down: "👎 Pollice giù",
  Thumb_Up: "👍 Pollice su",
  Victory: "✌️ Vittoria",
  ILoveYou: "🤟 Ti voglio bene",
};

/**
 * Le 21 coppie di punti da collegare per disegnare lo scheletro della mano (polso→pollice,
 * nocca→falange e così via). La tabella la fornisce MediaPipe: viene riesportata da qui perché
 * la usano sia l'anteprima 2D sia la scena 3D, e nessuno dei due deve importare MediaPipe solo
 * per questo.
 */
export const HAND_CONNECTIONS = GestureRecognizer.HAND_CONNECTIONS;
