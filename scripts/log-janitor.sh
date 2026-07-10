#!/bin/sh
# The ASB writes hourly-rotated trace files that are never pruned:
# tracing-libp2p.*.log runs 70-80MB PER HOUR (~1.8GB/day) and tracing.*.log
# ~3MB/hour. Left alone they fill the disk. Keep 3 hours of libp2p traces
# (enough for live debugging) and 7 days of the general traces.
LOGS=/data/logs
while true; do
  find "$LOGS" -name 'tracing-libp2p.*.log' -mmin +180 -delete 2>/dev/null
  find "$LOGS" -name 'tracing.*.log' -mmin +10080 -delete 2>/dev/null
  sleep 3600
done
