# Research and skills index

Append-only. Before starting a new online search, check whether a recent note already covers
the topic (rules R2/R4 in `CLAUDE.md`).

## Research notes

| Date | Note | Topic | Task |
|---|---|---|---|
| 2026-10-04 | [scheletro-testa-e-luce](2026-10-04-scheletro-testa-e-luce.md) | perché la testa era «bassa» (z del viso ×4), cura col modello del volto; RoomEnvironment/bump/transparent in three 0.186; soglie delle dita per sasso-carta-forbici; voce del browser | scheletro, sfida |
| 2026-09-29 | [mediapipe-volto-web](2026-09-29-mediapipe-volto-web.md) | FaceLandmarker 478 punti + 52 blendshape + posa della testa; l'IDENTITÀ non esiste ed è dichiarata fuori scopo nelle model card; modello fissato con sha256, limiti e bias documentati | pagina sul volto |
| 2026-09-23 | [un-file-solo-senza-installare-niente](2026-09-23-un-file-solo-senza-installare-niente.md) | `file://` è contesto sicuro e la webcam funziona; la libreria si carica da CDN ma NON da un file accanto alla pagina (CORS, origine null) → o CDN o server, niente via di mezzo | corso semplificato /corso-facile/ |
| 2026-09-22 | [mediapipe-python-per-il-corso](2026-09-22-mediapipe-python-per-il-corso.md) | MediaPipe Python 1.0.1: `mp.solutions` rimosso, API Tasks + drawing_utils, RunningMode.VIDEO, wheel e piattaforme (niente Mac Intel), 503 MB, prestazioni CPU misurate, niente Pyodide/Colab webcam | valutare il corso in Python invece che in TypeScript |
| 2026-09-20 | [due-modelli-mediapipe-stesso-fotogramma](2026-09-20-due-modelli-mediapipe-stesso-fotogramma.md) | due task vision (Pose + Hand) sullo stesso fotogramma: WebGL, fileset, timestamp, costi, HolisticLandmarker, modello hand_landmarker con sha256 | mani vere (21 punti) nella pagina /corpo/ |
| 2026-09-19 | [ambienti-online-typescript-senza-login](2026-09-19-ambienti-online-typescript-senza-login.md) | playground TS usabili senza account (verificati in Chromium headless), limite webcam negli iframe | pagina /corso/ |
| 2026-09-18 | [mediapipe-pose-landmarker-web](2026-09-18-mediapipe-pose-landmarker-web.md) | PoseLandmarker web: API, 33 punti, visibility, modelli lite/full/heavy con checksum | pagina /corpo/ con scheletro 3D |
| 2026-09-17 | [mediapipe-web-deploy-findings](2026-09-17-mediapipe-web-deploy-findings.md) | telemetria MediaPipe, CSP, handedness, GPU headless, versioni Vite/Three | prima versione app + deploy |
| 2026-09-17 | [mediapipe-gesture-recognizer-web](2026-09-17-mediapipe-gesture-recognizer-web.md) | MediaPipe Tasks Vision 1.0.1: API gesti/landmark, modelli, Model Maker, skill esterne valutate | setup ambiente agentico |

## Installed skills

| Date | Skill | Source | Why |
|---|---|---|---|
| 2026-09-17 | `skill-scout` | local | R1: find/evaluate/install a skill before acting |
| 2026-09-17 | `web-research` | local | R2: official docs before technical tasks |
| 2026-09-17 | `verify-work` | local | R5: verify empirically before saying "done" |
| 2026-09-17 | `retro` | local | R6: turn recurring work into skills |
| 2026-09-17 | `kit-doctor` | local | diagnose and repair portability |
| 2026-09-17 | `agent-kit` | JoeBosi/agent-kit (v3.0.3) | scaffold/upgrade of this kit |
| 2026-09-17 | `find-skills` | vercel-labs/skills | search engine for R1 |
| 2026-09-17 | `mediapipe-hand-gestures` | local | no public skill for MediaPipe hands on web (see research note) |
| 2026-09-17 | `webcam-capture` | local | getUserMedia + project privacy rules |
| 2026-09-17 | `project-memory` | local | portable memory in `.claude/memory/` |
| 2026-09-17 | `threejs-fundamentals`, `threejs-geometry`, `threejs-materials`, `threejs-lighting` | cloudai-x/threejs-skills (3.3k stelle, solo documentazione) | scena 3D della mano stilizzata |
| 2026-09-18 | (nessuna nuova) | R1: cercate skill per MediaPipe pose — le candidate (kinemotion/mediapipe-pose-detection, liuchiawei/mediapipe-usage) non riguardano l'uso nel browser | pagina /corpo/ |
| 2026-09-19 | (nessuna nuova) | R1: cercata una skill per la progettazione di corsi — la candidata migliore (travisjneuman@course-material-creator) non pubblica il SKILL.md, quindi non installata (R7: non si installa ciò che non si può leggere) | pagina /corso/ |
- [2026-10-11 ml5 handPose + p5.js per la scuola](2026-10-11-ml5-handpose-p5-scuola.md) — versioni, API minima, prova con webcam finta
- [2026-10-29 Sito bilingue](2026-10-29-sito-bilingue.md) — mkdocs-static-i18n, hreflang, pagine /en/
- [2026-10-30 ml5: una mano sola e le ossa](2026-10-30-ml5-una-mano-e-ossa.md) — maxHands: 1, getConnections(), prova nell'editor p5.js vero
