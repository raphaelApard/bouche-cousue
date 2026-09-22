#!/usr/bin/env bash
#
# Run the deploy script, or explain how to create it.
#
# scripts/deploy.sh carries the server coordinates and is gitignored, so it is
# absent from a fresh clone. Running it directly there fails with "No such file
# or directory", which says nothing about the template sitting beside it — this
# wrapper is what turns that into an instruction.

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DEPLOY="$SCRIPT_DIR/deploy.sh"

if [ ! -f "$DEPLOY" ]; then
  printf '\n\033[1;31mNo deploy script.\033[0m scripts/deploy.sh holds the server\n' >&2
  printf 'coordinates, so it is gitignored and never part of a clone.\n\n' >&2
  printf 'Create it from the committed template, then fill in the four values\n' >&2
  printf 'in its Configuration block:\n\n' >&2
  printf '  cp scripts/deploy-sample.sh scripts/deploy.sh\n' >&2
  printf '  chmod +x scripts/deploy.sh\n' >&2
  printf '  $EDITOR scripts/deploy.sh\n\n' >&2
  exit 1
fi

# A copy made with `cp` keeps the template's mode, but one restored from a
# backup or an editor may not.
[ -x "$DEPLOY" ] || exec bash "$DEPLOY" "$@"

exec "$DEPLOY" "$@"
