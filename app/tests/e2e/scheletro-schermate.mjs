/**
 * scheletro-schermate.mjs — fotografa lo scheletro su una posa finta.
 *
 * Verifica la FORMA della figura 3D (proporzioni del cranio, gabbia toracica, bacino, ossa delle
 * mani) senza dipendere da una webcam né da quello che il riconoscitore decide di vedere in un
 * filmato: la posa è scritta a mano in `src/prova-scheletro.ts` ed è sempre la stessa, quindi due
 * esecuzioni si possono confrontare.
 *
 * Non fa parte di `npm run test:e2e`: non controlla niente da solo, produce schermate **da
 * guardare**. Si usa quando si mette mano a `bones.ts` o a `body3d.ts`.
 *
 *   cd app
 *   npm run dev &                                  # serve prova-scheletro.html sulla 5173
 *   OUT=/tmp node tests/e2e/scheletro-schermate.mjs
 *
 * Variabili:  OUT=cartella (obbligatoria)   PORT=5173
 */
import { chromium } from "playwright";

const OUT = process.env.OUT;
if (!OUT) throw new Error("serve OUT=<cartella dove salvare le schermate>");
const PORT = process.env.PORT ?? 5173;

// swiftshader: su un server senza scheda grafica Chromium disegna il 3D via software. È lento ma
// il risultato a schermo è identico, ed è tutto ciò che serve per giudicare una forma.
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

const errori = [];
page.on("pageerror", (e) => errori.push(e.message));
page.on("console", (m) => m.type() === "error" && errori.push(m.text()));

for (const [nome, qs] of [["fronte", "?turn=0"], ["girata", "?turn=42"], ["senza-mani", "?turn=0&hands=0"]]) {
  await page.goto(`http://localhost:${PORT}/prova-scheletro.html${qs}`, { waitUntil: "networkidle" });
  // La pagina disegna una quarantina di fotogrammi per far finire la dissolvenza in entrata, poi
  // si dichiara pronta: senza aspettare quel segnale si fotograferebbe una figura semitrasparente.
  await page.waitForSelector("body[data-pronto=si]", { timeout: 30000 });
  await page.screenshot({ path: `${OUT}/scheletro-${nome}.png` });
  console.log(`${nome}: ${OUT}/scheletro-${nome}.png`);
}

console.log("errori:", errori.length ? errori : "nessuno");
await browser.close();
