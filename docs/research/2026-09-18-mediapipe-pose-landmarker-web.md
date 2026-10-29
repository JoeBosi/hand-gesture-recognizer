# MediaPipe Pose Landmarker (web) — note di ricerca

**Data:** 2026-09-18
**Perché:** aggiungere al sito una seconda pagina che riconosce il corpo intero (testa, braccia,
gambe) e ne disegna lo scheletro stilizzato, riusando lo stesso impianto della pagina della mano.
**Fonti:**
- <https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js> (guida ufficiale JS)
- `node_modules/@mediapipe/tasks-vision/vision.d.ts` della versione **1.0.1** già installata
  (verifica diretta di API e costanti, più affidabile della documentazione)

## Cosa è stato verificato

### API (confermata nei tipi della 1.0.1 installata)

```ts
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
const landmarker = await PoseLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: "GPU" },
  runningMode: "VIDEO",
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  outputSegmentationMasks: false,
});
const result = landmarker.detectForVideo(video, timestampMs);
```

- Il metodo si chiama **`detectForVideo`** (la mano usa `recognizeForVideo`); vale la stessa regola
  dei timestamp strettamente crescenti.
- `PoseLandmarker.POSE_CONNECTIONS` esiste come proprietà statica (35 collegamenti, viso compreso):
  verificato in `vision.d.ts:2527`.
- Risultato: `landmarks` (33 punti normalizzati 0…1 sull'immagine) e `worldLandmarks` (33 punti in
  metri, origine al bacino). Ogni punto ha anche **`visibility`** e `presence`.
- Opzioni e valori predefiniti come da tabella ufficiale: `numPoses` 1, le tre confidenze 0,5,
  `outputSegmentationMasks` false.

### Modelli (versione "1", non "latest")

| Taglia | URL | Dimensione |
|---|---|---|
| lite | `…/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | 5.777.746 byte |
| full | `…/pose_landmarker_full/float16/1/pose_landmarker_full.task` | 9.398.198 byte |
| heavy | `…/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task` | 30.664.242 byte |

Prefisso comune: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/`.
Tutti e tre rispondono HTTP 200 al 18/09/2026 (verificato con `curl -I`).

**Scelto `lite`**, scaricato e fissato in `app/scripts/prepare-assets.mjs` con
`sha256 = 59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` (calcolato in locale
sul file scaricato). Motivo: è la taglia pensata per il tempo reale nel browser; `full` e `heavy`
danno una precisione che una figura stilizzata non sfrutta, in cambio di 2-5 volte il peso.

### I 33 punti

```
 0 naso · 1-3 occhio sx · 4-6 occhio dx · 7-8 orecchie · 9-10 bocca
11-12 spalle · 13-14 gomiti · 15-16 polsi · 17-22 mani (mignolo, indice, pollice)
23-24 anche · 25-26 ginocchia · 27-28 caviglie · 29-30 talloni · 31-32 punte dei piedi
```

Due regolarità utili, sfruttate nel codice:
- da 11 in poi, **indice dispari = lato sinistro, pari = lato destro** della persona;
- "left"/"right" sono anatomici (riferiti alla persona), **non** riferiti allo schermo. Siccome la
  scena specchia la x, il lato sinistro della persona compare a sinistra dello schermo: nessuna
  inversione da fare, al contrario di `handedness` nella pagina della mano.

## Conseguenze sul progetto

1. `visibility` è la novità che cambia il disegno: i punti non inquadrati (tipico: le gambe sotto
   la scrivania) vengono **indovinati** dal modello. Sotto 0,5 non si disegnano — vedi
   `MIN_VISIBILITY` in `app/src/body3d.ts`.
2. `POSE_CONNECTIONS` include il viso: in 3D diventa un grumo davanti alla faccia. Nello scheletro
   si usa un elenco di ossa scritto a mano (`BODY_BONES` in `app/src/pose.ts`) più una sfera per la
   testa; nell'anteprima 2D invece le connessioni complete vanno benissimo.
3. Il runtime WebAssembly è lo stesso della mano: chi visita entrambe le pagine lo scarica una
   volta sola. Cambia solo il file `.task`.
4. `worldLandmarks` (coordinate in metri) non serve a questa demo, che disegna la figura dov'è
   sullo schermo; sarebbe la scelta giusta per misurare angoli o altezze di salto.
