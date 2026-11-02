// src/camera.ts
export async function accendiCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error("La camera funziona solo su https:// o su localhost.");
  }
  const flusso = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = flusso;
  await video.play();
  return flusso;
}

export function spegniCamera(video: HTMLVideoElement, flusso: MediaStream | null): void {
  flusso?.getTracks().forEach((t) => t.stop());   // ← questa è la riga che conta
  video.pause();
  video.srcObject = null;
}
