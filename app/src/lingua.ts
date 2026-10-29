/**
 * lingua.ts — il selettore della lingua e la scelta automatica (dal 29/10/2026).
 *
 * - Selettore: un link «English» / «Italiano» nel menu in alto (o in cima alla pagina, nei
 *   documenti senza menu) che porta alla stessa pagina nell'altra lingua. Cliccandolo la scelta
 *   resta memorizzata nel browser.
 * - Scelta automatica: solo la prima volta, solo dalle pagine italiane, e solo se fra le lingue
 *   del browser non c'è l'italiano. I programmi dei motori di ricerca non vengono spostati: devono
 *   vedere tutte e due le versioni (le collega `hreflang` nell'intestazione di ogni pagina).
 */
import { lingua, percorsoAltraLingua } from "./i18n";

const CHIAVE = "lingua";

function leggiScelta(): string | null {
  try {
    return localStorage.getItem(CHIAVE);
  } catch {
    return null;
  }
}

function sceltaAutomatica(): void {
  if (lingua !== "it" || leggiScelta()) return;
  if (/bot|crawl|spider|slurp|google|bing|yandex|duckduck|baidu|lighthouse|headless/i.test(navigator.userAgent)) return;
  const lingue = navigator.languages?.length ? navigator.languages : [navigator.language];
  if (lingue.some((l) => l.toLowerCase().startsWith("it"))) return;
  location.replace(percorsoAltraLingua() + location.search + location.hash);
}

function selettore(): void {
  const a = document.createElement("a");
  a.className = "scelta-lingua";
  a.href = percorsoAltraLingua();
  a.hreflang = lingua === "en" ? "it" : "en";
  a.lang = a.hreflang;
  a.textContent = lingua === "en" ? "Italiano" : "English";
  a.addEventListener("click", () => {
    try {
      localStorage.setItem(CHIAVE, a.hreflang);
    } catch {
      /* senza memoria nel browser la scelta vale solo per questa visita */
    }
  });
  const nav = document.querySelector(".topbar .nav");
  if (nav) nav.append(a);
  else document.body.prepend(Object.assign(document.createElement("div"), { className: "barra-lingua" }));
  if (!nav) document.querySelector(".barra-lingua")!.append(a);
}

sceltaAutomatica();
selettore();
