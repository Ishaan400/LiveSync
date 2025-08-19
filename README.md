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


## Endpoints Screenshots

<img width="1879" height="866" alt="Screenshot 2025-08-19 142525" src="https://github.com/user-attachments/assets/0d13e473-ed9d-444c-8314-0c0be4eb8cdb" />
<img width="1870" height="892" alt="Screenshot 2025-08-19 142549" src="https://github.com/user-attachments/assets/995737cc-c238-4622-b600-fa0e078cf46e" />
<img width="1870" height="426" alt="Screenshot 2025-08-19 142600" src="https://github.com/user-attachments/assets/759e5cb5-a3d5-4606-b5b9-d2f970520453" />
<img width="1801" height="888" alt="Screenshot 2025-08-19 142659" src="https://github.com/user-attachments/assets/9e71f539-1a15-4ff2-bf98-5857ba91e5bb" />
<img width="1789" height="914" alt="Screenshot 2025-08-19 142912" src="https://github.com/user-attachments/assets/696b224f-2706-4cc0-97d7-7573e8442498" />
<img width="1781" height="884" alt="Screenshot 2025-08-19 143024" src="https://github.com/user-attachments/assets/2fa2320f-8cfa-4163-a1ce-80a245f6980e" />
<img width="1782" height="881" alt="Screenshot 2025-08-19 143228" src="https://github.com/user-attachments/assets/b3c7ec7b-3f05-4a1b-b997-e8841f83f337" />
<img width="984" height="507" alt="Screenshot 2025-08-19 143410" src="https://github.com/user-attachments/assets/105abd84-f8af-41be-a31c-e59c4371d02f" />
<img width="1758" height="895" alt="Screenshot 2025-08-19 143510" src="https://github.com/user-attachments/assets/5be0c74a-f2ef-4d3a-9b62-1d877cef9b0b" />
<img width="1777" height="912" alt="Screenshot 2025-08-19 143621" src="https://github.com/user-attachments/assets/9600d303-71db-4a00-b608-176c2a3e0628" />
<img width="1775" height="880" alt="Screenshot 2025-08-19 143840" src="https://github.com/user-attachments/assets/0394468a-b916-40fd-9ef2-208d3102cf5d" />
<img width="1774" height="909" alt="Screenshot 2025-08-19 144148" src="https://github.com/user-attachments/assets/0a198fee-ca42-4409-9819-dc4c252a48eb" />
<img width="1768" height="885" alt="Screenshot 2025-08-19 144446" src="https://github.com/user-attachments/assets/ac45d32a-e1b4-4c84-993a-3668ce2baabb" />
<img width="1794" height="917" alt="Screenshot 2025-08-19 144650" src="https://github.com/user-attachments/assets/db4ed19e-cac8-4a26-aa16-6f5e7bf58670" />
<img width="1753" height="879" alt="Screenshot 2025-08-19 144905" src="https://github.com/user-attachments/assets/158cad2d-28ac-4db8-ad8e-bc7779db04b9" />
