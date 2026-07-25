#!/usr/bin/env zsh
set -euo pipefail

owner=bharat-innovation-olympiad
repos=(bio-portal bio-admin bio-exam bio-proctor bio-contracts)
here=${0:A:h:h}
parent=${here:h}

if ! (( $+commands[gh] )); then
  print -u2 -- "gh CLI not found. Install GitHub CLI or clone siblings manually."
  exit 1
fi

for repo in $repos; do
  target="$parent/$repo"
  if [[ -d "$target/.git" ]]; then
    print -r -- "exists: $target"
  else
    print -r -- "cloning: $owner/$repo -> $target"
    gh repo clone "$owner/$repo" "$target"
  fi
done
