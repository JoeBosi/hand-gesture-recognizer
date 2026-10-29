/**
 * main.ts — il regista dell'applicazione.
 *
 * Qui non c'è quasi nessun calcolo: il compito di questo file è mettere in fila gli altri quattro
 * moduli, uno per ogni pezzo del lavoro, e gestire lo stato della pagina (spenta, in avvio, in
 * funzione, in errore).
 *
 *   camera.ts   accende e spegne la webcam
 *   tracker.ts  chiede a MediaPipe dove sono mano e dita
 *   filter.ts   smorza il tremolio dei punti rilevati
 *   hand3d.ts   disegna la mano stilizzata in 3D
 *
 * Il giro completo di ogni fotogramma è: video → tracker → filtro → scena 3D + anteprima 2D.
 * Spiegazione estesa con i disegni: ../../docs/COME-FUNZIONA.md
 */
import "./accessi";
import "./piede";
import "./style.css";
import "./mano.css";
import { DrawingUtils, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { CameraError, startCamera, stopCamera } from "./camera";
import { entra, libera, mantieni } from "./presenza";
import { iniziaSchermoIntero } from "./schermo-intero";
import { LandmarkSmoother } from "./filter";
import { HandScene, type Side } from "./hand3d";
import { GESTURE_LABELS, HAND_CONNECTIONS, HandTracker } from "./tracker";
import { t } from "./i18n";

/**
 * Scorciatoia per prendere un elemento dall'HTML.
 * Il `as T` è una promessa fatta a TypeScript ("fidati, questo elemento esiste ed è di questo
 * tipo"): qui è lecita perché gli id sono scritti a mano in index.html e non cambiano a runtime.
 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * Tutti i nodi della pagina raccolti in un punto solo. Se domani cambia un id in index.html,
 * si corregge qui e non sparso in mezzo alla logica.
 */
const ui = {
  scene: $<HTMLCanvasElement>("scene"), // tela con la mano 3D (metà schermo)
  intro: $("intro"), // riquadro iniziale con il pulsante di avvio
  avviso: $("avviso"), // "avvicina la mano": vedi misuraPalmo()
  start: $<HTMLButtonElement>("start"),
  error: $("error"), // riga rossa dei messaggi di errore
  status: $("status"), // "Camera spenta" / "● Camera accesa"
  preview: $("preview"), // riquadro dell'anteprima webcam
  video: $<HTMLVideoElement>("video"), // <video> che riceve il flusso della camera
  overlay: $<HTMLCanvasElement>("overlay"), // tela sopra l'anteprima per i puntini
  hud: $("hud"), // barra in basso
  gestures: $("gestures"), // testo "Destra: 👍 Pollice su"
  fps: $("fps"),
  togglePreview: $<HTMLButtonElement>("toggle-preview"),
  stop: $<HTMLButtonElement>("stop"),
};

/** Gli unici quattro stati possibili della pagina. */
type State = "idle" | "loading" | "running" | "error";

// --- Oggetti di lunga durata, creati una volta sola all'apertura della pagina ---------------

/** La scena 3D. Si costruisce subito: mostra uno sfondo vuoto finché non arriva una mano. */
const scene = new HandScene(ui.scene);

/** Contesto 2D dell'anteprima e utilità di MediaPipe per disegnare punti e ossa. */
const overlayCtx = ui.overlay.getContext("2d")!;
const drawing = new DrawingUtils(overlayCtx);

/**
 * Un filtro anti-tremolio per lato. È `null` quando quella mano non è inquadrata: alla ricomparsa
 * se ne crea uno nuovo, altrimenti il filtro "ricorderebbe" dove stava prima e la mano arriverebbe
 * strisciando da lì.
 */
const smoothers: Record<Side, LandmarkSmoother | null> = { Right: null, Left: null };

/** Etichette mostrate all'utente. Il codice ragiona in inglese, l'interfaccia parla italiano. */
const SIDE_IT: Record<Side, string> = { Right: t("lato.Right"), Left: t("lato.Left") };

/**
 * Con `?e2e` nell'indirizzo la pagina espone nel DOM il suo stato (quante mani, quale gesto, dove
 * sta il polso): serve ai test automatici, che altrimenti non avrebbero modo di "vedere" il 3D.
 * Fuori dai test è spento di proposito: sono pur sempre dati sulla mano dell'utente, e qualunque
 * estensione del browser potrebbe leggerli dalla pagina.
 */
const E2E = new URLSearchParams(location.search).has("e2e");

/**
 * Una mano compare sullo schermo solo dopo tre rilevazioni consecutive.
 * Motivo misurato: nei cambi bruschi di immagine MediaPipe ogni tanto "vede" per un fotogramma
 * solo una seconda mano che non esiste (2 volte su 117 nei test). Senza questa conferma si
 * vedrebbe un lampo di mano fantasma.
 */
const CONFIRM_FRAMES = 3;
const streak: Record<Side, number> = { Right: 0, Left: 0 };

/**
 * «Avvicina la mano»: come si decide che è troppo lontana.
 *
 * Si misura il PALMO, cioè la distanza fra il polso (punto 0) e la nocca del medio (punto 9). È la
 * misura più stabile che la mano offra: non cambia aprendo o chiudendo le dita, a differenza della
 * larghezza complessiva o del riquadro che contiene i 21 punti, che si dimezza a pugno chiuso.
 * Più la mano è lontana dalla camera, più quel segmento è corto nell'immagine.
 *
 * L'unità è "quanta parte dell'altezza dell'immagine": le x di MediaPipe sono divise per la
 * larghezza e le y per l'altezza, quindi la x va riportata alla stessa scala moltiplicandola per
 * le proporzioni del video. Senza questa correzione la stessa mano darebbe numeri diversi su una
 * webcam 4:3 e su una 16:9.
 *
 * Le due soglie sono MISURATE, non scelte a occhio. La stessa foto di una mano è stata messa
 * dentro un fotogramma 640×480 a quattro dimensioni diverse, per simulare la distanza, e il palmo
 * è risultato proporzionale come ci si aspetta:
 *
 *   la mano occupa   palmo misurato   rilevata
 *        100%            0,345         108/110
 *         60%            0,204          86/88
 *         40%            0,136         102/104
 *         28%            0,093          79/81
 *
 * Da notare: MediaPipe la trova lo stesso anche piccola — il problema non è che smetta di
 * funzionare, è che a quel punto le dita sono pochi pixel e la mano 3D diventa imprecisa. La
 * soglia è quindi una scelta di comodità, fissata intorno a un terzo del fotogramma.
 *
 * Le soglie sono due apposta: con una sola, una mano ferma sul confine farebbe lampeggiare
 * l'avviso. Si accende sotto la prima e si spegne solo sopra la seconda.
 */
const PALMO_LONTANO = 0.115; // sotto questo (mano sotto ~1/3 del fotogramma): troppo lontana
const PALMO_VICINO = 0.13; // sopra questo (~38% del fotogramma): di nuovo a posto
/** Fotogrammi consecutivi prima di cambiare idea: evita che l'avviso appaia per un singolo scatto. */
const AVVISO_FRAMES = 5;
let lontanaDa = 0; // da quanti fotogrammi di fila la mano risulta lontana
let vicinaDa = 0; // da quanti di fila risulta abbastanza vicina
let avvisoAcceso = false;

/**
 * La lunghezza del palmo nell'immagine, nell'unità descritta sopra.
 * `aspect` = larghezza/altezza del video.
 */
function misuraPalmo(landmarks: NormalizedLandmark[], aspect: number): number {
  const polso = landmarks[0];
  const nocca = landmarks[9];
  if (!polso || !nocca) return 0;
  const dx = (nocca.x - polso.x) * aspect;
  const dy = nocca.y - polso.y;
  return Math.hypot(dx, dy);
}

/**
 * Accende o spegne l'avviso, con le due soglie e i fotogrammi di conferma.
 *
 * Quando non c'è nessuna mano inquadrata l'avviso si spegne e i contatori si azzerano: dire
 * «avvicinati» a chi non ha ancora alzato la mano sarebbe solo rumore, e il caso "nessuna mano"
 * lo racconta già la barra in basso.
 */
function aggiornaAvviso(ciSonoMani: boolean, palmo: number): void {
  if (!ciSonoMani) {
    lontanaDa = vicinaDa = 0;
    mostraAvviso(false);
    return;
  }
  if (palmo < PALMO_LONTANO) {
    lontanaDa++;
    vicinaDa = 0;
    if (lontanaDa >= AVVISO_FRAMES) mostraAvviso(true);
  } else if (palmo > PALMO_VICINO) {
    vicinaDa++;
    lontanaDa = 0;
    if (vicinaDa >= AVVISO_FRAMES) mostraAvviso(false);
  }
  // Fra le due soglie non si cambia idea: è la zona morta che evita il lampeggio.
}

function mostraAvviso(acceso: boolean): void {
  if (acceso === avvisoAcceso) return; // niente scritture inutili nel DOM a ogni fotogramma
  avvisoAcceso = acceso;
  ui.avviso.textContent = acceso ? t("mano.avvicina") : "";
  ui.avviso.hidden = !acceso;
}

// --- Stato mutevole ------------------------------------------------------------------------

let tracker: HandTracker | null = null; // il riconoscitore MediaPipe (creato al primo avvio)
let stream: MediaStream | null = null; // il flusso della webcam, quando è accesa
let rafId = 0; // id dell'ultimo requestAnimationFrame, per poterlo annullare
let lastVideoTime = -1; // istante dell'ultimo fotogramma già analizzato
let frames = 0; // contatore per il calcolo degli fps
let fpsWindowStart = performance.now();

/**
 * Cambia stato alla pagina: un solo punto decide cosa si vede e cosa no.
 * `data-state` sul <body> serve anche ai test e, volendo, al CSS.
 */
function setState(state: State, status: string): void {
  document.body.dataset.state = state;
  ui.status.textContent = status;
  ui.status.classList.toggle("live", state === "running"); // pallino rosso quando la camera è accesa
  ui.intro.hidden = state === "running";
  ui.hud.hidden = state !== "running";
  // L'anteprima torna visibile solo se l'utente non l'aveva nascosta con il pulsante.
  ui.preview.hidden = state !== "running" || ui.togglePreview.getAttribute("aria-pressed") !== "true";
  ui.start.disabled = state === "loading";
  ui.start.textContent = state === "loading" ? t("cam.avvio") : t("cam.accendi");
}

/**
 * Da quale mano arriva questo scheletro?
 *
 * MediaPipe decide destra/sinistra dando per scontato che l'immagine sia già specchiata, come in
 * una videochiamata. Il fotogramma grezzo della webcam però non lo è, quindi la sua etichetta va
 * ribaltata. Verificato il 2026-09-17 su una foto di mano sinistra: MediaPipe diceva "Right".
 */
function realSide(label: string | undefined): Side {
  return label === "Left" ? "Right" : "Left";
}

/**
 * Il ciclo principale, richiamato dal browser prima di ogni ridisegno (di solito 60 volte al
 * secondo). Il riconoscimento invece gira solo quando c'è davvero un fotogramma nuovo dalla
 * webcam (~30 al secondo): analizzare due volte lo stesso fotogramma sarebbe lavoro sprecato, e
 * MediaPipe rifiuta comunque due analisi con lo stesso istante.
 */
function loop(): void {
  rafId = requestAnimationFrame(loop);
  const video = ui.video;
  // readyState >= 2 significa "ci sono dati per il fotogramma corrente".
  if (tracker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();

    // QUI avviene il riconoscimento vero e proprio: immagine dentro, 21 punti per mano fuori.
    const result = tracker.detect(video, now);

    // La tela dell'anteprima ha le dimensioni reali del video (es. 640×480); il CSS poi la
    // rimpicciolisce. Così i punti disegnati coincidono con l'immagine sotto.
    if (ui.overlay.width !== video.videoWidth) {
      ui.overlay.width = video.videoWidth;
      ui.overlay.height = video.videoHeight;
    }
    overlayCtx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);

    const seen = new Set<Side>(); // mani rilevate in questo fotogramma
    const shown: Side[] = []; // di quelle, le confermate e quindi disegnate
    const shownGestures: string[] = [];
    const labels: string[] = []; // testo per la barra in basso
    // Proporzioni del video: servono a misurare il palmo in modo indipendente dalla webcam.
    const aspect = video.videoWidth / video.videoHeight || 4 / 3;
    let palmoMax = 0; // la più vicina delle mani inquadrate decide l'avviso

    result.landmarks.forEach((landmarks: NormalizedLandmark[], i) => {
      let side = realSide(result.handedness[i]?.[0]?.categoryName);
      // Se MediaPipe attribuisce lo stesso lato a entrambe le mani (succede raramente), la seconda
      // finisce nell'altro contenitore: meglio un'etichetta sbagliata che una mano che sparisce.
      if (seen.has(side)) side = side === "Right" ? "Left" : "Right";
      seen.add(side);
      streak[side]++;

      // Il filtro lavora anche durante i fotogrammi di conferma, così quando la mano appare
      // è già stabile invece di assestarsi sotto gli occhi dell'utente.
      smoothers[side] ??= new LandmarkSmoother();
      const smoothed = smoothers[side]!.smooth(landmarks, now);
      if (streak[side] < CONFIRM_FRAMES) return; // non ancora confermata: niente da disegnare

      // Quanto è lontana: si misura sui punti grezzi, che corrispondono all'immagine vera.
      palmoMax = Math.max(palmoMax, misuraPalmo(landmarks, aspect));

      // 1) la mano 3D, con i punti addolciti dal filtro
      scene.update(side, smoothed);

      // 2) l'anteprima 2D, con i punti grezzi: lì serve la corrispondenza esatta con l'immagine
      drawing.drawConnectors(landmarks, HAND_CONNECTIONS, { color: side === "Right" ? "#38bdf8" : "#f472b6", lineWidth: 3 });
      drawing.drawLandmarks(landmarks, { color: "#ffffff", radius: 2.5, lineWidth: 1 });

      // 3) il nome del gesto, se il modello ne riconosce uno ("None" = nessuno tra gli otto noti)
      const gesture = result.gestures[i]?.[0];
      shown.push(side);
      shownGestures.push(gesture?.categoryName ?? "None");
      const name = gesture && gesture.categoryName !== "None" ? GESTURE_LABELS[gesture.categoryName] : undefined;
      labels.push(`${SIDE_IT[side]}: ${name ?? "✋"}`);
    });

    // Le mani non viste in questo fotogramma spariscono in dissolvenza e i loro contatori si azzerano.
    for (const side of ["Right", "Left"] as Side[]) {
      if (!seen.has(side)) {
        streak[side] = 0;
        scene.update(side, null);
        smoothers[side] = null;
      }
    }

    aggiornaAvviso(shown.length > 0, palmoMax);

    // Stato leggibile dai test automatici (solo con ?e2e, vedi sopra).
    if (E2E) {
      document.body.dataset.hands = String(shown.length);
      document.body.dataset.sides = shown.join(",");
      document.body.dataset.gestures = shownGestures.join(",");
      document.body.dataset.wrist = result.landmarks[0] ? result.landmarks[0][0].x.toFixed(3) : "";
      document.body.dataset.palm = palmoMax ? palmoMax.toFixed(3) : "";
      document.body.dataset.avviso = avvisoAcceso ? "1" : "0";
    }

    // La lettura, grande sotto la mano 3D. Quando non c'è nessuna mano il tono si abbassa
    // (classe `vuota`): è uno stato normale, non un guasto, e non deve gridare come un avviso.
    ui.gestures.textContent = labels.length ? labels.join("   ·   ") : t("mano.nessuna");
    ui.gestures.classList.toggle("vuota", labels.length === 0);

    // Fotogrammi analizzati nell'ultimo secondo: è la velocità del riconoscimento, non quella del
    // disegno, ed è il numero che conta per capire se l'app "sta dietro" alla mano.
    frames++;
    if (now - fpsWindowStart >= 1000) {
      ui.fps.textContent = `${Math.round((frames * 1000) / (now - fpsWindowStart))} fps · ${tracker.delegate}`;
      frames = 0;
      fpsWindowStart = now;
    }
  }

  // Il disegno 3D gira sempre, anche senza fotogrammi nuovi: così le dissolvenze restano fluide.
  scene.render();
  void fallbackToCpuIfSlow(); // `void`: non aspettiamo il risultato, è un controllo di sfondo
}

let switching = false;

/**
 * Rete di sicurezza sulle prestazioni.
 *
 * Di norma il riconoscimento gira sulla scheda grafica ed è più veloce. Su alcune configurazioni
 * (GPU emulata, driver vecchi) succede il contrario: nei test in un browser senza scheda grafica
 * la GPU impiegava 3-5 secondi a fotogramma, la CPU faceva 4-6 fotogrammi al secondo.
 * Se dopo 8 rilevazioni la media supera i 150 ms, il riconoscitore viene ricreato su CPU.
 * L'utente può forzare la stessa scelta con `?delegate=cpu` nell'indirizzo.
 */
async function fallbackToCpuIfSlow(): Promise<void> {
  if (!tracker || switching || tracker.delegate !== "GPU" || tracker.detections < 8 || tracker.avgDetectMs < 150) return;
  switching = true;
  const slow = tracker;
  tracker = null; // mentre il nuovo non è pronto, il ciclo salta le rilevazioni
  try {
    tracker = await HandTracker.create(true); // true = solo CPU
    slow.close(); // il vecchio va chiuso: tiene memoria e contesto grafico
    console.info(`Riconoscimento su GPU troppo lento (${Math.round(slow.avgDetectMs)} ms): passo alla CPU`);
  } catch {
    tracker = slow; // se la creazione fallisce si continua con quello di prima
  } finally {
    switching = false;
  }
}

/**
 * Avvio, dal clic sul pulsante. L'ordine conta: prima il modello (pesante, ~8 MB, ma non chiede
 * niente all'utente), poi la webcam. Così il permesso viene chiesto quando manca poco al via, e
 * non si tiene la camera accesa per secondi mentre si scarica il modello.
 */
// --- I posti (al massimo cinque persone insieme: vedi presenza.ts) -------------------------------
const ETICHETTA_AVVIO = ui.start.textContent ?? t("cam.accendi");
/** Un clic durante l'attesa la annulla; `attesaGen` fa morire i cicli di attesa rimasti indietro. */
let inAttesa = false;
let attesaGen = 0;

/** Mostra (o toglie, con `null`) il messaggio «al completo» e trasforma il pulsante in «Annulla». */
function mostraAttesa(testo: string | null): void {
  if (testo) {
    ui.error.textContent = testo;
    ui.error.hidden = false;
    ui.start.textContent = t("presenza.annulla");
    ui.start.disabled = false;
  } else {
    ui.error.hidden = true;
    ui.start.textContent = ETICHETTA_AVVIO;
  }
}

/** Il posto è scaduto e nel frattempo il sito si è riempito: la camera si spegne e lo si dice. */
function postoPerso(): void {
  stop();
  ui.error.textContent = t("presenza.perso");
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
    tracker ??= await HandTracker.create(); // `??=`: la seconda accensione riusa il modello già in memoria
    stream = await startCamera(ui.video, stop); // `stop` anche se la camera si spegne da sola
    // (permesso revocato, webcam staccata, un'altra app che se la prende)

    // Se nel frattempo l'utente ha cambiato scheda, la camera non deve restare accesa in secondo
    // piano: era una delle osservazioni del controllo privacy.
    if (document.hidden) {
      stop();
      return;
    }

    // Le proporzioni reali del video decidono l'area utile della scena 3D (una webcam può dare
    // 4:3, 16:9 o un formato verticale sul telefono).
    scene.setFrameAspect(ui.video.videoWidth / ui.video.videoHeight);
    lastVideoTime = -1;
    setState("running", t("cam.accesa"));
    mantieni(postoPerso);
    cancelAnimationFrame(rafId); // per sicurezza: mai due cicli in parallelo
    loop();
  } catch (e) {
    stop();
    // CameraError porta già un messaggio comprensibile (permesso negato, camera occupata…);
    // per tutto il resto si mostra l'errore tecnico, meglio di un fallimento muto.
    ui.error.textContent = e instanceof CameraError ? e.message : t("cam.errore", { msg: String((e as Error).message ?? e) });
    ui.error.hidden = false;
    setState("error", t("cam.spenta"));
  }
}

/**
 * Spegnimento. Va lasciato tutto pulito: telecamera rilasciata (la spia del portatile si spegne),
 * ciclo fermo, mani svanite, filtri azzerati.
 * Il riconoscitore invece resta in memoria, pronto per una riaccensione immediata; viene chiuso
 * solo quando si lascia la pagina.
 */
function stop(): void {
  libera(); // il posto torna a disposizione di chi aspetta
  cancelAnimationFrame(rafId);
  stopCamera(ui.video, stream);
  stream = null;
  scene.update("Right", null);
  scene.update("Left", null);
  streak.Right = streak.Left = 0;
  smoothers.Right = smoothers.Left = null;
  lontanaDa = vicinaDa = 0;
  mostraAvviso(false);
  ui.gestures.textContent = "";
  ui.gestures.classList.remove("vuota");
  // La tela dei puntini va ripulita: quello che resta nel suo buffer è lo scheletro dell'ultima
  // mano inquadrata, cioè un dato ricavato dall'immagine di una persona, e senza `clearRect`
  // sopravvive allo spegnimento e può lampeggiare per un fotogramma alla riaccensione.
  overlayCtx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
  // Anche i dati di diagnostica dei test se ne vanno con la camera: esistono solo con `?e2e`, ma
  // restano pur sempre misure ricavate dall'immagine di una persona.
  if (E2E) {
    document.body.dataset.hands = "0";
    document.body.dataset.sides = "";
    document.body.dataset.gestures = "";
    document.body.dataset.wrist = "";
    document.body.dataset.palm = "";
    document.body.dataset.avviso = "0";
  }

  // Il ciclo principale è fermo, ma la dissolvenza della mano dura ancora qualche decimo di
  // secondo: si continua a disegnare per una ventina di fotogrammi.
  let n = 20;
  const fade = () => {
    scene.render();
    if (--n > 0) requestAnimationFrame(fade);
  };
  fade();
  setState("idle", t("cam.spenta"));
}

// --- Collegamenti con i comandi della pagina -----------------------------------------------

ui.start.addEventListener("click", () => void start());
ui.stop.addEventListener("click", stop);

ui.togglePreview.addEventListener("click", () => {
  // `aria-pressed` è insieme lo stato del pulsante e l'informazione per i lettori di schermo.
  const show = ui.togglePreview.getAttribute("aria-pressed") !== "true";
  ui.togglePreview.setAttribute("aria-pressed", String(show));
  ui.togglePreview.textContent = show ? t("cam.nascondi") : t("cam.mostra");
  ui.preview.hidden = !show;
});

// Scheda in secondo piano: la camera si spegne. È una scelta di riservatezza, ed evita anche di
// tenere occupata la webcam mentre il browser rallenta comunque i fotogrammi.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && stream) stop();
});

// Uscita dalla pagina: oltre alla camera si libera anche il riconoscitore (memoria e contesto
// grafico del WebAssembly).
window.addEventListener("pagehide", () => {
  stop();
  tracker?.close();
  tracker = null;
});

// Primo disegno: la tela mostra lo sfondo invece di restare trasparente in attesa del clic.
scene.render();

iniziaSchermoIntero(); // il pulsante «Schermo intero» nella barra in alto
