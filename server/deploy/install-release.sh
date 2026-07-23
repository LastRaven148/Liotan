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
legacy_checkout=/home/liotan/apps/Liotan

[[ -f "$archive" ]] || { echo "deployment archive not found" >&2; exit 2; }
[[ "$deploy_root" == /* && "$deploy_root" != "/" ]] || { echo "DEPLOY_ROOT must be an absolute non-root path" >&2; exit 2; }
case "$deploy_root/" in
  "$legacy_checkout/"*)
    echo "the legacy checkout must not be used as DEPLOY_ROOT: $legacy_checkout" >&2
    exit 2
    ;;
esac
[[ "$process_name" =~ ^[A-Za-z0-9_.@-]+$ ]] || { echo "invalid PM2 process name" >&2; exit 2; }
[[ "$health_url" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?/ ]] || { echo "HEALTH_URL must use loopback HTTP(S)" >&2; exit 2; }
[[ "$frontend_url" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?$ ]] || { echo "FRONTEND_SMOKE_URL must use loopback HTTP(S)" >&2; exit 2; }
[[ "$frontend_host" =~ ^[A-Za-z0-9.-]{1,253}$ ]] || { echo "invalid frontend Host header" >&2; exit 2; }
[[ "$public_link" == /* && "$public_link" != "/" ]] || { echo "PUBLIC_FRONTEND_LINK must be absolute" >&2; exit 2; }
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid revision" >&2; exit 2; }
for required_command in curl flock node npm pm2 python3; do
  command -v "$required_command" >/dev/null 2>&1 || { echo "$required_command is required" >&2; exit 2; }
done

mkdir -p "$deploy_root/releases"
[[ ! -L "$deploy_root" ]] || { echo "DEPLOY_ROOT must not be a symbolic link" >&2; exit 2; }
[[ -d "$deploy_root/releases" && ! -L "$deploy_root/releases" ]] || { echo "releases must be a real directory inside DEPLOY_ROOT" >&2; exit 2; }
exec 9>"$deploy_root/.deploy.lock"
flock -n 9 || { echo "another Liotan deployment is already running" >&2; exit 3; }

releases_root=$(readlink -f -- "$deploy_root/releases")
release="$releases_root/$revision"
current="$deploy_root/current"
shared="$deploy_root/shared"
shared_env="$shared/server.env"
shared_uploads="$shared/uploads"
previous=""
previous_revision=""
active_target=""
active_revision=""
deployment_succeeded=0
candidate_prepared=0
backend_stopped=0
frontend_build=""
frontend_index=""
frontend_js_assets=()
frontend_wasm_assets=()
candidate_transparency_public_key=""

[[ -d "$shared" && ! -L "$shared" ]] || { echo "shared must be a real directory outside releases" >&2; exit 2; }
[[ -f "$shared_env" && ! -L "$shared_env" ]] || { echo "shared production environment not found or is a symlink: $shared_env" >&2; exit 2; }
mkdir -p "$shared_uploads/attachments" "$shared_uploads/avatars"
[[ -d "$shared_uploads" && ! -L "$shared_uploads" ]] || { echo "shared uploads must be a real directory" >&2; exit 2; }

tmp_dir=$(mktemp -d)
cleanup() {
  local current_target=""
  current_target=$(readlink -f -- "$current" 2>/dev/null || true)
  if [[ "$backend_stopped" -eq 1 && -n "$current_target" && -f "$current_target/server/server.js" ]]; then
    pm2 delete "$process_name" >/dev/null 2>&1 || true
    pm2 start "$current/server/server.js" --name "$process_name" --cwd "$current/server" --time >/dev/null 2>&1 || true
  fi
  if [[ "$candidate_prepared" -eq 1 && "$deployment_succeeded" -ne 1 && -d "$release" && "$release" != "$previous" && "$current_target" != "$release" ]]; then
    rm -rf -- "$release"
  fi
  rm -rf -- "$tmp_dir"
  rm -f -- "$archive"
}
trap cleanup EXIT

fail_invariant() {
  local phase=$1
  shift
  echo "$phase invariant failed: $*" >&2
  return 1
}

resolve_current() {
  local phase=$1
  local expected_revision=${2:-}
  local target=""
  local target_revision=""

  [[ -L "$current" ]] || fail_invariant "$phase" "current is not a symbolic link" || return 1
  target=$(readlink -f -- "$current" 2>/dev/null || true)
  [[ -n "$target" && -d "$target" ]] || fail_invariant "$phase" "current target is missing" || return 1
  case "$target" in
    "$releases_root"/*) ;;
    *) fail_invariant "$phase" "current target is outside $releases_root"; return 1 ;;
  esac

  target_revision=$(basename -- "$target")
  [[ "$target_revision" =~ ^[0-9a-f]{40}$ ]] || fail_invariant "$phase" "current target basename is not a Git SHA" || return 1
  [[ "$target" == "$releases_root/$target_revision" ]] || fail_invariant "$phase" "current target is not a direct child of releases" || return 1
  if [[ -n "$expected_revision" && "$target_revision" != "$expected_revision" ]]; then
    fail_invariant "$phase" "active revision $target_revision does not match expected $expected_revision"
    return 1
  fi

  active_target=$target
  active_revision=$target_revision
}

package_version() {
  local package_file=$1
  python3 - "$package_file" <<'PYTHON'
import json
import pathlib
import sys

value = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")).get("version")
if not isinstance(value, str) or not value or any(char in value for char in "\r\n\t"):
    raise SystemExit(2)
sys.stdout.write(value)
PYTHON
}

validate_release_layout() {
  local phase=$1
  local target=$2
  local env_target=""
  local uploads_target=""

  [[ -f "$target/server/server.js" ]] || fail_invariant "$phase" "server/server.js is missing" || return 1
  [[ -f "$target/server/package.json" ]] || fail_invariant "$phase" "server/package.json is missing" || return 1
  [[ -f "$target/client/build/index.html" ]] || fail_invariant "$phase" "client/build/index.html is missing" || return 1
  package_version "$target/server/package.json" >/dev/null || fail_invariant "$phase" "server package version is invalid" || return 1

  [[ -L "$target/server/.env" ]] || fail_invariant "$phase" "server/.env is not linked to shared storage" || return 1
  env_target=$(readlink -f -- "$target/server/.env" 2>/dev/null || true)
  [[ "$env_target" == "$(readlink -f -- "$shared_env")" ]] || fail_invariant "$phase" "server/.env does not resolve to shared/server.env" || return 1

  [[ -L "$target/server/uploads" ]] || fail_invariant "$phase" "server/uploads is not linked to shared storage" || return 1
  uploads_target=$(readlink -f -- "$target/server/uploads" 2>/dev/null || true)
  [[ "$uploads_target" == "$(readlink -f -- "$shared_uploads")" ]] || fail_invariant "$phase" "server/uploads does not resolve to shared/uploads" || return 1
}

read_pm2_metadata() {
  local metadata_file="$tmp_dir/pm2.json"
  pm2 jlist >"$metadata_file" || return 1
  chmod 0600 "$metadata_file"
  python3 - "$metadata_file" "$process_name" <<'PYTHON'
import json
import pathlib
import sys

processes = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
entry = next((item for item in processes if item and item.get("name") == sys.argv[2]), None)
if not entry or not isinstance(entry.get("pm2_env"), dict):
    raise SystemExit(2)
environment = entry["pm2_env"]
values = [environment.get(key) for key in ("pm_exec_path", "pm_cwd", "version", "status")]
if any(not isinstance(value, str) or any(char in value for char in "\r\n\t") for value in values):
    raise SystemExit(3)
sys.stdout.write("\t".join(values))
PYTHON
}

validate_pm2_runtime() {
  local phase=$1
  local target=$2
  local expected_version=""
  local metadata=""
  local actual_script=""
  local actual_cwd=""
  local actual_version=""
  local actual_status=""

  expected_version=$(package_version "$target/server/package.json") || fail_invariant "$phase" "cannot read expected server version" || return 1
  metadata=$(read_pm2_metadata) || fail_invariant "$phase" "cannot read sanitized PM2 metadata" || return 1
  IFS=$'\t' read -r actual_script actual_cwd actual_version actual_status <<<"$metadata"

  [[ "$actual_script" == "$current/server/server.js" ]] || fail_invariant "$phase" "PM2 script path is not $current/server/server.js" || return 1
  [[ "$actual_cwd" == "$current/server" ]] || fail_invariant "$phase" "PM2 exec cwd is not $current/server" || return 1
  [[ "$actual_version" == "$expected_version" ]] || fail_invariant "$phase" "running version $actual_version does not match package.json $expected_version" || return 1
  [[ "$actual_status" == "online" ]] || fail_invariant "$phase" "PM2 status is $actual_status, expected online" || return 1
}

health_check_once() {
  curl \
    --fail \
    --silent \
    --show-error \
    --max-time 5 \
    --output /dev/null \
    "$health_url"
}

wait_for_health() {
  local timeout_seconds=90
  local retry_delay=2
  local deadline=$((SECONDS + timeout_seconds))
  local pid=""

  while (( SECONDS < deadline )); do
    if health_check_once 2>/dev/null; then
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

validate_frontend_assets() {
  local phase=$1
  local target=$2
  frontend_build="$target/client/build"
  frontend_index="$frontend_build/index.html"
  frontend_js_assets=()
  frontend_wasm_assets=()

  [[ -f "$frontend_index" ]] || fail_invariant "$phase" "client/build/index.html is missing" || return 1
  [[ ! -f "$frontend_build/test/production/fixture.html" ]] || fail_invariant "$phase" "test-only production fixture is present" || return 1
  if find "$frontend_build/assets" -maxdepth 1 -type f -name 'productionCrypto-*.js' -print -quit | grep -q .; then
    fail_invariant "$phase" "test-only productionCrypto chunk is present"
    return 1
  fi
  mapfile -t frontend_js_assets < <(grep -oE 'assets/[A-Za-z0-9._-]+\.js' "$frontend_index" | sort -u)
  mapfile -t frontend_wasm_assets < <(find "$frontend_build" -type f -name '*.wasm' -printf '%P\n' | sort)
  ((${#frontend_js_assets[@]} > 0)) || fail_invariant "$phase" "hashed JavaScript chunk is missing from index.html" || return 1
  ((${#frontend_wasm_assets[@]} > 0)) || fail_invariant "$phase" "CoreCrypto WASM asset is missing" || return 1
  for asset in "${frontend_js_assets[@]}" "${frontend_wasm_assets[@]}"; do
    [[ -f "$frontend_build/$asset" ]] || fail_invariant "$phase" "referenced frontend asset is missing: $asset" || return 1
  done
}

validate_candidate_provenance() {
  local target=$1
  local expected_revision=$2
  local deployment_manifest="$target/DEPLOYMENT-MANIFEST.json"
  local client_manifest="$target/client/build/build-meta.json"
  local package_file="$target/server/package.json"

  [[ -f "$deployment_manifest" ]] || fail_invariant "candidate provenance" "DEPLOYMENT-MANIFEST.json is missing" || return 1
  [[ -f "$client_manifest" ]] || fail_invariant "candidate provenance" "client build-meta.json is missing" || return 1
  candidate_transparency_public_key=$(
    python3 - "$deployment_manifest" "$client_manifest" "$package_file" "$expected_revision" <<'PYTHON'
import json
import pathlib
import re
import sys

deployment = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
client = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
package = json.loads(pathlib.Path(sys.argv[3]).read_text(encoding="utf-8"))
revision = sys.argv[4]
version = package.get("version")
if deployment != {
    "schema": "liotan-deployment/v1",
    "version": version,
    "sourceSha": revision,
}:
    raise SystemExit("deployment manifest does not bind the candidate revision and version")
if client.get("schema") != "liotan-client-build/v1":
    raise SystemExit("client build provenance schema is invalid")
if client.get("version") != version or client.get("sourceSha") != revision:
    raise SystemExit("client build does not bind the candidate revision and version")
public_key = client.get("keyTransparencyPublicKey")
if client.get("keyTransparencyPublicKeyPinned") is not True or not isinstance(public_key, str) \
        or re.fullmatch(r"[A-Za-z0-9_-]{43}", public_key) is None:
    raise SystemExit("client build has no valid Key Transparency public-key pin")
sys.stdout.write(public_key)
PYTHON
  ) || fail_invariant "candidate provenance" "manifest verification failed" || return 1
  if find "$target/client/build" -type f -name '*.map' -print -quit | grep -q .; then
    fail_invariant "candidate provenance" "public source maps are forbidden"
    return 1
  fi
}

validate_frontend() {
  local phase=$1
  local target=$2
  local expected_revision=$3
  local response_index="$tmp_dir/$phase.index.html"
  local js_headers="$tmp_dir/$phase.js.headers"
  local wasm_headers="$tmp_dir/$phase.wasm.headers"
  local active_public_target=""

  validate_frontend_assets "$phase assets" "$target" || return 1

  active_public_target=$(readlink -f -- "$public_link" 2>/dev/null || true)
  [[ "$active_public_target" == "$target/client/build" ]] || fail_invariant "$phase" "public link does not resolve to revision $expected_revision" || return 1

  if ! curl \
    --fail \
    --silent \
    --show-error \
    --header "Host: $frontend_host" \
    --output "$response_index" \
    "$frontend_url/"; then
    fail_invariant "$phase" "Nginx index request failed for Host $frontend_host"
    return 1
  fi
  cmp -s "$frontend_index" "$response_index" || fail_invariant "$phase" "Nginx index.html does not match revision $expected_revision" || return 1
  grep -Fq "${frontend_js_assets[0]}" "$response_index" || fail_invariant "$phase" "active index does not reference ${frontend_js_assets[0]}" || return 1

  if ! curl \
    --fail \
    --silent \
    --show-error \
    --head \
    --header "Host: $frontend_host" \
    --output "$js_headers" \
    "$frontend_url/${frontend_js_assets[0]}"; then
    fail_invariant "$phase" "JavaScript asset is unavailable: ${frontend_js_assets[0]}"
    return 1
  fi
  grep -Eiq '^Content-Type:[[:space:]]*(application|text)/(javascript|x-javascript)' "$js_headers" || fail_invariant "$phase" "invalid JavaScript Content-Type" || return 1

  if ! curl \
    --fail \
    --silent \
    --show-error \
    --head \
    --header "Host: $frontend_host" \
    --output "$wasm_headers" \
    "$frontend_url/${frontend_wasm_assets[0]}"; then
    fail_invariant "$phase" "CoreCrypto WASM asset is unavailable: ${frontend_wasm_assets[0]}"
    return 1
  fi
  grep -Eiq '^Content-Type:[[:space:]]*application/wasm' "$wasm_headers" || fail_invariant "$phase" "invalid WASM Content-Type" || return 1
}

restart_pm2() {
  pm2 delete "$process_name" >/dev/null 2>&1 || true
  pm2 start "$current/server/server.js" --name "$process_name" --cwd "$current/server" --time || return 1
}

switch_current() {
  local target=$1
  local temporary_link=$2
  rm -f -- "$temporary_link"
  ln -s "$target" "$temporary_link"
  mv -Tf "$temporary_link" "$current"
}

rollback() {
  if [[ -z "$previous" || ! -d "$previous" ]]; then
    echo "rollback failed: previous release is unavailable" >&2
    return 1
  fi

  switch_current "$previous" "$deploy_root/current.rollback" || return 1
  resolve_current "rollback current" "$previous_revision" || return 1
  validate_release_layout "rollback release" "$previous" || return 1
  restart_pm2 || return 1
  wait_for_health || return 1
  validate_pm2_runtime "rollback PM2" "$previous" || return 1
  validate_frontend "rollback frontend" "$previous" "$previous_revision" || return 1
  pm2 save || return 1
  backend_stopped=0
}

expected_public_target="$current/client/build"
actual_public_target=$(readlink "$public_link" 2>/dev/null || true)
if [[ "$actual_public_target" != "$expected_public_target" ]]; then
  echo "PUBLIC_FRONTEND_LINK is not wired to the atomic current release" >&2
  echo "expected symlink: $public_link -> $expected_public_target" >&2
  echo "actual target: ${actual_public_target:-not a readable symbolic link}" >&2
  echo "repair the root-owned link before deploying; backend was not restarted" >&2
  exit 2
fi

resolve_current "preflight current" || exit 2
previous=$active_target
previous_revision=$active_revision
validate_release_layout "preflight release" "$previous" || exit 2
validate_pm2_runtime "preflight PM2" "$previous" || exit 2
health_check_once || { echo "preflight health check failed; current was not changed" >&2; exit 2; }
validate_frontend "preflight frontend" "$previous" "$previous_revision" || exit 2

if [[ "$previous" == "$release" ]]; then
  deployment_succeeded=1
  echo "revision $revision is already active and all deployment invariants passed"
  exit 0
fi

if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "unsafe path in deployment archive" >&2
  exit 2
fi

rm -rf -- "$release"
mkdir -p "$release"
candidate_prepared=1
tar -xzf "$archive" -C "$release" --no-same-owner --no-same-permissions

build="$release/client/build"
[[ -f "$build/index.html" ]] || { echo "client/build/index.html is missing" >&2; exit 2; }
[[ -f "$release/server/server.js" && -f "$release/server/package.json" ]] || { echo "server release payload is incomplete" >&2; exit 2; }
[[ -f "$release/server/scripts/migrateCryptoState.js" ]] || { echo "crypto state migration is missing from the candidate release" >&2; exit 2; }
[[ -f "$release/server/scripts/migrateKeyTransparency.js" ]] || { echo "key transparency migration is missing from the candidate release" >&2; exit 2; }
[[ -f "$release/server/scripts/migrateMediaQuotaLifecycle.js" ]] || { echo "media quota migration is missing from the candidate release" >&2; exit 2; }
[[ ! -e "$release/server/.env" && ! -L "$release/server/.env" ]] || { echo "deployment archive must not contain server/.env" >&2; exit 2; }
validate_candidate_provenance "$release" "$revision" || exit 2

(cd "$release/server" && npm ci --omit=dev --no-audit --fund=false)
rm -rf -- "$release/server/uploads"
ln -s "$shared_uploads" "$release/server/uploads"
ln -s "$shared_env" "$release/server/.env"

# Only the immutable frontend subtree is world-readable for nginx. Server code,
# shared runtime data and secrets remain inaccessible to the public user.
chmod 0711 "$deploy_root" "$deploy_root/releases" "$release" "$release/client"
find "$build" -type d -exec chmod 0755 {} +
find "$build" -type f -exec chmod 0644 {} +
chmod -R o-rwx "$release/server"
chmod 0600 "$shared_env"

validate_release_layout "candidate release" "$release" || exit 2
validate_frontend_assets "candidate frontend" "$release" || exit 2

# The old backend is stopped before forward-compatible migrations so an older
# binary cannot create untracked directory/media state during backfill. All
# migrations are additive or preserve old-reader compatibility, so the
# verified previous binary remains a valid rollback.
mkdir -p "$shared/migration-backups"
chmod 0700 "$shared/migration-backups"
pm2 stop "$process_name"
backend_stopped=1
if ! (
  cd "$release/server"
  node - "$candidate_transparency_public_key" <<'NODE'
  require("dotenv").config();
  const expected = process.argv[2];
  const actual = require("./security/keyTransparency").signingMaterial().publicKey;
  if (actual !== expected) throw new Error("server Key Transparency key does not match the pinned client key");
NODE
  LIOTAN_CRYPTO_MIGRATION_CONFIRM=APPLY_50_1_0_CRYPTO_STATE_MIGRATION \
  LIOTAN_MIGRATION_BACKUP_DIR="$shared/migration-backups" \
    node scripts/migrateCryptoState.js --apply
  LIOTAN_KEY_TRANSPARENCY_MIGRATION_CONFIRM=APPLY_50_2_0_KEY_TRANSPARENCY_MIGRATION \
    node scripts/migrateKeyTransparency.js --apply
  LIOTAN_MEDIA_QUOTA_MIGRATION_CONFIRM=APPLY_50_3_0_MEDIA_QUOTA_LIFECYCLE \
  LIOTAN_MAINTENANCE_MODE=true \
    node scripts/migrateMediaQuotaLifecycle.js --apply
); then
  if restart_pm2 && wait_for_health && validate_pm2_runtime "migration rollback PM2" "$previous"; then
    backend_stopped=0
    echo "candidate migration failed; verified previous backend was restored" >&2
  else
    echo "CRITICAL: candidate migration failed and previous backend could not be restored" >&2
  fi
  exit 1
fi

switch_current "$release" "$deploy_root/current.next"
if ! resolve_current "post-switch current" "$revision" \
  || ! validate_release_layout "post-switch release" "$release" \
  || ! restart_pm2 \
  || ! wait_for_health \
  || ! validate_pm2_runtime "post-deploy PM2" "$release" \
  || ! validate_frontend "post-deploy frontend" "$release" "$revision" \
  || ! pm2 save; then
  if rollback; then
    echo "deployment failed; current and PM2 were restored to revision $previous_revision" >&2
  else
    echo "CRITICAL: deployment and verified rollback both failed; inspect current and PM2 immediately" >&2
  fi
  exit 1
fi

deployment_succeeded=1
backend_stopped=0

# Keep the active release plus six recent rollback candidates. The shared tree
# is outside releases and cannot be selected by this bounded rotation.
find "$releases_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr | tail -n +8 | cut -d' ' -f2- | while IFS= read -r old; do
      [[ -n "$old" && "$old" != "$release" && "$old" != "$previous" ]] || continue
      old_real=$(readlink -f -- "$old" 2>/dev/null || true)
      old_revision=$(basename -- "$old_real" 2>/dev/null || true)
      if [[ "$old_real" == "$releases_root/$old_revision" && "$old_revision" =~ ^[0-9a-f]{40}$ ]]; then
        rm -rf -- "$old_real"
      else
        echo "skipping unsafe release rotation candidate: $old" >&2
      fi
    done

echo "atomically activated and verified revision $revision"
