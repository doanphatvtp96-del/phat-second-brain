---
title: Server services
updated: 2026-10-17
---

# Server services

This node records the services installed on the server and the commands used to deploy them.

## Runtime

- Docker Engine 26.1.3 and Docker Compose v2.27.0 are installed from the official Docker CE repository on AlmaLinux 8.
- Podman, podman-docker, and podman-remote were removed so the `docker` command uses Docker Engine.
- Docker starts at boot with `systemctl enable --now docker`.

## Command line tools

- Codex CLI 0.163.0 is installed at `/root/.local/bin/codex`.
- Claude Code 2.1.302 is installed at `/root/.local/bin/claude`.
- Claude Code still needs account authentication before use.

## 9router

- Source: `https://github.com/decolua/9router`.
- Clone path: `/opt/services/9router`.
- Compose file: `/opt/services/9router/docker-compose.yml`.
- Deploy with `cd /opt/services/9router && docker compose up -d`.
- The service listens on server port `20128`.
- The optional Headroom service is disabled because its image exited with code 132 on this server, while the core 9router service runs correctly without it.

## n8n

- Source: `https://github.com/n8n-io/n8n`.
- Clone path: `/opt/services/n8n`.
- Generated deployment path: `/opt/services/n8n/deploy`.
- Compose file: `/opt/services/n8n/deploy/compose.yml`.
- Deploy with `cd /opt/services/n8n && docker compose -f deploy/compose.yml up -d`.
- The service listens on server port `5678`.
- The n8n sandbox runner uses `DOCKER_IGNORE_BR_NETFILTER_ERROR=1` because the host does not expose the bridge netfilter sysctl.

## Multica

- Source: `https://github.com/kevinle128/multica.git`.
- Clone path: `/opt/services/multica`.
- Compose file: `/opt/services/multica/compose.yml`.
- Deploy with `cd /opt/services/multica && docker compose -f compose.yml up -d`.
- The frontend listens on `127.0.0.1:3000`.
- The backend listens on `127.0.0.1:8080`.
- PostgreSQL is available only inside the Docker network.

## Secrets and verification

- Generated environment files are stored with mode `600` in each deployment directory.
- Generated deployment credentials are also stored in `/root/service-secrets/credentials.env` with mode `600`.
- Do not copy secret values into this node or into Git.
- Verified on 2026-10-17: Docker is active, 9router returns HTTP 307, n8n returns HTTP 200, Multica frontend returns HTTP 200, and all long-running containers are up.
