/**
 * i18n.ts — la lingua del sito (dal 29/10/2026): italiano, lingua principale, agli indirizzi di
 * sempre; inglese sotto /en/.
 *
 * Ogni pagina esiste in due file HTML (es. `index.html` e `en/index.html`) con il testo fisso già
 * tradotto e `<html lang="…">` giusto. Il codice legge la lingua da lì e prende le scritte che
 * scrive lui (stati, avvisi, frasi dette ad alta voce) da `i18n/it.json` o `i18n/en.json`.
 * Le chiavi mancanti in inglese ricadono sull'italiano, e in sviluppo lo dice in console.
 */
// Le scritte stanno in più file per pagina (`comune.it.json`, `sfida.it.json`…), uniti qui.
const unisci = (file: Record<string, Record<string, string>>): Record<string, string> =>
  Object.assign({}, ...Object.values(file));
const it = unisci(import.meta.glob<Record<string, string>>("./i18n/*.it.json", { eager: true, import: "default" }));
const en = unisci(import.meta.glob<Record<string, string>>("./i18n/*.en.json", { eager: true, import: "default" }));

export type Lingua = "it" | "en";
type Chiave = string;

export const lingua: Lingua = document.documentElement.lang.startsWith("en") ? "en" : "it";
const testi: Record<string, string> = lingua === "en" ? en : it;

/** La scritta `chiave` nella lingua della pagina; `{nome}` viene sostituito con `valori.nome`. */
export function t(chiave: Chiave, valori: Record<string, string | number> = {}): string {
  let s = testi[chiave] ?? it[chiave];
  if (import.meta.env.DEV && !(chiave in testi)) console.warn(`i18n: manca "${chiave}" in ${lingua}`);
  for (const [k, v] of Object.entries(valori)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Locale per numeri e voce (sintesi vocale). */
export const locale = lingua === "en" ? "en-GB" : "it-IT";

/** Lo stesso indirizzo nell'altra lingua: /sfida/ ↔ /en/sfida/. */
export function percorsoAltraLingua(percorso = location.pathname): string {
  if (lingua === "en") return percorso.replace(/^\/en(\/|$)/, "/");
  return "/en" + percorso;
}

/** Un indirizzo interno nella lingua della pagina: "/crediti/" → "/en/crediti/" in inglese. */
export function percorso(p: string): string {
  return lingua === "en" ? "/en" + p : p;
}
