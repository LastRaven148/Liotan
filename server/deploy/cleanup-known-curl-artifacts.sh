#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

checkout=${1:-}
[[ "$checkout" == /* && "$checkout" != "/" ]] || {
  echo "usage: $0 /absolute/path/to/legacy-checkout" >&2
  exit 2
}

command -v git >/dev/null 2>&1 || { echo "git is required" >&2; exit 2; }

checkout_real=$(readlink -f -- "$checkout" 2>/dev/null || true)
[[ -n "$checkout_real" && -d "$checkout_real/server" ]] || {
  echo "checkout does not contain a server directory: $checkout" >&2
  exit 2
}

git_root=$(git -C "$checkout_real" rev-parse --show-toplevel 2>/dev/null || true)
git_root=$(readlink -f -- "$git_root" 2>/dev/null || true)
[[ "$git_root" == "$checkout_real" ]] || {
  echo "refusing cleanup outside an exact Git worktree root" >&2
  exit 2
}

artifacts=(
  --retry
  --retry-connrefused
  --retry-delay
)

removed=0
for artifact in "${artifacts[@]}"; do
  path="$checkout_real/server/$artifact"
  if [[ ! -e "$path" && ! -L "$path" ]]; then
    continue
  fi
  if [[ -L "$path" || ! -f "$path" || -s "$path" ]]; then
    echo "refusing to remove unexpected non-empty, non-regular, or symlink artifact: $path" >&2
    exit 2
  fi
  rm -- "$path"
  echo "removed known empty curl redirection artifact: $path"
  removed=$((removed + 1))
done

echo "cleanup complete; removed $removed known artifact(s); no other untracked files were touched"
