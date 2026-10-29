---
name: project-memory
description: Reads and maintains this project's portable memory in .claude/memory/ - facts about the user, project decisions, feedback on how to work, external references - one fact per file plus the MEMORY.md index. Use at the start of a session to recall context, whenever the user says "ricordati", "ricorda che", "remember", "tieni a mente", "dimentica", when a decision or correction should survive the session, and when a stored fact turns out to be wrong or outdated.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Project memory — portabile, dentro la cartella

`.claude/memory/MEMORY.md` è importato da `CLAUDE.md`, quindi l'indice è sempre nel contesto.
I file puntati si leggono **quando servono**, non tutti a ogni avvio.

La memoria automatica di Claude Code vive nella home della macchina e non viaggia con la cartella:
tutto ciò che conta per il progetto va qui.

## Formato: un fatto per file

```markdown
---
name: <kebab-case, uguale al nome file senza .md>
description: <una riga, serve a decidere se è rilevante>
metadata:
  type: user | feedback | project | reference
---

<il fatto>
**Why:** <perché>            (obbligatorio per feedback e project)
**How to apply:** <quando e come usarlo>
Collegato: [[altro-nome]]
```

Tipi: `user` chi è l'utente e come lavora · `feedback` correzioni o conferme sul *come* lavorare ·
`project` decisioni, vincoli, scadenze (date **assolute**, mai "giovedì prossimo") ·
`reference` puntatori a risorse esterne.

Nome file: `<type>-<slug>.md`. Dopo averlo scritto, aggiungere una riga all'indice:
`- [Titolo](file.md) — gancio breve`. L'indice contiene solo puntatori, mai contenuto.

## Prima di salvare

1. Cerca un file che copra già il tema (`grep -ril <parola> .claude/memory`): **aggiorna** quello.
2. Non salvare ciò che è già scritto altrove: codice, `git log`, `PROJECT.md`, `CLAUDE.md`,
   `docs/JOURNAL.md` (decisioni datate), `docs/research/` (fonti tecniche).
   Esempio: una scelta di stack va in `PROJECT.md` + JOURNAL; in memoria solo il *perché* non ovvio.
3. Mai segreti, token, dati personali di terzi, immagini.
4. Una correzione sul *modo* di lavorare che vale sempre è una regola: va in `CLAUDE.md` o in una
   skill (vedi `retro`), la memoria al massimo la richiama.

## Quando un ricordo è sbagliato o vecchio

Correggilo o cancellalo subito (file + riga dell'indice). Un ricordo che nomina file, funzioni o
versioni va verificato prima di basarci un consiglio.
