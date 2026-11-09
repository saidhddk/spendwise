#!/bin/sh
# NFR-07: daily encrypted backup of the SpendWise database.
#   - consistent copy with SQLite's online backup
#   - AES-256 encryption; the key file is kept outside the backup folder (BACKUP_KEY_FILE)
#   - backups older than 30 days are deleted
# Production schedule (operator crontab):  15 2 * * *  /srv/spendwise/scripts/backup.sh
set -eu
DB="${DB_FILE:-prisma/dev.db}"
OUT_DIR="${BACKUP_DIR:-backups}"
KEY="${BACKUP_KEY_FILE:?set BACKUP_KEY_FILE to a key file stored apart from the backups}"
umask 077                                   # files readable by the operator account only
mkdir -p "$OUT_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TMP=$(mktemp -d)
sqlite3 "$DB" ".backup '$TMP/spendwise.db'"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY" \
  -in "$TMP/spendwise.db" -out "$OUT_DIR/spendwise-$STAMP.db.enc"
rm -rf "$TMP"
find "$OUT_DIR" -name 'spendwise-*.db.enc' -mtime +30 -delete
echo "backup written: $OUT_DIR/spendwise-$STAMP.db.enc"
