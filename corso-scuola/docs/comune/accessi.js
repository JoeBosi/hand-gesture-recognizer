// Il contatore «Accessi: N» in basso a destra, come nelle altre pagine del sito (app/src/accessi.ts).
// Una POST vuota verso il sito stesso: nessun dato, nessun identificativo, niente cookie.
// I test automatici (navigator.webdriver) leggono il totale senza aumentarlo.
(async function () {
  try {
    const r = navigator.webdriver
      ? await fetch("/presenza/accessi", { cache: "no-store" })
      : await fetch("/presenza/visita", { method: "POST", cache: "no-store" });
    if (!r.ok) return;
    const { accessi } = await r.json();
    if (typeof accessi !== "number") return;
    const el = document.createElement("div");
    el.className = "accessi";
    const en = document.documentElement.lang.startsWith("en");
    el.textContent = (en ? "Visits: " : "Accessi: ") + accessi.toLocaleString(en ? "en-GB" : "it-IT");
    document.body.append(el);
  } catch (e) {
    /* contatore non raggiungibile (anteprima locale): niente riquadro */
  }
})();
