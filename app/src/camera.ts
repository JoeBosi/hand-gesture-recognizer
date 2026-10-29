/**
 * camera.ts — accensione e spegnimento della webcam.
 *
 * Tutto quello che riguarda la telecamera sta qui, isolato di proposito: è la parte che tocca i
 * dati più delicati (le immagini di una persona) ed è più facile controllarla in trenta righe che
 * cercarla in mezzo al resto.
 *
 * Regola del progetto: i fotogrammi restano nel browser. In questo file non c'è nessun `fetch`,
 * nessun `MediaRecorder`, nessun salvataggio; il flusso finisce solo dentro l'elemento <video>.
 * Vedi .claude/skills/webcam-capture/SKILL.md
 */
import { t } from "./i18n";

/** Errore "previsto", con un messaggio già scritto per l'utente. Lo distingue da un bug vero. */
export class CameraError extends Error {}

/**
 * I nomi degli errori del browser tradotti in frasi utili.
 * Sono i nomi standard di `DOMException` restituiti da getUserMedia.
 */
const MESSAGES: Record<string, string> = {
  NotAllowedError: t("cam.negato"),
  NotFoundError: t("cam.nessuna"),
  NotReadableError: t("cam.occupata"),
  OverconstrainedError: t("cam.risoluzione"),
};

/**
 * Accende la webcam e la collega all'elemento <video>.
 * Va chiamata solo in risposta a un gesto dell'utente (il clic sul pulsante): è una regola del
 * progetto, ed è anche il modo in cui i browser mostrano la richiesta di permesso in modo sensato.
 */
/**
 * @param onEnded chiamata se la telecamera si spegne da sola: permesso revocato dalle
 *        impostazioni del browser, webcam staccata, oppure un'altra applicazione che se la prende.
 *        Senza questo aggancio la pagina resterebbe "accesa" mostrando l'ULTIMO FOTOGRAMMA
 *        CONGELATO — sembrerebbe che la camera stia ancora riprendendo mentre non lo fa più, ed è
 *        esattamente il tipo di bugia che una pagina con una webcam non deve raccontare.
 */
export async function startCamera(video: HTMLVideoElement, onEnded?: () => void): Promise<MediaStream> {
  // I browser danno accesso alla camera solo in "contesto sicuro": HTTPS oppure localhost.
  // Senza questo controllo l'app fallirebbe con un errore oscuro su `navigator.mediaDevices`.
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(t("cam.https"));
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user", // camera frontale sui telefoni
        // "ideal" e non "exact": se la webcam non fa 640×480 il browser sceglie il più vicino
        // invece di rifiutare. 640×480 è un buon compromesso: MediaPipe non guadagna precisione
        // con immagini più grandi, ma ci mette di più.
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false, // il microfono non serve: non va nemmeno chiesto
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    throw new CameraError(MESSAGES[name] ?? t("cam.impossibile"));
  }

  video.srcObject = stream;
  await video.play();

  // Subito dopo play() le dimensioni possono essere ancora 0: l'app però ne ha bisogno per
  // impostare le proporzioni della scena 3D, quindi si aspetta l'evento che le annuncia.
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => video.addEventListener("loadedmetadata", () => resolve(), { once: true }));
  }

  // `ended` scatta quando la traccia finisce per una causa esterna alla pagina. Non scatta
  // chiamando noi `track.stop()`, quindi non c'è rischio di rientrare nello spegnimento.
  if (onEnded) {
    for (const t of stream.getVideoTracks()) t.addEventListener("ended", onEnded, { once: true });
  }

  return stream;
}

/**
 * Spegne la webcam davvero: fermare il <video> non basta, il flusso resterebbe aperto e la spia
 * della telecamera accesa. Ogni traccia va fermata singolarmente.
 */
export function stopCamera(video: HTMLVideoElement, stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
  video.pause();
  video.srcObject = null;
}
