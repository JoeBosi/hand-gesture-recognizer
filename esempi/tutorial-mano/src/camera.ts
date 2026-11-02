/** An "expected" error, with a message already written for the user. */
export class CameraError extends Error {}

const MESSAGES: Record<string, string> = {
  NotAllowedError: "Permission denied: allow the camera in the browser settings and try again.",
  NotFoundError: "No webcam found on this device.",
  NotReadableError: "The webcam is busy with another application.",
  OverconstrainedError: "The webcam does not support the requested resolution.",
};

/** Turns the webcam on and connects it to the <video> element. Call it only from a click. */
export async function startCamera(video: HTMLVideoElement, onEnded?: () => void): Promise<MediaStream> {
  // Browsers give camera access only in a "secure context": HTTPS or localhost.
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("The camera only works on an HTTPS page.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user", // front camera on phones
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false, // the microphone is not needed: it is not even requested
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    throw new CameraError(MESSAGES[name] ?? "Cannot turn on the camera.");
  }

  video.srcObject = stream;
  await video.play();

  // Right after play() the size can still be 0: wait for the event that announces it.
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => video.addEventListener("loadedmetadata", () => resolve(), { once: true }));
  }

  // `ended` fires when the track stops for a reason outside the page (permission revoked,
  // webcam unplugged). It does not fire when we call track.stop() ourselves.
  if (onEnded) {
    for (const track of stream.getVideoTracks()) track.addEventListener("ended", onEnded, { once: true });
  }
  return stream;
}

/** Really turns the webcam off: every track must be stopped, pausing the <video> is not enough. */
export function stopCamera(video: HTMLVideoElement, stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop()); // this line turns off the camera light
  video.pause();
  video.srcObject = null;
}
