#!/usr/bin/env bash
# rollback_to_stable.sh - Restores Daily Devotions to the v2.2 Stable Reference Version
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=========================================================="
echo " Daily Devotions - Rollback to v2.2 (Stable Reference)     "
echo "=========================================================="

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "--> Restoring working tree to git tag 'v2.2' (or 'stable')..."
  git checkout v2.2 -- . || git checkout stable -- .
  git clean -fd
  echo "✓ Successfully rolled back to git tag v2.2 (stable reference)!"
else
  BACKUP_TAR="/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/daily-devotions-v2.2-stable.tar.gz"
  if [ -f "$BACKUP_TAR" ]; then
    echo "--> Restoring from immutable backup archive: $BACKUP_TAR..."
    tar -xzf "$BACKUP_TAR" -C "$DIR"
    echo "✓ Successfully restored from immutable backup archive!"
  else
    echo "Error: Neither git repository nor backup archive was found."
    exit 1
  fi
fi

echo "=========================================================="
echo "✓ All files restored to v2.2 stable reference release."
echo "=========================================================="
