#!/bin/sh
set -e
mkdir -p /data/logs /data/supervisor
chown -R asb:asb /data || true
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
