#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
installer="$repo_root/server/deploy/install-release.sh"
cleanup_script="$repo_root/server/deploy/cleanup-known-curl-artifacts.sh"
tmp_dir=$(mktemp -d)
cleanup() { rm -rf -- "$tmp_dir"; }
trap cleanup EXIT

old_revision=0000000000000000000000000000000000000000
failed_revision=1111111111111111111111111111111111111111
good_revision=2222222222222222222222222222222222222222
process_name=liotan-api

create_release_payload() {
  local target=$1
  local marker=$2
  mkdir -p "$target/server/scripts" "$target/client/build/assets"
  printf '{"name":"server","version":"50.1.0"}\n' >"$target/server/package.json"
  printf 'require("http");\n' >"$target/server/server.js"
  printf 'process.exitCode = 0;\n' >"$target/server/scripts/migrateCryptoState.js"
  printf 'process.exitCode = 0;\n' >"$target/server/scripts/migrateKeyTransparency.js"
  printf 'process.exitCode = 0;\n' >"$target/server/scripts/migrateMediaQuotaLifecycle.js"
  printf '<!doctype html><script type="module" src="/assets/index-%s.js"></script>\n' "$marker" >"$target/client/build/index.html"
  printf 'console.log("%s");\n' "$marker" >"$target/client/build/assets/index-$marker.js"
  printf '\0asm' >"$target/client/build/assets/core-$marker.wasm"
  if [[ "$marker" =~ ^[0-9a-f]{40}$ ]]; then
    printf '{"schema":"liotan-deployment/v1","version":"50.1.0","sourceSha":"%s"}\n' "$marker" >"$target/DEPLOYMENT-MANIFEST.json"
    printf '{"schema":"liotan-client-build/v1","version":"50.1.0","sourceSha":"%s","keyTransparencyPublicKey":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","keyTransparencyPublicKeyPinned":true}\n' "$marker" >"$target/client/build/build-meta.json"
  fi
}

create_archive() {
  local revision=$1
  local source="$tmp_dir/archive-$revision"
  local archive="$tmp_dir/$revision.tar.gz"
  rm -rf -- "$source"
  create_release_payload "$source" "$revision"
  tar -czf "$archive" -C "$source" server client DEPLOYMENT-MANIFEST.json
  printf '%s\n' "$archive"
}

make_atomic_fixture() {
  local name=$1
  local deploy_root="$tmp_dir/$name/deploy"
  local old_release="$deploy_root/releases/$old_revision"
  mkdir -p "$deploy_root/shared/uploads/attachments" "$deploy_root/shared/uploads/avatars" "$tmp_dir/$name/bin"
  printf 'test-only\n' >"$deploy_root/shared/server.env"
  printf 'persistent\n' >"$deploy_root/shared/uploads/sentinel"
  create_release_payload "$old_release" "$old_revision"
  ln -s "$deploy_root/shared/server.env" "$old_release/server/.env"
  ln -s "$deploy_root/shared/uploads" "$old_release/server/uploads"
  ln -s "$old_release" "$deploy_root/current"
  ln -s "$deploy_root/current/client/build" "$tmp_dir/$name/public-frontend"
  printf '%s\n' "$deploy_root"
}

install_mocks() {
  local name=$1
  local deploy_root=$2
  local bin="$tmp_dir/$name/bin"
  local state="$tmp_dir/$name/pm2.state"
  local log="$tmp_dir/$name/pm2.log"

  cat >"$bin/pm2" <<'MOCK_PM2'
#!/usr/bin/env bash
set -Eeuo pipefail
command=${1:-}
shift || true
case "$command" in
  jlist)
    IFS='|' read -r script cwd version status <"$MOCK_PM2_STATE"
    printf '[{"name":"%s","pm2_env":{"pm_exec_path":"%s","pm_cwd":"%s","version":"%s","status":"%s"}}]\n' \
      "$MOCK_PROCESS_NAME" "$script" "$cwd" "$version" "$status"
    ;;
  delete)
    printf 'delete:%s\n' "${1:-}" >>"$MOCK_PM2_LOG"
    ;;
  stop)
    printf 'stop:%s\n' "${1:-}" >>"$MOCK_PM2_LOG"
    ;;
  start)
    script=${1:-}
    shift || true
    cwd=""
    while (($#)); do
      case "$1" in
        --cwd) cwd=$2; shift 2 ;;
        *) shift ;;
      esac
    done
    target=$(readlink -f -- "$MOCK_DEPLOY_ROOT/current")
    revision=$(basename -- "$target")
    version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["version"])' "$target/server/package.json")
    printf '%s|%s|%s|online\n' "$script" "$cwd" "$version" >"$MOCK_PM2_STATE"
    printf 'start:%s\n' "$revision" >>"$MOCK_PM2_LOG"
    ;;
  save)
    printf 'save\n' >>"$MOCK_PM2_LOG"
    ;;
  pid)
    revision=$(basename -- "$(readlink -f -- "$MOCK_DEPLOY_ROOT/current")")
    if [[ -n "${MOCK_FAIL_REVISION:-}" && "$revision" == "$MOCK_FAIL_REVISION" ]]; then
      printf '0\n'
    else
      printf '1234\n'
    fi
    ;;
  describe)
    printf 'mock PM2 description\n' >&2
    ;;
  *)
    echo "unexpected mock pm2 command: $command" >&2
    exit 2
    ;;
esac
MOCK_PM2

  cat >"$bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
output=""
head_request=0
url=""
while (($#)); do
  case "$1" in
    --output|-o) output=$2; shift 2 ;;
    --header|-H|--max-time) shift 2 ;;
    --head) head_request=1; shift ;;
    --fail|--silent|--show-error) shift ;;
    http://*|https://*) url=$1; shift ;;
    *) echo "unexpected mock curl argument: $1" >&2; exit 2 ;;
  esac
done

target=$(readlink -f -- "$MOCK_DEPLOY_ROOT/current")
revision=$(basename -- "$target")
if [[ "$url" == *"/health" ]]; then
  [[ -z "${MOCK_FAIL_REVISION:-}" || "$revision" != "$MOCK_FAIL_REVISION" ]]
  exit
fi

[[ -n "$output" ]] || { echo "mock frontend curl requires --output" >&2; exit 2; }
if [[ "$head_request" -eq 1 ]]; then
  if [[ "$url" == *.wasm ]]; then
    printf 'Content-Type: application/wasm\r\n' >"$output"
  else
    printf 'Content-Type: application/javascript\r\n' >"$output"
  fi
else
  cp "$target/client/build/index.html" "$output"
fi
MOCK_CURL

  cat >"$bin/npm" <<'MOCK_NPM'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${1:-}" == "ci" ]] || { echo "unexpected mock npm command" >&2; exit 2; }
MOCK_NPM

  cat >"$bin/node" <<'MOCK_NODE'
#!/usr/bin/env bash
set -Eeuo pipefail
case "${1:-}" in
  -) cat >/dev/null ;;
  scripts/migrateCryptoState.js|scripts/migrateKeyTransparency.js|scripts/migrateMediaQuotaLifecycle.js)
    [[ "${2:-}" == "--apply" ]]
    ;;
  *) echo "unexpected mock node command: ${1:-}" >&2; exit 2 ;;
esac
MOCK_NODE

  chmod +x "$bin/pm2" "$bin/curl" "$bin/node" "$bin/npm"
  printf '%s|%s|50.1.0|online\n' \
    "$deploy_root/current/server/server.js" \
    "$deploy_root/current/server" >"$state"
  : >"$log"
}

run_installer() {
  local name=$1
  local deploy_root=$2
  local archive=$3
  local revision=$4
  local fail_revision=${5:-}
  PATH="$tmp_dir/$name/bin:$PATH" \
  MOCK_DEPLOY_ROOT="$deploy_root" \
  MOCK_PROCESS_NAME="$process_name" \
  MOCK_PM2_STATE="$tmp_dir/$name/pm2.state" \
  MOCK_PM2_LOG="$tmp_dir/$name/pm2.log" \
  MOCK_FAIL_REVISION="$fail_revision" \
    bash "$installer" \
      "$archive" \
      "$deploy_root" \
      "$process_name" \
      "http://127.0.0.1:3001/health" \
      "$revision" \
      "http://127.0.0.1:8080" \
      "tunnel.liotan.com" \
      "$tmp_dir/$name/public-frontend"
}

test_public_link_fails_before_pm2() {
  local name=bad-public-link
  local deploy_root
  local archive="$tmp_dir/$name/placeholder.tar.gz"
  deploy_root=$(make_atomic_fixture "$name")
  install_mocks "$name" "$deploy_root"
  rm -f -- "$tmp_dir/$name/public-frontend"
  ln -s "$deploy_root/releases/$old_revision/client/build" "$tmp_dir/$name/public-frontend"
  touch "$archive"

  set +e
  output=$(run_installer "$name" "$deploy_root" "$archive" "$old_revision" 2>&1)
  status=$?
  set -e

  [[ "$status" -eq 2 ]] || { echo "expected public link preflight exit 2, got $status" >&2; exit 1; }
  [[ "$output" == *"PUBLIC_FRONTEND_LINK is not wired to the atomic current release"* ]] || { echo "missing frontend link diagnostic" >&2; exit 1; }
  [[ ! -s "$tmp_dir/$name/pm2.log" ]] || { echo "PM2 mutated before frontend link preflight" >&2; exit 1; }
}

test_current_outside_releases_fails_before_pm2() {
  local name=bad-current
  local deploy_root
  local archive="$tmp_dir/$name/placeholder.tar.gz"
  local outside="$tmp_dir/$name/outside/$old_revision"
  deploy_root=$(make_atomic_fixture "$name")
  install_mocks "$name" "$deploy_root"
  create_release_payload "$outside" outside
  ln -s "$deploy_root/shared/server.env" "$outside/server/.env"
  ln -s "$deploy_root/shared/uploads" "$outside/server/uploads"
  rm -f -- "$deploy_root/current"
  ln -s "$outside" "$deploy_root/current"
  touch "$archive"

  set +e
  output=$(run_installer "$name" "$deploy_root" "$archive" "$old_revision" 2>&1)
  status=$?
  set -e

  [[ "$status" -eq 2 ]] || { echo "expected invalid current exit 2, got $status" >&2; exit 1; }
  [[ "$output" == *"current target is outside"* ]] || { echo "missing current containment diagnostic" >&2; exit 1; }
  [[ ! -s "$tmp_dir/$name/pm2.log" ]] || { echo "PM2 mutated with current outside releases" >&2; exit 1; }
  [[ -d "$deploy_root/releases/$old_revision" ]] || { echo "preflight cleanup removed an existing release" >&2; exit 1; }
}

test_invalid_candidate_fails_before_pm2_restart() {
  local name=bad-candidate
  local deploy_root
  local archive="$tmp_dir/$name/bad-candidate.tar.gz"
  local source="$tmp_dir/$name/source"
  deploy_root=$(make_atomic_fixture "$name")
  install_mocks "$name" "$deploy_root"
  mkdir -p "$source/client/build/assets"
  printf '<!doctype html><script src="/assets/index.js"></script>\n' >"$source/client/build/index.html"
  printf 'console.log(1);\n' >"$source/client/build/assets/index.js"
  printf '\0asm' >"$source/client/build/assets/core.wasm"
  tar -czf "$archive" -C "$source" client

  set +e
  output=$(run_installer "$name" "$deploy_root" "$archive" "$failed_revision" 2>&1)
  status=$?
  set -e

  [[ "$status" -eq 2 ]] || { echo "expected invalid candidate exit 2, got $status" >&2; exit 1; }
  [[ "$(readlink -f -- "$deploy_root/current")" == "$deploy_root/releases/$old_revision" ]] || { echo "invalid candidate changed current" >&2; exit 1; }
  [[ ! -s "$tmp_dir/$name/pm2.log" ]] || { echo "PM2 restarted for an unverified candidate" >&2; exit 1; }
  [[ ! -d "$deploy_root/releases/$failed_revision" ]] || { echo "invalid candidate release was not removed" >&2; exit 1; }
  [[ "$output" == *"server release payload is incomplete"* ]] || { echo "missing invalid candidate diagnostic" >&2; exit 1; }
}

test_missing_wasm_fails_before_pm2_restart() {
  local name=missing-wasm
  local deploy_root
  local archive="$tmp_dir/$name/missing-wasm.tar.gz"
  local source="$tmp_dir/$name/source"
  deploy_root=$(make_atomic_fixture "$name")
  install_mocks "$name" "$deploy_root"
  create_release_payload "$source" "$failed_revision"
  rm -- "$source/client/build/assets/core-$failed_revision.wasm"
  tar -czf "$archive" -C "$source" server client DEPLOYMENT-MANIFEST.json

  set +e
  output=$(run_installer "$name" "$deploy_root" "$archive" "$failed_revision" 2>&1)
  status=$?
  set -e

  [[ "$status" -eq 2 ]] || { echo "expected missing WASM exit 2, got $status" >&2; exit 1; }
  [[ "$output" == *"CoreCrypto WASM asset is missing"* ]] || { echo "missing WASM diagnostic not emitted" >&2; exit 1; }
  [[ "$(readlink -f -- "$deploy_root/current")" == "$deploy_root/releases/$old_revision" ]] || { echo "missing WASM candidate changed current" >&2; exit 1; }
  [[ ! -s "$tmp_dir/$name/pm2.log" ]] || { echo "PM2 restarted for candidate without WASM" >&2; exit 1; }
}

test_wrong_pm2_path_fails_before_switch() {
  local name=bad-pm2-path
  local deploy_root
  local archive="$tmp_dir/$name/placeholder.tar.gz"
  deploy_root=$(make_atomic_fixture "$name")
  install_mocks "$name" "$deploy_root"
  printf '%s|%s|50.1.0|online\n' \
    "$deploy_root/releases/$old_revision/server/server.js" \
    "$deploy_root/releases/$old_revision/server" >"$tmp_dir/$name/pm2.state"
  touch "$archive"

  set +e
  output=$(run_installer "$name" "$deploy_root" "$archive" "$failed_revision" 2>&1)
  status=$?
  set -e

  [[ "$status" -eq 2 ]] || { echo "expected bad PM2 path exit 2, got $status" >&2; exit 1; }
  [[ "$output" == *"PM2 script path is not"* ]] || { echo "missing PM2 path diagnostic" >&2; exit 1; }
  [[ "$(readlink -f -- "$deploy_root/current")" == "$deploy_root/releases/$old_revision" ]] || { echo "bad PM2 preflight changed current" >&2; exit 1; }
  [[ ! -s "$tmp_dir/$name/pm2.log" ]] || { echo "bad PM2 preflight mutated PM2" >&2; exit 1; }
}

test_failed_health_rolls_back_verified_release() {
  local name=rollback
  local deploy_root
  local archive
  deploy_root=$(make_atomic_fixture "$name")
  install_mocks "$name" "$deploy_root"
  archive=$(create_archive "$failed_revision")

  set +e
  output=$(run_installer "$name" "$deploy_root" "$archive" "$failed_revision" "$failed_revision" 2>&1)
  status=$?
  set -e

  [[ "$status" -eq 1 ]] || { echo "expected failed deployment exit 1, got $status" >&2; echo "$output" >&2; exit 1; }
  [[ "$(readlink -f -- "$deploy_root/current")" == "$deploy_root/releases/$old_revision" ]] || { echo "current was not rolled back" >&2; exit 1; }
  grep -Fxq "start:$failed_revision" "$tmp_dir/$name/pm2.log" || { echo "candidate PM2 start was not recorded" >&2; exit 1; }
  grep -Fxq "start:$old_revision" "$tmp_dir/$name/pm2.log" || { echo "rollback PM2 start was not recorded" >&2; exit 1; }
  [[ "$(grep -c '^save$' "$tmp_dir/$name/pm2.log")" -eq 1 ]] || { echo "only verified rollback state may be persisted" >&2; exit 1; }
  [[ ! -d "$deploy_root/releases/$failed_revision" ]] || { echo "failed candidate release was not removed" >&2; exit 1; }
  [[ -f "$deploy_root/shared/uploads/sentinel" && -f "$deploy_root/shared/server.env" ]] || { echo "shared runtime data was damaged during rollback" >&2; exit 1; }
  [[ "$output" == *"restored to revision $old_revision"* ]] || { echo "missing verified rollback diagnostic" >&2; exit 1; }
}

test_success_verifies_current_pm2_and_shared_data() {
  local name=success
  local deploy_root
  local archive
  deploy_root=$(make_atomic_fixture "$name")
  install_mocks "$name" "$deploy_root"
  archive=$(create_archive "$good_revision")

  output=$(run_installer "$name" "$deploy_root" "$archive" "$good_revision" 2>&1)
  [[ "$(readlink -f -- "$deploy_root/current")" == "$deploy_root/releases/$good_revision" ]] || { echo "successful current target mismatch" >&2; exit 1; }
  grep -Fxq "start:$good_revision" "$tmp_dir/$name/pm2.log" || { echo "successful PM2 start was not recorded" >&2; exit 1; }
  [[ "$(grep -c '^save$' "$tmp_dir/$name/pm2.log")" -eq 1 ]] || { echo "verified deployment must persist PM2 once" >&2; exit 1; }
  [[ -L "$deploy_root/releases/$good_revision/server/.env" && -L "$deploy_root/releases/$good_revision/server/uploads" ]] || { echo "candidate persistent links are missing" >&2; exit 1; }
  [[ -f "$deploy_root/shared/uploads/sentinel" && -f "$deploy_root/shared/server.env" ]] || { echo "shared runtime data was damaged" >&2; exit 1; }
  [[ "$output" == *"atomically activated and verified revision $good_revision"* ]] || { echo "missing successful invariant diagnostic" >&2; exit 1; }
}

test_known_artifact_cleanup_is_bounded() {
  local checkout="$tmp_dir/cleanup-checkout"
  mkdir -p "$checkout/server"
  git -C "$checkout" init -q
  touch "$checkout/server/--retry" "$checkout/server/--retry-connrefused" "$checkout/server/--retry-delay"
  printf 'preserve\n' >"$checkout/server/unrelated-untracked-file"

  bash "$cleanup_script" "$checkout" >/dev/null

  [[ ! -e "$checkout/server/--retry" && ! -e "$checkout/server/--retry-connrefused" && ! -e "$checkout/server/--retry-delay" ]] || { echo "known curl artifacts were not removed" >&2; exit 1; }
  [[ -f "$checkout/server/unrelated-untracked-file" ]] || { echo "bounded cleanup removed an unrelated file" >&2; exit 1; }

  printf 'do not delete\n' >"$checkout/server/--retry"
  set +e
  bash "$cleanup_script" "$checkout" >/dev/null 2>&1
  status=$?
  set -e
  [[ "$status" -eq 2 && -s "$checkout/server/--retry" ]] || { echo "cleanup did not refuse a non-empty artifact" >&2; exit 1; }
}

test_public_link_fails_before_pm2
test_current_outside_releases_fails_before_pm2
test_invalid_candidate_fails_before_pm2_restart
test_missing_wasm_fails_before_pm2_restart
test_wrong_pm2_path_fails_before_switch
test_failed_health_rolls_back_verified_release
test_success_verifies_current_pm2_and_shared_data
test_known_artifact_cleanup_is_bounded

echo "Deployment invariant, rollback, persistence, and bounded-cleanup regressions passed."
