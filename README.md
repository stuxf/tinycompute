# MPP Compute API

A pay-per-use compute provisioning API built on [Fly.io Machines](https://fly.io/docs/machines/) with [MPP (Micropayment Protocol)](https://www.mppx.dev/) billing. Agents pay with USDC on Tempo to create, manage, and run cloud VMs and volumes.

## Architecture

- **Hono** HTTP server with MPP middleware for payment gating
- **Fly.io Machines API** for compute provisioning (VMs, volumes, IPs)
- **Session-based billing** for running machines ($0.005/min)
- **One-time charges** for resource creation and commands
- **Ownership registry** — each wallet can only access resources it created
- **Auto-stop enforcement** — machines are stopped when billing deposits are exhausted

## Setup

### Prerequisites

- Node.js 20+
- A [Fly.io](https://fly.io) account with an API token and app
- A [Tempo](https://tempo.money) wallet address for receiving payments

### Install

```bash
pnpm install
```

### Configure

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `FLY_API_TOKEN` | Fly.io API deploy token |
| `FLY_APP_NAME` | Name of your Fly app |
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

## API Endpoints

All `/api/*` endpoints require an MPP-signed `Authorization` header. Resources are scoped to the paying wallet.

### Machines

| Method | Path | Price | Description |
|---|---|---|---|
| `GET` | `/api/machines` | Free | List your machines |
| `GET` | `/api/machines/:id` | Free | Get machine details |
| `POST` | `/api/machines` | $0.10 | Create a machine |
| `POST` | `/api/machines/:id/start` | $0.005/min | Start a machine (session billing) |
| `POST` | `/api/machines/:id/stop` | Free | Stop a machine |
| `POST` | `/api/machines/:id/restart` | $0.005/min | Restart a machine (session billing) |
| `DELETE` | `/api/machines/:id` | Free | Destroy a machine |
| `POST` | `/api/machines/:id/wait` | Free | Wait for machine state |
| `GET` | `/api/machines/:id/events` | Free | Get machine events |
| `POST` | `/api/machines/:id/exec` | $0.01 | Execute a command |
| `POST` | `/api/machines/:id/suspend` | Free | Suspend a machine |
| `GET` | `/api/machines/:id/ps` | Free | List processes |
| `GET` | `/api/machines/:id/billing` | Free | Get billing session info |

### Volumes

| Method | Path | Price | Description |
|---|---|---|---|
| `GET` | `/api/volumes` | Free | List your volumes |
| `GET` | `/api/volumes/:id` | Free | Get volume details |
| `POST` | `/api/volumes` | $0.05 | Create a volume |
| `DELETE` | `/api/volumes/:id` | Free | Delete a volume |
| `PUT` | `/api/volumes/:id/extend` | $0.05 | Extend volume size |

### Apps

| Method | Path | Price | Description |
|---|---|---|---|
| `POST` | `/api/apps` | Free | Create a Fly app |
| `DELETE` | `/api/apps/:name` | Free | Delete a Fly app |
| `GET` | `/api/apps/:name/ips` | Free | List IP assignments |
| `POST` | `/api/apps/:name/ips` | $0.01 | Allocate an IP address |

### Other

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/` | Landing page |
| `GET` | `/llms.txt` | Machine-readable API description for agents |

## Example Usage

All paid endpoints require an MPP-signed Authorization header. Use the [Tempo CLI](https://docs.tempo.money) or `mppx` SDK to sign requests.

### Health check

```bash
curl http://localhost:3000/health
```

### Create a machine ($0.10)

```bash
curl -X POST http://localhost:3000/api/machines \
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
```

### Start a machine ($0.005/min session)

```bash
curl -X POST http://localhost:3000/api/machines/$MACHINE_ID/start \
  -H "Authorization: $MPP_TOKEN"
```

### Execute a command ($0.01)

```bash
curl -X POST http://localhost:3000/api/machines/$MACHINE_ID/exec \
  -H "Authorization: $MPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "command": ["echo", "hello world"], "timeout": 10 }'
```

### Stop a machine (free)

```bash
curl -X POST http://localhost:3000/api/machines/$MACHINE_ID/stop \
  -H "Authorization: $MPP_TOKEN"
```

### Create a volume ($0.05)

```bash
curl -X POST http://localhost:3000/api/volumes \
  -H "Authorization: $MPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "my_data", "region": "ewr", "size_gb": 1 }'
```

### Destroy a machine (free)

```bash
curl -X DELETE http://localhost:3000/api/machines/$MACHINE_ID \
  -H "Authorization: $MPP_TOKEN"
```

## Error Responses

All errors follow a standard format:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": []
}
```

Error codes: `VALIDATION_ERROR`, `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `FLY_API_ERROR`, `INTERNAL_ERROR`.

## Billing Model

- **One-time charges** use `mppx.charge()` — the agent pays a fixed amount per request.
- **Session billing** uses `mppx.session()` — the agent locks a deposit and is charged per minute while a machine runs. When the deposit is consumed, the machine is automatically stopped.
- **Validation runs before billing** — invalid requests return 400 without being charged.

## Fly Client Hardening

The Fly API client includes:

- **Request timeout**: 30s default (configurable via `FlyRequestOptions`)
- **Retry with exponential backoff**: up to 3 retries for 5xx and network errors (500ms, 1s, 2s)
- **Rate limit handling**: parses `retry-after` header on 429 responses
- **Request logging**: logs method, path, status, and duration to console
