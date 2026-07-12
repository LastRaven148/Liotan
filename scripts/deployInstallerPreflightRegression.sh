#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tmp_dir=$(mktemp -d)
cleanup() { rm -rf -- "$tmp_dir"; }
trap cleanup EXIT

deploy_root="$tmp_dir/deploy"
old_release="$deploy_root/releases/0000000000000000000000000000000000000000"
archive="$tmp_dir/release.tar.gz"
public_link="$tmp_dir/public-frontend"
pm2_marker="$tmp_dir/pm2-was-called"

mkdir -p "$old_release/client/build" "$deploy_root/shared/uploads" "$tmp_dir/bin"
printf 'test-only\n' > "$deploy_root/shared/server.env"
printf '#!/usr/bin/env bash\ntouch %q\n' "$pm2_marker" > "$tmp_dir/bin/pm2"
chmod +x "$tmp_dir/bin/pm2"
touch "$archive"
ln -s "$old_release" "$deploy_root/current"
ln -s "$old_release/client/build" "$public_link"

set +e
output=$(PATH="$tmp_dir/bin:$PATH" bash "$repo_root/server/deploy/install-release.sh" \
  "$archive" \
  "$deploy_root" \
  "liotan-api" \
  "http://127.0.0.1:3001/health" \
  "1111111111111111111111111111111111111111" \
  "http://127.0.0.1:8080" \
  "tunnel.liotan.com" \
  "$public_link" 2>&1)
status=$?
set -e

[[ "$status" -eq 2 ]] || { echo "expected frontend link preflight to exit 2, got $status" >&2; exit 1; }
[[ "$output" == *"PUBLIC_FRONTEND_LINK is not wired to the atomic current release"* ]] || {
  echo "missing actionable frontend link diagnostic" >&2
  exit 1
}
[[ "$output" == *"backend was not restarted"* ]] || {
  echo "missing no-restart guarantee diagnostic" >&2
  exit 1
}
[[ ! -e "$pm2_marker" ]] || { echo "PM2 was invoked before frontend link preflight completed" >&2; exit 1; }

echo "Deployment frontend link preflight regression passed."
