// Stampa in PDF le pagine di una versione del corso, come farebbe «Stampa» del browser (11/11/2026).
// Uso: node stampa.mjs <uscita.pdf> <url>…   (un PDF per pagina; esporta.sh li unisce con pdfunite)
// window.print() è disattivato (la pagina print.html di mdBook lo chiama da sola) e i <details>
// (le soluzioni) si aprono, così il PDF contiene tutto il testo.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { chromium } = require('playwright');
const [uscita, ...indirizzi] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => { window.print = () => {}; });
let n = 0;
for (const url of indirizzi) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
  await page.pdf({ path: indirizzi.length > 1 ? `${uscita}.${++n}.pdf` : uscita, format: 'A4',
                   printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' } });
}
await browser.close();
