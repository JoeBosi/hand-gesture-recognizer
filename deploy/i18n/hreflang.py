"""hreflang.py — mette i link hreflang (it, en, x-default) nell'intestazione di una coppia di pagine.

Uso: python3 deploy/i18n/hreflang.py <percorso-url>   es. /sfida/
Modifica app/<pagina>/index.html e app/en/<pagina>/index.html. Si può rilanciare: non duplica.
"""
import re, sys

B = "https://mano.giuseppebosi.com"
url = sys.argv[1]
rel = url.strip("/")
it_file = f"app/{rel}/index.html" if rel else "app/index.html"
en_file = f"app/en/{rel}/index.html" if rel else "app/en/index.html"
blocco = (
    f'    <link rel="alternate" hreflang="it" href="{B}{url}" />\n'
    f'    <link rel="alternate" hreflang="en" href="{B}/en{url}" />\n'
    f'    <link rel="alternate" hreflang="x-default" href="{B}{url}" />\n'
)
for f in (it_file, en_file):
    s = open(f).read()
    s = re.sub(r'    <link rel="alternate" hreflang="[^"]*" href="[^"]*" />\n', "", s)
    s = s.replace("  </head>", blocco + "  </head>", 1)
    open(f, "w").write(s)
print("hreflang", it_file, en_file)
