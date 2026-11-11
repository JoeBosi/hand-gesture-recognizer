#!/usr/bin/env bash
# Esporta il corso in altri formati, per confrontare la qualità dei quattro framework (11/11/2026).
#   corso-scuola/site-esporta/<framework>/…  → pubblicato in /scuola/esporta/ da costruisci.sh
# Prima: corso-scuola/costruisci.sh (servono i quattro siti già costruiti).
# Formati: PDF da stampa web (Chrome headless, tutti e quattro); Markdown nel dialetto di ognuno;
# Quarto in più: PDF via LaTeX (xelatex, TinyTeX), sorgente .tex, PDF via Typst, Word, EPUB, ODT, GFM.
# Strumenti: strumenti/quarto-*, TinyTeX (`quarto install tinytex`), Playwright di app/ (Chromium), pdfunite.
set -euo pipefail
cd "$(dirname "$0")/.."
QUARTO="$PWD/$(ls -d strumenti/quarto-*/bin/quarto | tail -1)"
OUT="$PWD/corso-scuola/site-esporta"
LAV=corso-scuola/esporta-lavoro
rm -rf "$OUT" "$LAV"; mkdir -p "$OUT"/{mkdocs,quarto,mdbook,starlight} "$LAV"
NOME=La-mano-al-computer

# 1. Quarto come libro: PDF LaTeX (+ .tex), PDF Typst, Word, EPUB
python3 -I corso-scuola/convertitore/converti.py quarto corso-scuola/docs "$LAV/libro"
cp corso-scuola/esporta/_quarto-libro.yml "$LAV/libro/_quarto.yml"
for f in pdf typst docx epub; do
  (cd "$LAV/libro" && "$QUARTO" render --to $f --output-dir "_out-$f" --quiet)
done
cp "$LAV/libro/_out-pdf/$NOME.pdf"   "$OUT/quarto/$NOME-latex.pdf"
cp "$LAV/libro/$NOME.tex"            "$OUT/quarto/$NOME.tex"
cp "$LAV/libro/_out-typst/$NOME.pdf" "$OUT/quarto/$NOME-typst.pdf"
cp "$LAV/libro/_out-docx/$NOME.docx" "$OUT/quarto/$NOME.docx"
cp "$LAV/libro/_out-epub/$NOME.epub" "$OUT/quarto/$NOME.epub"
# ODT e Markdown GFM: i libri di Quarto non li fanno, li fa il suo pandoc sulle stesse pagine
(cd "$LAV/libro" && "$QUARTO" pandoc index.md lezioni/01-punti-della-mano.md --resource-path=.:lezioni \
   -M title="La mano al computer" -M lang=it -o "$OUT/quarto/$NOME.odt")
(cd "$LAV/libro" && "$QUARTO" pandoc index.md lezioni/01-punti-della-mano.md -t gfm \
   -o "$OUT/quarto/$NOME-gfm.md")

# 2. Markdown nel dialetto di ogni framework (indice + lezioni in un file)
unisci() { for f in "$@"; do cat "$f"; printf '\n\n'; done; }
python3 -I - corso-scuola/docs > "$OUT/mkdocs/$NOME.md" <<'PY'
import re, sys, pathlib
d = pathlib.Path(sys.argv[1])
for f in [d / "index.md", *sorted((d / "lezioni").glob("[0-9]*[!n].md"))]:
    t = re.sub(r'^(\s*)--8<-- "([^"]+)"\s*$', lambda m: "\n".join(m.group(1) + l if l else l
              for l in (d / m.group(2)).read_text().rstrip("\n").split("\n")), f.read_text(), flags=re.M)
    print(t, end="\n\n")
PY
unisci corso-scuola/mdbook-lavoro/pagine/index.md corso-scuola/mdbook-lavoro/pagine/lezioni/*.md > "$OUT/mdbook/$NOME.md"
unisci corso-scuola/starlight/src/content/docs/index.md corso-scuola/starlight/src/content/docs/lezioni/*.md > "$OUT/starlight/$NOME.md"

# 3. PDF dalla stampa del browser, sul sito servito in locale (i link sono assoluti: /scuola/…)
SERV="$LAV/web"; mkdir -p "$SERV/scuola"
cp -r corso-scuola/site "$SERV/scuola/mkdocs"; cp -r corso-scuola/site-quarto "$SERV/scuola/quarto"
cp -r corso-scuola/site-mdbook "$SERV/scuola/mdbook"; cp -r corso-scuola/site-starlight "$SERV/scuola/starlight"
PORTA=8781
python3 -m http.server $PORTA --bind 127.0.0.1 -d "$SERV" >/dev/null 2>&1 & PID=$!
trap 'kill $PID 2>/dev/null' EXIT
sleep 1
stampa() {  # stampa <framework> <pagina>…  → un PDF unico
  local fw=$1; shift; local urls=() dest="$OUT/$fw/$NOME-stampa-web.pdf"
  for p in "$@"; do urls+=("http://127.0.0.1:$PORTA/scuola/$fw/$p"); done
  node corso-scuola/esporta/stampa.mjs "$dest" "${urls[@]}"
  if [ ${#urls[@]} -gt 1 ]; then pdfunite "$dest".*.pdf "$dest" && rm "$dest".*.pdf; fi
}
stampa mkdocs    "" lezioni/01-punti-della-mano/
stampa quarto    index.html lezioni/01-punti-della-mano.html
stampa mdbook    print.html
stampa starlight "" lezioni/01-punti-della-mano/
# 4. Plugin di terze parti, installati nel progetto (11/11/2026, ok di Giuseppe)
# MkDocs: mkdocs-to-pdf 0.12.1 (WeasyPrint), nel .venv; config corso-scuola/mkdocs-pdf.yml
.venv/bin/mkdocs build -q -f corso-scuola/mkdocs-pdf.yml >/dev/null 2>&1
cp "$LAV/mkdocs-pdf/pdf/$NOME.pdf" "$OUT/mkdocs/$NOME-plugin-to-pdf.pdf"
# Starlight: starlight-to-pdf 1.4.0 (Puppeteer) sul sito servito qui sopra; Chrome senza sandbox perché si è root
(cd corso-scuola/starlight && npx starlight-to-pdf "http://127.0.0.1:$PORTA/scuola/starlight/" \
   --browser-executable "$PWD/../esporta/chrome-root.sh" -p "$OLDPWD/$LAV" -f starlight-plugin \
   --contents-name Indice --format A4 >/dev/null 2>&1)
cp "$LAV/starlight-plugin.pdf" "$OUT/starlight/$NOME-plugin-starlight-to-pdf.pdf"
# mdBook: mdbook-typst-pdf, mdbook-pandoc, mdbook-epub, se presenti in strumenti/mdbook-plugin/
PLUG="$PWD/strumenti/mdbook-plugin"
if [ -x "$PLUG/mdbook-epub" ]; then
  MDBOOK="$PWD/$(ls -d strumenti/mdbook-*/mdbook | grep -v plugin | tail -1)"
  LIB="$LAV/mdbook-plugin"; rm -rf "$LIB"; cp -r corso-scuola/mdbook-lavoro "$LIB"
  cat corso-scuola/esporta/book-plugin.toml >> "$LIB/book.toml"
  (cd "$LIB" && PATH="$PLUG:$(dirname "$QUARTO")/tools/x86_64:$HOME/.TinyTeX/bin/x86_64-linux:$PATH" "$MDBOOK" build -d out) >/dev/null 2>&1 || true
  find "$LIB/out" -name '*.epub' -exec cp {} "$OUT/mdbook/$NOME-plugin-epub.epub" \;
  find "$LIB/out/typst-pdf" -name '*.pdf' -exec cp {} "$OUT/mdbook/$NOME-plugin-typst.pdf" \; 2>/dev/null || true
  find "$LIB/out/pandoc" -name '*.pdf' -exec cp {} "$OUT/mdbook/$NOME-plugin-pandoc-latex.pdf" \; 2>/dev/null || true
  find "$LIB/out/pandoc" -name '*.tex' -exec cp {} "$OUT/mdbook/$NOME-plugin-pandoc.tex" \; 2>/dev/null || true
  find "$LIB/out/pandoc" -name '*.docx' -exec cp {} "$OUT/mdbook/$NOME-plugin-pandoc.docx" \; 2>/dev/null || true
fi
echo "export pronti in $OUT"; find "$OUT" -type f | sort
