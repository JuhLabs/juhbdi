#!/bin/bash
# /var/www/juhbdi/update-stats.sh
# Parses nginx access logs to count unique install.sh / tarball downloads.
# Run via cron: */30 * * * * /var/www/juhbdi/update-stats.sh

STATS_FILE="/var/www/juhbdi/stats.json"
LOG_DIR="/var/log/nginx"
PATTERN='GET /juhbdi/(install\.sh|juhbdi-[0-9]+\.[0-9]+\.[0-9]+\.tar\.gz) HTTP'

# Collect all matching IPs into a temp file, then count unique
tmp=$(mktemp)
trap "rm -f '$tmp'" EXIT

# Plain text logs
for log in "$LOG_DIR"/access.log "$LOG_DIR"/access.log.1; do
  [ -f "$log" ] || continue
  grep -E "$PATTERN" "$log" 2>/dev/null | awk '{print $1}' >> "$tmp" || true
done

# Rotated gzipped logs
for log in "$LOG_DIR"/access.log.*.gz; do
  [ -f "$log" ] || continue
  zcat "$log" 2>/dev/null | grep -E "$PATTERN" 2>/dev/null | awk '{print $1}' >> "$tmp" || true
done

count=$(sort -u "$tmp" | wc -l | tr -d ' ')

cat > "$STATS_FILE" << EOF
{"installs":${count},"updated":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
