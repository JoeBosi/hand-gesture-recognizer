---
name: verify-work
description: Proves that finished work actually works before it is reported as done - runs the code, executes the command, inspects the real output, tries the likely edge cases and checks for side effects. Use this before reporting any task complete, after changing code, configuration or scripts, and any time the words "done", "works" or "should" are about to be written.
---

# Verify work — no "should work"

Rule R5 in `CLAUDE.md`.

## Before saying "done"

1. **Exercise the real path**: run the command, start the script, open the generated file, call
   the endpoint. Reading the code is not verification.
2. **Show the output** that demonstrates the result — truncated, not paraphrased.
3. **Try the likeliest edge case**: empty input, missing file, permissions, a second run
   (idempotence), a different folder (portability, R3).
4. **Look for side effects**: files written where they should not be, absolute paths, symlinks,
   secrets in plain text, processes left running.
5. **Re-read the original request** and check it point by point: is everything done, or only the
   easy part?

## When verification is impossible

Say so explicitly, explain why (missing credential, needs another machine, requires the user),
and give the exact command the user can run. Never report as complete something untested.

## When it fails

Report the real error with its output. Do not soften it, hide it, or retry at random: diagnose,
hypothesise, fix, verify again. If it stays broken, say that plainly and list what was ruled out.
