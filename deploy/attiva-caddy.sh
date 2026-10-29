#!/usr/bin/env bash
# Mette online mano.giuseppebosi.com in due passi:
#   1. installa e avvia il servizio `mano` (deploy/server.mjs), che serve app/dist DENTRO il
#      progetto su 127.0.0.1:8791 — nessun file copiato fuori dalla cartella;
#   2. aggiunge a /etc/caddy/Caddyfile il blocco con reverse_proxy verso quella porta.
# Idempotente. Backup del Caddyfile prima di toccarlo; se validazione o reload falliscono
# rimette il file di prima (reload, non restart: gli altri siti non cadono).
# Uso: deploy/attiva-caddy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PROGETTO=$(pwd)

CADDYFILE=/etc/caddy/Caddyfile
DOMINIO=mano.giuseppebosi.com
PORTA=8791
UNIT=/etc/systemd/system/mano.service

[ -s app/dist/index.html ] || { echo "Manca app/dist: lancia prima deploy/pubblica.sh" >&2; exit 1; }

echo "1. Servizio mano"
sed "s|__PROGETTO__|$PROGETTO|" deploy/mano.service > "$UNIT"
systemctl daemon-reload
systemctl enable --now mano >/dev/null
sleep 1
systemctl restart mano
sleep 1
curl -sf -o /dev/null "http://127.0.0.1:$PORTA/" || { echo "   KO: il servizio non risponde (journalctl -u mano -n 30)" >&2; exit 1; }
echo "   ok  (attivo su 127.0.0.1:$PORTA, serve $PROGETTO/app/dist)"

echo "2. Blocco Caddy"
if grep -q "^$DOMINIO {" "$CADDYFILE"; then
  echo "   --  già presente, non tocco il Caddyfile"
else
  BACKUP="$CADDYFILE.bak.$(date +%Y%m%d-%H%M%S)"
  cp -p "$CADDYFILE" "$BACKUP"
  echo "   backup: $BACKUP"
  { echo; cat deploy/Caddyfile.snippet; } >> "$CADDYFILE"

  ripristina() {
    echo "   KO: $1 — ripristino il Caddyfile precedente" >&2
    cp -p "$BACKUP" "$CADDYFILE"
    systemctl reload caddy || true
    exit 1
  }
  caddy validate --adapter caddyfile --config "$CADDYFILE" >/dev/null 2>&1 || ripristina "caddy validate fallisce"
  systemctl reload caddy || ripristina "reload fallito"
  sleep 3
  systemctl is-active --quiet caddy || ripristina "caddy non è attivo dopo il reload"
  echo "   ok  (blocco aggiunto, Caddy ricaricato)"
fi

echo "3. Verifica pubblica"
# Il certificato arriva al primo contatto: qualche secondo di pazienza.
for _ in $(seq 1 20); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMINIO/" || true)
  [ "$CODE" = "200" ] && break
  sleep 3
done
echo "   https://$DOMINIO → HTTP ${CODE:-nessuna risposta}"
[ "$CODE" = "200" ] || { echo "   Non risponde ancora 200: 'journalctl -u caddy -n 50'. Il blocco resta installato." >&2; exit 1; }
curl -sI "https://$DOMINIO/" | grep -iE '^(content-security-policy|permissions-policy):' || true
echo
echo "Online: https://$DOMINIO"
