// Lesson 7, state after exercises 7.1 to 7.6: camera on/off, translated errors,
// mirrored video on a canvas, fps counter, camera off when the tab is hidden.
import "./style.css";

const bottoneAccendi = document.getElementById("accendi") as HTMLButtonElement;
const bottoneSpegni = document.getElementById("spegni") as HTMLButtonElement;
const video = document.getElementById("video") as HTMLVideoElement;
const messaggio = document.getElementById("messaggio") as HTMLParagraphElement;
const etichettaFps = document.getElementById("fps") as HTMLSpanElement;
const tela = document.getElementById("tela") as HTMLCanvasElement;

const contesto = tela.getContext("2d");
if (!contesto) throw new Error("questo browser non sa disegnare in 2D");
const ctx: CanvasRenderingContext2D = contesto;

let flusso: MediaStream | null = null;
let idCiclo = 0;

/** I nomi standard degli errori del browser, tradotti in frasi utili. */
const MESSAGGI: Record<string, string> = {
  NotAllowedError: "Permesso negato: consenti l'uso della camera dalle impostazioni del browser e riprova.",
  NotFoundError: "Nessuna webcam trovata su questo dispositivo.",
  NotReadableError: "La webcam è occupata da un'altra applicazione.",
  OverconstrainedError: "La webcam non supporta la risoluzione richiesta.",
};

// --- Esercizio 7.5: i fotogrammi al secondo ---
let fotogrammi = 0;
let inizioFinestra = performance.now();

function contaFps(): void {
  fotogrammi++;
  const adesso = performance.now();
  const trascorso = adesso - inizioFinestra;
  if (trascorso >= 1000) {
    etichettaFps.textContent = `${Math.round((fotogrammi * 1000) / trascorso)} fps`;
    fotogrammi = 0;
    inizioFinestra = adesso;
  }
}

// --- Esercizio 7.4: il ciclo, con il video specchiato ---
function ciclo(): void {
  idCiclo = requestAnimationFrame(ciclo);

  ctx.save();                       // mette da parte l'orientamento attuale
  ctx.translate(tela.width, 0);     // sposta l'origine sul bordo destro
  ctx.scale(-1, 1);                 // ribalta l'asse x: ecco lo specchio
  ctx.drawImage(video, 0, 0, tela.width, tela.height);
  ctx.restore();                    // rimette tutto com'era

  contaFps();
}

// --- Esercizi 7.1, 7.2 e 7.6: accendere la camera ---
async function accendiCamera(): Promise<void> {
  messaggio.textContent = "";
  try {
    flusso = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = flusso;
    await video.play();
    if (document.hidden) {          // 7.6: la scheda è stata nascosta mentre la camera si accendeva
      spegniCamera();
      return;
    }
    messaggio.textContent = "● Camera accesa";
    cancelAnimationFrame(idCiclo);  // mai due cicli insieme
    ciclo();
  } catch (e) {
    const nome = e instanceof DOMException ? e.name : "";
    messaggio.textContent = MESSAGGI[nome] ?? "Non riesco ad accendere la camera.";
  }
}

// --- Esercizio 7.3: spegnere davvero ---
function spegniCamera(): void {
  cancelAnimationFrame(idCiclo);
  flusso?.getTracks().forEach((t) => t.stop());
  video.pause();
  video.srcObject = null;
  flusso = null;
  ctx.clearRect(0, 0, tela.width, tela.height);
  messaggio.textContent = "Camera spenta";
}

bottoneAccendi.addEventListener("click", () => {
  void accendiCamera();
});
bottoneSpegni.addEventListener("click", spegniCamera);

// --- Esercizio 7.6: camera spenta se nessuno guarda ---
document.addEventListener("visibilitychange", () => {
  if (document.hidden && flusso) spegniCamera();
});
