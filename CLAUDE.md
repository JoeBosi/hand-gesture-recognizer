# Recognizer-Mano — Agent protocol

A **portable** agent setup: everything needed lives inside this folder. Copy it elsewhere,
run `./bootstrap.sh`, and the agent behaves the same.

Project context: [`PROJECT.md`](./PROJECT.md). Read it before working.
Come funziona il codice, con diagrammi: [`docs/COME-FUNZIONA.md`](./docs/COME-FUNZIONA.md).

## Standing rules (apply to every task, without the user restating them)

### R1 — Look for an existing skill first
1. Check the local skills in `.claude/skills/`.
2. If none covers the task, search online: `npx skills find <query>`, https://skills.sh,
   `anthropics/skills`, `vercel-labs/skills`, the vendor's own repo.
3. If a good one exists → install it **into this folder** and use it.
4. If nothing fits → do the work by hand; if the task recurs, see R6.

Spend one search round, not five. "Nothing suitable, doing it by hand" is a valid outcome —
say it in one line rather than silently skipping the step.
Full protocol: `.claude/skills/skill-scout/SKILL.md`.

### R2 — On technical tasks, read the docs online first
For code, config, APIs, libraries, CLIs, standards, security, deployment: read the current
official documentation **before** acting. Never work from memory — versions and APIs change.
Write the findings to `docs/research/YYYY-MM-DD-<slug>.md` and index them in `INDEX.md`.
Protocol: `.claude/skills/web-research/SKILL.md`.

### R3 — Portability
- Install skills project-scoped and copied: never `-g`, always `--copy`.
- No absolute paths in project files — only paths relative to the root.
- Every installed skill appears in `skills-lock.json` (restorable with `./bootstrap.sh`).
- No secrets in the repo: `.env` (ignored) plus `.env.example` as the record.

### R4 — Traceability
Installed skills → `skills-lock.json` and `docs/research/INDEX.md`. Research → `docs/research/`.
Non-trivial decisions → `docs/JOURNAL.md`. If it isn't written down, it didn't happen.

### R5 — Verify before saying "done"
No "should work". Run the code, execute the command, open the file, show the real output.
If verification was impossible, say so plainly and give the command the user can run.
Report failures with their output, unsoftened.
Protocol: `.claude/skills/verify-work/SKILL.md`.

### R6 — Capitalize
After a non-trivial task, ask: will this happen again? If yes, turn it into a local skill in
`.claude/skills/`. The kit should get better with every task.
Protocol: `.claude/skills/retro/SKILL.md`.

### R7 — Safety and caution
- Third-party skills run with the agent's full permissions: **read the `SKILL.md` before
  installing it**, every time, including on updates.
- Never put secrets in files, logs, or messages.
- Destructive or irreversible actions — deletions, pushes, deployments, sends, spending,
  anything touching keys or funds, and any change to **shared system configuration**
  (reverse proxy, service manager, firewall) — need confirmation first, unless the user
  has explicitly said otherwise. Prefer handing over ready-to-run commands to running them.

## Task order

```
1. Classify     → technical? recurring? irreversible?
2. R1 scout     → local skill ▸ online skill ▸ install ▸ otherwise by hand
3. R2 research  → official docs (technical tasks) ▸ note in docs/research/
4. Execute
5. R5 verify    → real run, real output
6. R4+R6 record → JOURNAL/INDEX ▸ is this worth a skill?
```

**Allowed exceptions** (state them in one line, never skip silently): conversational questions,
reading files, trivial edits to code already in context. When in doubt, apply the rules.

## Working style
Answer in the language the user writes in. Keep answers compact; skip process narration unless
asked. Raise doubts when they appear, not at the end. If a request has two very different
readings, ask; otherwise pick one and state the assumption.

## Recognizer-Mano — regole di progetto

Web app che riconosce i gesti della mano dalla webcam, **tutto nel browser** (MediaPipe Tasks Vision).
Dettagli in `PROJECT.md`.

### Memoria di progetto (portabile)
L'indice della memoria è importato qui sotto ed è sempre nel contesto; i singoli file si leggono
quando servono. Per salvare, correggere o cancellare un ricordo: skill `project-memory`.
Usa **questa** memoria, non quella automatica nella home: deve viaggiare con la cartella.

@.claude/memory/MEMORY.md

### P1 — Privacy on-device (dati: immagini/video di persone)
I frame della webcam e i landmark non escono dal browser: niente upload, registrazioni, log di
immagini, analytics su canvas, senza conferma esplicita. La camera parte su azione dell'utente e si
spegne quando non serve. Prima di dire "fatto" su codice che tocca camera, rete, dipendenze o
deploy → sub-agente `privacy-auditor`.

### P2 — Versioni fissate
`@mediapipe/tasks-vision`, cartella `wasm` e modelli `.task` con versioni fissate e allineate;
mai `@latest` nel codice. Prima di aggiornare, R2 (doc ufficiale) e nota in `docs/research/`.

### P3 — Verifica nel browser
Sul VPS non c'è webcam: la verifica R5 di riconoscimento/UI si fa con il sub-agente
`browser-tester` (Chromium headless con video finto), non leggendo il codice.
Il test pronto è `cd app && npm run test:e2e`: deve finire con `E2E OK`.

### Skill e sub-agenti di progetto
| Quando | Usa |
|---|---|
| riconoscimento mani/gesti, landmark, modelli custom, prestazioni | skill `mediapipe-hand-gestures` |
| webcam, permessi, specchio, spegnimento camera | skill `webcam-capture` |
| scena 3D, geometrie, materiali, luci della mano stilizzata | skill `threejs-fundamentals`, `threejs-geometry`, `threejs-materials`, `threejs-lighting` |
| una nuova pagina di sola prosa (guida, corso, manuale) | skill `pagina-documento` |
| pubblicare un aggiornamento | `deploy/pubblica.sh` (build + controlli + `systemctl restart mano`) |
| prima installazione / ripristino della pubblicazione | `deploy/attiva-caddy.sh`, dettagli in `deploy/LEGGIMI.md` |
| cambiare la configurazione del dominio già installata (password, intestazioni) | `deploy/Caddyfile.snippet` + `deploy/aggiorna-caddy.sh` |
| gioco a due giocatori, gesti come mosse | `app/src/sfida.ts` (pagina `/sfida/`) |
| posa a due mani tenuta per 4 s → palla di energia e raggio, effetti di luce su canvas 2D | `app/src/onda.ts` (giudice della posa + macchina a stati) e `app/src/onda-fx.ts` (disegno), pagina `/onda/` |
| volto: punti, espressioni, dove guarda — e perché l'identità NON si può fare | nota `docs/research/2026-09-29-mediapipe-volto-web.md` |
| riconoscimento del corpo (33 punti, PoseLandmarker) | `app/src/pose.ts`, nota `docs/research/2026-09-18-mediapipe-pose-landmarker-web.md` |
| mani vere sulla pagina del corpo, due modelli sullo stesso fotogramma | `app/src/hands.ts`, nota `docs/research/2026-09-20-due-modelli-mediapipe-stesso-fotogramma.md` |
| forma dello scheletro (cranio, costole, bacino, ossa) | `app/src/bones.ts` + `app/src/body3d.ts`; per guardarla senza webcam: `app/prova-scheletro.html` e `app/tests/e2e/scheletro-schermate.mjs` |
| corso per la scuola (p5.js + ml5, MkDocs in `corso-scuola/`): nuove lezioni, esercizi, prova degli sketch | skill `corso-mkdocs` |
| "ricordati…", decisioni da conservare, ricordi sbagliati | skill `project-memory` |
| cercare/installare una skill esterna | skill `skill-scout` (+ `find-skills`) |
| prova end-to-end nel browser | agente `browser-tester` |
| controllo privacy prima di chiudere | agente `privacy-auditor` |
| ricerca tecnica con fonti / verifica indipendente | agenti `tech-researcher` / `verifier` |
