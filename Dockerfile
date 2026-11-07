# syntax=docker/dockerfile:1
# Patched Eigen ASB 5.0.2 with the Monero SuperAtomic 1% maker developer tip.
# Built from github.com/brainchainz/eigenwallet-core (GPLv3). Source of the patch:
# swap-env/src/defaults.rs (tip address) + swap-asb/src/main.rs (1% floor) +
# swap-controller-api + swap/src/asb/rpc/server.rs (unlocked balance in RPC,
# withdraw_xmr, monero_history).
# Public base (ghcr, multi-arch, digest-pinned; built by the
# "Build SuperSwap asb image" workflow from swap-asb/Dockerfile).
FROM ghcr.io/brainchainz/asb:5.0.2-1pct@sha256:655524bbb183d979b94626e4ac5d54abe55a1ea5c4ad576758546b6276bcfa34 AS asb-base

FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS dashboard
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --include=dev
COPY frontend ./frontend
RUN cd frontend && npm run build

FROM ubuntu:24.04@sha256:a08e551cb33850e4740772b38217fc1796a66da2506d312abe51acda354ff061 AS runner
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg nginx supervisor && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r asb -g 1001 && useradd -r -g asb -u 1001 -d /tmp -s /sbin/nologin asb

COPY --from=asb-base /bin/asb /bin/asb
COPY --from=asb-base /bin/asb-controller /bin/asb-controller
COPY --from=dashboard /app /app
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY scripts /app/scripts

RUN mkdir -p /data/logs /var/log/nginx /var/lib/nginx /var/cache/nginx /var/run /tmp && \
    chown -R asb:asb /app /data /var/log/nginx /var/lib/nginx /var/cache/nginx /var/run /tmp /etc/nginx && \
    chmod 755 /app/scripts/*.sh

EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
