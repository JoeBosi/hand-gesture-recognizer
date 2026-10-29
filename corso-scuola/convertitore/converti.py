"""Traduce le pagine del corso dal formato MkDocs (corso-scuola/docs/) a quello di Quarto o di mdBook.

La fonte è una sola: si scrive in docs/ e questo programma, a ogni costruzione, produce la cartella
di lavoro di Quarto. Così le due versioni del sito hanno sempre lo stesso identico testo.

Cosa cambia fra i due formati (solo questo):
  !!! tipo "Titolo"  + blocco rientrato   →  ::: {.callout-…} ## Titolo … :::
  ??? tipo "Titolo"  (a scomparsa)        →  ::: {.callout-… collapse="true"}
  --8<-- "file"   (inclusione del codice) →  il contenuto del file, copiato al suo posto
  # Titolo in prima riga                  →  title: nell'intestazione YAML
  { width="480" }                         →  {width="480"}

Per mdBook (che non ha riquadri con titolo né attributi sulle immagini):
  !!! tipo "Titolo"   →  > [!TIP] con il titolo in grassetto (riquadri di mdBook 0.5)
  ??? tipo "Titolo"   →  <details><summary>Titolo</summary> … </details>
  ![alt](img){ width="480" }  →  <img src alt width>
  # Titolo resta com'è; in più si scrive SUMMARY.md (l'indice di mdBook)

Uso: python3 -I converti.py <quarto|mdbook> <docs> <cartella di lavoro>
"""
import re, shutil, sys
from pathlib import Path

FORMATO = "quarto"
PIEDE = ('<small>Giuseppe Bosi, Dottore in Ingegneria Elettronica (V.O.), Professore di Scienze e Tecnologie Informatiche<br>' 'Testi <a href="https://creativecommons.org/licenses/by/4.0/deed.it">CC BY 4.0</a> · Codice <a href="https://opensource.org/license/mit">MIT</a> · <a href="/crediti/">Crediti</a> · <a href="/privacy/">Privacy</a></small>')
ALLARMI = {"tip": "TIP", "note": "NOTE", "warning": "WARNING", "important": "IMPORTANT"}
TIPI = {"success": "tip", "tip": "tip", "note": "note", "info": "note", "warning": "warning",
        "danger": "important", "example": "note", "question": "note"}


def converti(testo: str, docs: Path) -> str:
    righe = testo.split("\n")
    out, i = [], 0
    if FORMATO == "quarto" and righe and righe[0].startswith("# "):
        titolo = righe[0][2:].strip().replace('"', '\\"')
        out += ["---", f'title: "{titolo}"', "---"]
        i = 1
    while i < len(righe):
        r = righe[i]
        m = re.match(r'^(\s*)(!!!|\?\?\?\+?)\s+(\w+)(?:\s+"([^"]*)")?\s*$', r)
        if m:
            rientro, segno, tipo, titolo = m.groups()
            corpo, i = [], i + 1
            while i < len(righe) and (righe[i].strip() == "" or righe[i].startswith(rientro + "    ")):
                corpo.append(righe[i][len(rientro) + 4:] if righe[i].strip() else "")
                i += 1
            while corpo and corpo[-1] == "":
                corpo.pop()
            if FORMATO == "mdbook":
                interno = converti_corpo(corpo, docs)
                if segno.startswith("???"):
                    out += [f"{rientro}<details{' open' if segno.endswith('+') else ''}>",
                            f"{rientro}<summary>{titolo or tipo}</summary>", ""]
                    out += [rientro + c if c else "" for c in interno]
                    out += ["", f"{rientro}</details>", ""]
                else:
                    out.append(f"{rientro}> [!{ALLARMI[TIPI.get(tipo, 'note')]}]")
                    if titolo:
                        out += [f"{rientro}> **{titolo}**", f"{rientro}>"]
                    out += [f"{rientro}> {c}".rstrip() for c in interno]
                    out.append("")
                continue
            attr = f".callout-{TIPI.get(tipo, 'note')}"
            if segno.startswith("???"):
                attr += f' collapse="{"false" if segno.endswith("+") else "true"}"'
            out.append(f"{rientro}::: {{{attr}}}")
            if titolo:
                out.append(f"{rientro}## {titolo}")
                out.append("")
            out += [rientro + c if c else "" for c in converti_corpo(corpo, docs)]
            out.append(f"{rientro}:::")
            out.append("")
            continue
        out.append(r)
        i += 1
    return sistema("\n".join(out), docs)


def converti_corpo(corpo, docs):
    return converti("\n".join(corpo), docs).split("\n")


def sistema(testo: str, docs: Path) -> str:
    def includi(m):
        rientro = m.group(1)
        return "\n".join(rientro + l if l else l
                         for l in (docs / m.group(2)).read_text().rstrip("\n").split("\n"))
    testo = re.sub(r'^(\s*)--8<-- "([^"]+)"\s*$', includi, testo, flags=re.M)
    if FORMATO == "mdbook":
        testo = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)\{\s*width="(\d+)"\s*\}',
                       r'<img src="\2" alt="\1" width="\3">', testo)
    else:  # Quarto farebbe del testo alternativo una didascalia visibile: lo si passa come fig-alt
        testo = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)\{\s*([^{}]*?)\s*\}',
                       lambda m: f'![]({m.group(2)}){{{m.group(3)} fig-alt="{m.group(1)}"}}', testo)
    testo = re.sub(r"\{\s+([^{}]*?)\s+\}", r"{\1}", testo)
    return testo


def main():
    global FORMATO
    FORMATO, docs, lavoro = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    for f in docs.rglob("*"):
        dest = lavoro / f.relative_to(docs)
        if f.is_dir():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        if f.suffix == ".md":
            testo = converti(f.read_text(), docs)
            if FORMATO == "mdbook":  # mdBook non ha un piè di pagina configurabile: lo si aggiunge al testo
                testo = testo.rstrip("\n") + "\n\n---\n\n" + PIEDE + "\n"
            dest.write_text(testo)
        else:
            shutil.copy2(f, dest)
    if FORMATO == "mdbook":
        sommario(docs, lavoro)


def sommario(docs: Path, lavoro: Path):
    """SUMMARY.md di mdBook: l'indice prima, poi le lezioni in ordine, ognuna con il suo titolo."""
    voci = ["# Sommario", "", "[Indice del corso](index.md)", ""]
    for f in sorted((docs / "lezioni").glob("*.md")):
        titolo = f.read_text().split("\n", 1)[0].lstrip("# ").strip()
        voci.append(f"- [{titolo}](lezioni/{f.name})")
    (lavoro / "SUMMARY.md").write_text("\n".join(voci) + "\n")


if __name__ == "__main__":
    main()
