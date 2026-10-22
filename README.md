# TGlobal Gold Loan Portal

Production-grade npm workspaces monorepo for the TGlobal Gold Loan Intake Portal & AI Agent.

## Workspaces

| Package | Path | Stack |
|---|---|---|
| `@tglobal/api` | `apps/api` | Node.js + Express + TypeScript + Prisma + PostgreSQL + Zod + Vitest |
| `@tglobal/web` | `apps/web` | React 18 + Vite + TypeScript + Tailwind CSS + Lucide React |

## Quick Start

### 1. Prerequisites

- Node.js ≥ 20
- PostgreSQL 15+ running locally

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your DATABASE_URL and any API keys
```

### 4. Set up the database

```bash
# Run migrations (creates tables)
npm run db:migrate

# Seed plans + sample leads
npm run db:seed
```

### 5. Start development servers

```bash
npm run dev
# API  → http://localhost:4000
# Web  → http://localhost:5173
```

## Root Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts API (port 4000) + Web (port 5173) concurrently |
| `npm run build` | TypeScript build for both workspaces |
| `npm test` | Vitest unit & integration tests in `apps/api` |
| `npm run eval` | AI agent evaluation suite in `apps/api` |
| `npm run db:migrate` | Runs Prisma migrations (prod deploy) |
| `npm run db:seed` | Seeds loan schemes + sample leads |

## Monetary Convention

**All monetary values are stored as integer paise** (1 INR = 100 paise). For example:

- `700000` paise = ₹7,000.00 (gold rate per gram)
- `goldValuePaise`, `eligibleLoanPaise`, `rate24kPaise` are all `BigInt` columns

**Never use float for money.** The `appraise()` function in `apps/api/src/lib/gold.ts` performs all calculations using integer arithmetic.

## Loan Plans (seeded)

| ID | Name | Rate | Max LTV | Tenure |
|---|---|---|---|---|
| `PLAN_BULLET_01` | Bullet Repayment | 12.0% p.a. | 70% | 12 months |
| `PLAN_EMI_01` | Monthly EMI | 10.5% p.a. | 75% | 12 months |

## API Endpoints

```
GET  /health                      — Health check
GET  /api/v1/schemes              — List active loan schemes
GET  /api/v1/schemes/:id          — Get a single scheme
POST /api/v1/leads                — Submit a new lead
GET  /api/v1/leads                — List all leads (admin)
GET  /api/v1/leads/:id            — Get lead by UUID or applicationId
PATCH /api/v1/leads/:id/status    — Update lead status (admin)
POST /api/v1/agent/chat           — AI agent chat (Phase 2 stub)
```

## Project Structure

```
tglobal-gold-loan/
├── apps/
│   ├── api/                      # Express API
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # Database schema
│   │   │   └── seed.ts           # Seed script
│   │   └── src/
│   │       ├── index.ts          # Entry point
│   │       ├── app.ts            # Express app factory
│   │       ├── routes/           # API route handlers
│   │       ├── lib/              # Business logic (gold.ts, prisma.ts, etc.)
│   │       ├── schemas/          # Zod validation schemas
│   │       └── eval/             # AI agent evaluation suite
│   └── web/                      # React frontend
│       └── src/
│           ├── App.tsx           # Root app with navigation
│           └── components/
│               ├── LoanIntakeForm.tsx   # Customer application form
│               ├── AdminDashboard.tsx  # Admin leads view
│               └── AgentChat.tsx       # AI chat UI
├── .env.example
└── package.json                  # Workspace root
```

## LLM Provider Support (Phase 2)

Set `LLM_PROVIDER` in `apps/api/.env`:

| Value | Description |
|---|---|
| `gemini` | Google Gemini (requires `GEMINI_API_KEY`) |
| `groq` | Groq (requires `GROQ_API_KEY`) |
| `ollama` | Local Ollama (requires `OLLAMA_BASE_URL`) |
| `mock` | Deterministic mock for tests |
