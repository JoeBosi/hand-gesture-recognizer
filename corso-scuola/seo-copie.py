#!/usr/bin/env python3
"""seo-copie.py — le versioni Quarto e mdBook hanno lo stesso testo della versione MkDocs: per i
motori di ricerca sono copie. Questo script (lanciato da costruisci.sh) aggiunge a ogni loro pagina
il link canonical verso la pagina MkDocs corrispondente e la descrizione, dà l'alt alle immagini
di Quarto (il testo della didascalia) e lascia un solo h1 per pagina in mdBook (il titolo del
menu diventa un div). Uso: python3 -I corso-scuola/seo-copie.py <site-quarto> <site-mdbook>
"""
import pathlib, re, sys

MKDOCS = "https://mano.giuseppebosi.com/scuola/mkdocs/"
DESCR = {
    "index.html": "Corso per la scuola: con p5.js e ml5.js gli studenti che conoscono il C riconoscono la mano dalla webcam e costruiscono un gioco da comandare con le dita.",
    "lezioni/01-punti-della-mano.html": "Prima lezione: accendi la webcam nell'editor di p5.js e disegna sulla mano i 21 punti e le ossa con ml5 handPose, passo per passo con le schermate.",
}


def sistema(cartella: pathlib.Path, mdbook: bool) -> None:
    for f in cartella.rglob("*.html"):
        rel = f.relative_to(cartella).as_posix()
        s = f.read_text()
        testa = ""
        if rel in DESCR:
            canon = MKDOCS + ("" if rel == "index.html" else rel.removesuffix(".html") + "/")
            testa = f'<link rel="canonical" href="{canon}">\n'
            if 'name="description"' not in s:
                testa += f'<meta name="description" content="{DESCR[rel]}">\n'
        elif rel in ("print.html", "toc.html", "404.html"):
            testa = '<meta name="robots" content="noindex">\n'
        if testa and 'rel="canonical"' not in s:
            s = s.replace("</head>", testa + "</head>", 1)
        if mdbook:
            s = re.sub(r'<h1 class="menu-title">(.*?)</h1>', r'<div class="menu-title">\1</div>', s)
        else:
            # <figure> con <img> senza alt: l'alt è il testo della didascalia
            def alt(m):
                cap = re.sub(r"<[^>]+>", "", m.group(3)).strip().replace('"', "&quot;")
                return m.group(1) + f' alt="{cap}"' + m.group(2) + m.group(3)
            s = re.sub(r'(<img(?![^>]*\balt=)[^>]*?)(\s*/?>.*?<figcaption[^>]*>)(.*?)(?=</figcaption>)', alt, s, flags=re.S)
        f.write_text(s)


sistema(pathlib.Path(sys.argv[1]), False)
sistema(pathlib.Path(sys.argv[2]), True)
