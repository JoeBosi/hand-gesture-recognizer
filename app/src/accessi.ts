/**
 * accessi.ts — il contatore «Accessi: N» in basso a destra, su tutte le pagine (dal 08/10/2026).
 *
 * Un accesso è un'apertura di una qualunque pagina del sito, anche per sbaglio; il totale è unico
 * per tutto il sito (lo tiene deploy/server.mjs). Viaggia una POST vuota verso il sito stesso:
 * nessun dato, nessun identificativo, niente cookie. Se il server non risponde (sviluppo) il
 * riquadro semplicemente non compare.
 *
 * I test automatici (`navigator.webdriver`) leggono il totale senza aumentarlo, così le prove non
 * gonfiano il numero.
 */
import "./accessi.css";

async function mostraAccessi(): Promise<void> {
  try {
    const r = navigator.webdriver
      ? await fetch("/presenza/accessi", { cache: "no-store" })
      : await fetch("/presenza/visita", { method: "POST", cache: "no-store" });
    if (!r.ok) return;
    const { accessi } = (await r.json()) as { accessi: number };
    if (typeof accessi !== "number") return;
    const el = document.createElement("div");
    el.className = "accessi";
    el.textContent = `Accessi: ${accessi.toLocaleString("it-IT")}`;
    document.body.append(el);
  } catch {
    /* contatore non raggiungibile: niente riquadro */
  }
}

void mostraAccessi();
