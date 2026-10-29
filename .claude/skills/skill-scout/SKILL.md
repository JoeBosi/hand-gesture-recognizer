---
name: skill-scout
description: Checks whether an existing skill already does the job before building anything by hand - searches the local skills, then the public ecosystem (npx skills find, skills.sh, anthropics/skills, vendor repos), evaluates candidates, and installs the good ones project-scoped. Use this at the start of any task where the user asks to build, configure, automate, analyse or set something up, whenever a task feels routine or recurring, and whenever skills, plugins or tooling come up.
allowed-tools:
  - Bash(npx skills:*)
  - Bash(npx -y skills@latest:*)
  - WebSearch
  - WebFetch
  - Read
  - Glob
  - Grep
---

# Skill scout — search first, build second

Rule R1 in `CLAUDE.md`. The point is to avoid rebuilding by hand what already exists as a
reusable skill, and to grow this folder's kit with every task.

## Step 0 — Is it worth scouting?

Skip only for: conversational questions, reading files, trivial edits to code already in
context. Otherwise scout, and report the outcome in one line. "Nothing suitable, doing it by
hand" is a fine answer — silently skipping the step is not.

Spend **one** search round. Scouting is meant to save time, not to consume it.

## Step 1 — Local inventory

```bash
ls .claude/skills/
cat skills-lock.json
```
If a local skill covers the task, use it and stop here.

## Step 2 — Public search

Search in this order and stop as soon as a solid candidate appears:

```bash
npx -y skills@latest find "<domain keyword>"
npx -y skills@latest find "<query>" --owner anthropics
npx -y skills@latest add <owner>/<repo> --list     # what a repo contains
```

Cross-check with WebSearch/WebFetch:
- https://skills.sh — public registry (install count is a quality signal)
- `github.com/anthropics/skills` — official Anthropic skills
- `github.com/vercel-labs/skills`, `vercel-labs/agent-skills`
- the vendor's own repo for the product involved (e.g. `supabase/agent-skills`)
- Claude Code plugin marketplaces: good for inspiration, but **not portable** — plugins install
  outside the folder, so prefer the equivalent skill

Query shapes that work: `<technology> skill agent`, `<task> SKILL.md`, `<vendor> agent skills`.

## Step 3 — Quality gate

Install only if the candidate passes all of these:
- **Provenance**: official or well-known owner, or a repo with real history and stars.
- **Freshness**: recently updated, aligned with current versions.
- **Read it**: open the `SKILL.md` before installing. Check that it does not exfiltrate data,
  install surprise packages, or ask for credentials. Skills run with the agent's full
  permissions, so reading them is not optional (R7).
- **Fit**: it solves *this* task, not a neighbouring one.

Fail any single point and it does not get installed. Say why.

## Step 4 — Portable install

```bash
npx -y skills@latest add <owner>/<repo> --skill <name> -a claude-code --copy -y
```
- `--copy` is required: without it the CLI symlinks into the global cache, and those links break
  the moment the folder is copied to another machine.
- Never `-g`: the install must stay in `.claude/skills/`.
- Check `ls .claude/skills/<name>` and that `skills-lock.json` was updated.

If the skill is not in the registry but a `SKILL.md` exists on GitHub, pass the direct file or
archive URL to `skills add`. Private repositories work too: the CLI reuses git/`gh`/SSH auth.

## Step 5 — Nothing suitable

Do the work by hand (still applying R2), then consider R6: if the task will recur, create a
local skill with `cd .claude/skills && npx -y skills@latest init <name>`.

## Step 6 — Record it

Add a row to `docs/research/INDEX.md`: skill, source, the task that motivated it, date.
