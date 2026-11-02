// src/main.ts
import "./style.css";
import { accendiCamera, spegniCamera } from "./camera";
import { disegnaOssa, disegnaPunti, type Punto } from "./disegna";
import { FiltroMano } from "./filtro";
import { aPixel } from "./punti";
import { disegna, mostra, mostraMano, coloraMano } from "./scena3d";
import { creaRiconoscitore } from "./tracker";
import type { GestureRecognizer } from "@mediapipe/tasks-vision";

const bottoneAccendi = document.getElementById("accendi") as HTMLButtonElement;
const bottoneSpegni = document.getElementById("spegni") as HTMLButtonElement;
const video = document.getElementById("video") as HTMLVideoElement;
const etichettaStato = document.getElementById("stato") as HTMLParagraphElement;
const riquadroErrore = document.getElementById("errore") as HTMLParagraphElement;
const etichettaMani = document.getElementById("mani") as HTMLParagraphElement;
const etichettaFps = document.getElementById("fps") as HTMLSpanElement;
const etichettaTremolio = document.getElementById("tremolio") as HTMLSpanElement;
const etichettaDita = document.getElementById("dita") as HTMLParagraphElement;
const etichettaGesto = document.getElementById("gesto") as HTMLParagraphElement;
const tela = document.getElementById("tela") as HTMLCanvasElement;
const ctx = tela.getContext("2d") as CanvasRenderingContext2D;

const GESTI: Record<string, string> = {
  Closed_Fist: "✊ Pugno",
  Open_Palm: "🖐️ Mano aperta",
  Pointing_Up: "☝️ Indice in su",
  Thumb_Down: "👎 Pollice giù",
  Thumb_Up: "👍 Pollice su",
  Victory: "✌️ Vittoria",
  ILoveYou: "🤟 Ti voglio bene",
};

/** I nomi standard degli errori del browser, tradotti in frasi utili. */
const MESSAGGI: Record<string, string> = {
  NotAllowedError: "Permesso negato: consenti l'uso della camera dalle impostazioni del browser e riprova.",
  NotFoundError: "Nessuna webcam trovata su questo dispositivo.",
  NotReadableError: "La webcam è occupata da un'altra applicazione.",
  OverconstrainedError: "La webcam non supporta la risoluzione richiesta.",
};

function messaggioErrore(e: unknown): string {
  const nome = e instanceof DOMException ? e.name : "";
  return MESSAGGI[nome] ?? "Non riesco ad accendere la camera.";
}

let flusso: MediaStream | null = null;
let idCiclo = 0;
let riconoscitore: GestureRecognizer | null = null;
let ultimoIstante = -1;
let filtro: FiltroMano | null = null;

const CONFERME = 3;
let consecutivi = 0;

let fotogrammi = 0;
let inizioFinestra = performance.now();

let precedenti: Punto[] | null = null;
let sommaMovimento = 0;
let misure = 0;

/** Spostamento medio dei 21 punti rispetto al fotogramma precedente (in unità 0…1). */
function misuraTremolio(punti: Punto[]): void {
  if (precedenti && precedenti.length === punti.length) {
    let somma = 0;
    for (let i = 0; i < punti.length; i++) {
      const dx = punti[i].x - precedenti[i].x;
      const dy = punti[i].y - precedenti[i].y;
      somma += Math.sqrt(dx * dx + dy * dy);
    }
    sommaMovimento += somma / punti.length;
    misure++;
  }
  // copia dei valori, non dei riferimenti: servono com'erano adesso
  precedenti = punti.map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

function contaFps(): void {
  fotogrammi++;
  const adesso = performance.now();
  const trascorso = adesso - inizioFinestra;
  if (trascorso >= 1000) {
    etichettaFps.textContent = `${Math.round((fotogrammi * 1000) / trascorso)} fps`;
    fotogrammi = 0;
    inizioFinestra = adesso;
    // una volta al secondo, insieme agli fps:
    if (misure > 0) {
      etichettaTremolio.textContent = `tremolio: ${(sommaMovimento / misure).toFixed(5)}`;
      sommaMovimento = 0;
      misure = 0;
    }
  }
}

type Stato = "spenta" | "avvio" | "accesa" | "errore";

function setState(stato: Stato, messaggio: string): void {
  etichettaStato.textContent = messaggio;
  bottoneAccendi.disabled = stato === "avvio" || stato === "accesa";
  bottoneSpegni.disabled = stato !== "accesa";
  riquadroErrore.hidden = stato !== "errore";
  document.body.dataset.stato = stato;
}

async function avvia(): Promise<void> {
  setState("avvio", "Carico il modello…");
  try {
    riconoscitore ??= await creaRiconoscitore();
    flusso = await accendiCamera(video);
    setState("accesa", "● Camera accesa");
    ciclo();
  } catch (e) {
    spegni();
    riquadroErrore.textContent = messaggioErrore(e);
    setState("errore", "Camera spenta");
  }
}

function spegni(): void {
  cancelAnimationFrame(idCiclo);
  spegniCamera(video, flusso);
  flusso = null;
  filtro = null;
  setState("spenta", "Camera spenta");
}

function ciclo(): void {
  idCiclo = requestAnimationFrame(ciclo);
  contaFps();

  if (riconoscitore && video.readyState >= 2 && video.currentTime !== ultimoIstante) {
    ultimoIstante = video.currentTime;
    const risultato = riconoscitore.recognizeForVideo(video, performance.now());

    const gesto = risultato.gestures[0]?.[0];
    const nome = gesto?.categoryName;
    etichettaGesto.textContent =
      nome && nome !== "None" ? GESTI[nome] ?? nome : "nessun gesto riconosciuto";

    const mano = risultato.landmarks[0];
    if (mano) {
      etichettaMani.textContent = "";
      consecutivi++;
      filtro ??= new FiltroMano(5);
      const addolciti = filtro.smorza(mano);   // si filtra sempre…
      misuraTremolio(addolciti);
      if (consecutivi >= CONFERME) {
        disegnaVideo();
        disegnaOssa(ctx, inPixel(addolciti), "#38bdf8");
        disegnaPunti(ctx, inPixel(addolciti));
        mostraMano(addolciti);    // punti 0…1: la conversione la fa la scena
        coloraMano(nome === "Thumb_Up" ? 0x22c55e : 0x38bdf8);
        etichettaDita.textContent = `dita alzate: ${contaDita(addolciti)}`;
      }
    } else {
      consecutivi = 0;
      precedenti = null;
      filtro = null;
      etichettaMani.textContent = "Nessuna mano inquadrata";
      ctx.clearRect(0, 0, tela.width, tela.height);
      mostra(false);
      etichettaDita.textContent = "";
    }
  }

  disegna();   // fuori dall'if: la scena si ridisegna a ogni fotogramma
}

/** Indice, medio, anulare, mignolo: punta e nocca di ciascuno. */
const DITA = [
  { punta: 8, nocca: 5 },
  { punta: 12, nocca: 9 },
  { punta: 16, nocca: 13 },
  { punta: 20, nocca: 17 },
];

function contaDita(punti: Punto[]): number {
  let alzate = 0;
  for (const dito of DITA) {
    // y più piccola = più in alto nell'immagine
    if (punti[dito.punta].y < punti[dito.nocca].y) alzate++;
  }
  return alzate;
}

function disegnaVideo(): void {
  ctx.save();
  ctx.translate(tela.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, tela.width, tela.height);
  ctx.restore();
}

/** Da coordinate 0…1 a pixel, con la x ribaltata: il video è specchiato. */
function inPixel(punti: Punto[]): Punto[] {
  return punti.map((p) => aPixel({ ...p, x: 1 - p.x }, tela.width, tela.height));
}

bottoneAccendi.addEventListener("click", () => {
  void avvia();
});
bottoneSpegni.addEventListener("click", spegni);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && flusso) spegni();
});
