# Deployment Guide

## Docker (recommended — reviewer path)

### Prerequisites

- Docker ≥ 24
- Docker Compose ≥ 2.20

### Steps

```bash
git clone <repo-url>
cd Power-Grid-Manager

# No .env changes needed — docker-compose.yml provides all defaults
docker compose up
```

The compose file starts three services:

| Service | Port | Notes |
|---|---|---|
| `mongo` | 27017 | MongoDB 7. Data persisted to `mongo_data` Docker volume |
| `backend` | 4000 | Waits for MongoDB healthcheck before starting |
| `frontend` | 3000 | nginx serving the compiled React app + API proxy |

First boot will pull images and build containers (~2–3 min on a fast connection).

### Verify

```
http://localhost:3000              → Frontend console
http://localhost:4000/api/health   → Backend health JSON
```

Expected health response:

```json
{
  "status": "ok",
  "timestamp": "2026-08-01T06:00:00.000Z",
  "version": "0.1.0",
  "db": "connected"
}
```

### Stop

```bash
docker compose down          # stop containers, keep data
docker compose down -v       # stop and delete MongoDB volume
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Backend HTTP port |
| `NODE_ENV` | `production` (Docker), `development` (local) | Express environment |
| `MONGO_URI` | `mongodb://mongo:27017/pgm` | MongoDB connection string |
| `OPENAI_API_KEY` | _(unset)_ | Optional. Used for incident summaries. System works without it. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used for summaries if key is set |

All variables have safe defaults. A reviewer does not need to set any variable to run the stack.

---

## Local Development

See [README.md](./README.md#local-development-without-docker).

---

## Production Considerations (beyond assessment scope)

- Add TLS termination at a load balancer or reverse proxy in front of nginx.
- Use MongoDB Atlas or a replica set for persistence guarantees.
- Add BullMQ + Redis if horizontal backend scaling is needed.
- Mount `.env` as a Docker secret rather than an environment variable.
- Add resource limits (`mem_limit`, `cpus`) in docker-compose.yml.

These are noted for completeness but are not implemented — see ADR-003.
