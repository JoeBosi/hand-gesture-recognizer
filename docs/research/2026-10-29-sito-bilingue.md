# Sito bilingue (it + en) — 29/10/2026

Fonti: https://ultrabug.github.io/mkdocs-static-i18n/ (repo github.com/ultrabug/mkdocs-static-i18n, PyPI 1.3.1),
https://developers.google.com/search/docs/specialty/international/localized-versions

- mkdocs-static-i18n 1.3.1: `docs_structure: suffix` (index.en.md), italiano default alla radice, inglese in /en/.
  Dichiara Material < 9.7.2; con 9.7.7 la build funziona (provata). Non emette hreflang: li mette
  `corso-scuola/overrides/main.html` (it, en, x-default).
- Material scarica `sitemap.xml` dalla cartella di ogni `link[rel=alternate]`: per non avere 404 in console
  `costruisci.sh` copia la sitemap in ogni cartella del sito MkDocs.
- Google: ogni versione elenca se stessa e le altre; x-default facoltativo; nella sitemap `xhtml:link` per ogni `<url>`.
- App: pagine inglesi in `app/en/…`, scritte del codice in `src/i18n/*.it.json` / `*.en.json`, `src/i18n.ts`, selettore e
  scelta automatica in `src/lingua.ts` (solo dalle pagine italiane, solo se il browser non ha l'italiano, mai per i bot).
- Quarto e mdBook restano solo in italiano.
