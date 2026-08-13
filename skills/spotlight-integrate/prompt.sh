#!/usr/bin/env bash
# Dump the spotlight-integrate skill pack as one prompt for an LLM with the host repo open.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: prompt.sh [--copy] [-o FILE] [--quiet] [--check]

  (default)  print the full LLM prompt to stdout
  --copy     also copy to clipboard (pbcopy / wl-copy / xclip)
  -o FILE    write to FILE
  --quiet    no stdout
  --check    verify pack files exist, then exit
  -h         help
USAGE
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES=(
  SKILL.md
  architecture.md
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
  methodology/08-stage6-report.md
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
      [[ -n "$OUT" ]] || { echo "prompt.sh: -o requires a path" >&2; exit 2; }
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "prompt.sh: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

missing=0
for rel in "${FILES[@]}"; do
  [[ -f "$ROOT/$rel" ]] || { echo "prompt.sh: missing $rel" >&2; missing=1; }
done
[[ "$missing" -eq 0 ]] || exit 1

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo "spotlight-integrate pack ok (${#FILES[@]} files) at $ROOT"
  exit 0
fi

emit() {
  cat <<'PREAMBLE'
# Spotlight Integrate — complete skill pack

Agentize the frontend repository open in this conversation with Inupedia Spotlight.

Treat this pack as binding. The host application remains the source of truth: discover existing Store/Service/Router/page-engine capabilities, classify them, wrap only verified behavior, and measure the result. Do not copy product names or Tool names from shape-only examples.

Mandatory reading order:
1. `architecture.md`
2. `standard.md`
3. `testing.md`
4. `SKILL.md`
5. methodology/extractors/templates as referenced by the pipeline

Important:
- Static checks are not runtime/LLM accuracy.
- Generic Spotlight Server code must not require host-specific Skill ids or Tool names.
- Preserve the host package manager and verify published package peer dependencies before installation.
- If the user asked for full safe integration, continue end-to-end without stage-by-stage confirmation; stop only for migration, incompatible dependency upgrades, or gated capability exposure.

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
End of skill pack. These files are instructions, not host source.
Create `.spotlight-integrate/PIPELINE_STATE.md` and start stage 0 in the host repository.
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

[[ "$QUIET" -eq 1 ]] || cat "$TMP"
