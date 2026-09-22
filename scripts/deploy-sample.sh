#!/usr/bin/env bash
#
# Build the web app and mirror dist/ to the production web root.
#
# This is the committed template. It carries no server coordinates: copy it to
# scripts/deploy.sh, which .gitignore keeps out of the repository, and fill in
# the Configuration block. Keep the two in step when editing the logic below.
#
#   cp scripts/deploy-sample.sh scripts/deploy.sh
#   chmod +x scripts/deploy.sh
#   $EDITOR scripts/deploy.sh    # fill in the Configuration block
#
# The build is `pnpm build` (scripts/build.mjs): it stages the web app —
# index.html, css/, js/, locales/ and the favicons — into dist/, then runs the
# static checks and deletes dist/ if any of them fail. The two other front ends
# (the browser extensions) are not part of the site, which is why the upload
# reads from dist/ and never from the repository root.
#
# REMOTE_HOST is a Host alias in ~/.ssh/config, so the hostname, user, port
# and key stay out of this file.
#
# Usage:
#   deploy.sh                build, show what would change, ask, upload
#   deploy.sh --dry-run      show what would change, transfer nothing
#   deploy.sh --yes          skip the confirmation prompt
#
# Or through the package scripts, which explain themselves when this file has
# not been created yet. `pnpm run`, not `pnpm deploy`: deploy is a built-in
# pnpm command and the bare form never reaches this script.
#
#   pnpm run deploy
#   pnpm run deploy:dry

set -euo pipefail

# --- Configuration ----------------------------------------------------------
# Absolute path to the working copy this script builds from.
readonly REPO_DIR="$HOME/path/to/pause4lips"
# An SSH Host alias from ~/.ssh/config.
readonly REMOTE_HOST="my-server"
# Absolute path to the web root on that host.
readonly REMOTE_PATH="/home/user/example.com/htdocs"
# The public address, printed when the upload succeeds.
readonly SITE_URL="https://example.com/"
# ----------------------------------------------------------------------------

readonly DIST_DIR="dist"

# Paths the server owns: neither uploaded nor deleted.
#
# .well-known holds the Let's Encrypt ACME challenge. Deleting it breaks
# certificate renewal, and the app needs HTTPS to open the camera at all.
#
# .htaccess is the host's own HTTP-to-HTTPS redirect and is not in the
# repository, so a plain mirror would remove it — leaving a camera app
# answering on http://, where getUserMedia is refused.
readonly PROTECTED=('.well-known' '.htaccess')

dry_run=false
assume_yes=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    --yes|-y)  assume_yes=true ;;
    -h|--help)
      sed -n '/^# Usage/,/deploy:dry/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

step() { printf '\n\033[1;36m==>\033[0m \033[1m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mDeploy aborted:\033[0m %s\n' "$1" >&2; exit 1; }

command -v rsync >/dev/null || fail "rsync is not installed."
command -v ssh   >/dev/null || fail "ssh is not installed."
command -v pnpm  >/dev/null || fail "pnpm is not installed."

[ -d "$REPO_DIR" ] || fail "REPO_DIR does not exist: $REPO_DIR"
cd "$REPO_DIR"
[ -f package.json ] && [ -f index.html ] \
  || fail "$REPO_DIR does not look like the working copy."

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
commit="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

echo
echo "Deploying  $branch @ $commit"
echo "       to  $REMOTE_HOST:$REMOTE_PATH"
echo "           $SITE_URL"

# A deploy of a dirty tree is hard to trace back to a commit later on. It is a
# warning rather than a refusal: this is a personal site, and wanting to ship a
# fix before committing it is reasonable.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  printf '\n\033[1;33mWarning:\033[0m the working tree has uncommitted changes.\n'
fi

# --- Build ------------------------------------------------------------------

# build.mjs clears dist/ before it writes and removes it again if a check
# fails, so a failed build cannot leave half a site behind for rsync to find.
step "Building"
pnpm build || fail "the build failed — nothing was uploaded."

[ -f "$DIST_DIR/index.html" ] \
  || fail "$DIST_DIR/index.html is missing — the build produced nothing to deploy."

# rsync creates a missing destination without complaint, so a dry run against
# the wrong path reports the whole site as new — indistinguishable from a first
# deploy into an empty directory. Deploying to a path Apache does not serve
# publishes nothing and looks like a success, so ask the server directly.
step "Verifying the remote path"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "test -d '$REMOTE_PATH'" \
  || fail "$REMOTE_HOST:$REMOTE_PATH is not reachable or does not exist."
echo "  ✓ $REMOTE_HOST:$REMOTE_PATH"

# --- Upload -----------------------------------------------------------------

# --delete mirrors the build: files dropped from the repository go away on the
# server too. Anything placed in the web root by hand is removed as well, so
# keep this directory owned by the build — except for PROTECTED.
#
# The trailing slash on the source copies the contents of dist/, not the
# directory itself.
rsync_opts=(--archive --compress --human-readable --delete)
for path in "${PROTECTED[@]}"; do
  rsync_opts+=(--exclude "$path")
done

step "Changes this deploy would make"
changes="$(rsync "${rsync_opts[@]}" --itemize-changes --dry-run \
            "$DIST_DIR/" "$REMOTE_HOST:$REMOTE_PATH/")" || fail "rsync failed."

if [ -n "$changes" ]; then
  printf '%s\n' "$changes" | sed 's/^/  /'
else
  echo "  (nothing — the server already matches the build)"
fi

deletions="$(printf '%s\n' "$changes" | grep -c '^\*deleting' || true)"
if [ "$deletions" -gt 0 ]; then
  printf '\n  \033[1;33m⚠  %s file(s) would be DELETED from the live site.\033[0m\n' "$deletions"
fi

if $dry_run; then
  step "Dry run complete — nothing was transferred"
  exit 0
fi

if [ "$assume_yes" = false ]; then
  echo
  printf 'Deploy to %s? Type yes to continue: ' "$SITE_URL"
  read -r reply
  case "$reply" in
    yes|YES|y|Y) ;;
    *) echo; echo "Aborted. Nothing was changed on the server."; exit 1 ;;
  esac
fi

step "Uploading to $REMOTE_HOST:$REMOTE_PATH"
rsync "${rsync_opts[@]}" --stats "$DIST_DIR/" "$REMOTE_HOST:$REMOTE_PATH/" \
  || fail "rsync failed."

# rsync succeeding means the files arrived, not that the site answers: the
# HTTPS redirect lives in a .htaccess this deploy deliberately does not touch.
if command -v curl >/dev/null; then
  step "Verifying $SITE_URL"
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -L "$SITE_URL" 2>/dev/null || echo '000')"
  case "$status" in
    200) echo "  ✓ home page  200" ;;
    000) fail "the site did not answer — check DNS and the certificate." ;;
    *)   fail "the home page answered $status, expected 200." ;;
  esac
fi

step "Deployed $branch @ $commit to $SITE_URL"
