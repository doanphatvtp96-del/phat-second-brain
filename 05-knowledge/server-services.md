---
title: Server services
updated: 2026-10-18
---

# Server services

This node records the services installed on the server and the commands used to deploy them.

## Network access

Only SSH (port `2018`) is open to the internet. Every application is reachable only inside the Tailscale network, at `100.81.58.77` or `srv-lvs0k.taildae6a9.ts.net`.

| App | Tailnet URL | Container bind |
|---|---|---|
| n8n | `http://100.81.58.77:5678` | `127.0.0.1:5678` |
| 9router | `http://100.81.58.77:20128` | `127.0.0.1:20128` |
| Multica frontend | `http://100.81.58.77:3000` | `127.0.0.1:3000` |
| Multica backend | not exposed; the frontend proxies to it | `127.0.0.1:8080` |

- From `admin-pc` (Windows, tailnet `doanphatvtp96@`), the server is node `ps` at `ps.taildae6a9.ts.net` (`100.110.183.75`). On 2026-10-19, `http://ps.taildae6a9.ts.net:5678/healthz` returned 200 and `/api/v1/workflows` returned 401 without a key. `100.81.58.77` timed out from this PC. [Source: user, chat | 2026-10-19 | confidence: high]
- Each app binds `127.0.0.1` in its compose file. `tailscale serve --bg --tcp=<port> tcp://127.0.0.1:<port>` forwards the tailnet port to it. Serve rules persist across reboots. Check them with `tailscale serve status`.
- Docker-published ports skip the iptables `INPUT` chain. A port published as `0.0.0.0` is public even with the firewall on. Never publish an app port on `0.0.0.0` or on the public IP.
- To add a new app: bind it to `127.0.0.1:<port>` in compose, then run `tailscale serve --bg --tcp=<port> tcp://127.0.0.1:<port>`.

## Firewall

- Script: `/usr/local/sbin/host-firewall.sh`. Systemd unit: `host-firewall.service`, enabled at boot.
- The script fills an own chain `host-input` (IPv4 and IPv6) and appends it to `INPUT` after Tailscale's `ts-input`.
- It accepts loopback, established connections, `tailscale0`, Docker bridges (`docker0`, `br-*`), ICMP, TCP `2018` (SSH), and UDP `41641`. It drops everything else.
- UDP `41641` is Tailscale's WireGuard port. It lets peers connect directly (about 30 ms) instead of through the DERP relay (about 85 ms). Remove that line from the script to close it; Tailscale still works through the relay.
- To disable the firewall at once: `iptables -D INPUT -j host-input; ip6tables -D INPUT -j host-input`.
- Verified on 2026-10-18 from the laptop: on the public IP, `2018` is open and `5678`, `20128`, `3000`, `8080`, `5679` are closed. On the tailnet IP, n8n returns 200, 9router 307, and Multica 200. New SSH sessions work on both IPs, and containers still reach the internet.

## Runtime

- Docker Engine 26.1.3 and Docker Compose v2.27.0 are installed from the official Docker CE repository on AlmaLinux 8.
- Podman, podman-docker, and podman-remote were removed so the `docker` command uses Docker Engine.
- Docker starts at boot with `systemctl enable --now docker`.

## Tailscale

- Tailscale 1.104.1 is installed from the official Tailscale repository. `tailscaled` starts at boot.
- Tailnet hostname: `srv-lvs0k`. Tailscale IPv4: `100.81.58.77`.
- The node is logged in as `ongtrumtaichinh888@`, and it is in the same tailnet as `les-macbook-pro` and `minis-mac-mini`.
- No Tailscale SSH, no exit node, and no subnet routes. `--accept-routes` is off.
- SSH works on the tailnet IP with the same port and credentials as in `.env`.

## Command line tools

- Codex CLI 0.163.0 is installed at `/root/.local/bin/codex`.
- Claude Code 2.1.302 is installed at `/root/.local/bin/claude`.
- Claude Code still needs account authentication before use.
- Claude Code refuses `--dangerously-skip-permissions` under root. For that mode, use the user `agent` (uid 1000, home `/home/agent`).
- `agent` has its own Claude Code 2.1.302 at `/home/agent/.local/bin/claude`. It has no password (locked), no sudo, and is not in the `docker` group, so it cannot change Docker, the firewall, or `/opt/services`.
- Start it as root with `su - agent`, then `claude --dangerously-skip-permissions`. The first run needs `/login`.
- Verified on 2026-10-18: the flag runs under `agent` (only "Not logged in" is shown) and is still refused under root. `docker ps` as `agent` returns permission denied.

## 9router

- Source: `https://github.com/decolua/9router`.
- Clone path: `/opt/services/9router`.
- Compose file: `/opt/services/9router/docker-compose.yml`.
- Deploy with `cd /opt/services/9router && docker compose up -d`.
- The service binds `127.0.0.1:20128`.
- The optional Headroom service is disabled because its image exited with code 132 on this server, while the core 9router service runs correctly without it.

## n8n

- Source: `https://github.com/n8n-io/n8n`.
- Clone path: `/opt/services/n8n`.
- Generated deployment path: `/opt/services/n8n/deploy`.
- Compose file: `/opt/services/n8n/deploy/compose.yml`.
- Deploy with `cd /opt/services/n8n && docker compose -f deploy/compose.yml up -d`.
- The service binds `127.0.0.1:5678`.
- `deploy/.env` sets `WEBHOOK_URL` and `N8N_EDITOR_BASE_URL` to `http://100.81.58.77:5678/`, so webhook URLs and editor links use the tailnet address.
- `deploy/.env` sets `N8N_SECURE_COOKIE=false`, because tailnet access uses plain HTTP. WireGuard still encrypts the traffic. The user approved this on 2026-10-18.
- The n8n sandbox runner uses `DOCKER_IGNORE_BR_NETFILTER_ERROR=1` because the host does not expose the bridge netfilter sysctl.
- The owner account is not created yet. The first visit opens the setup page.

## Multica

- Source: `https://github.com/kevinle128/multica.git`.
- Clone path: `/opt/services/multica`.
- Compose file: `/opt/services/multica/compose.yml`.
- Deploy with `cd /opt/services/multica && docker compose -f compose.yml up -d`.
- The frontend binds `127.0.0.1:3000`. The backend binds `127.0.0.1:8080`.
- `.env` sets `FRONTEND_ORIGIN` and `MULTICA_APP_URL` to `http://100.81.58.77:3000`. The backend sets the `Secure` cookie flag only for an `https` origin (`server/internal/auth/cookie.go`), so login works over plain HTTP.
- PostgreSQL is available only inside the Docker network.

## Secrets and backups

- Generated environment files are stored with mode `600` in each deployment directory.
- Generated deployment credentials are also stored in `/root/service-secrets/credentials.env` with mode `600`.
- Do not copy secret values into this node or into Git.
- Configs changed on 2026-10-18 have backups with the suffix `.bak-20261018-2323` next to each file.

## Verification history

- 2026-10-17: Docker is active, 9router returns HTTP 307, n8n returns HTTP 200, Multica frontend returns HTTP 200, and all long-running containers are up.
- 2026-10-18: The same versions and HTTP codes. `deploy-sandbox-certs-1` exits with code 0 and seems to be a one-time setup job. The Multica backend returns HTTP 404 at `/`.
- 2026-10-18, after the firewall change: n8n shows its owner setup page and Multica shows its sign-in page over the tailnet, with no browser console errors.
