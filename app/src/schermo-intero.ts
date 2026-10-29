/**
 * schermo-intero.ts — il pulsante «Schermo intero», uguale su tutte le pagine con la camera.
 *
 * Usa la Fullscreen API del browser: un clic mette la pagina a tutto schermo, un secondo clic (o il
 * tasto Esc, o la lettera F) la riporta com'era. Il pulsante sta nella barra in alto, accanto allo
 * stato della camera, perché è sempre visibile: anche prima di accendere la camera, e anche in
 * schermo intero (dove il menu si nasconde ma lo stato e questo pulsante restano).
 *
 * In schermo intero l'`<html>` prende la classe `schermo-intero`, e i CSS (style.css e quelli delle
 * singole pagine) tolgono i margini e nascondono il menu: l'immagine della camera e la scena
 * occupano tutto il monitor invece della finestra meno le cornici.
 *
 * AUTOMATICO (dal 08/10/2026): il browser concede lo schermo intero solo dentro un gesto
 * dell'utente, quindi «da solo all'apertura della pagina» non si può. Il primo gesto utile è il clic
 * su «Accendi la camera»: in quel clic si entra in schermo intero. Se il browser rifiuta comunque, compare
 * una domanda con un pulsante (il cui clic È un gesto valido). Le prove automatiche ne sono escluse,
 * salvo `?autofs` nell'indirizzo.
 *
 * Dove non si può (l'iPhone non ha la Fullscreen API per le pagine web) il pulsante si nasconde:
 * un pulsante che non fa niente è peggio di nessun pulsante.
 */
// Il testo dopo il simbolo sta in uno <span> che su telefono si nasconde (style.css): resta il simbolo.
const ETICHETTA_ENTRA = '⛶<span class="lungo"> Schermo intero</span>';
const ETICHETTA_ESCI = '✕<span class="lungo"> Esci da schermo intero</span>';

export function iniziaSchermoIntero(): void {
  const bottone = document.getElementById("schermo-intero") as HTMLButtonElement | null;
  if (!bottone) return;
  const radice = document.documentElement;

  // `fullscreenEnabled` è falso dove l'API non c'è o è disattivata (iPhone, iframe senza permesso).
  if (!document.fullscreenEnabled) {
    bottone.hidden = true;
    return;
  }

  const aggiorna = (): void => {
    const dentro = document.fullscreenElement !== null;
    radice.classList.toggle("schermo-intero", dentro);
    bottone.innerHTML = dentro ? ETICHETTA_ESCI : ETICHETTA_ENTRA;
    bottone.title = dentro ? "Esci da schermo intero" : "Schermo intero";
    bottone.setAttribute("aria-label", bottone.title);
    bottone.setAttribute("aria-pressed", String(dentro));
  };

  const alterna = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    // `navigationUI: "hide"` toglie anche i suggerimenti del browser dove li prevede. Un rifiuto
    // (permesso negato, gesto non valido) non è un errore da mostrare: il pulsante resta com'era.
    else void radice.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  };

  bottone.addEventListener("click", alterna);

  const avvio = document.getElementById("start");
  const automatico = !navigator.webdriver || new URLSearchParams(location.search).has("autofs");
  if (avvio && automatico) {
    // Fase di cattura: si chiede lo schermo intero PRIMA che il gestore della pagina faccia `await`,
    // finché il clic conta ancora come gesto dell'utente.
    avvio.addEventListener(
      "click",
      () => {
        if (document.fullscreenElement || rifiutato()) return;
        radice.requestFullscreen({ navigationUI: "hide" }).catch(chiedi);
      },
      { capture: true },
    );
  }
  // Esc esce da solo (lo fa il browser): si ascolta il cambiamento, non il tasto.
  document.addEventListener("fullscreenchange", aggiorna);
  // La lettera F come scorciatoia, come nei lettori video. Non c'è nessun campo di testo nelle
  // pagine, quindi non si ruba la digitazione a nessuno.
  document.addEventListener("keydown", (e) => {
    if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) alterna();
  });
  aggiorna();
}

/** «No» detto alla domanda, valido finché la scheda resta aperta. */
function rifiutato(): boolean {
  try {
    return sessionStorage.getItem("fs-no") === "1";
  } catch {
    return false;
  }
}

/** Il browser ha rifiutato lo schermo intero automatico: lo si chiede con un pulsante. */
function chiedi(): void {
  if (document.getElementById("chiedi-fs")) return;
  const box = document.createElement("div");
  box.id = "chiedi-fs";
  box.setAttribute("role", "dialog");
  box.style.cssText =
    "position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:50;display:flex;gap:10px;" +
    "align-items:center;padding:10px 14px;border-radius:14px;background:rgb(15 23 42/.92);" +
    "border:1px solid rgb(148 163 184/.3);font:600 1rem system-ui,sans-serif;color:#e2e8f0";
  box.innerHTML = '<span>Vuoi usare tutto lo schermo?</span><button class="primary">⛶ Sì</button><button>No</button>';
  const [si, no] = box.querySelectorAll("button");
  si.addEventListener("click", () => {
    box.remove();
    void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  });
  no.addEventListener("click", () => {
    box.remove();
    try { sessionStorage.setItem("fs-no", "1"); } catch { /* niente */ }
  });
  document.body.append(box);
  setTimeout(() => box.remove(), 12_000);
}
