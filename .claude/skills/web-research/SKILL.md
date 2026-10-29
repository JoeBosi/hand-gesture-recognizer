---
name: web-research
description: Reads the current official documentation online before doing any technical work, then records what was found - covers APIs, libraries and their versions, CLI flags, configuration, protocols and standards, security and cryptography, deployment. Use this before writing code or commands on any technical task, especially when the answer seems already known from memory, since versions and APIs change and stale recall is the usual cause of broken work.
allowed-tools:
  - WebSearch
  - WebFetch
  - Read
  - Write
  - Glob
  - Grep
---

# Web research — read the docs before acting

Rule R2 in `CLAUDE.md`. Recalled knowledge is dated: versions, flags, endpoints and best
practices move. On a technical task, research comes **before** execution.

## When it applies

Always, for: code, configuration, third-party APIs, libraries and their versions, CLIs and
flags, formats and standards (RFC, EIP, W3C), security, cryptography, deployment, CI. Including
when the answer feels obvious — the point is to confirm the current version.

It does not apply to: conversational questions, navigating code already present, mechanical
refactors of files already in context.

## Procedure

1. **Write 3-5 concrete questions** ("what is the current signature of X?", "which version
   introduced Y?", "what are the known failure modes of Z?"). Put the current year in queries.
2. **Source priority**: official docs / official repo / spec → changelog, release notes, official
   issue tracker → recent technical articles → forums and blogs (as a hint, never as truth).
3. **Check the version actually in use** in the project (`package.json`, lockfile, `--version`).
   Docs for another major version are the wrong source.
4. **Cross-check** at least two independent sources for any non-trivial choice, and for any
   claim about security or money.
5. **Cite** the links behind key decisions in the answer to the user.
6. **Read the source when the docs are ambiguous.** Documentation describes intent; the source
   describes behaviour. A ten-minute read of the implementation beats an hour of guessing.

## Research note (required when the research shaped a decision)

Write `docs/research/YYYY-MM-DD-<slug>.md`:

```markdown
# <Topic>
Date: YYYY-MM-DD · Task: <what I was doing>

## Questions
## Answers (with sources)   — <short answer> — [title](url)
## Versions verified        — <tool> = <version> (docs read: <version>)
## Decisions                — <choice> because <reason>
## Open questions
```

Then add a row to `docs/research/INDEX.md`. Before a new search, **check that index**: reuse a
recent note instead of starting over, but confirm it is not stale.

## Honesty

If the documentation is ambiguous or could not be found, say so and state the assumption made.
Never present a recollection as a verified source.
