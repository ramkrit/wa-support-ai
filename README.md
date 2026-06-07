# WA Support AI

A personal RAG-powered WhatsApp assistant built with NestJS. It maintains a headless WhatsApp Web session, ingests your knowledge base into a vector store, and uses retrieval-augmented generation to answer incoming messages intelligently.

## What it does

- Keeps a persistent WhatsApp Web session via `whatsapp-web.js` (Puppeteer-based)
- Real-time dashboard showing connection status and QR code for authentication
- Forwards incoming messages through a RAG pipeline: embed query → retrieve relevant chunks → generate an answer via LLM
- REST API for sending messages programmatically
- SSE stream for live status updates

## Tech Stack

- **Runtime:** NestJS 11, TypeScript, Node.js
- **WhatsApp:** whatsapp-web.js with LocalAuth session persistence
- **Database:** MongoDB via Mongoose (for chunks, conversations, RAG logs)
- **RAG Pipeline:** Vector embeddings + vector store + LLM generation (planned)
- **API Docs:** Swagger UI at `/api/docs`

## Getting Started

### Prerequisites

- Node.js 20+
- A machine where Chromium can run (Puppeteer dependency)
- WhatsApp account to link

### Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in your values
cp .env.example .env

# Start in dev mode
npm run start:dev
```

Open `http://localhost:3000` to see the dashboard. Scan the QR code with WhatsApp to connect.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `OPENAI_API_KEY` | OpenAI API key for the LLM module |
| `OPENAI_MODEL` | Model to use (default: gpt-4o-mini) |
| `MONGODB_URI` | MongoDB connection string (default: mongodb://localhost:27017/wa_support_ai) |
| `WA_SEND_API_USER` | Basic auth user for the send-message endpoint |
| `WA_SEND_API_PASS` | Basic auth password for the send-message endpoint |

See `.env.example` for the full template.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Live dashboard with connection status and QR |
| GET | `/wa-channel/qr` | PNG image of the current QR code |
| GET | `/wa-channel/status` | JSON status (`connected`, `awaiting_scan`, `disconnected`) |
| POST | `/wa-channel/send-message` | Send a message (Basic Auth required) |
| GET | `/wa-channel/events` | SSE stream for real-time status + QR updates |
| GET | `/api/docs` | Swagger documentation |

## Project Structure

```
src/
├── main.ts                  # App bootstrap + Swagger setup
├── app.module.ts            # Root module
├── config/                  # Configuration & data source
├── frontend/                # Dashboard controller (serves HTML)
├── wa-channel/              # WhatsApp client, controller, DTOs
├── database/                # TypeORM migrations & entities
├── rag/                     # (planned) RAG orchestration
├── embedding/               # (planned) Vector encoding service
├── vector-store/            # (planned) Vector storage & retrieval
├── document/                # (planned) Document ingestion & chunking
├── llm/                     # (planned) LLM provider integration
└── conversation/            # (planned) Chat session memory
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Dev mode with watch |
| `npm run build` | Compile TypeScript |
| `npm run start:prod` | Run compiled build |
| `npm run lint` | ESLint with auto-fix |
| `npm run test` | Run unit tests |

## Deployment

The project includes Docker support. See `Dockerfile` and `.dockerignore` for container builds.

```bash
docker compose up -d --build
```

The WhatsApp session persists across restarts via Docker volumes.

## License

UNLICENSED — personal project.
