#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

archive=${1:-}
deploy_root=${2:-}
process_name=${3:-}
health_url=${4:-}
revision=${5:-}

[[ -f "$archive" ]] || { echo "deployment archive not found" >&2; exit 2; }
[[ "$deploy_root" == /* && "$deploy_root" != "/" ]] || { echo "DEPLOY_ROOT must be an absolute non-root path" >&2; exit 2; }
[[ "$process_name" =~ ^[A-Za-z0-9_.@-]+$ ]] || { echo "invalid PM2 process name" >&2; exit 2; }
[[ "$health_url" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?/ ]] || { echo "HEALTH_URL must use loopback HTTP(S)" >&2; exit 2; }
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid revision" >&2; exit 2; }

release="$deploy_root/releases/$revision"
current="$deploy_root/current"
shared="$deploy_root/shared"
shared_env="$shared/server.env"
shared_uploads="$shared/uploads"
previous=""
mkdir -p "$deploy_root/releases"
[[ -f "$shared_env" ]] || { echo "shared production environment not found: $shared_env" >&2; exit 2; }
command -v pm2 >/dev/null 2>&1 || { echo "pm2 is not installed for the deploy user" >&2; exit 2; }
if [[ -L "$current" ]]; then
  previous=$(readlink -f "$current" || true)
fi

cleanup_archive() { rm -f -- "$archive"; }
trap cleanup_archive EXIT

rm -rf -- "$release"
mkdir -p "$release"
tar -xzf "$archive" -C "$release" --no-same-owner --no-same-permissions
(cd "$release/server" && npm ci --omit=dev --no-audit --fund=false)
mkdir -p "$shared_uploads/attachments" "$shared_uploads/avatars"
rm -rf -- "$release/server/uploads"
ln -s "$shared_uploads" "$release/server/uploads"
ln -s "$shared_env" "$release/server/.env"

rm -f -- "$deploy_root/current.next"
ln -s "$release" "$deploy_root/current.next"
mv -Tf "$deploy_root/current.next" "$current"

restart_pm2() {
  pm2 delete "$process_name" >/dev/null 2>&1 || true
  pm2 start "$current/server/server.js" \
    --name "$process_name" \
    --cwd "$current/server" \
    --time || return 1
  pm2 save || return 1
}

if ! restart_pm2 || ! curl --fail --silent --show-error --retry 12 --retry-connrefused --retry-delay 2 "$health_url" >/dev/null; then
  if [[ -n "$previous" && -d "$previous" ]]; then
    rm -f -- "$deploy_root/current.rollback"
    ln -s "$previous" "$deploy_root/current.rollback"
    mv -Tf "$deploy_root/current.rollback" "$current"
    restart_pm2 || true
  fi
  echo "deployment failed and previous release was restored" >&2
  exit 1
fi

find "$deploy_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr | tail -n +6 | cut -d' ' -f2- | while IFS= read -r old; do
      [[ -n "$old" && "$old" != "$release" && "$old" != "$previous" ]] && rm -rf -- "$old"
    done

echo "activated revision $revision"
