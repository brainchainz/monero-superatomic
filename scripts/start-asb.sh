#!/bin/sh
set -e
if [ ! -f /data/rpc-auth ]; then
  echo "Error: /data/rpc-auth missing" >&2
  exit 1
fi
exec /bin/asb --config=/data/config.toml start --rpc-bind-host=127.0.0.1 --rpc-bind-port=9944 --rpc-auth-file=/data/rpc-auth
