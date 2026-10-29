#!/usr/bin/env bash
# Costruisce le due versioni del corso, dalla stessa fonte (corso-scuola/docs/, formato MkDocs):
#   site/          → MkDocs + Material   (pubblicata in /scuola/mkdocs/)
#   site-quarto/   → Quarto              (pubblicata in /scuola/quarto/)
#   site-mdbook/   → mdBook              (pubblicata in /scuola/mdbook/)
# Con un argomento copia le due versioni e la pagina di scelta in <cartella>/scuola/ (lo usa
# deploy/pubblica.sh con app/dist).
# Strumenti: .venv (mkdocs), strumenti/quarto-*/ e strumenti/mdbook-*/ — si installano con corso-scuola/installa-strumenti.sh
set -euo pipefail
cd "$(dirname "$0")/.."

MKDOCS=.venv/bin/mkdocs
QUARTO=$(ls -d strumenti/quarto-*/bin/quarto 2>/dev/null | tail -1 || true)
MDBOOK=$(ls -d strumenti/mdbook-*/mdbook 2>/dev/null | tail -1 || true)
[ -x "$MKDOCS" ] && [ -n "$QUARTO" ] && [ -n "$MDBOOK" ] || {
  echo "mancano gli strumenti del corso: corso-scuola/installa-strumenti.sh" >&2; exit 1; }

"$MKDOCS" build -s -q -f corso-scuola/mkdocs.yml

LAVORO=corso-scuola/quarto-lavoro
rm -rf "$LAVORO" corso-scuola/site-quarto
mkdir -p "$LAVORO"
python3 -I corso-scuola/convertitore/converti.py quarto corso-scuola/docs "$LAVORO/pagine"
cp corso-scuola/quarto/_quarto.yml corso-scuola/quarto/corso.css "$LAVORO/pagine/"
"$QUARTO" render "$LAVORO/pagine" --quiet

LIBRO=corso-scuola/mdbook-lavoro
rm -rf "$LIBRO" corso-scuola/site-mdbook
mkdir -p "$LIBRO"
python3 -I corso-scuola/convertitore/converti.py mdbook corso-scuola/docs "$LIBRO/pagine"
cp corso-scuola/mdbook/book.toml "$LIBRO/"
"$MDBOOK" build "$LIBRO" -d "$PWD/corso-scuola/site-mdbook" 2>&1 | grep -v ' INFO ' || true
[ -s corso-scuola/site-mdbook/index.html ] || { echo "mdbook: costruzione fallita" >&2; exit 1; }

if [ $# -ge 1 ]; then
  DEST="$1/scuola"
  rm -rf "$DEST"; mkdir -p "$DEST"
  cp -r corso-scuola/site "$DEST/mkdocs"
  cp -r corso-scuola/site-quarto "$DEST/quarto"
  cp -r corso-scuola/site-mdbook "$DEST/mdbook"
  cp corso-scuola/scelta/* "$DEST/"
  # Material pubblica anche le mappe del suo codice compilato (.map): servono solo a chi fa debug.
  find "$DEST" -name '*.map' -delete
fi
echo "corso costruito: corso-scuola/site (MkDocs), site-quarto (Quarto), site-mdbook (mdBook)"
