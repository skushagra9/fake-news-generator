# The Daily Fabricator

A full-stack app that scrapes real news from RSS feeds, transforms each headline
into a satirical version with an LLM, and lets you chat with each article.

> Stack: Node 20 + TypeScript + Express + Prisma · React 18 + Vite + React Query
> · PostgreSQL · Redis + BullMQ · OpenAI

## One-command setup

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY
docker compose up --build
```

Then open:

- Frontend: http://localhost:5173
- API health: http://localhost:4000/api/health

The first run pulls images and builds everything — give it ~2 minutes. After
that, `docker compose up` is fast.

### What happens on startup

1. `db` (Postgres 16) starts; the backend waits for its healthcheck.
2. `redis` starts; backend + worker wait for its healthcheck.
3. `backend` runs `prisma migrate deploy` (idempotent), then `seed-sources.js`
   (idempotent upsert of the 3 RSS sources), then starts the API on `:4000`.
4. `worker` connects to Redis and processes transformation jobs.
5. `frontend` (nginx) serves the built SPA on `:5173` and reverse-proxies
   `/api` to the backend.

### Trying it

1. Visit http://localhost:5173.
2. Click **Scrape now** — backend pulls from NYT/NPR/Guardian RSS, inserts
   articles, and enqueues a transform job per article.
3. The feed shows articles immediately (with a "pending" pill); the worker
   fills in satirical titles asynchronously. Refresh after a few seconds to
   see them populated.
4. Click any article → toggle between satirical and original, ask
   structured questions in the chat panel (responses stream live).

### "I scraped before adding my real OpenAI key"

If you ran `Scrape now` while `OPENAI_API_KEY` was still the placeholder,
all transforms will be marked `FAILED` and BullMQ will not retry them
automatically. Fix:

```bash
# 1. update OPENAI_API_KEY in .env
# 2. restart so backend + worker pick up the new key
docker compose up -d --force-recreate backend worker
# 3. re-enqueue all FAILED/PENDING transforms
curl -X POST http://localhost:4000/api/scrape/retry-failed
```

## Project layout

```
fake-news-generator/
├─ docker-compose.yml         # 5 services: db, redis, backend, worker, frontend
├─ .env.example
├─ backend/
│  ├─ prisma/                 # schema + hand-written initial migration
│  ├─ src/
│  │  ├─ index.ts             # API entrypoint
│  │  ├─ worker.ts            # BullMQ worker entrypoint
│  │  ├─ server.ts            # Express app factory
│  │  ├─ config.ts            # Zod-validated env
│  │  ├─ db.ts                # Prisma singleton
│  │  ├─ queue.ts             # BullMQ queue + connection
│  │  ├─ routes/              # articles, sources, scrape, chat (SSE)
│  │  ├─ services/            # scraper, transformer, chatService, openai
│  │  ├─ jobs/                # BullMQ job processors
│  │  ├─ middleware/          # error handler
│  │  └─ scripts/             # seed-sources.ts
│  └─ Dockerfile
└─ frontend/
   ├─ src/
   │  ├─ api/client.ts        # typed fetch + SSE stream parser
   │  ├─ components/          # ArticleCard, ChatPanel, SourceFilter
   │  ├─ pages/               # HomePage, ArticlePage
   │  └─ types/index.ts       # API DTO mirror
   ├─ nginx.conf              # SPA fallback + /api proxy + SSE-friendly
   └─ Dockerfile
```

## API endpoints

| Method | Path                          | Purpose                                                    |
| ------ | ----------------------------- | ---------------------------------------------------------- |
| GET    | `/api/health`                 | Liveness                                                   |
| GET    | `/api/sources`                | List configured RSS sources                                |
| POST   | `/api/scrape`                 | Trigger a scrape across all sources (returns per-source totals) |
| POST   | `/api/scrape/retry-failed`    | Re-enqueue every PENDING/FAILED transform. Use this after fixing a bad OpenAI key or after a burst of upstream failures. |
| GET    | `/api/articles`               | List articles. Query: `sourceId`, `cursor`, `limit`        |
| GET    | `/api/articles/:id`           | Article + linked fake version + source                     |
| GET    | `/api/chat/:articleId`        | Persisted chat history for an article                      |
| POST   | `/api/chat/:articleId`        | Send a chat turn; response is SSE stream                   |

### Chat request body

```json
{ "kind": "summarize" | "entities" | "comparison" | "freeform", "message": "..." }
```

`message` is required when `kind === "freeform"`. The other kinds map to
predefined prompts server-side, so the UI just sends `{kind: "summarize"}`.

### Chat response (SSE)

```
event: chunk    data: "string fragment"
event: chunk    data: " of the response"
event: done     data: {}
```

On error: `event: error    data: {"message": "..."}`.

## Local development (without Docker)

You can run pieces locally for fast iteration. You still need Postgres + Redis;
the easiest is to start *just those* with compose:

```bash
docker compose up -d db redis
cd backend
npm install
cp ../.env.example .env  # set DATABASE_URL=postgresql://fakenews:fakenews@localhost:5432/fakenews
npx prisma migrate deploy
npm run dev          # API on :4000 with hot reload
# in another terminal
npm run dev:worker   # BullMQ worker

cd ../frontend
npm install
npm run dev          # Vite on :5173, proxies /api -> :4000
```

## Environment variables

See `.env.example`. The only one you actually need to set is `OPENAI_API_KEY`.
Everything else has working defaults for the compose setup.

## Tearing down

```bash
docker compose down            # stop containers, keep data
docker compose down -v         # also wipe Postgres + Redis volumes
```

## What's documented separately

See **INTERVIEW_NOTES.md** for the full design rationale: schema decisions,
async pipeline, LLM integration, error handling, and what I'd improve next.
