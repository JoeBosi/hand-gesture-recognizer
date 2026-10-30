/**
 * lingua.ts — il selettore della lingua e la scelta automatica (dal 29/10/2026).
 *
 * - Selettore: una bandierina con il codice della lingua («EN» con la bandiera inglese sulle
 *   pagine italiane, «IT» con quella italiana sulle inglesi), come su www.giuseppebosi.com
 *   (regola di Giuseppe del 30/10/2026). Sta nella barra in alto, a destra, o in cima alla pagina nei
 *   documenti senza menu, e porta alla stessa pagina nell'altra lingua. La scelta resta memorizzata.
 * - Scelta automatica: solo la prima volta, solo dalle pagine italiane, e solo se fra le lingue
 *   del browser non c'è l'italiano. I programmi dei motori di ricerca non vengono spostati: devono
 *   vedere tutte e due le versioni (le collega `hreflang` nell'intestazione di ogni pagina).
 */
import { lingua, percorsoAltraLingua } from "./i18n";

// Le due bandiere, SVG come nella home page di www.giuseppebosi.com (niente immagini esterne).
const BANDIERA_UK =
  '<svg viewBox="0 0 60 30" width="22" height="11" aria-hidden="true"><clipPath id="fg"><path d="M0,0v30h60V0z"/></clipPath><clipPath id="fh"><path d="M30,15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#fg)"><path d="M0,0v30h60V0z" fill="#012169"/><path d="M0,0 60,30M60,0 0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 60,30M60,0 0,30" clip-path="url(#fh)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></g></svg>';
const BANDIERA_IT =
  '<svg viewBox="0 0 3 2" width="17" height="11" aria-hidden="true"><path fill="#009246" d="M0 0h1v2H0z"/><path fill="#fff" d="M1 0h1v2H1z"/><path fill="#CE2B37" d="M2 0h1v2H2z"/></svg>';

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
  a.className = "scelta-lingua lang";
  a.href = percorsoAltraLingua();
  a.hreflang = lingua === "en" ? "it" : "en";
  a.lang = a.hreflang;
  a.title = lingua === "en" ? "Versione italiana" : "English version";
  a.innerHTML = (lingua === "en" ? BANDIERA_IT + "IT" : BANDIERA_UK + "EN");
  a.addEventListener("click", () => {
    try {
      localStorage.setItem(CHIAVE, a.hreflang);
    } catch {
      /* senza memoria nel browser la scelta vale solo per questa visita */
    }
  });
  // Sul telefono il menu scorre di lato e taglierebbe la bandierina: va nel blocco di destra,
  // che non si stringe mai, così resta sempre visibile.
  const destra = document.querySelector(".topbar .destra");
  const nav = destra ?? document.querySelector(".topbar .nav");
  if (destra) destra.prepend(a);
  else if (nav) nav.append(a);
  else document.body.prepend(Object.assign(document.createElement("div"), { className: "barra-lingua" }));
  if (!nav) document.querySelector(".barra-lingua")!.append(a);
}

sceltaAutomatica();
selettore();
