---
name: webcam-capture
description: Opens, manages and releases the browser webcam with getUserMedia under this project's privacy rules - secure context (HTTPS/localhost), permission and error handling, selfie mirroring, camera selection, stopping tracks, and keeping frames on-device. Use whenever code touches the camera, video element, permissions or recorded frames, and for Italian requests like "attiva la webcam", "permesso fotocamera negato", "la camera non si spegne", "privacy dei video".
---

# Webcam capture — on-device e rispettosa

## Regole del progetto (non negoziabili)

1. I frame restano nel browser: niente `fetch`/WebSocket/upload di immagini, blob o landmark
   senza conferma esplicita di Giuseppe.
2. Niente registrazione (`MediaRecorder`), niente `console.log` di frame/ImageData.
3. La camera parte solo su azione dell'utente (pulsante) e si spegne quando non serve:
   cambio pagina, `visibilitychange` → hidden, pulsante stop.
4. Stato visibile: l'utente deve sempre capire se la camera è accesa.

## Aprire la camera

```ts
if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  throw new Error("Serve HTTPS o localhost per usare la webcam");
}
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
});
video.srcObject = stream;
video.muted = true;
video.playsInline = true;      // necessario su iOS Safari
await video.play();
```

Errori da gestire con un messaggio chiaro (non un crash):
`NotAllowedError` (permesso negato) · `NotFoundError` (nessuna camera) ·
`NotReadableError` (camera occupata da un'altra app) · `OverconstrainedError` (vincoli impossibili).

## Spegnere

```ts
stream.getTracks().forEach((t) => t.stop());
video.srcObject = null;
```
Fermare anche il loop `requestAnimationFrame` e, se si esce, chiudere il task MediaPipe (`close()`).

## Specchio

Mostrare il video con CSS `transform: scaleX(-1)` e applicare la stessa trasformazione al canvas
dell'overlay. Non modificare i frame passati a MediaPipe.

## Verifica

- Sul VPS non c'è webcam: sub-agente `browser-tester` (Chromium con video finto).
- Prima di dire "fatto": sub-agente `privacy-auditor`.
- Fonti: MDN `MediaDevices.getUserMedia()` — https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia
