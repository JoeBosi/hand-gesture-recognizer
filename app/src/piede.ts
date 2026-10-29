/**
 * piede.ts — il piè di pagina comune a tutte le pagine del sito (dal 28/10/2026): autore, licenze,
 * link a Crediti e Privacy. Costruito con il DOM e non scritto nell'HTML di ogni pagina, così il
 * testo sta in un posto solo; niente innerHTML né stili in linea (CSP).
 */
import "./piede.css";

const AUTORE =
  "Giuseppe Bosi, Dottore in Ingegneria Elettronica (V.O.), Professore di Scienze e Tecnologie Informatiche";

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
  autore.textContent = AUTORE;
  const licenze = document.createElement("p");
  licenze.append(
    "Testi ",
    link("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/deed.it"),
    " · Codice ",
    link("MIT", "https://opensource.org/license/mit"),
    " · ",
    link("Crediti", "/crediti/"),
    " · ",
    link("Privacy", "/privacy/"),
  );
  const altri = document.createElement("p");
  altri.append(
    link("www.giuseppebosi.com", "https://www.giuseppebosi.com"),
    " · ",
    link("LinkedIn", "https://www.linkedin.com/in/giuseppebosi"),
    " · Altri corsi: ",
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
