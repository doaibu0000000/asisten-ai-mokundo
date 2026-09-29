#!/bin/bash
# Dev server supervisor v3 — watchdog untuk Next.js dev di port 3000.
# Pola spawn "orphan" (bash -c '& disown' tanpa setsid) terbukti bertahan
# (pola yang sama dengan start.sh sistem). Supervisor hanya restart bila
# server benar-benar mati; tidak menyentuh server yang sehat.
LOG=/tmp/dev-supervisor.log
OUT=/tmp/next-dev-stdout.log
cd /home/z/my-project

echo "$(date '+%F %T') supervisor v3 start" >> "$LOG"
STARTS=0
while true; do
  if curl -s -m 6 http://localhost:3000/api/status > /dev/null 2>&1; then
    : # sehat — tidak melakukan apa pun
  else
    STARTS=$((STARTS + 1))
    echo "$(date '+%F %T') server down (restart #$STARTS)" >> "$LOG"
    pkill -9 -f "next dev -p 3000" 2>/dev/null
    pkill -9 -f "next-server" 2>/dev/null
    sleep 1
    # pola orphan — server jadi anak yatim (PPID 1) seperti start.sh sistem
    bash -c "cd /home/z/my-project && bun run dev > $OUT 2>&1 & disown"
    sleep 14
  fi
  sleep 6
done
