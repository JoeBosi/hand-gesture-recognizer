/**
 * corpo.ts — il regista della pagina /corpo/.
 *
 * Fa per il corpo quello che main.ts fa per la mano, e la struttura è deliberatamente la stessa:
 * chi ha letto uno dei due file riconosce l'altro a prima vista. I moduli riusati tali e quali
 * sono tre su quattro — `camera.ts`, `filter.ts` e la base della scena 3D — e cambiano solo il
 * riconoscitore (`pose.ts`) e la figura disegnata (`body3d.ts`).
 *
 * Qui girano **tre** riconoscitori sullo stesso fotogramma: quello del corpo (33 punti), quello
 * delle mani (21 punti per mano) e quello del volto (478 punti, usato solo per sapere dove sta e
 * come è girata la testa: vedi face.ts). Il primo da solo darebbe quattro punti per mano — polso,
 * pollice, indice, mignolo — e con quelli le dita si possono solo disegnare a caso. Il prezzo è
 * una seconda analisi per fotogramma; le tre regole per farlo senza rompere niente stanno in
 * `hands.ts`, e le mani si cercano solo quando una persona c'è davvero.
 *
 * Le differenze rispetto alla mano:
 *   - una persona sola invece di due mani, quindi niente destra/sinistra da smistare;
 *   - 33 punti invece di 21;
 *   - niente gesti: al loro posto la barra in basso dice quali parti del corpo si vedono;
 *   - nessuna conferma su più fotogrammi: qui il falso positivo "una seconda persona che non
 *     c'è" non esiste, perché di persone se ne cerca una sola.
 *
 * Spiegazione estesa con i disegni: ../../docs/COME-FUNZIONA.md
 */
import "./accessi";
import "./piede";
import "./style.css";
import { DrawingUtils, type HandLandmarkerResult, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { BodyScene, type HandPoints, type PosePoint } from "./body3d";
import { CameraError, startCamera, stopCamera } from "./camera";
import { entra, libera, mantieni } from "./presenza";
import { iniziaSchermoIntero } from "./schermo-intero";
import { FaceTracker } from "./face";
import { LandmarkSmoother } from "./filter";
import { HAND_CONNECTIONS, HandsTracker } from "./hands";
import { POSE, POSE_CONNECTIONS, PoseTracker } from "./pose";

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
  parts: $("gestures"), // stesso riquadro della pagina della mano, altro contenuto
  fps: $("fps"),
  togglePreview: $<HTMLButtonElement>("toggle-preview"),
  stop: $<HTMLButtonElement>("stop"),
};

type State = "idle" | "loading" | "running" | "error";

/** La scena 3D. Si costruisce subito: mostra uno sfondo vuoto finché non arriva una persona. */
const scene = new BodyScene(ui.scene);

const overlayCtx = ui.overlay.getContext("2d")!;
const drawing = new DrawingUtils(overlayCtx);

/** Un solo filtro anti-tremolio, per i 33 punti. `null` quando non c'è nessuno inquadrato. */
let smoother: LandmarkSmoother | null = null;

/**
 * Un filtro per mano, con i suoi 21 punti. Sono separati da quello del corpo perché una mano può
 * sparire e ricomparire mentre la persona resta inquadrata: in quel caso si butta solo il suo.
 */
const handSmoothers: Record<"left" | "right", LandmarkSmoother | null> = { left: null, right: null };

const E2E = new URLSearchParams(location.search).has("e2e");

/**
 * Le tre parti mostrate nella barra in basso. Per dire "si vede", di ogni parte si controllano i
 * punti elencati: bastano quelli, non serve l'elenco completo.
 */
const PARTS: ReadonlyArray<{ nome: string; punti: readonly number[] }> = [
  { nome: "Testa", punti: [POSE.NOSE] },
  { nome: "Braccia", punti: [POSE.LEFT_ELBOW, POSE.RIGHT_ELBOW, POSE.LEFT_WRIST, POSE.RIGHT_WRIST] },
  { nome: "Busto", punti: [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER, POSE.LEFT_HIP, POSE.RIGHT_HIP] },
  { nome: "Gambe", punti: [POSE.LEFT_KNEE, POSE.RIGHT_KNEE, POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE] },
];
const MIN_VISIBILITY = 0.5;

let tracker: PoseTracker | null = null;
let handsTracker: HandsTracker | null = null;
let faceTracker: FaceTracker | null = null;
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
  ui.start.textContent = state === "loading" ? "Avvio in corso…" : "Accendi la camera";
}

// --- Una persona sola, e umana (dal 08/10/2026) ------------------------------------------------

let personaPrima = -1;

/** Indice della persona più vicina (spalle più larghe). Si cambia persona solo se l'altra è più
 *  grande del 30%: così con due persone a distanza simile la figura non salta dall'una all'altra. */
function personaVicina(persone: NormalizedLandmark[][], aspect: number): number {
  if (persone.length === 0) return (personaPrima = -1);
  const spalle = persone.map((l) => Math.hypot((l[11].x - l[12].x) * aspect, l[11].y - l[12].y));
  let i = spalle.indexOf(Math.max(...spalle));
  if (personaPrima >= 0 && personaPrima < persone.length && i !== personaPrima && spalle[i] < 1.3 * spalle[personaPrima]) {
    i = personaPrima;
  }
  return (personaPrima = i);
}

/**
 * Misure massime e minime di un adulto, in metri, sui punti 3D del modello (`worldLandmarks`, che non
 * si accorciano quando un osso punta verso la camera). Margini larghi: servono a scartare l'osso
 * attaccato a un'altra persona o a uno sbaglio grossolano, non a fare antropometria.
 * Un osso fuori misura spegne il suo punto finale e tutti quelli che vengono dopo (gomito → polso…).
 */
const OSSA: [number, number, number, number, number[]][] = [
  // da, a, min, max, punti da spegnere
  [11, 13, 0.15, 0.48, [13, 15, 17, 19, 21]], // braccio sinistro
  [13, 15, 0.13, 0.42, [15, 17, 19, 21]], // avambraccio sinistro
  [12, 14, 0.15, 0.48, [14, 16, 18, 20, 22]],
  [14, 16, 0.13, 0.42, [16, 18, 20, 22]],
  [23, 25, 0.22, 0.65, [25, 27, 29, 31]], // coscia
  [25, 27, 0.2, 0.62, [27, 29, 31]], // tibia
  [24, 26, 0.22, 0.65, [26, 28, 30, 32]],
  [26, 28, 0.2, 0.62, [28, 30, 32]],
];

type Punto = NormalizedLandmark & { visibility?: number };

function plausibile(l: Punto[], mondo: { x: number; y: number; z: number }[] | undefined): Punto[] | undefined {
  if (!mondo) return l;
  const d = (a: number, b: number) => Math.hypot(mondo[a].x - mondo[b].x, mondo[a].y - mondo[b].y, mondo[a].z - mondo[b].z);
  // Spalle impossibili: il fotogramma intero è sbagliato, meglio non disegnare niente di nuovo.
  const spalle = d(11, 12);
  if (spalle < 0.15 || spalle > 0.65) return undefined;
  const spenti = new Set<number>();
  // Busto: spalla → anca dello stesso lato e larghezza del bacino.
  if (d(11, 23) < 0.25 || d(11, 23) > 0.85 || d(12, 24) < 0.25 || d(12, 24) > 0.85 || d(23, 24) > 0.55) {
    for (let i = 23; i <= 32; i++) spenti.add(i);
  }
  for (const [a, b, min, max, via] of OSSA) {
    const v = d(a, b);
    if (v < min || v > max) via.forEach((i) => spenti.add(i));
  }
  if (spenti.size === 0) return l;
  return l.map((p, i) => (spenti.has(i) ? { ...p, visibility: 0 } : p));
}

/** Dove sta la testa secondo il corpo, per accettare solo il volto giusto (face.ts). */
function ancoraVolto(l: Punto[], aspect: number) {
  const orecchie = Math.hypot((l[7].x - l[8].x) * aspect, l[7].y - l[8].y);
  const spalle = Math.hypot((l[11].x - l[12].x) * aspect, l[11].y - l[12].y);
  return { x: l[0].x * aspect, y: l[0].y, larghezza: Math.max(orecchie, spalle * 0.5), aspect };
}

/**
 * Il ciclo principale: identico a quello della mano, compreso il salto dei fotogrammi già
 * analizzati e il disegno 3D che gira sempre, anche senza immagini nuove.
 */
function loop(): void {
  rafId = requestAnimationFrame(loop);
  const video = ui.video;
  if (tracker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();

    const result = tracker.detect(video, now);

    if (ui.overlay.width !== video.videoWidth) {
      ui.overlay.width = video.videoWidth;
      ui.overlay.height = video.videoHeight;
    }
    overlayCtx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);

    // Fino a due persone: si sceglie la più vicina (spalle più larghe), poi si spengono le ossa con
    // misure impossibili per un essere umano (vedi plausibile).
    const aspect = video.videoWidth / video.videoHeight || 4 / 3;
    const scelta = personaVicina(result.landmarks, aspect);
    const landmarks = scelta < 0 ? undefined : plausibile(
      result.landmarks[scelta] as (NormalizedLandmark & { visibility?: number })[],
      result.worldLandmarks[scelta],
    );

    if (landmarks) {
      smoother ??= new LandmarkSmoother(33);
      // Il filtro lavora solo su x, y e z: la visibilità va riattaccata a mano, perché serve a
      // body3d.ts per decidere cosa disegnare.
      const smoothed: PosePoint[] = smoother
        .smooth(landmarks, now)
        .map((p, i) => ({ ...p, visibility: landmarks[i].visibility }));

      // 1) le mani. Si cercano **solo adesso**, con una persona inquadrata: senza un corpo a cui
      //    attaccarle non servirebbero a niente, e un'analisi in meno per fotogramma è un'analisi
      //    in meno. Lo stesso istante `now` vale per tutti e due i riconoscitori (vedi hands.ts).
      const hands = handsTracker ? assegnaMani(handsTracker.detect(video, now, 0), landmarks, now) : [];

      // 2) il volto. Anche questo solo con una persona inquadrata. Serve a una cosa sola: la
      //    posizione e l'orientamento della testa, che dai sette punti del viso della posa non si
      //    ricavano bene (vedi skeleton-head.ts). Se non c'è, la figura ripiega sul calcolo vecchio.
      const face = faceTracker ? faceTracker.detect(video, now, ancoraVolto(landmarks, aspect)) : null;

      // 3) la figura 3D, con i punti addolciti dal filtro
      scene.update(smoothed, hands, face);

      // 3) l'anteprima 2D, con i punti grezzi: lì serve la corrispondenza esatta con l'immagine.
      //    Qui si usano tutte le connessioni di MediaPipe, viso compreso: sovrapposte
      //    all'immagine vera i bastoncini della faccia si leggono benissimo.
      drawing.drawConnectors(landmarks, POSE_CONNECTIONS, { color: "#a5b4fc", lineWidth: 2 });
      drawing.drawLandmarks(landmarks, { color: "#ffffff", radius: 2, lineWidth: 1 });
      for (const hand of hands) {
        drawing.drawConnectors(hand.grezzi, HAND_CONNECTIONS, { color: "#fbbf24", lineWidth: 2 });
      }

      // 4) quali parti del corpo il modello sta vedendo davvero
      const visible = PARTS.filter((p) => p.punti.every((i) => (landmarks[i]?.visibility ?? 0) >= MIN_VISIBILITY));
      const etichette = visible.map((p) => `${p.nome} ✓`);
      if (hands.length) etichette.push(`${hands.length === 2 ? "Mani" : "Mano"} ✓`);
      ui.parts.textContent = etichette.length ? etichette.join("   ·   ") : "Persona inquadrata parzialmente";

      if (E2E) {
        document.body.dataset.bodies = "1";
        document.body.dataset.parts = visible.map((p) => p.nome).join(",");
        document.body.dataset.nose = landmarks[POSE.NOSE].x.toFixed(3);
        document.body.dataset.hands = String(hands.length);
        document.body.dataset.handSides = hands.map((h) => h.side).sort().join(",");
        // Quanto costa, in millisecondi, ciascuno dei due riconoscitori: è il numero con cui si
        // giudica se il secondo modello è sostenibile su una macchina data.
        document.body.dataset.ms = `${Math.round(tracker.avgDetectMs)},${Math.round(handsTracker?.avgDetectMs ?? 0)},${Math.round(faceTracker?.avgDetectMs ?? 0)}`;
        document.body.dataset.face = face ? "1" : "0";
      }
    } else {
      // Nessuno inquadrato: la figura svanisce e il filtro si butta, così alla ricomparsa non
      // arriva strisciando dalla posizione di prima.
      scene.update(null);
      smoother = null;
      handSmoothers.left = handSmoothers.right = null;
      faceTracker?.reset();
      ui.parts.textContent = "Nessuna persona inquadrata";
      azzeraDatiE2E();
    }

    frames++;
    if (now - fpsWindowStart >= 1000) {
      ui.fps.textContent = `${Math.round((frames * 1000) / (now - fpsWindowStart))} fps · ${tracker.delegate}`;
      frames = 0;
      fpsWindowStart = now;
    }
  }

  scene.render();
  void fallbackToCpuIfSlow();
}

/**
 * Una mano riconosciuta, pronta per l'uso: i punti addolciti per la figura 3D e quelli grezzi per
 * l'anteprima, che deve combaciare con l'immagine vera.
 */
type ManoPronta = HandPoints & { grezzi: NormalizedLandmark[] };

/** Oltre questa distanza (in frazioni di larghezza dell'immagine) una mano non è di questo corpo. */
const MAX_DISTANZA_POLSO = 0.22;

/**
 * Decide a quale braccio appartiene ogni mano riconosciuta.
 *
 * Il riconoscitore delle mani sa dire «destra» o «sinistra», ma quell'etichetta presuppone
 * un'immagine non specchiata ed è già stata fonte di errori in questo progetto (vedi `realSide` in
 * main.ts). Qui non serve fidarsene: le due mani e i due polsi del corpo sono nello **stesso
 * sistema di coordinate** — stesso fotogramma, stesse coordinate normalizzate — quindi basta
 * guardare quale polso è più vicino. È una misura, non una convenzione, e non può invertirsi.
 *
 * Se tutte e due le mani puntano allo stesso polso vince la più vicina, e l'altra prende il polso
 * che resta; se anche così è troppo lontana, viene scartata (una mano di un'altra persona che passa
 * dietro, o un falso positivo).
 */
function assegnaMani(
  risultato: HandLandmarkerResult,
  corpo: (NormalizedLandmark & { visibility?: number })[],
  now: number,
): ManoPronta[] {
  const polsi = {
    left: corpo[POSE.LEFT_WRIST],
    right: corpo[POSE.RIGHT_WRIST],
  };
  const distanza = (p: NormalizedLandmark, q: NormalizedLandmark) => Math.hypot(p.x - q.x, p.y - q.y);

  // Per ogni mano: il lato preferito e quanto dista da quel polso.
  const candidate = risultato.landmarks.map((punti) => {
    const dL = distanza(punti[0], polsi.left);
    const dR = distanza(punti[0], polsi.right);
    return { punti, side: (dL <= dR ? "left" : "right") as "left" | "right", d: Math.min(dL, dR) };
  });
  candidate.sort((a, b) => a.d - b.d); // la più convincente sceglie per prima

  const prese = new Set<"left" | "right">();
  const fuori: ManoPronta[] = [];
  for (const c of candidate) {
    let side = c.side;
    if (prese.has(side)) side = side === "left" ? "right" : "left";
    if (prese.has(side)) continue; // più di due mani: le altre non hanno dove andare
    if (distanza(c.punti[0], polsi[side]) > MAX_DISTANZA_POLSO) continue;
    prese.add(side);

    handSmoothers[side] ??= new LandmarkSmoother(21);
    fuori.push({ side, points: handSmoothers[side]!.smooth(c.punti, now), grezzi: c.punti });
  }
  // Le mani sparite si portano via il loro filtro: al ritorno non devono arrivare strisciando.
  for (const side of ["left", "right"] as const) if (!prese.has(side)) handSmoothers[side] = null;

  return fuori;
}

/**
 * Cancella dalla pagina i dati di diagnostica dei test.
 *
 * Esistono solo con `?e2e` (senza, non vengono mai scritti), ma sono comunque misure ricavate
 * dall'immagine di una persona — dove ha il naso, quante mani ha alzato — e non devono
 * sopravvivere alla camera spenta. Si chiama sia quando non c'è nessuno inquadrato sia in `stop()`.
 */
function azzeraDatiE2E(): void {
  if (!E2E) return;
  const d = document.body.dataset;
  d.bodies = "0";
  d.parts = "";
  d.nose = "";
  d.hands = "0";
  d.handSides = "";
  d.ms = "";
  d.face = "";
}

let switching = false;

/**
 * Stessa rete di sicurezza della pagina della mano: se la scheda grafica risulta più lenta del
 * processore (succede con le GPU emulate), si ricrea il riconoscitore su CPU.
 */
async function fallbackToCpuIfSlow(): Promise<void> {
  if (switching) return;

  if (tracker && tracker.delegate === "GPU" && tracker.detections >= 8 && tracker.avgDetectMs >= 150) {
    switching = true;
    const slow = tracker;
    tracker = null;
    try {
      tracker = await PoseTracker.create(true);
      slow.close();
      console.info(`Riconoscimento del corpo su GPU troppo lento (${Math.round(slow.avgDetectMs)} ms): passo alla CPU`);
    } catch {
      tracker = slow;
    } finally {
      switching = false;
    }
    return;
  }

  // Lo stesso per il secondo e il terzo modello: sono indipendenti e ripiegano uno per volta.
  if (handsTracker && handsTracker.delegate === "GPU" && handsTracker.detections >= 8 && handsTracker.avgDetectMs >= 150) {
    switching = true;
    const slow = handsTracker;
    handsTracker = null;
    try {
      handsTracker = await HandsTracker.create(true);
      slow.close();
      console.info(`Riconoscimento delle mani su GPU troppo lento (${Math.round(slow.avgDetectMs)} ms): passo alla CPU`);
    } catch {
      handsTracker = slow;
    } finally {
      switching = false;
    }
    return;
  }

  if (faceTracker && faceTracker.delegate === "GPU" && faceTracker.detections >= 8 && faceTracker.avgDetectMs >= 150) {
    switching = true;
    const slow = faceTracker;
    faceTracker = null;
    try {
      faceTracker = await FaceTracker.create(true);
      slow.close();
      console.info(`Riconoscimento del volto su GPU troppo lento (${Math.round(slow.avgDetectMs)} ms): passo alla CPU`);
    } catch {
      faceTracker = slow;
    } finally {
      switching = false;
    }
  }
}

// --- I posti (al massimo cinque persone insieme: vedi presenza.ts) -------------------------------
const ETICHETTA_AVVIO = ui.start.textContent ?? "Accendi la camera";
/** Un clic durante l'attesa la annulla; `attesaGen` fa morire i cicli di attesa rimasti indietro. */
let inAttesa = false;
let attesaGen = 0;

/** Mostra (o toglie, con `null`) il messaggio «al completo» e trasforma il pulsante in «Annulla». */
function mostraAttesa(testo: string | null): void {
  if (testo) {
    ui.error.textContent = testo;
    ui.error.hidden = false;
    ui.start.textContent = "Annulla attesa";
    ui.start.disabled = false;
  } else {
    ui.error.hidden = true;
    ui.start.textContent = ETICHETTA_AVVIO;
  }
}

/** Il posto è scaduto e nel frattempo il sito si è riempito: la camera si spegne e lo si dice. */
function postoPerso(): void {
  stop();
  ui.error.textContent = "Il tuo posto è scaduto e nel frattempo il sito si è riempito. Riprova fra poco.";
  ui.error.hidden = false;
}

async function start(): Promise<void> {
  // Un secondo clic mentre si aspetta un posto è «annulla».
  if (inAttesa) {
    inAttesa = false;
    attesaGen++;
    return;
  }
  ui.error.hidden = true;
  const mia = ++attesaGen;
  inAttesa = true;
  const entrato = await entra(mostraAttesa, () => mia !== attesaGen);
  inAttesa = false;
  if (!entrato) return; // attesa annullata
  if (document.hidden) {
    // La scheda è stata nascosta mentre si aspettava e il posto è arrivato proprio ora: non si accende
    // la camera per nessuno, e il posto torna a chi è davvero in coda.
    libera();
    return;
  }
  setState("loading", "Avvio…");
  try {
    // I due modelli si creano **uno dopo l'altro**, mai con `Promise.all`: la libreria passa la
    // funzione che costruisce il modulo WebAssembly attraverso una variabile globale che azzera
    // subito dopo averla letta, e due creazioni in parallelo se la contendono (vedi hands.ts).
    tracker ??= await PoseTracker.create(); // prima i modelli, poi la camera
    handsTracker ??= await HandsTracker.create();
    faceTracker ??= await FaceTracker.create();
    stream = await startCamera(ui.video, stop); // `stop` anche se la camera si spegne da sola
    // (permesso revocato, webcam staccata, un'altra app che se la prende)

    if (document.hidden) {
      stop();
      return;
    }

    scene.setFrameAspect(ui.video.videoWidth / ui.video.videoHeight);
    lastVideoTime = -1;
    setState("running", "● Camera accesa");
    mantieni(postoPerso);
    cancelAnimationFrame(rafId);
    loop();
  } catch (e) {
    stop();
    ui.error.textContent = e instanceof CameraError ? e.message : `Errore durante l'avvio: ${(e as Error).message ?? e}`;
    ui.error.hidden = false;
    setState("error", "Camera spenta");
  }
}

function stop(): void {
  libera(); // il posto torna a disposizione di chi aspetta
  cancelAnimationFrame(rafId);
  stopCamera(ui.video, stream);
  stream = null;
  scene.update(null);
  smoother = null;
  handSmoothers.left = handSmoothers.right = null;
  faceTracker?.reset();
  azzeraDatiE2E();

  // Il ciclo è fermo, ma la dissolvenza dura ancora qualche decimo di secondo.
  let n = 20;
  const fadeOut = () => {
    scene.render();
    if (--n > 0) requestAnimationFrame(fadeOut);
  };
  fadeOut();
  setState("idle", "Camera spenta");
}

ui.start.addEventListener("click", () => void start());
ui.stop.addEventListener("click", stop);

ui.togglePreview.addEventListener("click", () => {
  const show = ui.togglePreview.getAttribute("aria-pressed") !== "true";
  ui.togglePreview.setAttribute("aria-pressed", String(show));
  ui.togglePreview.textContent = show ? "Nascondi camera" : "Mostra camera";
  ui.preview.hidden = !show;
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && stream) stop();
});

window.addEventListener("pagehide", () => {
  stop();
  tracker?.close();
  tracker = null;
  handsTracker?.close();
  handsTracker = null;
  faceTracker?.close();
  faceTracker = null;
});

scene.render();

iniziaSchermoIntero(); // il pulsante «Schermo intero» nella barra in alto
