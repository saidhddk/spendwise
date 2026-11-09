#!/bin/sh
# NFR-07: monthly test restore. Decrypts the newest backup into a temporary file, checks
# that SQLite reads it, counts the rows, and re-applies account deletions (FR-17).
set -eu
OUT_DIR="${BACKUP_DIR:-backups}"
KEY="${BACKUP_KEY_FILE:?set BACKUP_KEY_FILE}"
LATEST=$(ls -t "$OUT_DIR"/spendwise-*.db.enc | head -1)
TMP=$(mktemp -d)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY" -in "$LATEST" -out "$TMP/restored.db"
echo "restored from: $LATEST"
echo "integrity: $(sqlite3 "$TMP/restored.db" 'PRAGMA integrity_check;')"
echo "users: $(sqlite3 "$TMP/restored.db" 'SELECT COUNT(*) FROM User;')  transactions: $(sqlite3 "$TMP/restored.db" 'SELECT COUNT(*) FROM "Transaction";')"
DATABASE_URL="file:$TMP/restored.db" npx tsx scripts/reapply-deletions.ts
rm -rf "$TMP"
