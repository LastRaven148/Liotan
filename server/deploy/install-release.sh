#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

archive=${1:-}
deploy_root=${2:-}
process_name=${3:-}
health_url=${4:-}
revision=${5:-}
frontend_url=${6:-http://127.0.0.1:8080}
frontend_host=${7:-tunnel.liotan.com}
public_link=${8:-/var/www/liotan}

[[ -f "$archive" ]] || { echo "deployment archive not found" >&2; exit 2; }
[[ "$deploy_root" == /* && "$deploy_root" != "/" ]] || { echo "DEPLOY_ROOT must be an absolute non-root path" >&2; exit 2; }
[[ "$process_name" =~ ^[A-Za-z0-9_.@-]+$ ]] || { echo "invalid PM2 process name" >&2; exit 2; }
[[ "$health_url" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?/ ]] || { echo "HEALTH_URL must use loopback HTTP(S)" >&2; exit 2; }
[[ "$frontend_url" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?$ ]] || { echo "FRONTEND_SMOKE_URL must use loopback HTTP(S)" >&2; exit 2; }
[[ "$frontend_host" =~ ^[A-Za-z0-9.-]{1,253}$ ]] || { echo "invalid frontend Host header" >&2; exit 2; }
[[ "$public_link" == /* && "$public_link" != "/" ]] || { echo "PUBLIC_FRONTEND_LINK must be absolute" >&2; exit 2; }
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid revision" >&2; exit 2; }
command -v flock >/dev/null 2>&1 || { echo "flock is required" >&2; exit 2; }
command -v pm2 >/dev/null 2>&1 || { echo "pm2 is not installed for the deploy user" >&2; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 2; }

mkdir -p "$deploy_root/releases"
exec 9>"$deploy_root/.deploy.lock"
flock -n 9 || { echo "another Liotan deployment is already running" >&2; exit 3; }

release="$deploy_root/releases/$revision"
current="$deploy_root/current"
shared="$deploy_root/shared"
shared_env="$shared/server.env"
shared_uploads="$shared/uploads"
previous=""
[[ -f "$shared_env" ]] || { echo "shared production environment not found: $shared_env" >&2; exit 2; }
if [[ -L "$current" ]]; then previous=$(readlink -f "$current" || true); fi

tmp_dir=$(mktemp -d)
cleanup() { rm -rf -- "$tmp_dir"; rm -f -- "$archive"; }
trap cleanup EXIT

expected_public_target="$current/client/build"
actual_public_target=$(readlink "$public_link" 2>/dev/null || true)
if [[ "$actual_public_target" != "$expected_public_target" ]]; then
  echo "PUBLIC_FRONTEND_LINK is not wired to the atomic current release" >&2
  echo "expected symlink: $public_link -> $expected_public_target" >&2
  echo "actual target: ${actual_public_target:-not a readable symbolic link}" >&2
  echo "repair the root-owned link before deploying; backend was not restarted" >&2
  exit 2
fi

if [[ "$previous" == "$release" ]]; then
  echo "revision $revision is already active"
  exit 0
fi

if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "unsafe path in deployment archive" >&2
  exit 2
fi

rm -rf -- "$release"
mkdir -p "$release"
tar -xzf "$archive" -C "$release" --no-same-owner --no-same-permissions

build="$release/client/build"
index="$build/index.html"
[[ -f "$index" ]] || { echo "client/build/index.html is missing" >&2; exit 2; }
mapfile -t js_assets < <(grep -oE 'assets/[A-Za-z0-9._-]+\.js' "$index" | sort -u)
mapfile -t wasm_assets < <(find "$build" -type f -name '*.wasm' -printf '%P\n' | sort)
((${#js_assets[@]} > 0)) || { echo "hashed JavaScript chunk is missing from index.html" >&2; exit 2; }
((${#wasm_assets[@]} > 0)) || { echo "CoreCrypto WASM asset is missing" >&2; exit 2; }
for asset in "${js_assets[@]}" "${wasm_assets[@]}"; do
  [[ -f "$build/$asset" ]] || { echo "referenced frontend asset is missing: $asset" >&2; exit 2; }
done

(cd "$release/server" && npm ci --omit=dev --no-audit --fund=false)
mkdir -p "$shared_uploads/attachments" "$shared_uploads/avatars"
rm -rf -- "$release/server/uploads"
ln -s "$shared_uploads" "$release/server/uploads"
ln -s "$shared_env" "$release/server/.env"

# Only the immutable frontend subtree is world-readable for nginx. Server code,
# the shared environment and uploads remain inaccessible to the public user.
chmod 0711 "$deploy_root" "$deploy_root/releases" "$release" "$release/client"
find "$build" -type d -exec chmod 0755 {} +
find "$build" -type f -exec chmod 0644 {} +
chmod -R o-rwx "$release/server"
chmod 0600 "$shared_env"

restart_pm2() {
  pm2 delete "$process_name" >/dev/null 2>&1 || true
  pm2 start "$current/server/server.js" --name "$process_name" --cwd "$current/server" --time || return 1
  pm2 save || return 1
}

wait_for_health() {
  local timeout_seconds=90
  local retry_delay=2
  local deadline=$((SECONDS + timeout_seconds))
  local pid=""

  while (( SECONDS < deadline )); do
    if curl --fail --silent --max-time 5 "$health_url" >/dev/null; then
      return 0
    fi

    pid=$(pm2 pid "$process_name" 2>/dev/null | tail -n 1 | tr -d '[:space:]')
    if [[ ! "$pid" =~ ^[1-9][0-9]*$ ]]; then
      echo "PM2 process $process_name exited before the health endpoint became ready" >&2
      pm2 describe "$process_name" >&2 || true
      return 1
    fi

    sleep "$retry_delay"
  done

  echo "health endpoint did not become ready within ${timeout_seconds}s: $health_url" >&2
  pm2 describe "$process_name" >&2 || true
  return 1
}

frontend_smoke() {
  local response_index="$tmp_dir/index.html"
  local js_headers="$tmp_dir/js.headers"
  local wasm_headers="$tmp_dir/wasm.headers"
  local active_public_target=""

  active_public_target=$(readlink -f "$public_link" 2>/dev/null || true)
  if [[ "$active_public_target" != "$release/client/build" ]]; then
    echo "frontend smoke failed: public link resolved to '${active_public_target:-unavailable}', expected '$release/client/build'" >&2
    return 1
  fi

  if ! curl --fail --silent --show-error -H "Host: $frontend_host" "$frontend_url/" -o "$response_index"; then
    echo "frontend smoke failed: Nginx index request failed for Host '$frontend_host'" >&2
    return 1
  fi
  if ! cmp -s "$index" "$response_index"; then
    echo "frontend smoke failed: Nginx index.html does not match revision $revision" >&2
    return 1
  fi
  if ! grep -Fq "${js_assets[0]}" "$response_index"; then
    echo "frontend smoke failed: active index.html does not reference ${js_assets[0]}" >&2
    return 1
  fi

  if ! curl --fail --silent --show-error --head -H "Host: $frontend_host" "$frontend_url/${js_assets[0]}" -o "$js_headers"; then
    echo "frontend smoke failed: JavaScript asset is unavailable: ${js_assets[0]}" >&2
    return 1
  fi
  if ! grep -Eiq '^Content-Type:[[:space:]]*(application|text)/(javascript|x-javascript)' "$js_headers"; then
    echo "frontend smoke failed: invalid JavaScript Content-Type for ${js_assets[0]}" >&2
    grep -Ei '^Content-Type:' "$js_headers" >&2 || true
    return 1
  fi

  if ! curl --fail --silent --show-error --head -H "Host: $frontend_host" "$frontend_url/${wasm_assets[0]}" -o "$wasm_headers"; then
    echo "frontend smoke failed: CoreCrypto WASM asset is unavailable: ${wasm_assets[0]}" >&2
    return 1
  fi
  if ! grep -Eiq '^Content-Type:[[:space:]]*application/wasm' "$wasm_headers"; then
    echo "frontend smoke failed: invalid WASM Content-Type for ${wasm_assets[0]}" >&2
    grep -Ei '^Content-Type:' "$wasm_headers" >&2 || true
    return 1
  fi
}

rollback() {
  if [[ -n "$previous" && -d "$previous" ]]; then
    rm -f -- "$deploy_root/current.rollback"
    ln -s "$previous" "$deploy_root/current.rollback"
    mv -Tf "$deploy_root/current.rollback" "$current"
    restart_pm2 || true
  else
    rm -f -- "$current"
    pm2 delete "$process_name" >/dev/null 2>&1 || true
  fi
}

rm -f -- "$deploy_root/current.next"
ln -s "$release" "$deploy_root/current.next"
mv -Tf "$deploy_root/current.next" "$current"

if ! restart_pm2 \
  || ! wait_for_health \
  || ! frontend_smoke; then
  rollback
  echo "deployment failed; backend and frontend were rolled back to the previous revision" >&2
  exit 1
fi

# Keep the active release plus six recent rollback candidates.
find "$deploy_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr | tail -n +8 | cut -d' ' -f2- | while IFS= read -r old; do
      [[ -n "$old" && "$old" != "$release" && "$old" != "$previous" ]] && rm -rf -- "$old"
    done

echo "atomically activated revision $revision"
