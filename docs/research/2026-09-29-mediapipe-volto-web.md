# MediaPipe e il volto, sul web — cosa si può e cosa non si può fare

**Data:** 2026-09-29
**Perché:** Giuseppe chiede una pagina che faccia "riconoscimento facciale" e come si potrebbe
ideare l'esperienza. Prima di progettare serve sapere che cosa la libreria fa davvero.
**Fonti:** guide ufficiali Web di [Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
e [Face Detector](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js),
[elenco dei task](https://developers.google.com/edge/mediapipe/solutions/tasks), le tre model card PDF
([BlazeFace](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf),
[FaceMesh-V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf),
[Blendshape V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf)),
e i [typings pubblicati di @mediapipe/tasks-vision@1.0.1](https://unpkg.com/@mediapipe/tasks-vision@1.0.1/vision.d.ts).

## La risposta che conta: l'identità NON c'è, ed è una scelta dichiarata

MediaPipe Tasks Vision **non permette di capire chi è la persona**. Non esiste un `FaceEmbedder`,
non esiste confronto fra volti, non esiste face matching. Non è una deduzione: è scritto nelle
model card ufficiali, sezione *Out-of-scope applications*.

> **BlazeFace:** «Any form of surveillance or identity recognition is explicitly out of scope and
> not enabled by this technology»

> **FaceMesh-V2 e Blendshape V2 (frase gemella):** «Predicted face landmarks do not provide facial
> recognition or identification and do not store any unique face representation.»

Quindi "riconoscimento facciale" può voler dire due cose molto diverse, e solo una è a portata:

| | Cosa fa | Con MediaPipe |
|---|---|---|
| **Volto come forma** | dov'è il viso, 478 punti, espressioni, dove guarda, posa della testa | **sì, subito** |
| **Volto come identità** | *chi* è questa persona, è la stessa di prima? | **no, per scelta di Google** |

Per l'identità servirebbe un modello di *face embedding* (ArcFace/MobileFaceNet in ONNX con
`onnxruntime-web`): gira anche lui nel browser, ma produce **un vettore biometrico univoco** — cioè
esattamente la cosa che le model card dichiarano di non produrre, e che la regola P1 del progetto
esiste per evitare. Non è un dettaglio implementativo: è una decisione da prendere esplicitamente.

## Cosa c'è davvero nel pacchetto 1.0.1

Verificato sui typings pubblicati, non sulla documentazione (che è fuorviante: le pagine di API
reference JS elencano ancora `FaceStylizer` e `FaceAligner`, che nel pacchetto JS **non esistono**).

| Classe | C'è? | Restituisce |
|---|---|---|
| `FaceLandmarker` | sì | 478 punti per volto, 52 blendshape, matrice 4×4 di trasformazione |
| `FaceDetector` | sì | riquadro + 6 punti chiave |
| `HolisticLandmarker` | sì | volto + posa + due mani in un solo task, ma **una sola persona** |
| `FaceStylizer`, `FaceAligner`, `FaceEmbedder` | **no** | — |

### I 478 punti
x/y normalizzati; **la z è relativa al centro del volto e scalata sulla sua larghezza**, quindi non
è una profondità in metri — stesso avvertimento già noto per mano e corpo. 478 = 468 del mesh + 10
dell'iride (cioè **si sa dove guardano gli occhi**).

Costanti pronte per disegnare: `FACE_LANDMARKS_TESSELATION`, `..._CONTOURS`, `..._FACE_OVAL`,
`..._LIPS`, `..._LEFT_EYE`, `..._RIGHT_EYE`, `..._LEFT_EYEBROW`, `..._RIGHT_EYEBROW`,
`..._LEFT_IRIS`, `..._RIGHT_IRIS`.

### I 52 blendshape — è qui che sta il divertimento
Valori da 0 a 1 che dicono **quanto** è attiva un'espressione. Sono i nomi in stile ARKit, letti dai
metadati del modello vero: `_neutral`, `browDownLeft/Right`, `browInnerUp`, `browOuterUpLeft/Right`,
`cheekPuff`, `cheekSquintLeft/Right`, `eyeBlinkLeft/Right`, `eyeLookDown/In/Out/Up…`,
`eyeSquintLeft/Right`, `eyeWideLeft/Right`, `jawForward/Left/Open/Right`, `mouthClose`,
`mouthDimple…`, `mouthFrown…`, `mouthFunnel`, `mouthPucker`, `mouthSmileLeft/Right`,
`mouthStretch…`, `noseSneerLeft/Right`.

Con questi si fa, senza altro codice: occhiolino, bocca aperta, sorriso, sopracciglia alzate,
guance gonfie, sguardo a destra/sinistra.

> Discrepanza verificata: la model card elenca `tongueOut` e non elenca `_neutral`; il modello che
> gira davvero ha `_neutral` in posizione 0 e **non** ha `tongueOut`. Da riconfermare a runtime.

### La matrice di trasformazione
Una 4×4 per volto: porta il volto "canonico" sopra quello inquadrato. Serve per la **posa della
testa** (dove è girata) e per incollarci sopra un oggetto 3D. Non è un'identità: dice dove sta la
testa, non di chi è.

## Il modello da usare

```
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```
- HTTP 200, **3.758.596 byte**, sha256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
  (calcolato in locale: Google pubblica solo md5/crc32c, come già per gli altri modelli)
- `/float16/1/` e `/float16/latest/` hanno **oggi lo stesso sha256** → fissare `/1/` non cambia nulla
  ed è quello che chiede la regola P2. `/float16/2/` non esiste (404).
- Dentro il bundle ci sono già tre modelli: rilevatore, mesh, blendshape. **Non serve aggiungere
  `FaceDetector`**: il suo modello è byte-identico a quello già contenuto qui (verificato).

Opzioni da ricordare: `outputFaceBlendshapes` e `outputFacialTransformationMatrixes` sono
**spenti di default**, vanno chiesti; `numFaces` è **1** di default.

Convivenza con gli altri task sullo stesso fotogramma: vale la ricetta già nostra
(`2026-09-20-due-modelli-mediapipe-stesso-fotogramma.md`) — un solo `FilesetResolver`, creazione in
sequenza, stesso timestamp. Resta non documentata da Google.

## Limiti documentati (utili per progettare l'esperienza)

- Non funziona su volti girati di più di ~80°, inclinati più di 8° dalla verticale, visibili per
  meno del 50%, o **più lontani di 2 metri**; il riquadro del volto deve essere almeno il 20% del
  lato dell'immagine.
- Bias per tono della pelle: **misurato e pubblicato**. BlazeFace: recall 98,1% complessiva, da
  94,7% a 100% fra i toni. FaceMesh-V2: scarto fra i toni 0,41%, sotto la soglia di equità che
  Google si è data (2,56%). Blendshape V2: campione sbilanciato (toni chiari 36%, tono 9 il 2,4%).
- **Occhiali, mascherine, barba, copricapo: NON documentati.** Nessuna delle tre model card li
  nomina. Non si può dire niente, né in bene né in male.
- Costo per fotogramma sul web: **nessun benchmark ufficiale**, né CPU né GPU. Va misurato, come
  è stato fatto per mano e corpo.
- **Nessun riferimento a GDPR o dati biometrici** in nessuna model card: Google non prende
  posizione sul piano normativo. Se il tema conta, non c'è una fonte su cui appoggiarsi.

## Conclusione per il progetto

La pagina "volto" si può fare oggi, con un modello solo da 3,76 MB, nessuna dipendenza nuova e la
stessa architettura delle altre pagine. Quello che **non** si può fare — riconoscere *chi* è
qualcuno — richiederebbe un'altra libreria e un vettore biometrico, ed è una scelta che va posta a
Giuseppe prima di scrivere una riga.
