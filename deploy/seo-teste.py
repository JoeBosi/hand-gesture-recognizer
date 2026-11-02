#!/usr/bin/env python3
"""seo-teste.py — scrive title, description, Open Graph, Twitter e JSON-LD nelle 16 pagine dell'app
(app/**/index.html), IT e EN, da una tabella sola. Si rilancia quando cambia un testo:
    python3 -I deploy/seo-teste.py
Tocca solo il blocco fra <title> e i link hreflang; il resto della pagina resta com'è.
"""
import json, pathlib, re

RADICE = pathlib.Path(__file__).resolve().parent.parent / "app"
SITO = "https://mano.giuseppebosi.com"
REPO = "https://github.com/JoeBosi/hand-gesture-recognizer"

# percorso: (tipo JSON-LD, titolo IT, descrizione IT, titolo EN, descrizione EN)
PAGINE = {
    "/": ("WebSite",
          "Mano: riconoscimento della mano e dei gesti dalla webcam, nel browser",
          "La webcam guarda la tua mano, riconosce i gesti e la riproduce in 3D. Funziona nel browser con MediaPipe: le immagini restano sul tuo computer.",
          "Mano: hand and gesture recognition from the webcam, in the browser",
          "Your webcam watches your hand, recognizes gestures and rebuilds it in 3D. It runs in the browser with MediaPipe: the images stay on your computer."),
    "/sfida/": ("WebApplication",
          "Sasso, carta, forbici con la webcam: sfida a due giocatori · Mano",
          "Gioca a sasso, carta, forbici in due davanti alla stessa webcam: il computer riconosce i gesti delle mani e tiene il punteggio. Vince chi arriva a 2 punti.",
          "Rock, paper, scissors with your webcam: two-player duel · Mano",
          "Play rock, paper, scissors with a friend in front of one webcam: the computer recognizes both hand gestures and keeps the score. First to 2 points wins."),
    "/onda/": ("WebApplication",
          "Onda energetica: gesto a due mani riconosciuto dalla webcam · Mano",
          "Unisci le mani davanti alla webcam e tieni la posa per 4 secondi: si carica una palla di energia che parte come un raggio. Riconoscimento delle mani nel browser.",
          "Energy Wave: a two-hand gesture recognized by the webcam · Mano",
          "Join your hands in front of the webcam and hold the pose for 4 seconds: an energy ball charges and fires as a beam. Hand recognition in the browser."),
    "/corpo/": ("WebApplication",
          "Corpo: rilevamento della postura e scheletro dalla webcam · Mano",
          "La webcam trova i 33 punti del corpo e li riproduce come uno scheletro in 3D che si muove con te. Rilevamento della postura con MediaPipe, nel browser.",
          "Body: pose detection and 3D skeleton from the webcam · Mano",
          "The webcam finds the 33 body landmarks and turns them into a 3D skeleton that moves with you. Pose detection with MediaPipe, in the browser."),
    "/tutorial/": ("Course",
          "Tutorial: web app che riconosce la mano con MediaPipe e Three.js · Mano",
          "Come si programma da zero una web app che riconosce la mano dalla webcam con MediaPipe e la anima in 3D con Three.js, passo per passo, nel browser.",
          "Tutorial: build a hand-tracking web app with MediaPipe and Three.js · Mano",
          "How to build, from scratch, a web app that recognizes the hand from the webcam with MediaPipe and animates it in 3D with Three.js, step by step."),
    "/corso/": ("Course",
          "Corso di TypeScript da zero, con la webcam e la mano · Mano",
          "Corso di TypeScript da zero in 10 lezioni: dalla prima variabile a una mano che si muove sullo schermo seguendo la webcam.",
          "TypeScript course from scratch, with webcam hand tracking · Mano",
          "A TypeScript course from scratch in 10 lessons: from your first variable to a hand that moves on the screen following the webcam."),
    "/crediti/": ("WebPage",
          "Crediti: librerie, modelli e licenze del sito · Mano",
          "Le librerie, i modelli di intelligenza artificiale e gli strumenti con cui è costruito il sito Mano, con le loro licenze.",
          "Credits: libraries, models and licenses · Mano",
          "The libraries, artificial intelligence models and tools the Mano site is built with, and their licenses."),
    "/privacy/": ("WebPage",
          "Privacy: le immagini della webcam restano nel browser · Mano",
          "Come il sito Mano tratta i dati: le immagini della webcam vengono elaborate nel browser e restano sul tuo computer.",
          "Privacy: webcam images stay in your browser · Mano",
          "How the Mano site handles data: webcam images are processed in your browser and stay on your computer."),
}


def autore(en: bool) -> dict:
    return {"@type": "Person", "name": "Giuseppe Bosi", "honorificPrefix": "Prof.",
            "jobTitle": "Teacher of Computer Science and Technology" if en else "Professore di Scienze e Tecnologie Informatiche",
            "url": "https://www.giuseppebosi.com/en/" if en else "https://www.giuseppebosi.com",
            "sameAs": ["https://www.giuseppebosi.com", "https://www.linkedin.com/in/giuseppebosi", REPO]}


def jsonld(tipo: str, url: str, titolo: str, desc: str, en: bool) -> str:
    lingua = "en" if en else "it"
    base = {"name": titolo, "description": desc, "url": url, "inLanguage": lingua, "author": autore(en),
            "image": f"{SITO}/og-mano{'-en' if en else ''}.png"}
    if tipo == "WebSite":
        dati = {"@graph": [
            {"@type": "WebSite", **base, "license": "https://creativecommons.org/licenses/by/4.0/"},
            {"@type": "SoftwareSourceCode", "name": "hand-gesture-recognizer", "codeRepository": REPO,
             "programmingLanguage": "TypeScript", "license": "https://opensource.org/license/mit",
             "author": autore(en)}]}
    elif tipo == "WebApplication":
        dati = {"@type": "WebApplication", **base, "applicationCategory": "EducationalApplication",
                "operatingSystem": "Web browser", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"}}
    elif tipo == "Course":
        dati = {"@type": "Course", **base, "provider": autore(en), "isAccessibleForFree": True,
                "license": "https://creativecommons.org/licenses/by/4.0/"}
    else:
        dati = {"@type": "WebPage", **base}
    return json.dumps({"@context": "https://schema.org", **dati}, ensure_ascii=False)


def blocco(percorso: str, en: bool) -> str:
    tipo, ti, di, te, de = PAGINE[percorso]
    titolo, desc = (te, de) if en else (ti, di)
    url = SITO + ("/en" + percorso if en else percorso)
    img = f"{SITO}/og-mano{'-en' if en else ''}.png"
    alt = ("A drawn hand with 21 green points joined by white lines, and the title Mano" if en
           else "Una mano disegnata con 21 punti verdi uniti da linee bianche, e il titolo Mano")
    e = lambda s: s.replace("&", "&amp;").replace('"', "&quot;")
    righe = [
        f'<meta name="description" content="{e(desc)}" />',
        '<meta name="theme-color" content="#0b1020" />',
        '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
        f"<title>{e(titolo)}</title>",
        f'<link rel="canonical" href="{url}" />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="Mano" />',
        f'<meta property="og:locale" content="{"en_US" if en else "it_IT"}" />',
        f'<meta property="og:locale:alternate" content="{"it_IT" if en else "en_US"}" />',
        f'<meta property="og:title" content="{e(titolo)}" />',
        f'<meta property="og:description" content="{e(desc)}" />',
        f'<meta property="og:url" content="{url}" />',
        f'<meta property="og:image" content="{img}" />',
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        f'<meta property="og:image:alt" content="{e(alt)}" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{e(titolo)}" />',
        f'<meta name="twitter:description" content="{e(desc)}" />',
        f'<meta name="twitter:image" content="{img}" />',
        f'<meta name="twitter:image:alt" content="{e(alt)}" />',
        f'<script type="application/ld+json">{jsonld(tipo, url, titolo, desc, en)}</script>',
    ]
    return "\n    ".join(righe)


for percorso in PAGINE:
    for en in (False, True):
        f = RADICE / (("en" + percorso) if en else percorso.lstrip("/")) / "index.html"
        s = f.read_text()
        # dal primo meta description fino al primo link hreflang (escluso): il blocco SEO della pagina
        nuovo, n = re.subn(r'<meta\s+name="description".*?(?=<link rel="alternate" hreflang)',
                           blocco(percorso, en) + "\n    ", s, count=1, flags=re.S)
        assert n == 1, f
        f.write_text(nuovo)
        print("ok", f.relative_to(RADICE))
