#!/usr/bin/env bash
# Compila l'app, controlla ciò che la CSP di produzione imporrebbe, copia dist/ nella
# cartella servita da Caddy e verifica la configurazione.
#
# Non ricarica Caddy e non tocca il DNS: sono le azioni che possono rendere irraggiungibili
# anche gli altri siti della macchina, e vanno fatte a mano dopo aver letto l'esito.
# Uso: deploy/pubblica.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DOMINIO=mano.giuseppebosi.com
DIST=app/dist   # servito direttamente da deploy/server.mjs: niente copie fuori dal progetto

echo "1. Dipendenze (npm ci)"
( cd app && npm ci --no-audit --no-fund ) >/dev/null
echo "   ok"

echo "2. Compilazione"
( cd app && npm run build ) >/dev/null
echo "   ok  ($(du -sh "$DIST" | cut -f1))"

echo "2b. Corso per la scuola (MkDocs, Quarto e mdBook, in $DIST/scuola/)"
corso-scuola/costruisci.sh "$DIST" >/dev/null 2>&1 || { echo "   KO: corso-scuola/costruisci.sh" >&2; exit 1; }
echo "   ok"

echo "3. Controlli che la CSP di produzione imporrebbe"
# In `npm run dev` non c'è nessuna CSP: questi errori si vedrebbero solo una volta pubblicato.
# I controlli sul markup girano su TUTTE le pagine prodotte dalla build, qualunque esse siano, e sulla
# versione SENZA commenti: un commento che cita `style=""` per spiegare la regola non è un
# attributo, e non deve far fallire la pubblicazione.
for PAGINA in $(find "$DIST" -name '*.html'); do
  MARKUP=$(perl -0777 -pe 's/<!--.*?-->//gs' "$PAGINA")
  # Il corso (/scuola/) ha la sua CSP in Caddy, che ammette script e stili incorporati (li mettono
  # i temi di MkDocs e Quarto; pagine di sola lettura, senza camera). Per lui vale solo il
  # controllo sulle risorse esterne, più sotto.
  case "$PAGINA" in "$DIST"/scuola/*) CORSO=1 ;; *) CORSO=0 ;; esac
  if [ "$CORSO" = 0 ] && grep -q 'style="' <<<"$MARKUP"; then
    echo "   KO: attributi style=\"\" in ${PAGINA#$DIST/} (style-src 'self' li blocca)" >&2; exit 1
  fi
  if [ "$CORSO" = 0 ] && grep -v 'application/ld+json' <<<"$MARKUP" | grep -qE '<script[^>]*>[^<]'; then
    echo "   KO: script inline in ${PAGINA#$DIST/} (script-src 'self' lo blocca)" >&2; exit 1
  fi
  # Solo le RISORSE devono essere locali: script, fogli di stile, immagini. I collegamenti
  # (`<a href="https://…">`) verso la documentazione ufficiale sono leciti — la CSP non li
  # riguarda — e il tutorial ne è pieno.
  # Il testo dentro <pre> è codice da leggere, non da caricare: nel corso c'è l'esempio
  # <script src="https://unpkg.com/ml5…"> da copiare nell'editor di p5.js, e mdBook lo lascia con le
  # virgolette vere (gli altri le scrivono &quot;). Si toglie prima di cercare le risorse esterne.
  # Anche <link rel="canonical"> (MkDocs) è solo un indirizzo dichiarato: non scarica nulla.
  RISORSE=$(perl -0777 -pe 's/<pre\b.*?<\/pre>//gs; s/<link rel="canonical"[^>]*>//g' <<<"$MARKUP")
  if grep -qE '(src="https?://|<link[^>]*href="https?://)' <<<"$RISORSE"; then
    echo "   KO: risorsa esterna in ${PAGINA#$DIST/}: nessuna CDN è ammessa" >&2; exit 1
  fi
done
# La telemetria si cerca nel codice nostro E nel glue emscripten che accompagna il wasm: quello
# arriva dal pacchetto npm, viene ricopiato da prepare-assets.mjs a ogni build, e un
# aggiornamento della libreria potrebbe reintrodurci un indirizzo senza che nessuno lo noti.
if grep -q 'odml.pa.googleapis.com' "$DIST"/assets/*.js "$DIST"/mediapipe/wasm/*.js; then
  echo "   KO: la telemetria di MediaPipe è ancora nel bundle (vedi app/vite.config.ts)" >&2; exit 1
fi
# Ogni URL assoluto nel bundle deve essere uno di quelli noti e innocui (namespace, citazioni,
# identificatori protobuf). Un indirizzo nuovo va capito prima di pubblicare.
# creativecommons.org e opensource.org: i link alle licenze nel piè di pagina (app/src/piede.ts).
NOTI='^https?://(www\.w3\.org/|jcgt\.org/|type\.googleapis\.com/|creativecommons\.org/licenses/by/4\.0/deed\.it$|opensource\.org/license/mit$|www\.giuseppebosi\.com$|www\.linkedin\.com/in/giuseppebosi$|github\.com/JoeBosi/hand-gesture-recognizer$|corso-(api-json|llamacpp|rag)\.giuseppebosi\.com/$)'
IGNOTI=$(grep -ohE 'https?://[a-zA-Z0-9.-]+[^"'"'"'` )]*' "$DIST"/assets/*.js | grep -vE "$NOTI" | sort -u || true)
if [ -n "$IGNOTI" ]; then
  echo "   KO: URL non previsti nel bundle:" >&2; echo "$IGNOTI" | sed 's/^/       /' >&2; exit 1
fi
# Nel glue del wasm gli indirizzi sono decine e sono tutti citazioni di documentazione dentro i
# messaggi d'errore di emscripten (MDN, Khronos, RFC…): elencarli uno per uno vorrebbe dire
# riscrivere la lista a ogni aggiornamento. Si controlla invece l'elenco degli HOST, che cambia
# di rado: se ne spunta uno nuovo va guardato prima di pubblicare.
HOST_NOTI='^https?://(en\.wikipedia\.org|kripken\.github\.io|pubs\.opengroup\.org|server\.com|unicode\.org|bugzil\.la|developer\.mozilla\.org|github\.com|tools\.ietf\.org|webkit\.org|www\.ietf\.org|www\.khronos\.org)$'
HOST_IGNOTI=$(grep -ohE 'https?://[a-zA-Z0-9.-]+' "$DIST"/mediapipe/wasm/*.js | sort -u | grep -vE "$HOST_NOTI" || true)
if [ -n "$HOST_IGNOTI" ]; then
  echo "   KO: host non previsti nel glue del wasm MediaPipe:" >&2
  echo "$HOST_IGNOTI" | sed 's/^/       /' >&2
  echo "       se sono innocui, aggiungili a HOST_NOTI in questo script" >&2; exit 1
fi
for f in mediapipe/gesture_recognizer.task mediapipe/pose_landmarker_lite.task \
         mediapipe/hand_landmarker.task mediapipe/face_landmarker.task \
         mediapipe/wasm/vision_wasm_internal.js mediapipe/wasm/vision_wasm_internal.wasm; do
  [ -s "$DIST/$f" ] || { echo "   KO: manca $DIST/$f" >&2; exit 1; }
done
# Le pagine devono esserci tutte: se una manca, vuol dire che è sparita da rollupOptions.input
# in app/vite.config.ts e il sito andrebbe online monco.
for p in index.html sfida/index.html onda/index.html corpo/index.html tutorial/index.html corso/index.html crediti/index.html privacy/index.html \
         scuola/index.html scuola/mkdocs/index.html scuola/quarto/index.html scuola/mdbook/index.html; do
  [ -s "$DIST/$p" ] || { echo "   KO: manca la pagina $p" >&2; exit 1; }
done
echo "   ok  (niente inline, niente CDN, niente telemetria o URL ignoti, i quattro modelli e tutte le pagine)"

echo "4. Servizio mano (serve app/dist dal progetto)"
if systemctl is-active --quiet mano 2>/dev/null; then
  systemctl restart mano
  # Node ci mette qualche secondo a partire e a mettersi in ascolto: con una sola attesa fissa lo
  # script dava un falso KO su un servizio che stava semplicemente ancora avviandosi. Si riprova
  # per 15 secondi, e solo dopo si dichiara il guasto.
  RISPOSTA=no
  for _ in $(seq 1 15); do
    if curl -sf -o /dev/null http://127.0.0.1:8791/; then RISPOSTA=si; break; fi
    sleep 1
  done
  [ "$RISPOSTA" = si ] \
    && echo "   ok  (riavviato, risponde su 127.0.0.1:8791)" \
    || { echo "   KO: il servizio non risponde: journalctl -u mano -n 30" >&2; exit 1; }
else
  echo "   --  servizio mano non attivo: installalo con deploy/attiva-caddy.sh"
fi

echo "5. Configurazione di Caddy"
if grep -q "^$DOMINIO {" /etc/caddy/Caddyfile 2>/dev/null; then
  caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
    && echo "   ok  (blocco presente, configurazione valida)" \
    || { echo "   KO: caddy validate fallisce, NON ricaricare" >&2; exit 1; }
  # Il blocco installato può essere più vecchio del frammento del progetto: se contiene ancora
  # un `basic_auth` (la password tolta il 05/10/2026), meglio dirlo qui che scoprirlo aprendo il sito.
  # Si guarda SOLO dentro il blocco di questo dominio: sul server ci sono altri siti che usano
  # basic_auth, e cercare in tutto il file darebbe sempre esito positivo.
  if awk "/^$DOMINIO \{/,/^}/" /etc/caddy/Caddyfile | grep -v '^[[:space:]]*#' | grep -q 'basic_auth'; then
    echo "   !!  il blocco online ha ancora la password: allinealo con deploy/aggiorna-caddy.sh"
  fi
else
  echo "   --  il blocco per $DOMINIO non è in /etc/caddy/Caddyfile: vedi deploy/LEGGIMI.md"
fi

echo
if grep -q "^$DOMINIO {" /etc/caddy/Caddyfile 2>/dev/null; then
  echo "Pubblicato: https://$DOMINIO  (pagine: /  ·  /sfida/  ·  /onda/  ·  /corpo/  ·  /tutorial/  ·  /corso/  ·  /scuola/)"
else
  echo "Build pronta in $DIST. Per metterla online: deploy/attiva-caddy.sh"
fi
