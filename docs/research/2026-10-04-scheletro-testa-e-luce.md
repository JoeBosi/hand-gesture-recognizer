# Scheletro: la testa «bassa», la luce, e le mosse lette dalle dita

**Data:** 2026-10-04
**Perché:** richieste di Giuseppe — scheletro più bello e più completo, e testa che spesso è bassa;
sfida a 2 punti con lettura ritardata, mosse riconosciute anche di dorso, voce.
**Fonti:** sorgente di `three` 0.186.0 installato (la versione è fissata, è la fonte di verità),
[MDN: globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation),
[Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas),
[guida Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker),
note del 2026-09-29 sul volto (`2026-09-29-mediapipe-volto-web.md`).

## 1. Perché la testa veniva «bassa»: misurato, non supposto

Su un fotogramma vero (seduto, vicino, testa china verso lo schermo) lo scheletro disegnava il cranio
**a faccia in giù, visto dall'alto**. Posa del corpo contro modello del volto, stessa immagine:

| | posa del corpo | modello del volto |
|---|---|---|
| larghezza della testa | 0,107 | 0,146 |
| naso davanti alle orecchie (z) | 0,35 | 0,09 |

La `z` che la posa dà al viso è esagerata di ~4 volte. L'«alto» della testa era la direzione
spalle→orecchie, quindi quella `z` entrava nell'asse e lo inclinava verso la camera. In più il cranio
veniva disegnato ~27% troppo piccolo (scala dalla distanza fra le orecchie). **Cura:** il terzo
modello (`face_landmarker.task`, 3.758.596 byte, sha256 `64184e22…`), che ha una profondità coerente.
Il ripiego senza volto prende l'«alto» nel piano dell'immagine.

Taratura della scala: viso largo 13,5 cm e alto (fronte→mento) 18,5 su un cranio alto 22 e largo 15
→ scala = media di `larghezza / 0,70` e `altezza / 0,84`. Con 0,61 il cranio risultava il 27% più
largo del viso misurato.

## 2. Three.js 0.186 (verificato sul sorgente installato)

- `new RoomEnvironment()` **non prende argomenti**; è `PMREMGenerator(renderer)` che vuole il renderer.
  Uso: `pmrem.fromScene(room, 0.04).texture` → `scene.environment`; poi `room.dispose()`, `pmrem.dispose()`.
- Con `scene.environment` l'intensità si regola con **`scene.environmentIntensity`**: `material.envMapIntensity`
  viene ignorato a meno che il materiale abbia il suo `envMap` (`WebGLRenderer.js:2736`).
- `bumpMap` è un dato, non un colore: la `CanvasTexture` resta in `NoColorSpace` (il predefinito).
  Una sola texture si può condividere fra tutti i materiali.
- `RoomEnvironment` + luci di `FrameScene` insieme sovraesponevano l'osso (aspetto di gesso):
  ambiente a 0,32 e luci della scena ×0,55.
- Un materiale `transparent` si ordina per distanza e con ossa che si compenetrano l'ordine sbaglia:
  a opacità 1 si imposta `transparent = false` (si torna al passaggio con buffer di profondità).
- `mirrorX` per le geometrie: oltre a invertire la x serve rigirare i triangoli, **anche per le geometrie
  non indicizzate** (quelle di `ExtrudeGeometry`). Alla prima versione mancava e l'ala iliaca sinistra
  veniva grigia, con le luci invertite.

## 3. Canvas 2D per gli effetti (pagina dell'onda)
`globalCompositeOperation = "lighter"` somma i colori dove le forme si sovrappongono; `clearRect` a inizio
fotogramma va bene. MDN sconsiglia `shadowBlur` nell'ottimizzazione: si usano gradienti radiali (meglio
uno sprite del bagliore pre-renderizzato).

## 4. Le mosse dalla forma delle dita (`src/mosse.ts`)
Il classificatore di gesti è addestrato soprattutto su palmi. Per dito lungo: rapporto
`|punta−polso| / |nocca−polso|`. Misurato su foto reali: **disteso 1,78–2,29, piegato 0,62–0,84**
(soglie 1,55 / 1,35, nel vuoto fra i due). Pugno 0,79–0,84, vittoria 1,78/1,93 + 0,68/0,77, pollice su
0,73–0,81 (=sasso), indice in su 1,80 + 0,62–0,70 (=nessuna mossa), mani aperte 2,05–2,29 (**una delle
due vista dal dorso: carta in entrambi i modi**). Non provati su foto reali: sasso e forbici di dorso.

## 5. Voce (`speechSynthesis`)
Disponibilità non garantita (Chromium senza testa: nessuna voce → il gioco funziona uguale). Si
preferisce `voice.localService`; alcune voci dei browser sono «di rete» e mandano il testo a un server.
Qui il testo è solo frasi fisse del gioco; la pagina lo dice all'utente. Parte solo dopo un clic.

## Domande aperte
- Costo del volto sul portatile vero: qui 72 ms su CPU (VPS) contro 66 corpo e 117 mani; da misurare.
- Sasso e forbici di dorso su mani reali.
- Se le voci «di rete» valgano la pena di essere escluse del tutto (oggi si usano se non c'è altro).
