# MediaPipe in Python — note di ricerca per il corso

**Data:** 2026-09-22
**Perché:** valutare se riscrivere il corso di 10 lezioni in Python (webcam + OpenCV) invece che in
TypeScript nel browser, per studenti quasi principianti, con la mano solo in 2D.
**Fonti:**
- <https://pypi.org/pypi/mediapipe/json> (metadati PyPI, letti il 22/09/2026)
- <https://developers.google.com/edge/mediapipe/solutions/setup_python>
- <https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/python>
- <https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/index>
- <https://developers.google.com/edge/mediapipe/solutions/guide> (stato delle Legacy Solutions)
- <https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision> (reference `mp.tasks.vision`)
- <https://github.com/google-ai-edge/mediapipe-samples/blob/main/examples/hand_landmarker/python/hand_landmarker.ipynb>
- <https://github.com/google-ai-edge/mediapipe-samples/blob/main/examples/hand_landmarker/raspberry_pi/detect.py>
- <https://github.com/google-ai-edge/mediapipe/issues/6204> (rimozione di `mp.solutions`)
- <https://pyodide.org/en/stable/usage/packages-in-pyodide.html> (pacchetti Pyodide 314.0.7)
- <https://github.com/googlecolab/colabtools/issues/240> (webcam in Colab via `eval_js`)
- Verifica diretta: venv con `mediapipe==1.0.1` su questo VPS (Linux x86_64, Python 3.12.3, no GPU)

## Versioni verificate

`mediapipe` = **1.0.1** (PyPI, 2026-08-14), stesso numero di versione del pacchetto npm
`@mediapipe/tasks-vision` già usato dal progetto (vedi regola P2).

## 1. Pacchetto, Python, sistemi operativi

- Versione attuale **1.0.1** (14/08/2026). Precedenti: 1.0.0 (27/07/2026), 0.10.35, 0.10.33,
  0.10.32, 0.10.31, 0.10.30 (16/12/2025). Le **0.10.22–0.10.29 non sono mai uscite su PyPI**:
  buco di 10 mesi tra 0.10.21 (feb 2025) e 0.10.30 (dic 2025).
- **Python dichiarato:** i classifier PyPI dicono 3.9–3.12; la guida di setup dice *"Supports
  version 3.9 and later versions"*. Le due fonti non coincidono, e `requires_python` è vuoto:
  pip non blocca nulla. 3.13 e 3.14 funzionano nei test, ma non sono dichiarati.
- **Wheel della 1.0.1 — 5 in tutto, tutte `py3-none-*`:**

| Piattaforma | Tag | Peso |
|---|---|---|
| macOS Apple Silicon | `macosx_11_0_arm64` | 33,7 MB |
| Linux arm64 | `manylinux_2_28_aarch64` | 35,8 MB |
| Linux x86_64 | `manylinux_2_28_x86_64` | 37,9 MB |
| Windows x64 | `win_amd64` | 20,1 MB |
| Windows arm64 | `win_arm64` | 17,7 MB |

- **Buchi che contano in aula:** nessuna wheel **macOS Intel (x86_64)** — l'ultima è della 0.10.21
  (feb 2025). Nessuna musl (Alpine), nessuna 32 bit. `manylinux_2_28` richiede **glibc ≥ 2.28**
  (Ubuntu 20.04+, Debian 10+). Su PyPI non c'è sdist: su un MacBook Intel `pip install mediapipe`
  fallisce e l'unica strada sarebbe una build Bazel dal repo, non documentata come supportata.

## 2. API: Tasks sì, `mp.solutions` non esiste più

L'API da usare è **`mediapipe.tasks.python.vision.HandLandmarker`**.

La documentazione ufficiale dice solo, nella Solutions guide:
> *"We have ended support for the MediaPipe Legacy Solutions listed below as of March 1, 2023."*

**La documentazione non dice da nessuna parte che `mp.solutions` è stato rimosso dal pacchetto.**
Eppure lo è. Verificato qui con mediapipe 1.0.1:

```
>>> import mediapipe as mp; mp.solutions.hands.Hands()
AttributeError: module 'mediapipe' has no attribute 'solutions'
>>> [a for a in dir(mp) if not a.startswith('_')]
['Image', 'ImageFormat', 'tasks']
```

Anche `mediapipe.framework` è sparito. L'unica traccia pubblica è l'issue #6204 (04/01/2026),
rimasta senza risposta ufficiale.

**Conseguenza per il corso:** praticamente tutto il materiale didattico Python in circolazione
(`mp.solutions.hands` + `mp.solutions.drawing_utils`, il famoso esempio da 12 righe) non funziona
più. Gli studenti che cercano aiuto online o a un chatbot riceveranno codice che non parte.

## 3. Il disegno delle ossa c'è anche in Python — e c'è anche nel browser

Errore da non ripetere: si era concluso troppo in fretta che, morto `mp.solutions.drawing_utils`,
in Python le ossa andassero disegnate a mano. **Falso.** Verificato:

```
mp.tasks.vision.drawing_utils            C'E'
mp.tasks.vision.drawing_styles           C'E'
mp.tasks.vision.HandLandmarksConnections C'E'   (21 coppie)
```

`drawing_utils.draw_landmarks(...)` prende **direttamente** la lista di landmark del risultato
Tasks, senza conversione a protobuf.

La simmetria è esatta: **anche il browser ha il suo helper**, `DrawingUtils` da
`@mediapipe/tasks-vision` — è quello che il progetto usa in `app/src/main.ts:60,173`
(`drawing.drawConnectors` / `drawing.drawLandmarks`). Nessuna delle due strade richiede di
disegnare le ossa a mano: su questo punto sono pari.

## 4. Esempio minimo webcam + 21 punti

**Non esiste un esempio ufficiale minimo per la webcam.**

- Il notebook ufficiale `hand_landmarker.ipynb` lavora su **immagine statica**, non webcam.
- L'unico esempio ufficiale con camera, `examples/hand_landmarker/raspberry_pi/detect.py`
  (copyright 2023), è **152 righe** e **usa ancora `mp.solutions` e `landmark_pb2`: con
  mediapipe 1.0.1 si schianta all'import** (`No module named 'mediapipe.framework'`).

**Versione minima scritta e ESEGUITA qui: 30 righe non vuote.** Provata sul filmato di prova del
progetto (`app/tests/e2e/.cache/hands.mjpeg`) al posto della camera: **300 mani rilevate**, ossa
colorate disegnate correttamente, uscita pulita senza traceback.

```python
import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (HandLandmarker, HandLandmarkerOptions,
    RunningMode, HandLandmarksConnections, drawing_utils, drawing_styles)

opzioni = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path="hand_landmarker.task"),
    running_mode=RunningMode.VIDEO, num_hands=2)
camera = cv2.VideoCapture(0)
tempo = 0
with HandLandmarker.create_from_options(opzioni) as rilevatore:
    while True:
        ok, fotogramma = camera.read()
        if not ok:
            break
        fotogramma = cv2.flip(fotogramma, 1)
        immagine = mp.Image(image_format=mp.ImageFormat.SRGB,
                            data=cv2.cvtColor(fotogramma, cv2.COLOR_BGR2RGB))
        tempo = tempo + 33
        risultato = rilevatore.detect_for_video(immagine, tempo)
        for mano in risultato.hand_landmarks:
            drawing_utils.draw_landmarks(fotogramma, mano,
                HandLandmarksConnections.HAND_CONNECTIONS,
                drawing_styles.get_default_hand_landmarks_style(),
                drawing_styles.get_default_hand_connections_style())
        cv2.imshow("Mano", fotogramma)
        if cv2.waitKey(1) == 27:
            break
camera.release()
cv2.destroyAllWindows()
```

Il `tempo = tempo + 33` è voluto: `camera.get(cv2.CAP_PROP_POS_MSEC)` è verificato solo su file
video, su una webcam vera OpenCV spesso restituisce 0 e `detect_for_video` pretende timestamp
strettamente crescenti. Un contatore è più prevedibile e più facile da spiegare.

### L'equivalente nel browser: 31 righe di TypeScript + 9 di HTML

Scritto e **eseguito** anche quello (Chromium headless con webcam finta, `hands.mjpeg`): mano
rilevata, nessun errore in pagina. Stesso comportamento, stesso ordine di grandezza:

| | Python | Browser |
|---|---|---|
| righe non vuote | **30** | **31** + 9 di HTML |
| helper per le ossa | `drawing_utils.draw_landmarks` | `DrawingUtils.drawConnectors` |
| finestra a video | `cv2.imshow`, 1 riga | serve un po' di CSS o la pagina esce storta |
| per partire | `pip install` (sotto) | niente, nelle prime lezioni |

**Il codice non è più corto in Python.** Il lavoro lo fa MediaPipe in entrambi i casi.

## 5. Running mode: `VIDEO` basta, la callback non serve

Citazioni dalla guida Python:
- VIDEO: *"The mode for decoded frames of a video."*
- LIVE_STREAM: *"…resultListener must be called to set up a listener to receive results
  asynchronously."*
- *"If you use the video mode or live stream mode, Hand Landmarker uses tracking to avoid
  triggering palm detection model on every frame, which helps reduce latency."*

Il vantaggio del tracking c'è **anche in VIDEO**, e la doc non prescrive LIVE_STREAM per la webcam.
**Per il corso: `RunningMode.VIDEO` in un `while` sincrono** — niente callback, niente variabili
globali, il risultato è il valore di ritorno della riga precedente. È il vero vantaggio didattico
di Python rispetto a `requestAnimationFrame` + `async`.

## 6. Dipendenze e peso (misurati, non stimati)

`requires_dist` della 1.0.1: `absl-py~=2.3`, `certifi`, `numpy`, `sounddevice~=0.5`,
`flatbuffers~=25.9`, `opencv-contrib-python`, `matplotlib`. Niente protobuf, niente jax.

Installazione reale su questo VPS (venv Python 3.12, Linux x86_64):

| comando | tempo | disco | pacchetti |
|---|---|---|---|
| `pip install mediapipe` | ~38 s | **503 MB** | 19 |
| `pip install mediapipe opencv-python-headless` | 38,5 s | **586 MB** | 21 |

Download: **~160 MB** di wheel (la sola `opencv_contrib_python` è 82,1 MB). Dentro i 503 MB:
OpenCV 207 MB, `mediapipe` 114 MB, numpy 70 MB, matplotlib 34 MB, fontTools 29 MB.

In aula: **~500 MB per studente**. Su 25 portatili con il wifi della scuola sono ~12 GB.

## 7. Prestazioni senza GPU

L'unico benchmark ufficiale è `HandLandmarker (full)`: **CPU 17,12 ms / GPU 12,27 ms su Pixel 6**.
**Non esiste alcun numero ufficiale per Python su desktop o portatile.**

Misura nostra (VPS senza GPU, AMD EPYC ~2,0 GHz, XNNPACK CPU, 640×480, modello float16,
`RunningMode.VIDEO`, mediana su 150-200 fotogrammi):

| | ms/fotogramma | fps |
|---|---|---|
| `num_hands=1` | 24,0 ms | ~42 |
| `num_hands=2` | 49,6 ms | ~20 |

Il costo **raddoppia con due mani**. Va rimisurato sulle macchine d'aula vere.

## 8. Python nel browser senza installare niente: no

- **Pyodide: MediaPipe non c'è.** L'elenco ufficiale (Pyodide 314.0.7) non lo contiene. Le wheel
  sono binarie per piattaforma, non esiste una `py3-none-any` pura: `micropip.install("mediapipe")`
  non può funzionare. Paradosso: la versione **JavaScript** di MediaPipe *è* già WASM nel browser,
  quindi in Pyodide finiresti per chiamare il pacchetto JS, perdendo il senso di insegnare Python.
- **Colab: webcam solo a fotogrammi singoli.** Il Python gira sulla VM di Google, che non ha
  webcam; l'unico ponte è `google.colab.output.eval_js` + `getUserMedia`, snippet dentro l'UI di
  Colab e non documentato ufficialmente. Una foto alla volta, andata e ritorno browser↔VM: niente
  tempo reale.
- **JupyterLite** gira su Pyodide: stesso limite.

**Quindi: in Python non esiste la lezione 1 "apri il browser e scrivi", e non esiste il link da
mandare agli amici.** Sono esattamente i due punti su cui è costruito il corso attuale.

## Trappole per un corso con principianti

1. **Ogni esempio online con `mp.solutions.hands` è rotto.** Da dire alla lezione 1.
2. **L'esempio webcam ufficiale di Google è rotto**: non c'è niente di ufficiale da far copiare.
3. **Senza `with` (o `.close()`) compare un traceback all'uscita**, verificato:
   `TypeError: 'NoneType' object is not callable` in `mediapipe_c_utils.py`. Con
   `with HandLandmarker.create_from_options(...) as rilevatore:` sparisce. Per un principiante un
   traceback rosso a fine programma è devastante: `with` fin dal primo esempio.
4. **Warning spaventosi a ogni avvio** anche quando funziona tutto (`XNNPACK delegate`,
   `Logging before InitGoogle()`, `inference_feedback_manager.cc:121`,
   `landmark_projection_calculator.cc:81`). Vanno spiegati come normali.
5. **BGR → RGB**: se si dimentica `cv2.cvtColor` non c'è errore, il rilevamento peggiora e basta.
   Errore silenzioso classico.
6. **Timestamp strettamente crescenti** obbligatori in VIDEO e LIVE_STREAM.
7. **Il modello `.task` si scarica a parte**: `hand_landmarker.task`, 7.819.105 byte, lo stesso già
   presente in `app/public/mediapipe/`. Serve rete o una copia locale in aula.
8. **Fissare la versione** (regola P2): `mediapipe==1.0.1`, mai `pip install mediapipe` nudo.

## Decisioni

- **Se** si va in Python: API Tasks, `RunningMode.VIDEO` sincrono, `with`,
  `mp.tasks.vision.drawing_utils`, versione fissata a `mediapipe==1.0.1`, esempi scritti a mano
  (quelli ufficiali per webcam non funzionano).
- **Raccomandazione: non riscrivere il corso in Python.** Il guadagno vero è il `while` sincrono al
  posto di `async` + `requestAnimationFrame` e l'assenza di HTML/CSS/DOM; il codice però non si
  accorcia (30 righe contro 31+9) e il costo si sposta sull'ambiente: 500 MB per studente, nessun
  Mac Intel supportato, nessuna opzione "senza installare niente", nessun link condivisibile e il
  corso non porta più al sito pubblicato. Il taglio utile dell'idea — **solo 2D e codice corto** —
  si può applicare tale e quale restando in TypeScript.

## Domande aperte

- Limite superiore di Python supportato: nessuna fonte ufficiale chiarisce.
- Esiste un percorso supportato per **macOS Intel**? Non documentato, non provato.
- Comportamento di `CAP_PROP_POS_MSEC` su una webcam fisica: non verificabile sul VPS.
- I numeri di prestazione valgono per un vCPU server, non per un portatile scolastico.
- Nessuna dichiarazione ufficiale sulla rimozione di `mp.solutions`: se Google pubblicasse una nota
  di migrazione o la reintroducesse, il quadro cambierebbe.
