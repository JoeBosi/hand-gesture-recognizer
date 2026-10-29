#!/usr/bin/env bash
# Riallinea il blocco del sito dentro /etc/caddy/Caddyfile a deploy/Caddyfile.snippet.
#
# Serve quando cambia qualcosa nella configurazione del dominio — intestazioni, CSP, o come in
# questo caso l'accesso — e il blocco è già installato: attiva-caddy.sh in
# quel caso non tocca niente apposta, per non sovrascrivere modifiche fatte a mano.
#
# Cosa fa, nell'ordine: copia di riserva del Caddyfile, sostituzione del solo blocco del dominio,
# `caddy validate`, `systemctl reload caddy`. Se validazione o reload falliscono, rimette il file
# di prima e ricarica: gli altri siti del server non se ne accorgono (reload, mai restart).
#
# Uso: deploy/aggiorna-caddy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CADDYFILE=/etc/caddy/Caddyfile
DOMINIO=mano.giuseppebosi.com
SNIPPET=deploy/Caddyfile.snippet

grep -q "^$DOMINIO {" "$CADDYFILE" || {
  echo "Il blocco di $DOMINIO non è in $CADDYFILE: usa deploy/attiva-caddy.sh (prima installazione)." >&2
  exit 1
}

BACKUP="$CADDYFILE.bak.$(date +%Y%m%d-%H%M%S)"
cp -p "$CADDYFILE" "$BACKUP"
echo "backup: $BACKUP"

# Sostituzione del blocco: si copia il file riga per riga saltando quelle comprese fra
# "dominio {" e la graffa chiusa in prima colonna, e al loro posto si mette lo snippet attuale.
# Il conteggio delle graffe non serve: dentro il blocco le chiusure sono sempre rientrate.
python3 - "$CADDYFILE" "$SNIPPET" "$DOMINIO" <<'PY'
import sys
caddyfile, snippet, dominio = sys.argv[1], sys.argv[2], sys.argv[3]
righe = open(caddyfile).read().splitlines(keepends=True)
nuovo, dentro, sostituito = [], False, False
for riga in righe:
    if not dentro and riga.startswith(f"{dominio} {{"):
        dentro = True
        nuovo.append(open(snippet).read().rstrip("\n") + "\n")
        sostituito = True
        continue
    if dentro:
        if riga.startswith("}"):
            dentro = False
        continue
    nuovo.append(riga)
if not sostituito:
    sys.exit("blocco non trovato")
open(caddyfile, "w").writelines(nuovo)
PY

ripristina() {
  echo "KO: $1 — ripristino il Caddyfile precedente" >&2
  cp -p "$BACKUP" "$CADDYFILE"
  systemctl reload caddy || true
  exit 1
}

caddy validate --adapter caddyfile --config "$CADDYFILE" >/dev/null 2>&1 || ripristina "caddy validate fallisce"
systemctl reload caddy || ripristina "reload fallito"
sleep 2
systemctl is-active --quiet caddy || ripristina "caddy non è attivo dopo il reload"

echo "ok  (blocco di $DOMINIO riallineato a $SNIPPET, Caddy ricaricato)"

# Verifica: il sito risponde 200 senza credenziali (non c'è più una password).
SENZA=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMINIO/" || true)
echo "https://$DOMINIO → senza password: $SENZA (atteso 200)"
