# AGENTS.md

This folder uses a portable agent protocol. The full rules are in [`CLAUDE.md`](./CLAUDE.md)
and apply to **any** agent (Claude Code, Codex, Cursor, others). Project context lives in
[`PROJECT.md`](./PROJECT.md), e come funziona il codice, con diagrammi, in
[`docs/COME-FUNZIONA.md`](./docs/COME-FUNZIONA.md).

In short:
1. **Look for an existing skill first** (`.claude/skills/`, then `npx skills find`, skills.sh,
   GitHub). If one fits, install it here project-scoped with `--copy` and use it.
2. **On technical tasks, read the current official docs before acting**; save the note in
   `docs/research/`.
3. **Verify before declaring done**: real output, not promises.
4. **Everything stays inside the folder**: no global installs, no absolute paths.
5. **Be careful**: read third-party skills before running them; confirm irreversible actions
   and never change shared system configuration on your own.

Skills in `.claude/skills/` use the standard `SKILL.md` format: another agent can read them
directly or install them into its own directory with `npx skills add . -a <agent> --copy`.

## Recognizer-Mano

- Progetto: riconoscimento dei gesti della mano da webcam nel browser (MediaPipe Tasks Vision).
- **Privacy**: i frame della webcam non escono mai dal browser senza conferma esplicita
  (vedi sezione "Recognizer-Mano — regole di progetto" in `CLAUDE.md`, P1–P3).
- **Memoria di progetto**: leggi `.claude/memory/MEMORY.md` all'inizio; formato e regole di
  scrittura in `.claude/skills/project-memory/SKILL.md`.
- Sub-agenti in `.claude/agents/` (`browser-tester`, `privacy-auditor`, `verifier`, …): agenti
  diversi da Claude Code possono usarli come prompt/checklist.
