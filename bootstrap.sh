#!/usr/bin/env bash
# Restore and check the portable agent kit.
# Usage: ./bootstrap.sh [--check]
set -euo pipefail
cd "$(dirname "$0")"

ok(){ printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko(){ printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=1; }
FAIL=0
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

echo "▸ Kit $( [ -f KIT_VERSION ] && cat KIT_VERSION || echo 'version unknown' )"

echo "▸ Prerequisites"
command -v node >/dev/null && ok "node $(node -v)" || ko "node missing (required by npx skills)"
command -v git  >/dev/null && ok "git  $(git --version | awk '{print $3}')" || ko "git missing"

echo "▸ Structure"
for p in CLAUDE.md AGENTS.md PROJECT.md .claude/settings.json .claude/skills .claude/agents \
         docs/research/INDEX.md docs/JOURNAL.md .claude/memory/MEMORY.md; do
  [ -e "$p" ] && ok "$p" || ko "missing $p"
done

echo "▸ Skills"
if [ -f skills-lock.json ]; then
  if [ "$CHECK_ONLY" -eq 0 ]; then
    # explicit restore: project-scoped, copied, into .claude/skills/
    while read -r NAME SOURCE; do
      [ -z "$NAME" ] && continue
      [ "$SOURCE" = "local" ] && continue
      if [ -f ".claude/skills/$NAME/SKILL.md" ]; then
        ok "$NAME already present"
      else
        echo "  ↓ reinstalling $NAME from $SOURCE"
        # </dev/null: otherwise npx swallows the loop's stdin and only the first skill is restored
        npx -y skills@latest add "$SOURCE" --skill "$NAME" -a claude-code --copy -y \
          </dev/null >/dev/null 2>&1 || ko "restore of $NAME failed"
      fi
    done < <(node -e '
      const l=require("./skills-lock.json").skills||{};
      for (const [n,v] of Object.entries(l)) console.log(n, v.source||"local");
    ')
  fi
else
  [ "$CHECK_ONLY" -eq 1 ] || echo "  · no skills-lock.json yet (no third-party skills installed)"
fi
# every skill in the lock file must be on disk, or the kit is not really restored
if [ -f skills-lock.json ]; then
  while read -r NAME; do
    [ -n "$NAME" ] && [ ! -f ".claude/skills/$NAME/SKILL.md" ] && ko "$NAME is in skills-lock.json but not installed"
  done < <(node -e 'for (const n of Object.keys(require("./skills-lock.json").skills||{})) console.log(n)')
fi
for d in .claude/skills/*/; do
  [ -d "$d" ] || continue
  [ -f "$d/SKILL.md" ] && ok "$(basename "$d")" || ko "$(basename "$d") has no SKILL.md"
done

echo "▸ Portability"
if [ -n "$(find .claude -type l 2>/dev/null)" ]; then
  ko "symlinks under .claude (reinstall those skills with --copy)"
else ok "no symlinks"; fi
# Third-party skills are vendored content we do not control: their examples routinely
# contain absolute paths, and flagging them would train everyone to ignore this check.
# Locally written skills stay in scope, because those are ours to keep portable.
VENDORED=()
if [ -f skills-lock.json ]; then
  while read -r NAME; do
    [ -n "$NAME" ] && VENDORED+=(--exclude-dir="$NAME")
  done < <(node -e '
    const l=require("./skills-lock.json").skills||{};
    for (const [n,v] of Object.entries(l)) if ((v.source||"local")!=="local") console.log(n);
  ' 2>/dev/null || true)
fi
# The path must start a token: "../../root/x" is a relative path that merely passes through
# one of these names, and flagging it would be a false alarm. bootstrap.sh is excluded, so
# the pattern below does not match itself.
# Local fix: --include must come before --exclude=bootstrap.sh. GNU grep includes files that
# match no include/exclude rule unless the FIRST such option is --include, so with the original
# order every file (wasm loaders, generated configs) was scanned.
HITS=$(grep -rlIE --exclude-dir=docs --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=dist --exclude-dir=.cache \
  --include='*.md' --include='*.json' --include='*.sh' \
  --exclude=bootstrap.sh "${VENDORED[@]}" \
  -e '(^|[[:space:]"'"'"'`(=:,])/(root|home|Users)/' . 2>/dev/null || true)
if [ -n "$HITS" ]; then
  ko "absolute paths in: $(echo "$HITS" | tr '\n' ' ')"
else ok "no absolute paths"; fi

# A skill installed from a folder on this machine cannot be restored on another one.
# This is a normal state while developing a skill, so it is a note, not a failure —
# a check that fails in ordinary use is a check people learn to ignore.
if [ -f skills-lock.json ]; then
  LOCAL_SRC=$(node -e '
    const l=require("./skills-lock.json").skills||{};
    for (const [n,v] of Object.entries(l))
      if (v.sourceType==="local" || (v.source||"").includes("..")) console.log(n);
  ' 2>/dev/null || true)
  if [ -n "$LOCAL_SRC" ]; then
    printf "  · %s\n" "installed from a local path, so ./bootstrap.sh cannot restore them elsewhere: $(echo "$LOCAL_SRC" | tr '\n' ' ')"
  fi
fi

echo "▸ Memory"
# Local addition to the kit template: every file listed in the index must exist, and every
# memory file must be listed, otherwise the memory silently loses facts after a copy.
if [ -f .claude/memory/MEMORY.md ]; then
  for f in $(grep -oE '\]\([^)]+\.md\)' .claude/memory/MEMORY.md | sed 's/^](//; s/)$//'); do
    [ -f ".claude/memory/$f" ] || ko "MEMORY.md points to missing $f"
  done
  for f in .claude/memory/*.md; do
    b=$(basename "$f"); [ "$b" = MEMORY.md ] && continue
    grep -q "($b)" .claude/memory/MEMORY.md || ko "$b is not listed in MEMORY.md"
  done
  ok "$(ls .claude/memory/*.md | grep -vc 'MEMORY.md$') memories indexed"
fi

echo "▸ Secrets"
if [ -f .env ] && ! grep -q '^\.env$' .gitignore 2>/dev/null; then
  ko ".env exists but is not git-ignored"
else ok "no tracked secrets"; fi

echo
[ "$FAIL" -eq 0 ] && echo "Kit ready." || { echo "Kit incomplete: see ✗ above."; exit 1; }
