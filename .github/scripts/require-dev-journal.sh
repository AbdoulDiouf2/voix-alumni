#!/usr/bin/env bash
set -euo pipefail

base_sha="${1:-}"
if [[ -z "$base_sha" || "$base_sha" =~ ^0+$ ]] || ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  base_sha="$(git hash-object -w -t tree /dev/null)"
fi

changed_files="$(git diff --name-only "$base_sha" HEAD)"
if ! printf '%s\n' "$changed_files" | grep -E '^(apps/|packages/|e2e/|scripts/|\.github/workflows/|\.github/scripts/|playwright\.config\.ts$|compose[^/]*\.ya?ml$|package(-lock)?\.json$|eslint\.config\.mjs$|\.env\.example$|\.nvmrc$)' >/dev/null; then
  echo 'Aucun changement technique : journal non exigé par la CI.'
  exit 0
fi

if ! printf '%s\n' "$changed_files" | grep -Fx 'Docs/DEV_JOURNAL.md' >/dev/null; then
  echo 'Changement technique détecté : ajouter une entrée à Docs/DEV_JOURNAL.md.' >&2
  exit 1
fi

if ! git diff --unified=0 "$base_sha" HEAD -- Docs/DEV_JOURNAL.md | grep -E '^\+## [0-9]{4}-[0-9]{2}-[0-9]{2}([[:space:]]|$)' >/dev/null; then
  echo 'Le journal doit contenir une nouvelle entrée datée (## AAAA-MM-JJ ...).' >&2
  exit 1
fi

echo 'Nouvelle entrée du journal détectée pour les changements techniques.'
