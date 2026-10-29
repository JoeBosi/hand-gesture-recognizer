# Deploy di mano.giuseppebosi.com

Sito statico: nessun backend, nessun servizio systemd. Caddy serve `/opt/mano`, copia di `app/dist`.

## Aggiornare il sito

```bash
deploy/pubblica.sh
```

Compila, controlla (niente inline/CDN/telemetria/URL ignoti), riavvia il servizio `mano`.
Caddy non va ricaricato: i file li serve il servizio, dal progetto.

## Prima installazione (una volta sola)

```bash
deploy/attiva-caddy.sh
```

Installa e avvia il servizio systemd `mano` (dal modello `deploy/mano.service`), aggiunge
`deploy/Caddyfile.snippet` al Caddyfile dopo averne fatto il backup, valida, `systemctl reload caddy`
(non restart: gli altri siti non cadono), aspetta il certificato e controlla HTTP 200.
Se validazione o reload falliscono, rimette il Caddyfile di prima. È idempotente.
Eseguito il 2026-09-17: sito online.

Il DNS di `mano.giuseppebosi.com` punta già al VPS (164.68.123.249); il certificato HTTPS
lo ottiene Caddy da solo al primo accesso.

## Perché queste scelte

- **Niente file fuori dalla cartella**: la cartella deve restare portabile (R3). Caddy gira come
  utente `caddy` e non può attraversare `/root`, quindi i file li serve il servizio `mano`
  (`deploy/server.mjs`, Node senza dipendenze, solo su 127.0.0.1:8791) e Caddy fa da reverse proxy.
- **CSP `connect-src 'self'`**: la pagina non può inviare niente fuori dal proprio dominio. È la
  garanzia tecnica della frase "le immagini non lasciano il browser".
- **`'wasm-unsafe-eval'`**: serve per compilare il WebAssembly di MediaPipe; non abilita `eval()`.
- **wasm e modello serviti dal dominio**: nessuna CDN a runtime (`app/scripts/prepare-assets.mjs`,
  modello fissato con checksum).
- **Telemetria MediaPipe disattivata in build** (`app/vite.config.ts`).
- **`log { output discard }`**: nessun log degli accessi.

## Stato e diagnosi

```bash
systemctl status mano            # il server statico (porta 8791)
journalctl -u mano -n 30         # suoi log
curl -I https://mano.giuseppebosi.com/
```

## Tornare indietro

```bash
systemctl disable --now mano && rm /etc/systemd/system/mano.service && systemctl daemon-reload
ls -t /etc/caddy/Caddyfile.bak.* | head -1      # backup più recente
cp <backup> /etc/caddy/Caddyfile && caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile && systemctl reload caddy
```
