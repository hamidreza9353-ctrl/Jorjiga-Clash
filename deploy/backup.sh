#!/usr/bin/env bash
set -euo pipefail
# Set DATABASE_URL and BACKUP_DIR in the environment.
mkdir -p "${BACKUP_DIR:-/var/backups/jorjiga-clash}"
pg_dump "$DATABASE_URL" | gzip > "${BACKUP_DIR:-/var/backups/jorjiga-clash}/jorjiga-$(date +%Y-%m-%d_%H-%M-%S).sql.gz"
find "${BACKUP_DIR:-/var/backups/jorjiga-clash}" -type f -mtime +14 -delete
