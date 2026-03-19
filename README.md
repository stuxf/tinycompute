# TinyCompute

A pay-per-use compute marketplace built on [MPP (Micropayment Protocol)](https://www.mppx.dev/). Provision cloud VMs instantly by paying with USDC — no accounts, no API keys, no billing portal.

## Providers

TinyCompute is provider-agnostic. It currently supports:

- **Fly.io** — Firecracker microVMs with sub-second boot, persistent volumes, 35+ regions
- **DigitalOcean** — Droplets with flexible sizing, broad image support, 15+ regions

## Architecture

```
Client (AI agent / CLI / app)
  │
  │  HTTP + MPP payment headers (USDC on Tempo)
  ▼
┌──────────────────────────────────┐
│  TinyCompute API (Hono)          │
│  ├─ MPP middleware (402 flow)    │
│  ├─ Ownership registry (JSON)   │
│  ├─ Session billing tracker     │
│  └─ Input validation            │
├──────────────┬───────────────────┤
│  Fly.io      │  DigitalOcean    │
│  Machines    │  Droplets        │
│  Volumes     │                  │
│  Apps / IPs  │                  │
└──────────────┴───────────────────┘
```

- **Hono** HTTP server with MPP middleware for payment gating
- **Session-based billing** for running compute ($0.005/min)
- **One-time charges** for resource creation and commands
- **Ownership registry** — each wallet can only access resources it created (persisted to disk)
- **Auto-stop enforcement** — machines are stopped when billing deposits are exhausted

## Setup

### Prerequisites

- Node.js 20+
- A [Fly.io](https://fly.io) account with an API token and app
- A [DigitalOcean](https://digitalocean.com) account with an API token
- A [Tempo](https://tempo.money) wallet address for receiving payments

### Install

```bash
pnpm install
```

### Configure

Create a `.env` file with:

| Variable | Description |
|---|---|
| `FLY_API_TOKEN` | Fly.io API deploy token |
| `FLY_APP_NAME` | Name of your Fly app |
| `DO_API_TOKEN` | DigitalOcean API token |
| `DO_PROJECT_ID` | DigitalOcean project ID for droplet assignment (defaults to tinyCompute project) |
| `MPP_RECIPIENT` | Your Tempo wallet address (receives payments) |
| `PORT` | Server port (default: 3000) |

### Run

```bash
# Development (with hot reload)
pnpm dev

# Production
pnpm build
pnpm start
```

## API Reference

All `/api/*` endpoints require an MPP-signed `Authorization` header. Resources are scoped to the paying wallet.

### Fly.io Machines

| Method | Path | Price | Description |
|---|---|---|---|
| `POST` | `/api/machines` | $0.10 | Create a machine |
| `GET` | `/api/machines` | Free | List your machines |
| `GET` | `/api/machines/:id` | Free | Get machine details |
| `POST` | `/api/machines/:id/start` | $0.005/min | Start (session billing) |
| `POST` | `/api/machines/:id/stop` | Free | Stop machine |
| `POST` | `/api/machines/:id/restart` | $0.005/min | Restart (session billing) |
| `DELETE` | `/api/machines/:id` | Free | Destroy machine |
| `POST` | `/api/machines/:id/exec` | $0.01 | Execute command |
| `POST` | `/api/machines/:id/wait` | Free | Wait for state |
| `GET` | `/api/machines/:id/events` | Free | Machine events |
| `POST` | `/api/machines/:id/suspend` | Free | Suspend machine |
| `GET` | `/api/machines/:id/ps` | Free | List processes |
| `GET` | `/api/machines/:id/billing` | Free | Billing session info |

### Fly.io Volumes

| Method | Path | Price | Description |
|---|---|---|---|
| `POST` | `/api/volumes` | $0.05 | Create a volume |
| `GET` | `/api/volumes` | Free | List your volumes |
| `GET` | `/api/volumes/:id` | Free | Get volume details |
| `DELETE` | `/api/volumes/:id` | Free | Delete volume |
| `PUT` | `/api/volumes/:id/extend` | $0.05 | Extend volume size |

### Fly.io Apps

| Method | Path | Price | Description |
|---|---|---|---|
| `POST` | `/api/apps` | Free | Create a Fly app |
| `DELETE` | `/api/apps/:name` | Free | Delete a Fly app |
| `GET` | `/api/apps/:name/ips` | Free | List IP assignments |
| `POST` | `/api/apps/:name/ips` | $0.01 | Allocate an IP address |

### DigitalOcean Droplets

| Method | Path | Price | Description |
|---|---|---|---|
| `POST` | `/api/do/droplets` | $0.10 | Create a droplet |
| `GET` | `/api/do/droplets` | Free | List your droplets |
| `GET` | `/api/do/droplets/:id` | Free | Get droplet details |
| `POST` | `/api/do/droplets/:id/start` | $0.005/min | Power on (session billing) |
| `POST` | `/api/do/droplets/:id/stop` | Free | Power off |
| `DELETE` | `/api/do/droplets/:id` | Free | Destroy droplet |

### System

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/` | Landing page |
| `GET` | `/llms.txt` | Machine-readable API description |

## Pricing

| Action | Type | Cost |
|---|---|---|
| Create machine / droplet | One-time | $0.10 |
| Start / restart machine or droplet | Session | $0.005/min ($0.30/hr) |
| Execute command (Fly) | One-time | $0.01 |
| Create volume | One-time | $0.05 |
| Extend volume | One-time | $0.05 |
| Allocate IP | One-time | $0.01 |
| Stop, destroy, list, status | Free | Free |

## Billing Model

- **One-time charges** — the agent pays a fixed USDC amount per request via `mppx.charge()`.
- **Session billing** — the agent locks a deposit upfront via `mppx.session()` and is charged $0.005/min while compute runs. When the deposit is consumed, the machine is automatically stopped.
- **Validation before billing** — invalid requests return 400 without being charged.

## Security

- **Wallet-based tenant isolation** — each resource is bound to the wallet that created it. Only that wallet can access, manage, or destroy it.
- **Input validation** — all create/exec endpoints validate payloads before processing. Names, regions, sizes, and commands are sanitized.
- **No stored credentials** — authentication uses MPP payment signatures, not API keys or passwords.

## Example Workflow

### Fly.io Machine

```bash
# 1. Create a machine ($0.10)
curl -X POST https://tinycompute.dev/api/machines \
  -H "Authorization: $MPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-worker",
    "region": "ewr",
    "config": {
      "image": "ubuntu:22.04",
      "guest": { "cpu_kind": "shared", "cpus": 1, "memory_mb": 256 }
    }
  }'

# 2. Start the machine ($0.005/min session)
curl -X POST https://tinycompute.dev/api/machines/$MACHINE_ID/start \
  -H "Authorization: $MPP_TOKEN"

# 3. Run a command ($0.01)
curl -X POST https://tinycompute.dev/api/machines/$MACHINE_ID/exec \
  -H "Authorization: $MPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "command": ["echo", "hello world"], "timeout": 10 }'

# 4. Stop when done (free)
curl -X POST https://tinycompute.dev/api/machines/$MACHINE_ID/stop \
  -H "Authorization: $MPP_TOKEN"

# 5. Destroy (free)
curl -X DELETE https://tinycompute.dev/api/machines/$MACHINE_ID \
  -H "Authorization: $MPP_TOKEN"
```

### DigitalOcean Droplet

```bash
# 1. Create a droplet ($0.10)
curl -X POST https://tinycompute.dev/api/do/droplets \
  -H "Authorization: $MPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-droplet",
    "region": "nyc3",
    "size": "s-1vcpu-1gb",
    "image": "ubuntu-22-04-x64"
  }'

# 2. Power on ($0.005/min session)
curl -X POST https://tinycompute.dev/api/do/droplets/$DROPLET_ID/start \
  -H "Authorization: $MPP_TOKEN"

# 3. Power off (free)
curl -X POST https://tinycompute.dev/api/do/droplets/$DROPLET_ID/stop \
  -H "Authorization: $MPP_TOKEN"

# 4. Destroy (free)
curl -X DELETE https://tinycompute.dev/api/do/droplets/$DROPLET_ID \
  -H "Authorization: $MPP_TOKEN"
```

## Error Responses

All errors return JSON:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": []
}
```

Error codes: `VALIDATION_ERROR`, `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `FLY_API_ERROR`, `DO_API_ERROR`, `INTERNAL_ERROR`.

## Client Hardening

Both the Fly and DigitalOcean API clients include:

- **Request timeout**: 30s default
- **Retry with exponential backoff**: up to 3 retries for 5xx and network errors
- **Rate limit handling**: parses `retry-after` header on 429 responses
- **Request logging**: logs method, path, status, and duration

## Deployment

### Vercel

The server can be deployed to Vercel as a serverless function. Note that `setInterval`-based billing enforcement does not work in serverless — billing auto-stop is skipped in that environment.

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Required environment variables in Vercel dashboard:
- `FLY_API_TOKEN`
- `FLY_APP_NAME`
- `DO_API_TOKEN`
- `MPP_RECIPIENT`

## Agent Integration

Use [agentcash-skills](https://github.com/Merit-Systems/agentcash-skills) as an MCP server (`npx -y agentcash@latest`) or CLI (`npx agentcash fetch ...`). It handles x402/MPP payment negotiation automatically.
