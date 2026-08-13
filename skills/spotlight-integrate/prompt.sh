#!/usr/bin/env bash
# Dump the spotlight-integrate skill pack as one prompt you can paste into any LLM.
# The model then distills the host Vue app that is open in that conversation.
#
#   ./prompt.sh
#   ./prompt.sh --copy
#   ./prompt.sh -o /tmp/spotlight-integrate.prompt.md
#   bash skills/spotlight-integrate/prompt.sh --copy

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: prompt.sh [--copy] [-o FILE] [--check]

  (default)  print the full LLM prompt to stdout
  --copy     also copy to clipboard (pbcopy / wl-copy / xclip)
  -o FILE    write to FILE (still prints unless --quiet)
  --quiet    no stdout (use with -o and/or --copy)
  --check    verify pack files exist, then exit
  -h         help

Paste the output into a chat that already has the host Vue 3 + Vite repo open.
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FILES=(
  SKILL.md
  standard.md
  testing.md
  methodology/00-pipeline-state.md
  methodology/01-stage0-overview.md
  methodology/02-stage1-extract.md
  methodology/03-stage1.5-verify.md
  methodology/04-stage2-tools.md
  methodology/05-stage3-skills.md
  methodology/06-stage4-pressure-test.md
  methodology/07-stage5-wire.md
  extractors/navigation.md
  extractors/panels.md
  extractors/catalogs.md
  extractors/reads.md
  extractors/ui-actions.md
  extractors/danger.md
  templates.md
  examples.md
)

COPY=0
QUIET=0
CHECK_ONLY=0
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --copy) COPY=1; shift ;;
    --quiet) QUIET=1; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    -o|--output)
      OUT="${2:-}"
      if [[ -z "$OUT" ]]; then
        echo "prompt.sh: -o requires a path" >&2
        exit 2
      fi
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "prompt.sh: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

missing=0
for rel in "${FILES[@]}"; do
  if [[ ! -f "$ROOT/$rel" ]]; then
    echo "prompt.sh: missing $rel" >&2
    missing=1
  fi
done
if [[ ! -f "$ROOT/SKILL.md" ]]; then
  echo "prompt.sh: this script must live next to SKILL.md" >&2
  missing=1
fi
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo "spotlight-integrate pack ok (${#FILES[@]} files) at $ROOT"
  exit 0
fi

emit() {
  cat <<'PREAMBLE'
# Spotlight Integrate — skill pack (follow this, then inspect the host repo)

You are distilling **the Vue 3 + Vite app in this conversation** into an Inupedia Spotlight integration.

This message is the `spotlight-integrate` Agent Skill. Treat it as binding. Do not search the web for a different Spotlight API. Do not copy tool names, catalog strings, or domains from the example files below — those are shapes only. Read **this host repo** for real symbols.

## Mandatory order

1. File `standard.md` — layout, naming, env, boot. Do not invent a second `projectId` or a second tools file.
2. File `testing.md` — gold questions, static grep, list-vs-open contract.
3. File `SKILL.md` — pipeline stages 0 → 5.
4. Then methodology / extractors / templates as the pipeline requires.

## Hard rules

- Client Tools wrap **existing** host exports only. No new players, maps, HTTP APIs, or page-engine code.
- If this repo already has Spotlight (`defineClientTool`, `defineSpotlightConfig`, `.inupedia/skills`), **extend in place**. Do not move files to `src/spotlight/` just to match the canonical tree.
- `allowed-tools` ⊆ exported Client Tool names. Always emit `skill.knowledge` (`direct_answer`).
- List phrasing → `get*` / `list*`. Named open phrasing → `open*` / `play*`. Never invent catalog names.
- Pin `@inupedia/spotlight-*` and `ghcr.io/inupedia/spotlight-server:<ver>` to `npm view @inupedia/spotlight-vue version` unless the user pinned a version.
- Optional SDK fields (`videoChannels`, `quickPanelActions`, `catalogOverlay`, avatar) only if this host already has matching UI.

If the app is not Vue 3 + Vite, stop and say so.

After the pack: start stage 0. Confirm domains with the user before wrapping tools.

---
PREAMBLE

  local rel
  for rel in "${FILES[@]}"; do
    printf '\n===== FILE: %s =====\n\n' "$rel"
    cat "$ROOT/$rel"
    printf '\n\n===== END FILE: %s =====\n' "$rel"
  done

  cat <<'POSTAMBLE'

---

End of skill pack. The files above are instructions, not the host app.

Now work in the **host frontend repository** that is open in this chat. Create `.spotlight-integrate/PIPELINE_STATE.md` and begin stage 0.
POSTAMBLE
}

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
emit > "$TMP"

if [[ -n "$OUT" ]]; then
  mkdir -p "$(dirname "$OUT")"
  cp "$TMP" "$OUT"
  echo "prompt.sh: wrote $OUT ($(wc -c < "$TMP" | tr -d ' ') bytes)" >&2
fi

if [[ "$COPY" -eq 1 ]]; then
  if command -v pbcopy >/dev/null 2>&1; then
    pbcopy < "$TMP"
  elif command -v wl-copy >/dev/null 2>&1; then
    wl-copy < "$TMP"
  elif command -v xclip >/dev/null 2>&1; then
    xclip -selection clipboard < "$TMP"
  else
    echo "prompt.sh: --copy needs pbcopy, wl-copy, or xclip" >&2
    exit 1
  fi
  echo "prompt.sh: copied to clipboard ($(wc -c < "$TMP" | tr -d ' ') bytes)" >&2
fi

if [[ "$QUIET" -eq 0 ]]; then
  cat "$TMP"
fi
