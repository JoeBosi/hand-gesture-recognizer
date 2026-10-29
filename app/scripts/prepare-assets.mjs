/**
 * prepare-assets.mjs — porta dentro al sito il runtime e il modello di MediaPipe.
 *
 * Gira prima di ogni `npm run dev` e `npm run build` (vedi package.json) e mette in
 * `app/public/mediapipe/` due cose:
 *   - il runtime WebAssembly, copiato da node_modules (quindi della stessa versione del pacchetto);
 *   - il modello dei gesti, scaricato una volta sola e verificato con il suo checksum.
 *
 * Tutto ciò che sta in `public/` finisce in `dist/` così com'è, senza passare dal bundler.
 *
 * Perché non usare la CDN, come mostra la documentazione di Google:
 *   1. riservatezza — la CSP del sito consente richieste solo verso il proprio dominio; se il
 *      modello arrivasse da una CDN, quella regola andrebbe allargata e la promessa "le immagini
 *      non lasciano il browser" diventerebbe più difficile da dimostrare;
 *   2. stabilità — la documentazione usa l'indirizzo "@latest": il giorno che esce una versione
 *      nuova, il sito cambierebbe da solo, magari rompendosi. Qui le versioni sono fissate.
 *
 * È idempotente: le copie si rifanno sempre (costano niente), il modello si riscarica solo se
 * manca o se il checksum non torna.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// I moduli ES non hanno __dirname: si ricava dall'indirizzo del file stesso.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "mediapipe");

/**
 * Le due varianti "non-module" del runtime: la prima usa le istruzioni SIMD del processore ed è
 * più veloce, la seconda è il ripiego per browser che non le supportano. È MediaPipe stesso a
 * scegliere quale caricare, ma deve trovarle entrambe nella cartella.
 */
const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
mkdirSync(join(out, "wasm"), { recursive: true });
for (const f of WASM_FILES) copyFileSync(join(wasmSrc, f), join(out, "wasm", f));

/**
 * I modelli. Gli indirizzi puntano alla versione "1", non a "latest": il file è sempre lo stesso,
 * e il checksum lo dimostra a ogni build.
 *
 * - gesture_recognizer (~8 MB) serve alla pagina della mano: 21 punti + nome del gesto.
 * - pose_landmarker_lite (~5,8 MB) serve alla pagina del corpo: 33 punti da testa a piedi.
 *   Di "pose_landmarker" esistono tre taglie: lite, full (9,4 MB) e heavy (30 MB). Più grande è,
 *   più preciso è, ma anche più lento: per una figura stilizzata che si muove in tempo reale nel
 *   browser, lite è il compromesso giusto. Per cambiare taglia basta sostituire nome e checksum.
 */
const MODELS = [
  {
    url: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
    file: join(out, "gesture_recognizer.task"),
    sha256: "97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482",
  },
  {
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    file: join(out, "pose_landmarker_lite.task"),
    sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  },
  {
    // hand_landmarker (~7,8 MB) serve alla pagina del corpo, insieme al modello della posa: la
    // posa dà quattro punti per mano (polso, pollice, indice, mignolo) e con quelli le dita si
    // possono solo inventare. Questo modello dà le 21 articolazioni vere.
    //
    // Perché non riusare gesture_recognizer.task, che è già qui e contiene lo stesso
    // riconoscitore di mani: perché contiene *anche* la rete che classifica i gesti, che su
    // questa pagina non servono e che girerebbe a ogni fotogramma. La documentazione dice
    // esattamente questo: se serve solo la posizione delle dita, si usa Hand landmarker.
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    file: join(out, "hand_landmarker.task"),
    sha256: "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
  },
  {
    // face_landmarker (~3,8 MB) serve alla pagina del corpo, per una cosa sola: sapere in che
    // POSIZIONE e in che DIREZIONE sta la testa. La posa del corpo dà del viso soltanto sette punti
    // (naso, occhi, orecchie) e con quelli la testa si può solo indovinare: in particolare non si
    // vede se la persona sta china verso lo schermo, ed è il caso più comune davanti a una
    // webcam. Questo modello dà 478 punti del viso e l'apertura della mandibola.
    // Dentro il pacchetto ci sono già tre reti (rilevatore, mesh, blendshape): non serve
    // aggiungere anche FaceDetector. Lo sha256 è calcolato in locale (Google pubblica solo
    // md5/crc32c); `/float16/1/` e `/float16/latest/` oggi sono byte-identici.
    // NB: questo modello NON riconosce chi è la persona, e la sua scheda ufficiale dice che non
    // lo fa per scelta («do not provide facial recognition or identification»).
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    file: join(out, "face_landmarker.task"),
    sha256: "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
  },
];
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

for (const model of MODELS) {
  if (existsSync(model.file) && sha(readFileSync(model.file)) === model.sha256) continue;
  const res = await fetch(model.url);
  if (!res.ok) throw new Error(`download del modello fallito: HTTP ${res.status} (${model.url})`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Se il contenuto non è quello atteso la build si ferma: meglio un errore chiaro adesso che un
  // file sbagliato pubblicato sul sito.
  if (sha(buf) !== model.sha256) throw new Error(`checksum diverso da quello atteso: ${model.url}`);
  writeFileSync(model.file, buf);
}

console.log("asset MediaPipe pronti in public/mediapipe/");
