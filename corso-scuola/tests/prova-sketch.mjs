/**
 * prova-sketch.mjs — fa girare uno sketch p5.js + ml5 del corso in Chromium senza webcam vera
 * (webcam finta da un video .mjpeg) con p5 1.x e p5 2.x, e controlla che trovi almeno una mano e che
 * non ci siano errori. Salva una schermata per versione: è da lì che vengono le immagini
 * «Cosa ottieni» in cima alle lezioni.
 *
 * Uso (dalla radice del progetto; Playwright lo prende da app/):
 *   node corso-scuola/tests/prova-sketch.mjs corso-scuola/docs/codice/lezione-01.js [video.mjpeg] [cartella-schermate]
 * Il video predefinito è un fotogramma fermo dei test dell'app (una mano col pollice in su): con un video
 * che cambia, sulla macchina lenta di prova i punti arrivano in ritardo rispetto all'immagine.
 *
 * Lo sketch, per farsi controllare, deve scrivere `document.body.dataset.mani = mani.length;` in draw():
 * questo programma lo aggiunge da solo in fondo a draw() se manca, così il codice delle lezioni resta pulito.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const qui = dirname(fileURLToPath(import.meta.url));
// Playwright è installato una volta sola, nell'app: lo si prende da lì.
const { chromium } = createRequire(join(qui, "..", "..", "app", "package.json"))("playwright");
const VERSIONI_P5 = ["1.11.10", "2.3.4"]; // l'editor online può usare l'una o l'altra
const ML5 = "1.4.0";

const sketchPath = process.argv[2];
if (!sketchPath) { console.error("uso: node prova-sketch.mjs <sketch.js> [video.mjpeg] [cartella]"); process.exit(2); }
const fermo = join(qui, ".cache", "fermo.mjpeg");
let video = process.argv[3] ? resolve(process.argv[3]) : fermo;
const out = resolve(process.argv[4] ?? join(qui, ".cache"));
mkdirSync(out, { recursive: true });

// Il fotogramma fermo si ricava una volta dal video dei test dell'app.
if (video === fermo && !existsSync(fermo)) {
  const sorgente = join(qui, "..", "..", "app", "tests", "e2e", ".cache", "hands.mjpeg");
  if (!existsSync(sorgente)) { console.error("manca " + sorgente + ": lancia prima `cd app && npm run test:e2e`"); process.exit(2); }
  const d = readFileSync(sorgente);
  const fr = []; let i = 0;
  for (;;) { const a = d.indexOf(Buffer.from([0xff, 0xd8]), i); if (a < 0) break; const b = d.indexOf(Buffer.from([0xff, 0xd9]), a); fr.push(d.subarray(a, b + 2)); i = b + 2; }
  mkdirSync(dirname(fermo), { recursive: true });
  writeFileSync(fermo, Buffer.concat(Array(300).fill(fr[Math.floor(fr.length / 3)])));
}

let sketch = readFileSync(sketchPath, "utf8");
if (!sketch.includes("dataset.mani")) {
  sketch = sketch.replace(/function draw\(\)\s*\{/, "function draw() {\n  document.body.dataset.mani = mani.length;");
}

let p5v = "";
const pagina = () => `<!doctype html><html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/p5@${p5v}/lib/p5.min.js"></script>
<script src="https://unpkg.com/ml5@${ML5}/dist/ml5.js"></script></head><body><script src="sketch.js"></script></body></html>`;
const srv = createServer((q, r) => r.end(q.url === "/sketch.js" ? sketch : pagina())).listen(18995);

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`, "--enable-unsafe-swiftshader"] });
let falliti = 0;
for (const v of VERSIONI_P5) {
  p5v = v;
  const p = await browser.newPage({ viewport: { width: 660, height: 500 } });
  const errori = [];
  p.on("pageerror", (e) => errori.push(e.message));
  await p.goto("http://localhost:18995/");
  let mani = 0;
  for (let t = 0; t < 90 && !mani; t++) { await p.waitForTimeout(1000); mani = +(await p.evaluate(() => document.body.dataset.mani)) || 0; }
  await p.waitForTimeout(2500);
  const nome = join(out, `${sketchPath.split("/").pop().replace(/\.js$/, "")}-p5-${v}.png`);
  await p.screenshot({ path: nome });
  const ok = mani > 0 && errori.length === 0;
  if (!ok) falliti++;
  console.log(`${ok ? "✓" : "✗"} p5 ${v}: mani trovate ${mani}, errori ${errori.length ? JSON.stringify(errori) : "nessuno"} → ${nome}`);
  await p.close();
}
await browser.close();
srv.close();
console.log(falliti ? `SKETCH FALLITO (${falliti})` : "SKETCH OK");
process.exit(falliti ? 1 : 0);
