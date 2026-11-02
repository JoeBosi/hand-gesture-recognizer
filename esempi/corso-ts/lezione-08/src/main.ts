// src/main.ts
import "./style.css";
import { creaRiconoscitore } from "./tracker";
import type { GestureRecognizer } from "@mediapipe/tasks-vision";
import { disegnaOssa, disegnaPunti } from "./disegna";
import { aPixel } from "./punti";

const bottoneAccendi = document.getElementById("accendi") as HTMLButtonElement;
const bottoneSpegni = document.getElementById("spegni") as HTMLButtonElement;
const video = document.getElementById("video") as HTMLVideoElement;
const messaggio = document.getElementById("messaggio") as HTMLParagraphElement;
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

const COLORI = ["#38bdf8", "#f472b6"];

let flusso: MediaStream | null = null;
let idCiclo = 0;
let riconoscitore: GestureRecognizer | null = null;
let ultimoIstante = -1;

/** I nomi standard degli errori del browser, tradotti in frasi utili. */
const MESSAGGI: Record<string, string> = {
  NotAllowedError: "Permesso negato: consenti l'uso della camera dalle impostazioni del browser e riprova.",
  NotFoundError: "Nessuna webcam trovata su questo dispositivo.",
  NotReadableError: "La webcam è occupata da un'altra applicazione.",
  OverconstrainedError: "La webcam non supporta la risoluzione richiesta.",
};

async function accendiCamera(): Promise<void> {
  messaggio.textContent = "";
  try {
    flusso = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = flusso;
    await video.play();
    messaggio.textContent = "● Camera accesa";
  } catch (e) {
    const nome = e instanceof DOMException ? e.name : "";
    messaggio.textContent = MESSAGGI[nome] ?? "Non riesco ad accendere la camera.";
  }
}

function spegniCamera(): void {
  flusso?.getTracks().forEach((t) => t.stop());
  video.pause();
  video.srcObject = null;
  flusso = null;
  messaggio.textContent = "Camera spenta";
}

bottoneSpegni.addEventListener("click", spegniCamera);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && flusso) spegniCamera();
});

async function avvia(): Promise<void> {
  messaggio.textContent = "Carico il modello…";
  riconoscitore = await creaRiconoscitore();   // prima il modello: non chiede niente all'utente
  await accendiCamera();                        // poi la camera: il permesso si chiede alla fine
  ciclo();
}

function ciclo(): void {
  idCiclo = requestAnimationFrame(ciclo);
  if (!riconoscitore) return;
  if (video.readyState < 2 || video.currentTime === ultimoIstante) return;
  ultimoIstante = video.currentTime;

  const risultato = riconoscitore.recognizeForVideo(video, performance.now());
  console.log("mani:", risultato.landmarks.length, "punti:", risultato.landmarks[0]?.length ?? 0);

  const gesto = risultato.gestures[0]?.[0];
  const nome = gesto?.categoryName;
  etichettaGesto.textContent =
    nome && nome !== "None" ? GESTI[nome] ?? nome : "nessun gesto riconosciuto";

  disegnaVideo();
  risultato.landmarks.forEach((mano, i) => {
    const inPixel = mano.map((p) => aPixel({ ...p, x: 1 - p.x }, tela.width, tela.height));
    disegnaOssa(ctx, inPixel, COLORI[i]);
    disegnaPunti(ctx, inPixel, "#ffffff");
  });
}

function disegnaVideo(): void {
  ctx.save();
  ctx.translate(tela.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, tela.width, tela.height);
  ctx.restore();
}

bottoneAccendi.addEventListener("click", () => {
  void avvia();
});
