#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

archive=${1:-}
deploy_root=${2:-}
service=${3:-}
health_url=${4:-}
revision=${5:-}

[[ -f "$archive" ]] || { echo "deployment archive not found" >&2; exit 2; }
[[ "$deploy_root" == /* && "$deploy_root" != "/" ]] || { echo "DEPLOY_ROOT must be an absolute non-root path" >&2; exit 2; }
[[ "$service" =~ ^[A-Za-z0-9_.@-]+$ ]] || { echo "invalid systemd service name" >&2; exit 2; }
[[ "$health_url" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?/ ]] || { echo "HEALTH_URL must use loopback HTTP(S)" >&2; exit 2; }
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid revision" >&2; exit 2; }

release="$deploy_root/releases/$revision"
current="$deploy_root/current"
previous=""
mkdir -p "$deploy_root/releases"
if [[ -L "$current" ]]; then
  previous=$(readlink -f "$current" || true)
fi

cleanup_archive() { rm -f -- "$archive"; }
trap cleanup_archive EXIT

rm -rf -- "$release"
mkdir -p "$release"
tar -xzf "$archive" -C "$release" --no-same-owner --no-same-permissions
(cd "$release/server" && npm ci --omit=dev --no-audit --fund=false)

rm -f -- "$deploy_root/current.next"
ln -s "$release" "$deploy_root/current.next"
mv -Tf "$deploy_root/current.next" "$current"

if ! sudo systemctl restart "$service" || ! curl --fail --silent --show-error --retry 12 --retry-delay 2 "$health_url" >/dev/null; then
  if [[ -n "$previous" && -d "$previous" ]]; then
    ln -s "$previous" "$deploy_root/current.rollback"
    mv -Tf "$deploy_root/current.rollback" "$current"
    sudo systemctl restart "$service" || true
  fi
  echo "deployment failed and previous release was restored" >&2
  exit 1
fi

find "$deploy_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr | tail -n +6 | cut -d' ' -f2- | while IFS= read -r old; do
      [[ -n "$old" && "$old" != "$release" && "$old" != "$previous" ]] && rm -rf -- "$old"
    done

echo "activated revision $revision"
