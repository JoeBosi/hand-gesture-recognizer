/**
 * piede.ts — il piè di pagina comune a tutte le pagine del sito (dal 28/10/2026): autore, licenze,
 * link a Crediti e Privacy. Costruito con il DOM e non scritto nell'HTML di ogni pagina, così il
 * testo sta in un posto solo; niente innerHTML né stili in linea (CSP).
 */
import "./piede.css";
import "./lingua";
import { lingua, percorso, t } from "./i18n";


function link(testo: string, href: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.textContent = testo;
  a.href = href;
  return a;
}

function piede(): void {
  const f = document.createElement("footer");
  f.className = "piede-sito";
  const autore = document.createElement("p");
  autore.textContent = t("piede.autore");
  const licenze = document.createElement("p");
  licenze.append(
    t("piede.testi") + " ",
    link("CC BY 4.0", lingua === "en" ? "https://creativecommons.org/licenses/by/4.0/" : "https://creativecommons.org/licenses/by/4.0/deed.it"),
    " · " + t("piede.codice") + " ",
    link("MIT", "https://opensource.org/license/mit"),
    " · ",
    link(t("piede.crediti"), percorso("/crediti/")),
    " · ",
    link("Privacy", percorso("/privacy/")),
    " · ",
    link(t("piede.github"), "https://github.com/JoeBosi/hand-gesture-recognizer"),
  );
  const altri = document.createElement("p");
  altri.append(
    link("www.giuseppebosi.com", lingua === "en" ? "https://www.giuseppebosi.com/en/" : "https://www.giuseppebosi.com"),
    " · ",
    link("LinkedIn", "https://www.linkedin.com/in/giuseppebosi"),
    " · " + t("piede.altri") + ": ",
    link("JSON & API", "https://corso-api-json.giuseppebosi.com/"),
    " · ",
    link("llama.cpp", "https://corso-llamacpp.giuseppebosi.com/"),
    " · ",
    link("Memoria AI", "https://corso-rag.giuseppebosi.com/"),
  );
  f.append(autore, licenze, altri);
  document.body.append(f);
}

piede();
