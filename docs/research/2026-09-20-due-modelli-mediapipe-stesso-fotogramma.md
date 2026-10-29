# Due task MediaPipe sullo stesso fotogramma (posa + mani) — note di ricerca

**Data:** 2026-09-20
**Perché:** la pagina `/corpo/` usa `PoseLandmarker` (33 punti), che per ogni mano dà solo 4 punti.
Si vuole aggiungere le mani vere (21 punti per mano) facendo girare un secondo modello sullo stesso
fotogramma, restando su `@mediapipe/tasks-vision` **1.0.1** già fissata nel progetto.

**Fonti** (tutte consultate il 20/09/2026):
- Guida ufficiale Hand Landmarker (web): <https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js>
- Panoramica Hand Landmarker (modelli + benchmark): <https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker>
- Panoramica Pose Landmarker (33 punti + modelli): <https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker>
- Panoramica Gesture Recognizer (modelli + benchmark): <https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer>
- Panoramica e guida web Holistic Landmarker: <https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker> e <https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker/web_js>
- Sorgenti ufficiali: [`task_runner.ts`](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/core/task_runner.ts),
  [`vision_task_runner.ts`](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/core/vision_task_runner.ts),
  [`graph_runner.ts`](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/web/graph_runner/graph_runner.ts),
  [`run_script_helper.ts.template`](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/web/graph_runner/run_script_helper.ts.template),
  [`fileset_resolver.ts.template`](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/core/fileset_resolver.ts.template)
- Esempi ufficiali web: <https://github.com/google-ai-edge/mediapipe-samples-web> (in particolare `src/workers/base-worker.ts`)
- Issue: [#5826](https://github.com/google-ai-edge/mediapipe/issues/5826) (WebGPU, risposta di un manutentore Google),
  [#5171](https://github.com/google-ai-edge/mediapipe/issues/5171) (Pose + Gesture caricati insieme),
  [#5442](https://github.com/google-ai-edge/mediapipe/issues/5442) (conflitto WebGL con OpenCV.js),
  [#6352](https://github.com/google-ai-edge/mediapipe/issues/6352) e [#6296](https://github.com/google-ai-edge/mediapipe/issues/6296) (memoria/GPU, solo ImageSegmenter)
- Documentazione legacy (ufficiale, marcata "MediaPipe Legacy Solutions"):
  [`docs/solutions/holistic.md`](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/holistic.md),
  [`docs/solutions/pose.md`](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose.md)
- Tipi della 1.0.1 installata: `app/node_modules/@mediapipe/tasks-vision/vision.d.ts`

---

## 1. Due task vision insieme, entrambi `delegate: "GPU"`

**Non esiste una pagina ufficiale che dica sì o no.** Nessuna delle guide web (Pose, Hand, Gesture,
Holistic) parla di eseguire due task nella stessa pagina, e non ho trovato nessuna issue, aperta o
chiusa, che dichiari che due landmarker insieme si rompono (cercate su GitHub: `PoseLandmarker`+
`HandLandmarker`, "multiple tasks"+GPU, "too many active WebGL contexts", `FilesetResolver`+multiple).
Quello che segue viene quindi dai **sorgenti**, non dalla prosa della documentazione.

- **Ogni task è un'istanza a sé.** `createMediaPipeLib()` esegue lo script loader del wasm e chiama
  `self.ModuleFactory(...)`: ogni `createFromOptions()` produce un **modulo WebAssembly nuovo**, con
  il proprio heap (`graph_runner.ts:1173-1215`).
- **Ogni task si crea il proprio contesto WebGL.** `VisionTaskRunner.createVisionInstance()` fa
  `const canvas = options.canvas ?? createCanvas();` e `createCanvas()` restituisce `undefined`
  quando `OffscreenCanvas` è supportato (`vision_task_runner.ts`). I tipi della 1.0.1 lo dicono:
  *"The canvas element to bind textures to. This has to be set for GPU processing. The task will
  initialize a WebGL context and throw an error if this fails (e.g. if you have already initialized
  a different type of context)"* (`vision.d.ts:2851-2856`). Conferma di un manutentore Google:
  *"Our Vision tasks do use WebGL at the moment"* (issue #5826, schmidt-sebastian, 16/01/2025).
- **Quindi due task = due contesti WebGL + due istanze wasm.** Due contesti sono molto sotto il
  limite di qualunque browser, ma il limite esiste: il codice di esempio ufficiale diagnostica
  proprio *"Maximum active WebGL contexts limit exceeded for this domain. Please close other tabs or
  refresh."* e prevede un **fallback automatico da GPU a CPU** quando la creazione del task fallisce
  (`mediapipe-samples-web/src/workers/base-worker.ts`). Il numero esatto di contesti per pagina non è
  documentato da MediaPipe.
- **Non condividere la stessa canvas fra i due task.** Non è documentato cosa succede passando la
  stessa `canvas` a due task; i tipi avvisano solo dell'errore se il contesto è già di un altro tipo.
  Lasciare che ogni task si crei il suo è la strada che i sorgenti prevedono.
- **Ordine/parallelismo di creazione: rischio verificato nei sorgenti.** `runScript()` inserisce un
  tag `<script>` che scrive la **globale** `self.ModuleFactory`, e `createMediaPipeLib()` la consuma
  e poi la azzera (`self.ModuleFactory = self.Module = undefined;`). Non c'è nessun lock. Due
  `createFromOptions()` lanciati in parallelo (`Promise.all`) si contendono quella globale; il caso
  di fallimento è l'errore `ModuleFactory not set.`. Non ho trovato una issue che lo riporti (in
  #5171 un utente usa `Promise.all` con Pose + Gesture e lamenta solo la lentezza del primo
  caricamento, 30+ s su WKWebView iOS), quindi è un rischio **teorico ma leggibile nel codice**:
  creare i due task uno dopo l'altro (`await`, `await`) costa nulla e lo elimina.
- **Conflitti noti con altri utenti di WebGL**: issue #5442, crash del browser caricando MediaPipe
  insieme a OpenCV.js; la risposta ufficiale è che la combinazione non è testata né supportata e il
  rimedio è separare i contesti in worker. Non è il nostro caso (non usiamo OpenCV), ma conferma che
  la contesa sul contesto grafico è reale.
- **Memoria**: nessun numero ufficiale. Il binario `vision_wasm_internal.wasm` (11,76 MB nella copia
  fissata nel progetto) si scarica una volta sola (cache HTTP) ma viene **istanziato due volte**.
  Quanto costa in RAM non è documentato da nessuna parte e non l'ho misurato.
- Le due issue aperte su memoria/GPU nel web ([#6352](https://github.com/google-ai-edge/mediapipe/issues/6352),
  tabelle di handle GL che crescono senza limite; [#6296](https://github.com/google-ai-edge/mediapipe/issues/6296))
  riguardano **ImageSegmenter con le maschere**, non i landmarker: non si applicano a noi, che non
  chiediamo maschere di segmentazione.

## 2. `FilesetResolver.forVisionTasks()`: una volta sola

**Una volta sola, e si riusa.** È anche indifferente dal punto di vista del costo: il sorgente mostra
che `forVisionTasks()` non carica niente — fa un controllo SIMD (memorizzato in una variabile di
modulo dopo la prima chiamata) e restituisce un oggetto di soli percorsi:

```ts
return {
  wasmLoaderPath: `${basePath}/${taskName}_${suffix}.js`,
  wasmBinaryPath: `${basePath}/${taskName}_${suffix}.wasm`,
};
```
(`fileset_resolver.ts.template`)

Conseguenza importante: **passare lo stesso fileset ai due task non li fa condividere niente** — non
è un runtime condiviso, sono solo due stringhe. Tutti gli esempi ufficiali lo chiamano una volta per
task perché ogni demo carica un task solo; con due task nella stessa pagina la pratica sensata (e
quella dei nostri file) è chiamarlo una volta e riusare il risultato.

## 3. Timestamp in `runningMode: "VIDEO"`

**Ogni task ha la propria sequenza: i due possono ricevere lo stesso valore.** In `task_runner.ts` il
contatore è un campo **privato di istanza**:

```ts
private latestOutputTimestamp = 0;
// "Timestamps that are smaller than the currently latest output timestamp are ignored"
protected setLatestOutputTimestamp(timestamp: number): void {
  this.latestOutputTimestamp = Math.max(this.latestOutputTimestamp, timestamp);
}
```

Ogni task ha il suo grafo e il suo contatore, quindi non c'è nessuna sequenza globale da rispettare:
si può passare **lo stesso `timestamp` a `detectForVideo()` della posa e a quello della mano**, purché
per ciascun task la sequenza non torni indietro. Questo **non è scritto nella documentazione**: è
dedotto dal sorgente (campo privato per istanza). Attenzione al rovescio della medaglia: essendo
privato, i timestamp inferiori all'ultimo vengono *ignorati in silenzio*, senza errore.

Il ciclo consigliato dalle guide è quello che il progetto già usa: saltare il fotogramma se
`video.currentTime` non è cambiato (guida web Hand Landmarker, sezione "Run the task").

## 4. Quanto costa il secondo modello

Numeri ufficiali (sezione "Task benchmarks" delle panoramiche, **media su Pixel 6, pipeline intera**):

| Modello | CPU | GPU |
|---|---|---|
| HandLandmarker (full) | 17,12 ms | 12,27 ms |
| GestureRecognizer | 16,76 ms | 20,87 ms |
| Pose Landmarker (lite/full/heavy) | **nessun numero pubblicato** | **nessun numero pubblicato** |

Due avvertenze da non nascondere:
1. La pagina del Pose Landmarker **non ha affatto la sezione "Task benchmarks"** (verificato sul
   testo della pagina scaricata il 20/09/2026): per la posa non esiste un numero ufficiale con cui
   fare la somma.
2. Quei numeri sono **Pixel 6 nativo**, non browser: **non esiste nessun benchmark ufficiale
   web/WASM** per questi task. Qualsiasi stima del costo nella nostra pagina va misurata, non dedotta.

Quello che la documentazione dice invece in modo esplicito e utile:
- In VIDEO mode il rilevatore di palmo **non gira a ogni fotogramma**: Hand Landmarker riusa il
  riquadro del fotogramma precedente e richiama il palm detector solo quando perde la mano. Il costo
  ricorrente è quindi quello del solo modello dei landmark, non dell'intera pipeline
  (panoramica Hand Landmarker, sezione "Models"). Stessa cosa per la posa.
- *"Calls to the Hand Landmarker `detect()` and `detectForVideo()` methods run **synchronously and
  block the user interface thread**. […] You can prevent this by implementing web workers"* (guida
  web). Con due task, per fotogramma si bloccano **due volte** il thread principale, in sequenza.
  L'architettura degli esempi ufficiali è infatti **un worker per task**
  (`mediapipe-samples-web/src/workers/*.worker.ts`).

## 5. Le dita dal solo PoseLandmarker: **no, confermato**

L'elenco ufficiale dei 33 punti (panoramica Pose Landmarker) per ciascuna mano contiene solo:

```
15 - left wrist    16 - right wrist
17 - left pinky    18 - right pinky
19 - left index    20 - right index
21 - left thumb    22 - right thumb
```

Quattro punti per mano (polso, mignolo, indice, pollice), nessuna falange, nessun anulare/medio. Non
esiste nessuna opzione del task per ottenere di più: per i 21 punti servono `HandLandmarker`,
`GestureRecognizer` o `HolisticLandmarker`.

## 6. `HandLandmarker` vs `GestureRecognizer`

| | HandLandmarker | GestureRecognizer |
|---|---|---|
| File `.task` | **7.819.105 byte** | 8.373.440 byte (= quello già nel progetto) |
| Contenuto | palm detector + hand landmarks | gli stessi **più** gesture embedder + classificatore |
| Benchmark Pixel 6 | 17,12 ms CPU / 12,27 ms GPU | 16,76 ms CPU / 20,87 ms GPU |
| In più | — | 7 gesti predefiniti, Model Maker |

- Il bundle dei gesti pesa **554.335 byte in più** e aggiunge una seconda rete (embedding +
  classificatore) che gira a ogni fotogramma in cui c'è una mano.
- La documentazione ufficiale è esplicita: *"Note: If your app only requires hand landmark detection,
  use the Hand landmarker task"* (panoramica Gesture Recognizer).
- Entrambi danno `landmarks` (21 normalizzati), `worldLandmarks` e `handedness`.
- **Modello consigliato**, versione fissata (non `latest`):
  `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
  - dimensione: **7.819.105 byte**, `last-modified: 2023-04-26`
  - `sha256 = fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` (calcolato in locale
    sul file scaricato il 20/09/2026, come si è fatto per `pose_landmarker_lite`)
  - Google **non pubblica uno sha256**: negli header espone `md5=FTGEMOo4UWcP6ZFBFqnPrQ==` e
    `crc32c=jJyZRw==`. Le cartelle `1/` e `latest/` contengono oggi lo **stesso identico file**
    (stesso sha256): si punta a `1/` per la regola P2.

## 7. Allineare le mani ai polsi della posa

- **La base c'è ed è documentata**: entrambi i task restituiscono `NormalizedLandmark`, cioè
  *"x and y are normalized to [0.0, 1.0] by the image width and height respectively"*
  (`vision.d.ts:2419-2423`, e le due panoramiche dicono che l'output è in "normalized image
  coordinates"). Dando ai due task **lo stesso fotogramma** e nessuna `imageProcessingOptions`
  (niente rotazione, niente ROI), i punti della mano e quelli della posa vivono nello **stesso
  sistema di coordinate dell'immagine**: si confrontano direttamente, senza trasformazioni.
- **La z invece non è confrontabile.** Per la posa la documentazione legacy dice che l'origine è il
  punto medio delle anche (`docs/solutions/pose.md`); per la mano la documentazione Tasks dice solo
  "più piccolo = più vicino alla camera, scala simile a quella della x", **senza definire l'origine**.
  Mescolare le due z non è supportato da nessuna fonte: non farlo.
- **Non esiste nessuna API o utilità ufficiale che "attacchi" i landmark della mano al polso della
  posa.** Non l'ho trovata in nessuna guida né nei tipi della 1.0.1.
- Quello che **è** ufficiale è il task `HolisticLandmarker`, che fa esattamente questo lavoro dentro
  di sé: *"using the inferred pose landmarks we derive three regions of interest (ROI) crops for each
  hand (2x) and the face […] Finally, we merge all landmarks with those of the pose model"*, e la
  coerenza semantica *"preventing a mixup between left and right hands"* (`docs/solutions/holistic.md`,
  pagina legacy ma è la sola descrizione ufficiale della pipeline).
  - Presente nella **1.0.1 installata** (`vision.d.ts:1053`), risultato con `poseLandmarks`,
    `leftHandLandmarks`, `rightHandLandmarks`, `faceLandmarks` (478) già separate per lato.
  - Costi: modello unico da **13.683.609 byte** (`…/holistic_landmarker/float16/1/holistic_landmarker.task`,
    anche qui `1/` e `latest/` sono lo stesso file), **una sola persona** (nessun `numPoses`/`numHands`)
    e **il viso si calcola sempre** — nelle opzioni non c'è modo di spegnerlo, si può solo evitare di
    disegnarlo. Nessun benchmark ufficiale pubblicato per questo task.

---

## Versioni verificate

- `@mediapipe/tasks-vision` = **1.0.1** (`app/package.json`), tipi e bundle letti in `node_modules`.
- Documentazione letta: guide web correnti su developer.google.com (piè di pagina: Hand Landmarker
  aggiornata 2026-08-17, Holistic 2026-09-07); sorgenti dal branch `master` di
  `google-ai-edge/mediapipe` al 20/09/2026.
- Modelli verificati con `curl -I` il 20/09/2026: hand_landmarker 7.819.105 B, gesture_recognizer
  8.373.440 B, pose_landmarker_lite 5.777.746 B, holistic_landmarker 13.683.609 B — tutti HTTP 200
  sia in `1/` sia in `latest/`.

## Decisioni proposte

1. **Secondo task `HandLandmarker`** (non `GestureRecognizer`): mezzo megabyte in meno e nessuna rete
   di classificazione da far girare, esattamente il caso in cui la documentazione dice di preferirlo.
   Modello fissato a `float16/1/`, sha256 sopra, come già si fa per la posa.
2. **Un solo `FilesetResolver.forVisionTasks()`** riusato per i due task, e **creazione sequenziale**
   (`await` uno, poi l'altro) per non toccare la globale `self.ModuleFactory` in parallelo.
3. **Un solo timestamp per fotogramma**, passato a entrambi i `detectForVideo()`.
4. **Allineamento** sui landmark normalizzati (x, y) dello stesso fotogramma; il polso della mano
   (punto 0) e il polso della posa (15/16) sono già nello stesso spazio. Nessun uso della z incrociata.
5. **Fallback GPU → CPU** sulla creazione del task, come fa l'esempio ufficiale: se il secondo
   contesto WebGL non nasce, si riprova in CPU invece di rompere la pagina.
6. `HolisticLandmarker` resta l'alternativa da tenere pronta **se** la coerenza sinistra/destra fra
   mani e braccia dovesse dare problemi: è la sola soluzione ufficialmente allineata, ma costa 13,7 MB,
   una sola persona e il viso sempre calcolato.

## Domande aperte (nessuna fonte trovata)

- Quanto costano davvero due task nel browser: **nessun benchmark web ufficiale**, e per il Pose
  Landmarker nemmeno uno nativo. Va misurato sulla nostra pagina.
- Quanta RAM aggiunge la seconda istanza WebAssembly: non documentato.
- Se due task possano condividere una `canvas` passata esplicitamente: non documentato.
- Se la creazione parallela dei task sia ufficialmente supportata: non documentato; nei sorgenti la
  globale `self.ModuleFactory` non è protetta.
