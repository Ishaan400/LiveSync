## LiveSync Backend



A Node.js/Express backend for realtime collaborative document editing. It uses Automerge CRDTs over WebSockets for live syncing, MongoDB for persistence, Redis for pub/sub and presence, and JWT for authentication. Includes Swagger docs, Docker setup, and a test suite.

### Features
- **Realtime collaboration** with Automerge CRDT and WebSocket server
- **JWT auth** for both HTTP routes and WebSocket connections
- **Documents API**: CRUD, share, version history, and replay
- **Swagger UI** at `/api-docs`
- **Ratelimiting and request logging** builtin
- **Dockerized** stack (API, MongoDB, Redis, WebSocket server, Nginx)
- **Tests**: fast unit tests + WebSocket integration test

### Tech Stack
- Runtime: Node.js, Express
- Data: MongoDB (Mongoose)
- Realtime: WebSocket (`ws`), Automerge
- Cache/Presence: Redis
- Auth: JWT + Passport
- Docs: Swagger (swagger-jsdoc, swagger-ui-express)
- Infra: Docker, docker-compose, Nginx

### Project Structure
```text
src/
  app.js                 # Express app (middleware, swagger mount)
  server.js              # HTTP server bootstrap
  socket.js              # Automerge WebSocket server
  config/                # DB and swagger config
  controllers/           # Route controllers
  middlewares/           # Passport, request logger, rate limiters
  models/                # Mongoose models
  routes/                # Express routes (auth, documents, users, activity)
  services/              # Domain services
  utils/                 # Logger, Redis client (stubbed in tests)

tests/
  auth.test.js           # Auth flow
  document.test.js       # Document CRUD
  websocket.test.js      # WebSocket integration
  test-utils/db.js       # In-memory Mongo for unit tests

docker-compose.yml       # API, Mongo, Redis, Nginx, WS server
Dockerfile               # API container
Dockerfile.automerge     # WS server container
```

## Getting Started

### Prerequisites
- Node.js 18+ (or 20+)
- Docker + docker-compose (recommended)

### 1) Clone and install
```bash
git clone https://github.com/Ishaan400/LiveSync.git
cd LiveSync
npm install
```

### 2) Configure environment
Create `.env` with the following (example values shown):
```bash
JWT_SECRET=super_secret_key
MONGO_URI=mongodb://localhost:27017/livesync
REDIS_URL=redis://localhost:6379
PORT=3000
AUTOMERGE_PORT=1234
```
When using Docker, the compose file sets `MONGO_URI` and `REDIS_URL` to the service names.

## Run

### Option A: Docker (recommended)
```bash
# Start core services
docker compose up -d mongo redis

# Start API
docker compose up -d api

# Start Automerge WebSocket server
docker compose up -d automerge

# Optional: Nginx reverse proxy (http://localhost)
docker compose up -d nginx
```
- API: http://localhost:3000
- Swagger: http://localhost:3000/api-docs
- WebSocket: ws://localhost:1234

### Option B: Local dev (without Docker)
```bash
# Ensure MongoDB & Redis are running locally
export MONGO_URI=mongodb://localhost:27017/livesync
export REDIS_URL=redis://localhost:6379
export JWT_SECRET=your_secret

# Start API
npm start  #  http://localhost:3000

# In another terminal, run the WebSocket server if needed
export AUTOMERGE_PORT=1234
node src/socket.js  #  ws://localhost:1234
```

## API Docs
Open `http://localhost:3000/api-docs` for interactive Swagger documentation. Use the lock icon to configure a Bearer token.

## Testing

### Unit tests (fast, no external deps)
Redis is stubbed in tests; Mongo uses an inmemory server.
```bash
# macOS/Linux
NODE_ENV=test npm test

# Windows PowerShell
$env:NODE_ENV = 'test'; npm test
```

### WebSocket integration test
Requires API, Mongo, and Redis (Docker recommended):
```bash
npm run test:integration:up     # starts mongo, redis, api
npm run test:integration        # runs websocket.test.js
npm run test:integration:down   # stops services
```

## WebSocket Quickstart
- URL: `ws://localhost:1234/`
- Header: `Authorization: Bearer <JWT>`
- Example messages:
```json
{ "type": "connect", "docId": "<mongodb_object_id>" }
{ "type": "update",  "docId": "<id>", "changes": ["<base64 change>"] }
```
Server responds with events such as `{ "type": "doc" }`, `{ "type": "sync" }`, and `{ "type": "error" }`.

## Environment Variables
- `JWT_SECRET` (required)
- `MONGO_URI` (required when not using Docker networking)
- `REDIS_URL` (required when not using Docker networking)
- `PORT` (default: 3000)
- `AUTOMERGE_PORT` (default: 1234)

## Useful NPM Scripts
- `npm start`  start API
- `npm test`  run unit tests
- `npm run test:integration`  run WebSocket integration test
- `npm run test:integration:up` / `:down`  bring services up/down for integration tests

## Notes
- Rate limiting and request logging are enabled by default.
- In tests, the Redis client is replaced with an inmemory stub when `NODE_ENV=test` or `REDIS_URL` is unset.
