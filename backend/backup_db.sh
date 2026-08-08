#!/bin/bash
# Hourly snapshot of data.db so a mistake (mine or otherwise) can never again
# permanently wipe real accounts. Keeps the most recent 72 hourly backups
# (~3 days) plus prunes anything older automatically.
set -e
cd "$(dirname "$0")"

DB_PATH="data.db"
BACKUP_DIR="backups"
KEEP=72

mkdir -p "$BACKUP_DIR"

if [ ! -s "$DB_PATH" ]; then
  echo "[backup] data.db missing or empty, skipping backup"
  exit 0
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
cp "$DB_PATH" "$BACKUP_DIR/data-$TIMESTAMP.db"
echo "[backup] saved $BACKUP_DIR/data-$TIMESTAMP.db"

# Prune: keep only the newest $KEEP backups
cd "$BACKUP_DIR"
ls -1t data-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -I {} rm -f {}
