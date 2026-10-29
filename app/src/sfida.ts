/**
 * sfida.ts — sasso, carta, forbici fra due persone.
 *
 * Il riconoscimento è lo stesso della pagina principale (`tracker.ts`, che non è stato toccato):
 * quello che cambia è cosa se ne fa. Qui i 21 punti servono solo a due cose — capire QUALE gesto
 * sta facendo ogni mano e DOVE si trova sullo schermo — e tutto il resto è l'arbitro.
 *
 * Le tre mosse sono tre degli otto gesti che il modello conosce già:
 *   Closed_Fist → sasso     Open_Palm → carta     Victory → forbici
 * Gli altri cinque (pollice su, indice in su…) sono mosse non valide, e il round si ripete.
 *
 * TRE PROBLEMI VERI, e come sono risolti:
 *
 * 1. **Chi è il giocatore 1?** Non si usa l'etichetta destra/sinistra del modello: quella la
 *    decide MediaPipe dando per scontato di vedere UNA persona allo specchio, e qui le persone
 *    sono due, una accanto all'altra. Si usa la posizione orizzontale del polso sullo schermo:
 *    chi sta più a sinistra è il giocatore 1. È una misura, non un'ipotesi. (Stessa lezione già
 *    imparata sulla pagina del corpo, dove le mani si assegnano al polso più vicino.)
 *
 * 2. **Quando si "tira"?** Se si leggesse il gesto in un istante solo, basterebbe un fotogramma
 *    sfortunato — una mano a mezz'aria mentre si trasforma da sasso a forbici — per assegnare un
 *    punto sbagliato. Si guarda invece una FINESTRA di mezzo secondo e si prende il gesto più
 *    frequente di ciascuno.
 *
 * 3. **Il conto alla rovescia deve essere onesto.** Parte solo quando si vedono davvero due mani,
 *    e se una sparisce a metà il round si annulla invece di assegnare un punto a caso.
 */
import "./accessi";
import "./piede";
import "./style.css";
import "./sfida.css";
import { DrawingUtils, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { CameraError, startCamera, stopCamera } from "./camera";
import { entra, libera, mantieni } from "./presenza";
import { iniziaSchermoIntero } from "./schermo-intero";
import { HAND_CONNECTIONS, HandsTracker } from "./hands";
import { riconosciMossa, type Mossa } from "./mosse";
import { ultimaFraseDetta, impostaVoce, parla, voceAttiva, voceDisponibile, zittisci } from "./voce";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  intro: $("intro"),
  start: $<HTMLButtonElement>("start"),
  error: $("error"),
  status: $("status"),
  stage: $("stage"),
  video: $<HTMLVideoElement>("video"),
  overlay: $<HTMLCanvasElement>("overlay"),
  coriandoli: $<HTMLCanvasElement>("coriandoli"),
  tabellone: $("tabellone"),
  punti1: $("punti1"),
  punti2: $("punti2"),
  cartello: $("cartello"),
  istruzioni: $("istruzioni"),
  rigioca: $<HTMLButtonElement>("rigioca"),
  hud: $("hud"),
  gestures: $("gestures"),
  fps: $("fps"),
  ricomincia: $<HTMLButtonElement>("ricomincia"),
  voce: $<HTMLButtonElement>("voce"),
  stop: $<HTMLButtonElement>("stop"),
};

type State = "idle" | "loading" | "running" | "error";

// --- Le regole del gioco ---------------------------------------------------------------------

// La mossa non si legge più dal NOME del gesto che MediaPipe dà alla mano, ma dalla forma delle dita
// (vedi mosse.ts): così vale anche con la mano girata di 180°, di dorso.

/** Chi batte chi: `BATTE[a] === b` vuol dire "a vince contro b". */
const BATTE: Record<Mossa, Mossa> = { sasso: "forbici", forbici: "carta", carta: "sasso" };

const EMOJI: Record<Mossa, string> = { sasso: "✊", carta: "✋", forbici: "✌️" };

const PUNTI_PER_VINCERE = 2;

/**
 * I due giocatori si chiamano con il LATO, non con un numero: davanti alla camera non c'è nessun
 * cartellino con scritto "1", ma sinistra e destra sono evidenti a chiunque guardi lo schermo.
 * L'ordine è quello di `maniOrdinate`: indice 0 = più a sinistra sullo schermo.
 */
const LATO = ["di SINISTRA", "di DESTRA"];
const LATO_BREVE = ["Sinistra", "Destra"];

// --- I tempi del round (millisecondi) ---------------------------------------------------------

/** Quanto dura ogni numero del conto alla rovescia: 3… 2… 1… */
const MS_PER_NUMERO = 700;
/**
 * Quanto si aspetta, dopo il «via!», prima di guardare cosa hanno tirato. Prima si guardava
 * subito, ma chi tira ha bisogno di un momento per formare la mossa, e leggere le mani mentre
 * stanno ancora cambiando forma vuol dire leggere la mano a metà strada fra due gesti.
 */
const MS_ATTESA_MOSSA = 1500;
/** La finestra in cui si guardano le mani, dopo quell'attesa. */
const MS_RIVELAZIONE = 600;
/** Quanto resta a schermo l'esito del round prima di ricominciare (di più se c'è la voce da ascoltare). */
const msEsito = (): number => (voceDisponibile() ? 3400 : 1800);
/** Quanto dura l'annuncio di inizio partita, prima del primo conto alla rovescia. */
const msIntro = (): number => (voceDisponibile() ? 3000 : 1200);
/** Due mani vanno viste per almeno questo tempo prima di far partire il conto. */
const MS_PRONTI = 500;

// --- Stato del gioco -------------------------------------------------------------------------

/**
 * Le fasi di un round, in ordine:
 *   attesa      si aspettano due mani in campo
 *   intro       solo a inizio partita: «si comincia, vince chi arriva a due punti»
 *   conto       «tre… due… uno…»
 *   rivelazione «via!»; poi 1,5 s per formare la mossa; poi 0,6 s in cui si registra cosa fanno
 *               le due mani
 *   esito       si mostra chi ha vinto il round
 *   fine        qualcuno è arrivato al punteggio pieno: partita finita
 */
type Fase = "attesa" | "intro" | "conto" | "rivelazione" | "esito" | "fine";

let fase: Fase = "attesa";
let faseDa = 0; // istante in cui è cominciata la fase corrente
let punti = [0, 0];
/** Le mosse raccolte durante la finestra di rivelazione, uno per giocatore (`null` = incerta). */
let raccolta: [(Mossa | null)[], (Mossa | null)[]] = [[], []];
/** L'annuncio di inizio si fa una volta per partita; il numero detto per ultimo, una volta per cifra. */
let inizioAnnunciato = false;
/** Da quando i due giocatori tengono il pugno a fine partita (rivincita senza mani), 0 = no. */
let pugniDa = 0;
let ultimoNumero = -1;
/** Le cifre del punteggio, a parole: il sintetizzatore le legge meglio che come cifre. */
const NUM = ["zero", "uno", "due", "tre"];

const ctx = ui.overlay.getContext("2d")!;
const drawing = new DrawingUtils(ctx);

const E2E = new URLSearchParams(location.search).has("e2e");

let tracker: HandsTracker | null = null;
let stream: MediaStream | null = null;
let rafId = 0;
let lastVideoTime = -1;
let frames = 0;
let fpsWindowStart = performance.now();

// --- Interfaccia -----------------------------------------------------------------------------

function setState(state: State, status: string): void {
  document.body.dataset.state = state;
  ui.status.textContent = status;
  ui.status.classList.toggle("live", state === "running");
  ui.intro.hidden = state === "running";
  ui.stage.hidden = state !== "running";
  ui.hud.hidden = state !== "running";
  ui.start.disabled = state === "loading";
  ui.start.textContent = state === "loading" ? "Avvio in corso…" : "Accendi la camera";
}

/** Il cartellone al centro. `tipo` decide solo il colore (vedi sfida.css). */
function cartello(testo: string, tipo = ""): void {
  const classe = `cartello ${tipo}`.trim();
  // L'arbitro lo richiama a ogni fotogramma: si scrive nel DOM solo se qualcosa è cambiato (e
  // non si fa ripartire l'animazione della scritta lampeggiante a ogni passaggio).
  if (ui.cartello.textContent === testo && ui.cartello.className === classe) return;
  ui.cartello.textContent = testo;
  ui.cartello.className = classe;
  ui.cartello.hidden = testo === "";
}

function mostraPunti(): void {
  ui.punti1.textContent = String(punti[0]);
  ui.punti2.textContent = String(punti[1]);
}

/** Passa a una nuova fase e registra quando è cominciata. */
function vaiA(nuova: Fase, ora: number): void {
  fase = nuova;
  faseDa = ora;
}

// --- Il cuore: due mani ordinate per posizione sullo schermo ----------------------------------

interface ManoInQuadro {
  landmarks: NormalizedLandmark[];
  /** La mossa che la mano sta facendo adesso, o `null` se non è nessuna delle tre. */
  mossa: Mossa | null;
  /** x del polso come compare sullo schermo (immagine non specchiata): 0 = bordo sinistro. */
  xSchermo: number;
}

/**
 * Restituisce le mani viste, ordinate da sinistra a destra COME LE VEDE CHI GUARDA.
 *
 * L'immagine NON è specchiata (dal 28/10/2026): la x del fotogramma è già quella dello schermo.
 * Se un giorno si rimette lo specchio nel CSS, qui va rimesso `1 - x`, o i giocatori si scambiano
 * i punti.
 */
function maniOrdinate(landmarks: NormalizedLandmark[][], aspect: number): ManoInQuadro[] {
  return landmarks
    .map((l) => ({ landmarks: l, mossa: riconosciMossa(l, aspect), xSchermo: l[0].x }))
    .sort((a, b) => a.xSchermo - b.xSchermo);
}

/** La mossa più frequente della raccolta (le incerte non contano), se ce n'è almeno una. */
function mossaPiuFrequente(mosse: (Mossa | null)[]): Mossa | null {
  const conteggio = new Map<Mossa, number>();
  for (const m of mosse) if (m) conteggio.set(m, (conteggio.get(m) ?? 0) + 1);
  let migliore: Mossa | null = null;
  let max = 0;
  for (const [m, n] of conteggio) if (n > max) ((max = n), (migliore = m));
  // Una mossa vale solo se è stata letta in almeno metà dei fotogrammi: una mano che cambia forma
  // durante la lettura (o che il riconoscitore vede a tratti) non decide un punto per caso.
  if (max < mosse.length * 0.5) return null;
  return migliore;
}

/** Chi vince: 0 = il primo, 1 = il secondo, null = pareggio. */
function chiVince(a: Mossa, b: Mossa): 0 | 1 | null {
  if (a === b) return null;
  return BATTE[a] === b ? 0 : 1;
}

// --- Il ciclo --------------------------------------------------------------------------------

function loop(): void {
  rafId = requestAnimationFrame(loop);
  const video = ui.video;
  if (!tracker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const ora = performance.now();

  const result = tracker.detect(video, ora, 0.45) // due giocatori: possono stare a distanze un po’ diverse;

  if (ui.overlay.width !== video.videoWidth) {
    ui.overlay.width = video.videoWidth;
    ui.overlay.height = video.videoHeight;
  }
  ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);

  const mani = maniOrdinate(result.landmarks, video.videoWidth / video.videoHeight || 4 / 3);

  // Le due mani si disegnano con i colori dei due giocatori, così si vede a chi "appartiene"
  // ciascuna: è anche il modo più rapido per accorgersi che il gioco ha scambiato i lati.
  mani.slice(0, 2).forEach((m, i) => {
    const colore = i === 0 ? "#38bdf8" : "#f472b6";
    drawing.drawConnectors(m.landmarks, HAND_CONNECTIONS, { color: colore, lineWidth: 4 });
    drawing.drawLandmarks(m.landmarks, { color: "#ffffff", radius: 3, lineWidth: 1 });
  });

  arbitro(mani, ora);
  disegnaMosseLive(mani.slice(0, 2), ora);

  ui.gestures.textContent =
    mani.length >= 2
      ? mani.slice(0, 2).map((m, i) => `${LATO_BREVE[i]}: ${etichetta(m.mossa)}`).join("   ·   ")
      : `${mani.length} mano in campo: ne servono due`;

  if (E2E) {
    document.body.dataset.fase = fase;
    document.body.dataset.punti = punti.join("-");
    document.body.dataset.mani = String(mani.length);
    document.body.dataset.mosse = mani.slice(0, 2).map((m) => m.mossa ?? "-").join(",");
    document.body.dataset.parlato = ultimaFraseDetta();
  }

  frames++;
  if (ora - fpsWindowStart >= 1000) {
    ui.fps.textContent = `${Math.round((frames * 1000) / (ora - fpsWindowStart))} fps · ${tracker.delegate}`;
    frames = 0;
    fpsWindowStart = ora;
  }

  void fallbackToCpuIfSlow();
}

/**
 * Sopra ogni mano, grande, la mossa che il gioco sta leggendo ADESSO (dal 08/10/2026: prima si
 * scopriva solo a fine round cosa aveva visto la macchina, e non si capiva perché si perdeva).
 * Durante conto e lettura resta un «?» per non svelare la mossa all'avversario.
 * La tela non è specchiata: il testo si disegna dritto sopra la mano.
 */
function disegnaMosseLive(mani: ManoInQuadro[], ora: number): void {
  const nascosta = fase === "conto" || (fase === "rivelazione" && ora - faseDa < MS_ATTESA_MOSSA + MS_RIVELAZIONE);
  const W = ui.overlay.width;
  const H = ui.overlay.height;
  const px = Math.round(H * 0.11);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  mani.forEach((m, i) => {
    const xs = m.landmarks.map((p) => p.x);
    const ys = m.landmarks.map((p) => p.y);
    const x = ((Math.min(...xs) + Math.max(...xs)) / 2) * W;
    const y = Math.max(px * 1.1, Math.min(...ys) * H - 8);
    const testo = nascosta ? "❓" : m.mossa ? EMOJI[m.mossa] : "…";
    ctx.font = `${px}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = i === 0 ? "#38bdf8" : "#f472b6";
    ctx.fillStyle = "#fff";
    ctx.fillText(testo, x, y);
    if (!nascosta && !m.mossa) {
      ctx.font = `600 ${Math.round(px * 0.3)}px system-ui, sans-serif`;
      ctx.fillText("non chiara", x, y - px);
    }
  });
  ctx.restore();
}

function etichetta(m: Mossa | null): string {
  return m ? `${EMOJI[m]} ${m}` : "—";
}

/**
 * L'arbitro: una macchina a stati che guarda l'orologio e le mani in campo.
 * Viene chiamata una volta per fotogramma e decide tutto lei.
 */
function arbitro(mani: ManoInQuadro[], ora: number): void {
  const dueMani = mani.length >= 2;

  switch (fase) {
    case "attesa": {
      if (!dueMani) {
        faseDa = ora; // il conto dei "pronti" riparte da capo appena una mano esce
        cartello("");
        ui.istruzioni.textContent = "Mettetevi in due davanti alla camera, una mano a testa.";
        return;
      }
      ui.istruzioni.textContent = "Pronti…";
      // Due mani stabili per mezzo secondo: solo allora si parte.
      if (ora - faseDa >= MS_PRONTI) {
        raccolta = [[], []];
        if (!inizioAnnunciato) {
          // Prima volta della partita: l'annuncio, poi il primo conto alla rovescia.
          inizioAnnunciato = true;
          cartello(`Si comincia!\nVince chi arriva a ${PUNTI_PER_VINCERE} punti`, "via");
          ui.istruzioni.textContent = "";
          parla(`Si comincia! Vince chi arriva a ${NUM[PUNTI_PER_VINCERE]} punti.`, true);
          vaiA("intro", ora);
        } else {
          vaiA("conto", ora);
        }
      }
      return;
    }

    case "intro": {
      if (!dueMani) {
        // Una mano è uscita durante l'annuncio: si riparte da «attesa» senza ripeterlo.
        cartello("");
        vaiA("attesa", ora);
        return;
      }
      if (ora - faseDa >= msIntro()) vaiA("conto", ora);
      return;
    }

    case "conto": {
      // Se una mano esce di scena il round si annulla: meglio ricominciare che assegnare
      // un punto a un giocatore che non c'è.
      if (!dueMani) {
        cartello("Round annullato", "annullato");
        ui.istruzioni.textContent = "Servono due mani in campo.";
        vaiA("attesa", ora);
        return;
      }
      const passato = ora - faseDa;
      const numero = 3 - Math.floor(passato / MS_PER_NUMERO);
      if (numero >= 1) {
        cartello(String(numero), "conto");
        ui.istruzioni.textContent = "Sasso… carta… forbici…";
        // Il numero si dice una volta sola, quando compare, e interrompe quello che sta dicendo:
        // un «due» che arriva con il tabellone già su «uno» è peggio del silenzio.
        if (numero !== ultimoNumero) {
          ultimoNumero = numero;
          parla(["", "uno", "due", "tre"][numero], true);
        }
      } else {
        cartello("VIA!", "via");
        parla("Via!", true);
        ultimoNumero = -1;
        vaiA("rivelazione", ora);
      }
      return;
    }

    case "rivelazione": {
      const t = ora - faseDa;
      // 1) Dopo il «via!» si aspetta: chi tira ha bisogno di un momento per formare la mossa, e
      //    guardare le mani mentre cambiano forma vorrebbe dire leggerle a metà strada.
      if (t < MS_ATTESA_MOSSA) {
        if (t > 900) cartello("Mostrate la mossa!", "via");
        return;
      }
      // 2) Poi si registra, per una breve finestra, quello che fanno le due mani.
      if (t < MS_ATTESA_MOSSA + MS_RIVELAZIONE) {
        cartello("Fermi così!", "via");
        if (dueMani) {
          raccolta[0].push(mani[0].mossa);
          raccolta[1].push(mani[1].mossa);
        } else {
          // Una mano sparita proprio durante la lettura: non si può giudicare, si rifà.
          cartello("Mano uscita: si rifà", "annullato");
          ui.istruzioni.textContent = "Tenete la mano ferma davanti alla camera fino all'esito.";
          parla("Mano uscita. Si rifà.", true);
          vaiA("esito", ora);
        }
        return;
      }

      const m1 = mossaPiuFrequente(raccolta[0]);
      const m2 = mossaPiuFrequente(raccolta[1]);

      if (!m1 || !m2) {
        // Almeno uno dei due non ha fatto una mossa valida (pollice su, mano a mezz'aria,
        // uscita dal campo): si ripete, senza assegnare niente.
        const chi = !m1 && !m2 ? "Nessuno dei due" : `Il giocatore ${!m1 ? LATO[0] : LATO[1]}`;
        cartello(`${chi}: mossa non chiara`, "annullato");
        ui.istruzioni.textContent = "Si rifà. Mano ferma e ben aperta verso la camera: sasso ✊, carta ✋ o forbici ✌️.";
        parla(`Mossa non chiara. Si rifà.`, true);
        vaiA("esito", ora);
        return;
      }

      const vincitore = chiVince(m1, m2);
      if (vincitore === null) {
        cartello(`Pareggio — ${EMOJI[m1]} ${m1} contro ${EMOJI[m2]} ${m2}`, "pari");
        ui.istruzioni.textContent = "Nessun punto: si rifà.";
        parla("Pareggio. Si rifà.", true);
      } else {
        // Prima la mossa che VINCE, poi quella che perde: scritto nell'ordine dei giocatori
        // («forbici contro sasso» accanto a «punto al giocatore 2») sembrava dire il contrario.
        const [vinta, persa] = vincitore === 0 ? [m1, m2] : [m2, m1];
        punti[vincitore]++;
        mostraPunti();
        cartello(
          `Punto al giocatore ${LATO[vincitore]}\n${EMOJI[vinta]} ${vinta} batte ${EMOJI[persa]} ${persa}`,
          vincitore === 0 ? "vince1" : "vince2",
        );
        ui.istruzioni.textContent = `${punti[0]} a ${punti[1]}`;
        // Se questo punto chiude la partita non si dice niente adesso: tocca alla frase del
        // vincitore, che comprende il punteggio, e due frasi una sopra l'altra si tagliano.
        if (punti[vincitore] < PUNTI_PER_VINCERE) {
          parla(`Punto al giocatore ${LATO[vincitore].toLowerCase()}. ${NUM[punti[0]]} a ${NUM[punti[1]]}.`, true);
        }
      }
      vaiA("esito", ora);
      return;
    }

    case "esito": {
      if (punti[0] >= PUNTI_PER_VINCERE || punti[1] >= PUNTI_PER_VINCERE) {
        const chi = punti[0] > punti[1] ? 0 : 1;
        cartello(`🏆 HA VINTO\nil giocatore ${LATO[chi]}!`, `${chi === 0 ? "vince1" : "vince2"} trionfo`);
        ui.istruzioni.textContent = `Partita finita: ${punti[0]} a ${punti[1]}.`;
        ui.rigioca.hidden = false;
        lanciaCoriandoli(chi);
        parla(`Ha vinto il giocatore ${LATO[chi].toLowerCase()}! ${NUM[punti[0]]} a ${NUM[punti[1]]}.`, true);
        vaiA("fine", ora);
        return;
      }
      if (ora - faseDa >= msEsito()) {
        cartello("");
        vaiA("attesa", ora);
      }
      return;
    }

    case "fine": {
      // Rivincita senza toccare il computer: dopo 4 s, due pugni tenuti per 2 s fanno ripartire.
      // Il pulsante «Un'altra partita» resta, per chi preferisce cliccare.
      if (ora - faseDa < 4000) return;
      const pugni = dueMani && mani[0].mossa === "sasso" && mani[1].mossa === "sasso";
      if (!pugni) {
        pugniDa = 0;
        ui.istruzioni.textContent = `Partita finita: ${punti[0]} a ${punti[1]}. Rivincita? Fate tutti e due il pugno ✊ ✊`;
        return;
      }
      pugniDa ||= ora;
      ui.istruzioni.textContent = "Rivincita in arrivo… tenete il pugno!";
      if (ora - pugniDa >= 2000) {
        pugniDa = 0;
        nuovaPartita();
      }
      return;
    }
  }
}


// --- I coriandoli ----------------------------------------------------------------------------

/**
 * Scritti a mano invece di aggiungere una libreria: sono una trentina di righe, e una dipendenza
 * in più su questo progetto significa anche un pacchetto in più da controllare (la CSP vieta le
 * CDN, quindi finirebbe comunque nel nostro bundle).
 *
 * Il modello fisico è il più semplice che regga: ogni coriandolo ha una posizione, una velocità,
 * una rotazione. La gravità lo tira giù, l'attrito lo frena, e quando esce dal fondo sparisce.
 * Il ciclo si spegne da solo quando non ne resta nessuno: non gira per sempre a vuoto.
 */
interface Coriandolo {
  x: number; y: number; vx: number; vy: number;
  rot: number; vrot: number; w: number; h: number; colore: string;
}

const GRAVITA = 900; // pixel al secondo quadrato
const ATTRITO = 0.86; // quanto si frena la spinta orizzontale, ogni secondo
let coriandoli: Coriandolo[] = [];
let coriandoliRaf = 0;
let coriandoliUltimo = 0;

/** I colori: quelli del lato che ha vinto, più oro e bianco per la festa. */
const COLORI_FESTA = ["#fde68a", "#ffffff", "#fbbf24"];

/**
 * @param lato 0 = sinistra, 1 = destra. I coriandoli partono dal lato del vincitore, così anche
 *        senza leggere la scritta si capisce chi ha vinto.
 */
function lanciaCoriandoli(lato: 0 | 1 | number): void {
  const tela = ui.coriandoli;
  tela.width = tela.clientWidth;
  tela.height = tela.clientHeight;
  const colore = lato === 0 ? "#38bdf8" : "#f472b6";
  const tavolozza = [colore, colore, ...COLORI_FESTA];
  const xPartenza = lato === 0 ? tela.width * 0.2 : tela.width * 0.8;

  for (let i = 0; i < 160; i++) {
    coriandoli.push({
      x: xPartenza + (Math.random() - 0.5) * tela.width * 0.35,
      y: tela.height + 10 + Math.random() * 40, // partono da sotto il bordo e sparano in alto
      vx: (Math.random() - 0.5) * 420,
      vy: -(700 + Math.random() * 520),
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 12,
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 9,
      colore: tavolozza[Math.floor(Math.random() * tavolozza.length)],
    });
  }
  if (!coriandoliRaf) {
    coriandoliUltimo = performance.now();
    coriandoliRaf = requestAnimationFrame(disegnaCoriandoli);
  }
}

function disegnaCoriandoli(ora: number): void {
  const tela = ui.coriandoli;
  const c = tela.getContext("2d")!;
  // dt limitato: tornando su una scheda lasciata in secondo piano, un salto di secondi
  // catapulterebbe tutti i coriandoli fuori schermo in un fotogramma solo.
  const dt = Math.min((ora - coriandoliUltimo) / 1000, 0.05);
  coriandoliUltimo = ora;

  c.clearRect(0, 0, tela.width, tela.height);
  coriandoli = coriandoli.filter((p) => {
    p.vy += GRAVITA * dt;
    p.vx *= Math.pow(ATTRITO, dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vrot * dt;
    if (p.y - p.h > tela.height) return false; // uscito dal fondo: si butta

    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.fillStyle = p.colore;
    // Lo schiacciamento verticale simula la rotazione nello spazio: il coriandolo sembra girare
    // su sé stesso invece di restare un rettangolo piatto.
    c.fillRect(-p.w / 2, (-p.h / 2) * Math.abs(Math.cos(p.rot * 1.7)), p.w, p.h * Math.abs(Math.cos(p.rot * 1.7)) * 2);
    c.restore();
    return true;
  });

  coriandoliRaf = coriandoli.length ? requestAnimationFrame(disegnaCoriandoli) : 0;
}

/** Spegne la festa e pulisce la tela: serve a "Ricomincia" e allo spegnimento della camera. */
function fermaCoriandoli(): void {
  cancelAnimationFrame(coriandoliRaf);
  coriandoliRaf = 0;
  coriandoli = [];
  const tela = ui.coriandoli;
  tela.getContext("2d")!.clearRect(0, 0, tela.width, tela.height);
}

function nuovaPartita(): void {
  fermaCoriandoli();
  zittisci();
  inizioAnnunciato = false;
  ultimoNumero = -1;
  punti = [0, 0];
  raccolta = [[], []];
  mostraPunti();
  cartello("");
  ui.rigioca.hidden = true;
  ui.istruzioni.textContent = "";
  vaiA("attesa", performance.now());
}

let switching = false;

/** Rete di sicurezza sulle prestazioni: identica a quella della pagina principale. */
async function fallbackToCpuIfSlow(): Promise<void> {
  if (!tracker || switching || tracker.delegate !== "GPU" || tracker.detections < 8 || tracker.avgDetectMs < 150) return;
  switching = true;
  const slow = tracker;
  tracker = null;
  try {
    tracker = await HandsTracker.create(true);
    slow.close();
    console.info(`Riconoscimento su GPU troppo lento (${Math.round(slow.avgDetectMs)} ms): passo alla CPU`);
  } catch {
    tracker = slow;
  } finally {
    switching = false;
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
    tracker ??= await HandsTracker.create();
    stream = await startCamera(ui.video, stop); // `stop` anche se la camera si spegne da sola
    if (document.hidden) {
      stop();
      return;
    }
    lastVideoTime = -1;
    nuovaPartita();
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
  // La tela va ripulita: quello che resta nel suo buffer sono le mani dell'ultimo fotogramma.
  ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
  ui.gestures.textContent = "";
  cartello("");
  ui.istruzioni.textContent = "";
  ui.rigioca.hidden = true;
  fermaCoriandoli();
  zittisci(); // la voce non deve continuare a parlare a camera spenta
  inizioAnnunciato = false;
  ultimoNumero = -1;
  fase = "attesa";
  // Anche il punteggio e i gesti raccolti se ne vanno con la camera. Non escono dalla pagina, ma
  // sono l'unica cosa "sulle persone" che sopravviverebbe allo spegnimento: la partita finisce
  // quando finisce la ripresa, e riaccendendo si ricomincia da zero a zero.
  punti = [0, 0];
  raccolta = [[], []];
  mostraPunti();

  if (E2E) {
    document.body.dataset.fase = "";
    document.body.dataset.punti = "";
    document.body.dataset.mani = "0";
    document.body.dataset.mosse = "";
    document.body.dataset.parlato = "";
  }

  setState("idle", "Camera spenta");
}

ui.start.addEventListener("click", () => void start());
ui.stop.addEventListener("click", stop);
ui.rigioca.addEventListener("click", nuovaPartita);
ui.ricomincia.addEventListener("click", nuovaPartita);

// L'interruttore della voce. `aria-pressed` è insieme lo stato per i lettori di schermo e il
// testo che si vede. Nelle prove automatiche (senza voce) il pulsante funziona lo stesso.
ui.voce.addEventListener("click", () => {
  impostaVoce(!voceAttiva());
  ui.voce.setAttribute("aria-pressed", String(voceAttiva()));
  ui.voce.textContent = voceAttiva() ? "🔊 Voce" : "🔇 Voce spenta";
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
