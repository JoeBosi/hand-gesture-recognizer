/**
 * onda.ts — l'onda energetica: due mani unite caricano una palla di luce, e dopo 4 secondi parte
 * il raggio.
 *
 * Il riconoscimento è quello di sempre (`tracker.ts`, non toccato). Quello che questa pagina
 * aggiunge è un *giudice della posa* e una macchina a quattro stati:
 *
 *      idle ──posa tenuta 0,3 s──▶ carica ──4 s──▶ raggio ──2,5 s──▶ riposo
 *        ▲                           │ (posa persa: la carica scende, a 0 si riparte)   │
 *        └───────────────────────────┴──────── mani rilasciate per 0,6 s ◀─────────────┘
 *
 * QUATTRO DECISIONI, e il motivo di ciascuna:
 *
 * 1. **La posa si giudica su misure, con soglie misurate.** Due mani, polsi vicini (rispetto alla
 *    lunghezza del palmo), dita aperte, dita aperte (le mani possono stare a ventaglio). I numeri sono quelli
 *    misurati sul filmato di prova (vedi le costanti qui sotto e docs/JOURNAL.md), non ricordati
 *    a memoria.
 *
 * 2. **Due soglie per ogni misura** (una per accendere, una più larga per spegnere). Con una
 *    soglia sola, una mano ferma sul confine farebbe entrare e uscire dalla posa a ogni
 *    fotogramma e la carica non finirebbe mai.
 *
 * 3. **Tolleranza di 0,4 s.** Il riconoscitore ogni tanto perde le mani per un fotogramma. Senza
 *    tolleranza, 3 secondi e mezzo di carica andrebbero persi per uno starnuto del modello. E anche
 *    quando la posa si perde davvero la carica non crolla a zero: scende a velocità doppia di
 *    come sale, e se arriva a zero si ricomincia.
 *
 * 4. **Effetti e riconoscimento vanno separati.** Il riconoscimento gira quando arriva un
 *    fotogramma dalla webcam (30 al secondo, o 4 su un computer lento); gli effetti si
 *    ridisegnano a ogni `requestAnimationFrame`, interpolando fra le ultime posizioni note. Così la
 *    palla si muove fluida anche quando il riconoscitore è lento.
 *
 * LIMITE NOTO, da dire chiaro: dalla sola immagine 2D **non si può sapere se i palmi guardano la
 * camera**. La posa riconosciuta è «due mani aperte, con i polsi uniti» (anche a ventaglio): va
 * bene sia con i palmi rivolti alla camera sia con i dorsi. È una posa di mani, non un'analisi
 * di come sono ruotate.
 */
import "./accessi";
import "./piede";
import "./style.css";
import "./onda.css";
import { DrawingUtils, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { CameraError, startCamera, stopCamera } from "./camera";
import { entra, libera, mantieni } from "./presenza";
import { iniziaSchermoIntero } from "./schermo-intero";
import { SuonoOnda } from "./onda-audio";
import { HAND_CONNECTIONS, HandTracker } from "./tracker";
import {
  Particelle,
  disegnaAnello,
  disegnaBuio,
  disegnaLampo,
  disegnaRaggio,
  disegnaSfera,
  type Punto,
} from "./onda-fx";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  intro: $("intro"),
  start: $<HTMLButtonElement>("start"),
  error: $("error"),
  status: $("status"),
  stage: $("stage"),
  video: $<HTMLVideoElement>("video"),
  overlay: $<HTMLCanvasElement>("overlay"),
  grido: $("grido"),
  suggerimento: $("suggerimento"),
  hud: $("hud"),
  fps: $("fps"),
  stop: $<HTMLButtonElement>("stop"),
  suono: $<HTMLButtonElement>("suono"),
};

type State = "idle" | "loading" | "running" | "error";

// --- Soglie della posa ---------------------------------------------------------------------------
// Misurate sul filmato di prova `onda.mjpeg` (vedi docs/JOURNAL.md). Per ogni misura ce ne sono
// due: la prima per ENTRARE nella posa, la seconda — più larga — per RESTARNE DENTRO.

/** Distanza fra i polsi divisa per la lunghezza media del palmo. Misurato sul filmato: ~1,0. */
const POLSI_ENTRA = 1.6;
const POLSI_RESTA = 2.0;
/**
 * Angolo massimo fra le direzioni delle dita delle due mani (gradi).
 *
 * Era 75°, e una persona vera non lo rispetta: nella posa dell'onda le mani si tengono a ventaglio,
 * una con le dita in su e l'altra di lato, a ~100–110° fra loro (misurato a occhio sul fotogramma
 * di chi lo ha provato). A 75° la sua posa veniva scartata. Ora il controllo c'è solo per scartare le
 * mani che puntano in versi opposti (preghiera rovesciata, braccia incrociate): 135° per entrare,
 * 160° per restare.
 */
const ANGOLO_ENTRA = 135;
const ANGOLO_RESTA = 160;
/**
 * Quante dita (su otto: quattro per mano, pollice escluso) devono essere stese, SOMMANDO le due
 * mani. Prima si chiedeva "almeno tre per mano": una mano a coppa o puntata verso la camera ha le
 * dita scorciate e ne risulta con due o una, e la posa veniva scartata. Con quattro in tutto passa
 * una mano aperta e una a coppa, e continuano a non passare due pugni.
 */
const DITA_ENTRA = 4;
const DITA_RESTA = 3;
/**
 * Lunghezza polso→punta del medio divisa per quella del palmo. Una mano aperta e di fronte dà ~1,9;
 * puntata verso la camera si accorcia per la prospettiva. Sotto questa soglia la direzione 2D
 * delle dita non è più affidabile e il raggio parte in orizzontale.
 */
const SCORCIO = 1.0;
/** Sotto questa lunghezza (in palmi) le dita puntano quasi verso la camera: l'angolo non si misura. */
const DITA_CORTE = 0.45;

// --- Tempi (millisecondi) --------------------------------------------------------------------------

const MS_CARICA = 4000; // quanto va tenuta la posa
const MS_CONFERMA = 300; // la posa deve reggere questo tempo prima che la carica cominci
const MS_TOLLERANZA = 400; // buco di riconoscimento che si perdona
const MS_SCOMPARSA = 150; // mani non viste per tanto tempo: l'onda SPARISCE (non decresce)
const MS_RAGGIO = 2500; // quanto dura il raggio
const MS_RILASCIO = 600; // mani lontane per tanto tempo prima di poter ricaricare
const MS_LAMPO = 250; // dissolvenza del lampo bianco

// --- La misura della posa ---------------------------------------------------------------------------

interface Analisi {
  numMani: number;
  /** Distanza polsi / lunghezza palmo. Infinito se non ci sono due mani. */
  polsi: number;
  /** Dita stese nella mano che ne ha meno. */
  dita: number;
  /** Angolo fra le direzioni delle dita, in gradi. */
  angolo: number;
  /** Centro della palla e dimensione, già in pixel della tela. */
  x: number;
  y: number;
  palmo: number;
  /** Direzione delle dita (vettore unitario in pixel), o null se la prospettiva la rende inaffidabile. */
  dir: Punto | null;
}

const NESSUNA: Analisi = { numMani: 0, polsi: Infinity, dita: 0, angolo: 180, x: 0, y: 0, palmo: 0, dir: null };

const PUNTE = [8, 12, 16, 20]; // indice, medio, anulare, mignolo
const FALANGI = [6, 10, 14, 18]; // il «ginocchio» di ciascun dito (PIP)

/**
 * Lavora in «unità d'altezza»: la x di MediaPipe è divisa per la larghezza e la y per l'altezza,
 * quindi 0,1 in x e 0,1 in y NON sono la stessa distanza. Moltiplicando la x per le proporzioni
 * del video (larghezza/altezza) si torna a unità uguali nei due assi, e le distanze sono vere.
 * Moltiplicando poi per l'altezza della tela si hanno pixel.
 */
function analizza(mani: NormalizedLandmark[][], aspect: number, H: number): Analisi {
  if (mani.length < 2) return { ...NESSUNA, numMani: mani.length };
  const [a, b] = mani;
  const u = (l: NormalizedLandmark[], i: number): Punto => ({ x: l[i].x * aspect, y: l[i].y });
  const dist = (p: Punto, q: Punto) => Math.hypot(p.x - q.x, p.y - q.y);

  // La lunghezza del palmo (polso → nocca del medio) si accorcia quando la mano punta verso la
  // camera, e dividere per lei farebbe sembrare lontani due polsi che si toccano. La larghezza del
  // palmo (indice → mignolo) invece resta quella: si usa la maggiore delle due.
  const scalaMano = (l: NormalizedLandmark[]) => Math.max(dist(u(l, 0), u(l, 9)), dist(u(l, 5), u(l, 17)) * 1.15);
  const palmoA = scalaMano(a);
  const palmoB = scalaMano(b);
  const palmo = Math.max((palmoA + palmoB) / 2, 1e-4);
  const polsi = dist(u(a, 0), u(b, 0)) / palmo;

  // Un dito è «steso» se la punta sta più lontana dal polso del suo ginocchio.
  const stese = (l: NormalizedLandmark[]) =>
    PUNTE.filter((p, i) => dist(u(l, 0), u(l, p)) > dist(u(l, 0), u(l, FALANGI[i])) * 1.04).length;
  const dita = stese(a) + stese(b);

  // Direzione delle dita: dal polso alla nocca del medio (stabile), per ciascuna mano.
  const va = { x: u(a, 9).x - u(a, 0).x, y: u(a, 9).y - u(a, 0).y };
  const vb = { x: u(b, 9).x - u(b, 0).x, y: u(b, 9).y - u(b, 0).y };
  const coseno = (va.x * vb.x + va.y * vb.y) / Math.max(Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y), 1e-6);
  // Se una delle due mani punta quasi verso la camera la sua direzione nel piano è rumore: in quel
  // caso l'angolo non si giudica (si considera 0), perché sarebbe una misura inventata.
  const corte = Math.min(Math.hypot(va.x, va.y) / palmoA, Math.hypot(vb.x, vb.y) / palmoB) < DITA_CORTE;
  const angolo = corte ? 0 : (Math.acos(Math.max(-1, Math.min(1, coseno))) * 180) / Math.PI;

  // Il centro del palmo: la media di polso e attaccature delle dita. I punti 0,5,9,13,17 non si
  // muovono quando si piegano le dita, quindi la palla non balla se si stringono le mani.
  const centro = (l: NormalizedLandmark[]): Punto => {
    const idx = [0, 5, 9, 13, 17];
    return { x: idx.reduce((s, i) => s + l[i].x, 0) / idx.length, y: idx.reduce((s, i) => s + l[i].y, 0) / idx.length };
  };
  const ca = centro(a);
  const cb = centro(b);

  // Verso delle dita: dalla media dei polsi alla media delle punte dei medi.
  const poA = u(a, 0);
  const poB = u(b, 0);
  const tiA = u(a, 12);
  const tiB = u(b, 12);
  const dx = (tiA.x + tiB.x - poA.x - poB.x) / 2;
  const dy = (tiA.y + tiB.y - poA.y - poB.y) / 2;
  const lung = Math.hypot(dx, dy);
  const dir = lung / palmo >= SCORCIO ? { x: dx / lung, y: dy / lung } : null;

  const W = aspect * H;
  return {
    numMani: 2,
    polsi,
    dita,
    angolo,
    x: ((ca.x + cb.x) / 2) * W,
    y: ((ca.y + cb.y) / 2) * H,
    palmo: palmo * H,
    dir,
  };
}

/** Il giudizio, con la soglia larga se si è già nella posa e quella stretta per entrarci. */
function inPosa(a: Analisi, dentro: boolean): boolean {
  if (a.numMani < 2) return false;
  return (
    a.polsi <= (dentro ? POLSI_RESTA : POLSI_ENTRA) &&
    a.angolo <= (dentro ? ANGOLO_RESTA : ANGOLO_ENTRA) &&
    a.dita >= (dentro ? DITA_RESTA : DITA_ENTRA)
  );
}

/** Che cosa dire a chi non ci riesce: la prima cosa che non va, in parole. */
function consiglio(a: Analisi): string {
  if (a.numMani === 0) return "Alza le due mani davanti alla camera";
  if (a.numMani === 1) return "Serve anche l'altra mano";
  if (a.polsi > POLSI_ENTRA) return "Avvicina i polsi, uno contro l'altro";
  if (a.dita < DITA_ENTRA) return "Apri le dita";
  if (a.angolo > ANGOLO_ENTRA) return "Le mani non devono puntare in versi opposti";
  return "";
}

// --- Stato -----------------------------------------------------------------------------------------

type Fase = "idle" | "carica" | "raggio" | "riposo";

let fase: Fase = "idle";
let carica = 0; // 0..1
let tenutaDa: number | null = null; // da quando la posa regge (per la conferma)
let inizioPosa: number | null = null; // la prima volta che la posa è stata vista, in questo ciclo di carica
let ultimaPosa = -Infinity; // ultimo istante in cui la posa è risultata valida
let posaGrezza = false; // la posa è valida nell'ultimo fotogramma analizzato
let tRaggio = 0; // istante dello sparo
let rilascioDa: number | null = null; // da quando le mani sono fuori posa (in «riposo»)
let lampoDa = -Infinity;
let ultimaAnalisi: Analisi = NESSUNA;
/** Da quando non si vedono due mani (`null` se si vedono). Serve a far sparire l'onda se una mano esce. */
let maniAssentiDa: number | null = null;

/** La geometria della palla/raggio: l'ultima misurata (`bersaglio`) e quella disegnata (`vista`). */
interface Geo {
  x: number;
  y: number;
  palmo: number;
  dir: Punto | null;
}
let bersaglio: Geo | null = null;
let vista: Geo | null = null;
/** Il raggio, una volta sparato: dov'è e dove punta. */
let raggio: { x: number; y: number; dx: number; dy: number; spessore: number } | null = null;

let ultimiLandmark: NormalizedLandmark[][] = [];
let ultimiLandmarkT = -Infinity;

const ctx = ui.overlay.getContext("2d")!;
const drawing = new DrawingUtils(ctx);
const particelle = new Particelle();
const ridotto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const E2E = new URLSearchParams(location.search).has("e2e");

let tracker: HandTracker | null = null;
let stream: MediaStream | null = null;
let rafId = 0;
let lastVideoTime = -1;
let frames = 0;
let fpsWindowStart = performance.now();
let ultimoFotogramma = 0;
let buio = 0; // livello di scurimento disegnato (inseguito, per non scattare)

// --- Il suono -----------------------------------------------------------------------------------

/**
 * Il suono (src/onda-audio.ts) nasce al clic su «Accendi la camera»: i browser vietano di far
 * partire l'audio prima che l'utente abbia fatto qualcosa nella pagina, ed è quel clic a
 * soddisfare la regola. Si crea una volta sola; a camera spenta il contesto si sospende, così non
 * resta un motore audio acceso a vuoto.
 */
let audioCtx: AudioContext | null = null;
let audio: SuonoOnda | null = null;
let suonoMuto = false;
let ultimoAggiornamentoAudio = -Infinity;
/** Già portato a silenzio: finché la pagina resta inattiva non si aggiunge altro alla automazione. */
let audioInattivo = false;

function avviaAudio(): void {
  if (!("AudioContext" in window)) return; // senza Web Audio il gioco funziona uguale, muto
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
      audio = new SuonoOnda(audioCtx);
      audio.impostaMuto(suonoMuto);
    } catch {
      // Un browser vecchio senza uno dei nodi (per esempio il pannello stereo): la pagina non deve
      // rompersi per un suono che non può fare. Si va avanti muti.
      audio = null;
      void audioCtx?.close();
      audioCtx = null;
      return;
    }
  }
  void audioCtx.resume();
}

const tAudio = (): number => audioCtx?.currentTime ?? 0;

// --- Interfaccia -----------------------------------------------------------------------------------

function setState(state: State, status: string): void {
  document.body.dataset.state = state;
  ui.status.textContent = status;
  ui.status.classList.toggle("live", state === "running");
  ui.intro.hidden = state === "running";
  ui.stage.hidden = state !== "running";
  ui.hud.hidden = state !== "running";
  ui.start.disabled = state === "loading";
  ui.start.textContent = state === "loading" ? "Avvio in corso…" : "Accendi la camera e carica";
}

/** Scrive nel DOM solo se il testo è cambiato: a 60 fotogrammi al secondo conta. */
function testo(el: HTMLElement, valore: string, classe = ""): void {
  if (el.textContent !== valore) el.textContent = valore;
  if (el.dataset.stile !== classe) {
    el.dataset.stile = classe;
    el.className = classe ? `${el.id} ${classe}` : el.id;
  }
}

/** La scritta che si completa durante la carica, cinque passi sui quattro secondi. */
const GRIDO = ["ON…", "ONDA…", "ONDA ENER…", "ONDA ENERGE…", "ONDA ENERGETICA…"];
/** La scritta allo sparo. */
const GRIDO_SPARO = "ONDA ENERGETICA!!!";

/** Un dato per i test, solo con `?e2e`. Scrive solo se cambia (vedi `testo`). */
function dato(chiave: string, valore: string): void {
  if (E2E && document.body.dataset[chiave] !== valore) document.body.dataset[chiave] = valore;
}

function azzeraDati(): void {
  if (!E2E) return;
  for (const k of ["fase", "carica", "mani", "misura", "tenuta", "raggiox", "suono"]) document.body.dataset[k] = "";
  document.body.dataset.mani = "0";
}

// --- La macchina a stati ---------------------------------------------------------------------------

function spara(ora: number): void {
  // Quanto è durata la posa dalla prima volta che è stata vista: serve ai test, che altrimenti non
  // avrebbero modo di verificare che i secondi siano davvero quattro e non tre o sei.
  dato("tenuta", String(Math.round(ora - (inizioPosa ?? ora))));
  fase = "raggio";
  carica = 1;
  tRaggio = ora;
  lampoDa = ora;
  audio?.spara(tAudio());
  const g = vista ?? bersaglio;
  const H = ui.overlay.height;
  const W = ui.overlay.width;
  if (!g) return;
  // Se le dita non danno una direzione affidabile (mani puntate verso la camera) il raggio parte
  // in orizzontale, verso il lato dello schermo con più spazio.
  const dir = g.dir ?? { x: g.x < W / 2 ? 1 : -1, y: 0 };
  raggio = { x: g.x, y: g.y, dx: dir.x, dy: dir.y, spessore: Math.max(g.palmo * 0.5, 24 * (H / 480)) };
  particelle.svuota();
}

function avanza(ora: number, dtMs: number): void {
  // Se una mano (o tutte e due) esce dall'inquadratura, l'onda SPARISCE: non scende piano. Un
  // calo graduale faceva credere che la palla stesse aspettando il ritorno della mano, mentre
  // chi la sta caricando si aspetta che senza mani non ci sia più niente. Resta soltanto una
  // tolleranza minima (0,15 s) per i fotogrammi persi dal riconoscitore, che altrimenti
  // azzererebbero la carica a ogni sua distrazione.
  if (maniAssentiDa !== null && ora - maniAssentiDa >= MS_SCOMPARSA && (fase === "carica" || fase === "raggio")) {
    const eraRaggio = fase === "raggio";
    audio?.sparisce(tAudio()); // la palla si strappa: anche il suono
    fase = eraRaggio ? "riposo" : "idle";
    carica = 0;
    tenutaDa = null;
    inizioPosa = null;
    ultimaPosa = -Infinity; // senza questo la tolleranza di 0,4 s rimetterebbe subito in carica
    posaGrezza = false;
    raggio = null;
    rilascioDa = null;
    lampoDa = -Infinity;
    particelle.svuota();
    return;
  }
  const tenuta = posaGrezza || ora - ultimaPosa < MS_TOLLERANZA;

  switch (fase) {
    case "idle":
      if (!tenuta) {
        tenutaDa = null;
        break;
      }
      tenutaDa ??= ora;
      if (ora - tenutaDa >= MS_CONFERMA) {
        inizioPosa = tenutaDa;
        fase = "carica";
        audio?.ping(tAudio());
        carica = MS_CONFERMA / MS_CARICA; // i 0,3 s di conferma contano: dalla prima comparsa sono 4 s
      }
      break;

    case "carica":
      carica += (tenuta ? dtMs : -2 * dtMs) / MS_CARICA;
      if (carica >= 1) spara(ora);
      else if (carica <= 0) {
        carica = 0;
        fase = "idle";
        tenutaDa = null;
      }
      break;

    case "raggio":
      if (ora - tRaggio >= MS_RAGGIO) {
        fase = "riposo";
        carica = 0; // la palla è esplosa: il contatore riparte da zero (e `data-carica` non resta a 1)
        rilascioDa = null;
        raggio = null;
      }
      break;

    case "riposo":
      // Per ricaricare bisogna prima sciogliere la posa: altrimenti, tenendo le mani ferme, il
      // raggio ripartirebbe da solo ogni 6 secondi.
      if (posaGrezza) rilascioDa = null;
      else {
        rilascioDa ??= ora;
        if (ora - rilascioDa >= MS_RILASCIO) {
          fase = "idle";
          carica = 0;
          tenutaDa = null;
        }
      }
      break;
  }
}

// --- Disegno ---------------------------------------------------------------------------------------

function disegna(ora: number, dt: number, dtReale: number): void {
  const W = ui.overlay.width;
  const H = ui.overlay.height;
  const unita = H / 480;
  const t = ora / 1000;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);

  // La geometria disegnata insegue quella misurata: così la palla scorre invece di saltare a ogni
  // nuova rilevazione (a 4 rilevazioni al secondo sarebbe uno scatto ogni quarto di secondo).
  if (bersaglio) {
    if (!vista) vista = { ...bersaglio };
    else {
      const k = 1 - Math.exp(-dtReale * 14);
      vista.x += (bersaglio.x - vista.x) * k;
      vista.y += (bersaglio.y - vista.y) * k;
      vista.palmo += (bersaglio.palmo - vista.palmo) * k;
      if (bersaglio.dir && vista.dir) {
        const nx = vista.dir.x + (bersaglio.dir.x - vista.dir.x) * k;
        const ny = vista.dir.y + (bersaglio.dir.y - vista.dir.y) * k;
        const l = Math.hypot(nx, ny) || 1;
        vista.dir = { x: nx / l, y: ny / l };
      } else vista.dir = bersaglio.dir;
    }
  }

  // Il buio: inseguito, così entra ed esce piano.
  const obiettivoBuio = fase === "carica" ? carica : fase === "raggio" ? 0.65 : 0;
  buio += (obiettivoBuio - buio) * (1 - Math.exp(-dtReale * 6));
  disegnaBuio(ctx, W, H, buio);

  // Le mani, in trasparenza: servono a far vedere che la pagina le sta seguendo.
  if (ora - ultimiLandmarkT < 500) {
    const inPosaOra = posaGrezza || ora - ultimaPosa < MS_TOLLERANZA;
    ctx.globalAlpha = fase === "carica" ? 0.4 : 0.65;
    for (const l of ultimiLandmark) {
      drawing.drawConnectors(l, HAND_CONNECTIONS, { color: inPosaOra ? "#7dd3fc" : "#e2e8f0", lineWidth: 3 });
      drawing.drawLandmarks(l, { color: "#ffffff", radius: 2.5, lineWidth: 1 });
    }
    ctx.globalAlpha = 1;
  }

  // La palla.
  if (fase === "carica" && vista) {
    const push = vista.dir ? vista.palmo * 0.5 : 0; // un po' avanti, verso le dita
    const cx = vista.x + (vista.dir?.x ?? 0) * push;
    const cy = vista.y + (vista.dir?.y ?? 0) * push;
    const rMax = vista.palmo * 1.0;
    const r = rMax * (0.16 + 0.84 * Math.pow(carica, 0.8));
    particelle.emettiConvergenti(dt, carica, rMax, ridotto);
    particelle.passo(dt);
    ctx.globalCompositeOperation = "lighter";
    particelle.disegna(ctx, { x: cx, y: cy }, unita);
    const stato = { x: cx, y: cy, r, carica, t, ridotto, unita };
    disegnaSfera(ctx, stato);
    disegnaAnello(ctx, stato);
  }

  // Il raggio.
  if (fase === "raggio" && raggio) {
    // Il raggio SEGUE LE MANI per tutta la sua durata, dovunque le si porti (anche fuori dalla
    // posa: chi spara muove le braccia per puntarlo). Solo se le mani spariscono resta dov'era.
    if (vista) {
      const k = 1 - Math.exp(-dtReale * 14);
      raggio.x += (vista.x - raggio.x) * k;
      raggio.y += (vista.y - raggio.y) * k;
      if (vista.dir) {
        const nx = raggio.dx + (vista.dir.x - raggio.dx) * k;
        const ny = raggio.dy + (vista.dir.y - raggio.dy) * k;
        const l = Math.hypot(nx, ny) || 1;
        raggio.dx = nx / l;
        raggio.dy = ny / l;
      }
    }
    dato("raggiox", String(Math.round(raggio.x))); // per i test: dov'è l'origine del raggio, in pixel
    const fraz = (ora - tRaggio) / MS_RAGGIO;
    particelle.emettiScintille(dt, raggio, { x: raggio.dx, y: raggio.dy }, Math.hypot(W, H), raggio.spessore, ridotto);
    particelle.passo(dt);
    ctx.globalCompositeOperation = "lighter";
    particelle.disegna(ctx, raggio, unita);
    disegnaRaggio(ctx, { ...raggio, w: W, h: H, fase: Math.min(1, fraz), t, ridotto, unita });
  }

  // Il lampo dello sparo: un lampo solo, che svanisce in un quarto di secondo.
  const lampo = Math.max(0, 1 - (ora - lampoDa) / MS_LAMPO);
  disegnaLampo(ctx, W, H, lampo * lampo, ridotto);
  ctx.globalCompositeOperation = "source-over";

  // La scossa: sposta tutto il palcoscenico (video, tela, scritte). Forte allo sparo, poi un
  // tremito. Non c'è con «riduci animazioni».
  let sx = 0;
  let sy = 0;
  if (!ridotto) {
    const amp =
      fase === "raggio"
        ? 9 * Math.exp(-((ora - tRaggio) / 1000) * 4) + 1.4
        : fase === "carica"
          ? 2.2 * Math.pow(carica, 3)
          : 0;
    if (amp > 0.05) {
      sx = (Math.random() - 0.5) * 2 * amp;
      sy = (Math.random() - 0.5) * 2 * amp;
    }
  }
  const tr = sx || sy ? `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)` : "";
  if (ui.stage.style.transform !== tr) ui.stage.style.transform = tr;

  // Le scritte (nel DOM, non nella tela: la tela è specchiata e il testo verrebbe a rovescio).
  if (fase === "carica") {
    testo(ui.grido, GRIDO[Math.min(4, Math.floor(carica * 5))], "carica");
    const restano = Math.max(0, (1 - carica) * (MS_CARICA / 1000));
    testo(ui.suggerimento, `Tieni la posa… ${restano.toFixed(1).replace(".", ",")} s`);
  } else if (fase === "raggio") {
    testo(ui.grido, GRIDO_SPARO, "urlo");
    testo(ui.suggerimento, "");
  } else if (fase === "riposo") {
    testo(ui.grido, "");
    testo(ui.suggerimento, "Sciogli le mani per ricaricare");
  } else {
    testo(ui.grido, "");
    testo(ui.suggerimento, consiglio(ultimaAnalisi) || "Tieni la posa…");
  }

  dato("fase", fase);
  dato("carica", carica.toFixed(2));

  // Il suono segue la carica e il raggio. Si aggiorna ~25 volte al secondo e non a ogni fotogramma:
  // ogni chiamata aggiunge eventi di automazione ai parametri, e più di così non si sente.
  const inattiva = fase === "idle" || fase === "riposo";
  if (audio && audioCtx && ora - ultimoAggiornamentoAudio >= 40 && !(inattiva && audioInattivo)) {
    ultimoAggiornamentoAudio = ora;
    // A pagina inattiva i valori sono già a zero: dopo il primo aggiornamento si smette, così ogni
    // chiamata non aggiunge eventi alla automazione dei parametri (MDN avverte che «possono
    // accumularsi») per tutto il tempo in cui non succede niente, che è quasi sempre.
    audioInattivo = inattiva;
    // Il pannello stereo segue la posizione sullo schermo, che è SPECCHIATO rispetto alla camera.
    const sorgente = fase === "raggio" && raggio ? raggio.x : (vista?.x ?? W / 2);
    const pan = (1 - sorgente / W) * 2 - 1;
    audio.aggiorna(audioCtx.currentTime, fase, carica, pan, (ora - tRaggio) / MS_RAGGIO);
    if (E2E) {
      const l = audio.livelli();
      dato("suono", `${audioCtx.state}|${l.carica.toFixed(2)}|${l.raggio.toFixed(2)}|${suonoMuto ? "muto" : "voce"}`);
    }
  }
}

// --- Il ciclo --------------------------------------------------------------------------------------

function loop(): void {
  rafId = requestAnimationFrame(loop);
  const video = ui.video;
  const ora = performance.now();

  if (tracker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = tracker.detect(video, ora);

    if (ui.overlay.width !== video.videoWidth) {
      ui.overlay.width = video.videoWidth;
      ui.overlay.height = video.videoHeight;
    }
    const aspect = video.videoWidth / video.videoHeight || 4 / 3;
    const a = analizza(result.landmarks, aspect, ui.overlay.height);
    ultimaAnalisi = a;
    ultimiLandmark = result.landmarks;
    ultimiLandmarkT = ora;

    maniAssentiDa = a.numMani >= 2 ? null : (maniAssentiDa ?? ora);
    posaGrezza = inPosa(a, ora - ultimaPosa < MS_TOLLERANZA);
    if (posaGrezza) ultimaPosa = ora;
    // Il bersaglio si aggiorna ogni volta che ci sono due mani, anche durante il raggio: è così
    // che il raggio si muove con loro. (Prima, una volta sparato, si fermava se la posa non
    // reggeva più, e il raggio restava fermo mentre le mani si spostavano.)
    if (a.numMani >= 2) {
      bersaglio = { x: a.x, y: a.y, palmo: a.palmo, dir: a.dir };
    }

    dato("mani", String(a.numMani));
    dato("misura", a.numMani >= 2 ? `${a.polsi.toFixed(2)}|${a.dita}|${a.angolo.toFixed(0)}` : "");

    frames++;
    if (ora - fpsWindowStart >= 1000) {
      ui.fps.textContent = `${Math.round((frames * 1000) / (ora - fpsWindowStart))} fps · ${tracker.delegate}`;
      frames = 0;
      fpsWindowStart = ora;
    }
    void fallbackToCpuIfSlow();
  }

  // Il tempo reale, senza tetto, governa la macchina a stati: la carica dura 4 secondi veri
  // anche su un computer che disegna 4 fotogrammi al secondo. Il tetto vale solo per la fisica
  // delle particelle (un salto di secondi le catapulterebbe tutte fuori schermo).
  const dtReale = ultimoFotogramma ? (ora - ultimoFotogramma) / 1000 : 0;
  ultimoFotogramma = ora;
  avanza(ora, dtReale * 1000);
  disegna(ora, Math.min(dtReale, 0.05), dtReale);
}

let switching = false;

/** Rete di sicurezza sulle prestazioni, identica a quella delle altre pagine. */
async function fallbackToCpuIfSlow(): Promise<void> {
  if (!tracker || switching || tracker.delegate !== "GPU" || tracker.detections < 8 || tracker.avgDetectMs < 150) return;
  switching = true;
  const slow = tracker;
  tracker = null;
  try {
    tracker = await HandTracker.create(true);
    slow.close();
    console.info(`Riconoscimento su GPU troppo lento (${Math.round(slow.avgDetectMs)} ms): passo alla CPU`);
  } catch {
    tracker = slow;
  } finally {
    switching = false;
  }
}

function azzeraStato(): void {
  fase = "idle";
  carica = 0;
  tenutaDa = null;
  inizioPosa = null;
  ultimaPosa = -Infinity;
  posaGrezza = false;
  rilascioDa = null;
  lampoDa = -Infinity;
  bersaglio = vista = null;
  raggio = null;
  ultimaAnalisi = NESSUNA;
  maniAssentiDa = null;
  ultimiLandmark = [];
  ultimiLandmarkT = -Infinity;
  buio = 0;
  ultimoFotogramma = 0;
  particelle.svuota();
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
  // Il suono parte DENTRO il gesto dell'utente (prima di qualunque attesa): è la condizione per cui il
  // browser lo permette.
  avviaAudio();
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
  void audioCtx?.resume(); // dopo un'attesa di rete lo si richiama per prudenza (vedi avviaAudio)
  if (document.hidden) {
    // La scheda è stata nascosta mentre si aspettava e il posto è arrivato proprio ora: non si accende
    // la camera per nessuno, e il posto torna a chi è davvero in coda.
    libera();
    return;
  }
  setState("loading", "Avvio…");
  try {
    tracker ??= await HandTracker.create();
    stream = await startCamera(ui.video, stop); // `stop` anche se la camera si spegne da sola
    if (document.hidden) {
      stop();
      return;
    }
    lastVideoTime = -1;
    azzeraStato();
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

/**
 * Spegnimento: camera rilasciata, ciclo fermo, tela pulita, scritte vuote, scossa azzerata,
 * dati di diagnostica cancellati. Dopo di questo nella pagina non resta niente che riguardi la
 * persona.
 */
function stop(): void {
  libera(); // il posto torna a disposizione di chi aspetta
  audio?.zittisci(); // a camera spenta il suono si ferma subito e il motore audio si sospende
  audioInattivo = false;
  void audioCtx?.suspend();
  cancelAnimationFrame(rafId);
  stopCamera(ui.video, stream);
  stream = null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
  ui.stage.style.transform = "";
  testo(ui.grido, "");
  testo(ui.suggerimento, "");
  azzeraStato();
  azzeraDati();
  setState("idle", "Camera spenta");
}

ui.start.addEventListener("click", () => void start());
ui.stop.addEventListener("click", stop);

// L'interruttore del suono. `aria-pressed` è insieme lo stato per i lettori di schermo e il testo.
ui.suono.addEventListener("click", () => {
  suonoMuto = !suonoMuto;
  audio?.impostaMuto(suonoMuto);
  ui.suono.setAttribute("aria-pressed", String(!suonoMuto));
  ui.suono.textContent = suonoMuto ? "🔇 Suono spento" : "🔊 Suono";
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && stream) stop();
});

window.addEventListener("pagehide", () => {
  stop();
  tracker?.close();
  tracker = null;
});

iniziaSchermoIntero(); // il pulsante «Schermo intero» nella barra in alto
