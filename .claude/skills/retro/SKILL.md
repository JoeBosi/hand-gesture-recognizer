---
name: retro
description: Turns work that just happened into something reusable - decides whether it becomes a local skill, a research note, or a line in the journal, and then writes it. Use at the end of a non-trivial task, the second time a procedure repeats, or whenever the user corrects how the agent works rather than what it produced.
allowed-tools:
  - Bash(npx skills:*)
  - Bash(npx -y skills@latest:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Retro — the kit improves with every task

Rule R6 in `CLAUDE.md`. This takes a minute and is not a ritual: if there is nothing to
capture, say so in one line and move on.

## Three questions

1. **Will it happen again?** If the procedure will recur — even just a second time — it becomes
   a local skill.
2. **Was something learned and verified online?** → a note in `docs/research/` plus a row in `INDEX.md`.
3. **Did the user correct *how* the work is done?** That is a rule, not a fact: update
   `CLAUDE.md` or the relevant skill instead of trying to remember it.

## Creating the local skill

```bash
cd .claude/skills && npx -y skills@latest init <kebab-case-name>
```
- `name` matches the folder, kebab-case.
- The `description` is the trigger: it must say what the skill does **and when to use it**, in
  the words the user would actually use. A vague description means the skill never fires.
- Keep the body focused: procedure, exact commands, decision criteria, pitfalls. Heavy material
  goes in separate files next to the `SKILL.md`.
- Add `allowed-tools` only to pre-approve recurring commands, and keep it narrow.
- Add the row to `docs/research/INDEX.md`.

## Record it

One line in `docs/JOURNAL.md`: date, what happened, the decision, what was captured.
Append-only — do not rewrite the past.
