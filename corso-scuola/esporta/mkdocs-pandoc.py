"""Dalla pagina unica di mkdocs-print-site a un HTML pulito per pandoc (prova 11/11/2026).
Tiene solo il contenuto del corso; i riquadri (admonition) diventano citazioni con il titolo in grassetto,
le soluzioni a scomparsa (<details>) diventano testo normale con il titolo in grassetto, si tolgono i
pulsanti di copia e le ancore ¶. Uso: python mkdocs-pandoc.py <print_page/index.html> <uscita.html>"""
import sys
from bs4 import BeautifulSoup

s = BeautifulSoup(open(sys.argv[1], encoding="utf-8").read(), "html.parser")
corpo = s.find(id="print-site-page")
for x in corpo.select("a.headerlink, button, .md-clipboard, nav, .print-site-enumerate-headings"):
    x.decompose()
for d in corpo.find_all(["details"]):
    t = d.find("summary"); titolo = t.get_text(strip=True) if t else ""
    if t: t.decompose()
    d.name = "blockquote"; d.attrs = {}
    p = s.new_tag("p"); b = s.new_tag("strong"); b.string = titolo; p.append(b); d.insert(0, p)
for a in corpo.select("div.admonition"):
    t = a.find(class_="admonition-title")
    if t:
        b = s.new_tag("strong"); b.string = t.get_text(strip=True); t.clear(); t.append(b); t.name = "p"; t.attrs = {}
    a.name = "blockquote"; a.attrs = {}
for img in corpo.find_all("img"):  # percorsi relativi a print_page/
    img["src"] = img["src"].replace("../", "", 1) if img["src"].startswith("../") else img["src"]
out = BeautifulSoup('<html lang="it"><head><meta charset="utf-8"><title>La mano al computer</title></head><body></body></html>', "html.parser")
out.body.append(corpo)
open(sys.argv[2], "w", encoding="utf-8").write(str(out))
