# AuraGold by TGlobal

![CI](https://github.com/VenkateshReddy007/TGlobal/actions/workflows/ci.yml/badge.svg) ![Node.js 20](https://img.shields.io/badge/Node.js-20-339933?logo=node.js) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)

> **A gold-loan intake portal where the form and AI assistant share one source of truth.**
> React + TypeScript · Express · PostgreSQL · Prisma · Zod · Tool-calling AI

AuraGold gives a borrower or field agent two ways to prepare a gold-loan application: a guided three-step portal or a conversational assistant. Both use the same server-validated quote and lead services. The model can request tools; it cannot set the rate, invent a plan, do the maths, or submit without a clear confirmation.

**Repository:** [VenkateshReddy007/TGlobal](https://github.com/VenkateshReddy007/TGlobal)

## Start here

### Local development

Requirements: Node.js 20+, npm, and PostgreSQL 16. Start PostgreSQL, copy `.env.example` to `.env`, then run from the repository root:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:5173>. The API listens at <http://localhost:4000>. The seeded plans and demo leads populate the quote selector and operations console. `npm run dev` starts both workspace apps.

### One-command Docker stack

```bash
docker compose up --build
```

Compose starts PostgreSQL, applies migrations, seeds plans/data, builds the API and web containers, and serves the web app at port 5173. Nginx proxies `/api` to the API container.

### Verify the project

```bash
npm test
npm run eval
```

`npm test` runs the API's math, validation, integration, agent and workflow tests. `npm run eval` runs ten multi-turn conversations against the real agent tools and database and prints a per-scenario terminal report.

## Product tour

1. **Apply for a loan:** enter borrower and jewellery details, or quick-fill from one of the appraisal-slip demo presets. The quote refreshes after a 300 ms debounce. Select a plan, review the details, acknowledge the RBI LTV cap, and submit with an idempotency key.
2. **AI Loan Assist:** ask for a quote, compare available plans, check a recent application, or prepare a submission conversationally. See backend tool traces in the chat. Review the full confirmation card before the assistant can submit.
3. **Admin & Ops:** filter the newest-first lead register by plan/status or plain English. Inspect a lead's audit timeline and advance only through allowed workflow transitions.

## Agent orchestration: tool-first, confirmation-bound

The external LLM is an intent and tool-call adapter, not a financial calculator. Gemini, Groq, or Ollama may propose a typed function call. If a provider is missing, slow, or rate limited, the deterministic state machine parses English/Hinglish intents and invokes those same validated tools. Both paths return tool results to the assistant; displayed figures come from the backend.

```mermaid
sequenceDiagram
  actor Borrower
  participant Chat as React chat
  participant Agent as Agent orchestrator
  participant Model as Optional LLM
  participant Tools as Zod-validated tools
  participant Services as Shared API services
  participant DB as PostgreSQL

  Borrower->>Chat: Ask for a quote or application
  Chat->>Agent: message + session + history
  Agent->>Agent: Check topic, investment advice, injection, and pending confirmation
  alt Configured model available
    Agent->>Model: System policy + typed tool declarations
    Model-->>Agent: Function call (never a computed quote)
  else No key, provider failure, or mock mode
    Agent->>Agent: Deterministic English/Hinglish intent + slot parsing
  end
  Agent->>Tools: get_loan_schemes / calculate_quote / check_existing_application / submit_application
  Tools->>Tools: Parse arguments with the REST-shared Zod schemas
  Tools->>Services: Call quoteService, schemeService, or leadService
  Services->>DB: Read plans / check recent lead / transactionally write lead + audit
  DB-->>Services: Server data
  Services-->>Tools: Validated result or field/conflict error
  Tools-->>Agent: Tool result + trace
  Agent-->>Chat: Reply + tool status events + pending summary when needed
  Chat-->>Borrower: Explain result and render trace/confirmation card
  Borrower->>Chat: Explicitly confirm the exact displayed summary
  Chat->>Agent: confirmSubmission=true
  Agent->>Tools: submit_application with the session's pending payload
  Tools->>Services: Re-check duplicate and confirmation state, then submit
  Services->>DB: Advisory lock + lead + initial AuditLog in one transaction
  DB-->>Chat: Application ID and SUBMITTED status
```

For a pending application, the assistant keeps the quote summary in session state. A plan or detail change refreshes the quote and requires a fresh confirmation. A typed `submit_application` call alone is insufficient: the caller must confirm in the current session and the submitted payload must match the pending application. Seven-day duplicates are checked again during the transactional write, so the chat and form have the same protections.

## What makes this implementation stand out

- **One financial truth, two journeys.** Form requests and AI tools use the same Zod schemas and quote/lead/scheme services. The client never supplies authoritative gold value or eligible-loan figures.
- **Exact money boundaries.** Weights and rates are combined as rational numerators before division; monetary values are stored in integer paise. Every quote also enforces `effective LTV = min(plan LTV, 75%)` server-side.
- **Provider-independent agent behavior.** A deterministic tool-calling path keeps demos, tests, and CI functional without API keys. Provider failures fall back to the same real backend tools rather than to guessed answers.
- **Confirmation is an application gate.** The agent can prepare a summary but cannot insert a lead until the borrower explicitly confirms the current details. Editing or switching plans refreshes the summary and resets that decision.
- **Concurrent duplicate safety.** An idempotency key replays the exact original response. A PostgreSQL transaction advisory lock serializes the mobile-number check and insert for parallel submissions without a key.
- **Visible provenance.** The chat surfaces tool names, arguments, outcomes, and quote results so reviewers can see which backend result supports a displayed figure.
- **Safe admin language filters.** Plain English is converted into a small Zod-validated filter object and Prisma query. The application never executes generated SQL.
- **Useful without live credentials.** Seeded data, selectable appraisal-slip presets, mock mode, Docker and CI make the full journey straightforward to run and review.

## Platform capabilities

| Area | Delivered |
|---|---|
| API and business rules | Active loan schemes, pure quote endpoint, lead submit/list/detail, shared validation, and consistent error envelope |
| Exact financial calculations | Integer paise, rational purity arithmetic, whole-rupee display floor, server-enforced 75% maximum LTV |
| Borrower experience | Mobile-first three-step intake, 300 ms quote debounce, plan cards, field-level errors, conflict and receipt states |
| AI Loan Assist | Shared-tool quoting and submission, missing-field recovery, explicit UI confirmation, English/Hinglish, topic and injection guardrails |
| Application integrity | Idempotency replay, concurrent duplicate protection, status transitions, audit trail, and cached gold-rate endpoint |
| Appraisal and operations | Slip vision/OCR fallback, safe plain-English lead filters, paginated table, status and audit drawer |
| Deployment and security | Rate limiting, Helmet/CORS, Docker Compose, PostgreSQL GitHub Actions CI |

## API map

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/loan-schemes` | Active database-backed plans |
| `GET` | `/api/v1/gold-rate` | Cached 24K benchmark rate |
| `POST` | `/api/v1/quotes` | Validate and calculate an estimate; does not create a lead |
| `POST` | `/api/v1/leads` | Recalculate, deduplicate, and create a lead (`Idempotency-Key` supported) |
| `GET` | `/api/v1/leads` | Newest-first leads with masked mobile numbers |
| `GET` | `/api/v1/leads/:id` | Lead details and audit entries |
| `GET` | `/api/v1/leads/:id/audit-logs` | Chronological audit history |
| `PATCH` | `/api/v1/leads/:id/status` | Validated status transition and audit note |
| `POST` | `/api/v1/agent/chat` | Agent conversation, tool traces, pending summary, or receipt |
| `POST` | `/api/v1/agent/extract-slip` | Vision/OCR extraction or a demo slip preset |
| `POST` | `/api/v1/agent/admin-filter` | Safe plain-English filter to structured query |

All error responses use `{ "error": { "code", "message", "fields?", "applicationId?", "appliedAt?" } }`. Mobile numbers are masked in lead-list, filtered-lead, and agent tool-trace responses.

## Environment configuration

Copy the root `.env.example` to `.env`. API values can also be set in `apps/api/.env.example`. **Do not commit secrets.** With no API key, `LLM_PROVIDER=mock` selects deterministic orchestration. With a provider configured, set the corresponding key and provider name; the backend still validates every tool call.

| Variable | Example/default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/tglobal_gold_loan?schema=public` | PostgreSQL connection used by Prisma |
| `PORT` | `4000` | API port |
| `GOLD_RATE_24K_PAISE` | `700000` | ₹7,000.00 per gram as paise per gram |
| `LLM_PROVIDER` | `gemini` (or `mock`) | Provider adapter: `gemini`, `groq`, `ollama`, or `mock` |
| `GEMINI_API_KEY` | empty | Gemini tool calling and appraisal-slip vision |
| `GROQ_API_KEY` | empty | Groq `llama-3.3-70b-versatile` tool calling |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama server |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds |
| `LEADS_RATE_LIMIT_MAX` | `10` | Lead POST requests per IP in the window |
| `AGENT_CHAT_RATE_LIMIT_MAX` | `30` | Agent chat requests per IP in the window |
| `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated permitted browser origins |

## Verification

The math and API suite covers the core financial and API regression cases. Monetary examples use the seeded 24K rate of ₹7,000 per gram.

| Case | Assertion |
|---|---|
| 1 | 45g net, 22K, EMI → 41.25g pure · ₹2,88,750 gold value · ₹2,16,562 eligible |
| 2 | 45g net, 22K, Bullet → ₹2,88,750 gold value · ₹2,02,125 eligible |
| 3 | 10g net, 18K, EMI → 7.5g pure · ₹52,500 gold value · ₹39,375 eligible |
| 4 | Net 52g > gross 50g → 400 with `netWeightGrams` field error |
| 5 | `5876543210` and `98765` → 400 with `mobileNumber` field error |
| 6 | Same mobile within seven days → 409 with the existing application reference |
| 7 | Exact request + same idempotency key → original 201 response is replayed |
| 8 | Two concurrent submissions for one new mobile → exactly one 201 and one 409 |

The agent evaluation script runs these ten conversations against the backend service and test database:

| # | Conversation | Key assertion |
|---:|---|---|
| 1 | Happy path through submission | Backend quote, explicit confirmation, persisted GL reference |
| 2 | Missing field recovery | Requests gross/net weights before quoting |
| 3 | Net greater than gross | Tool returns the `netWeightGrams` validation error |
| 4 | Duplicate within seven days | Existing application is identified; no second lead |
| 5 | Off-topic request | Polite refusal and no tools called |
| 6 | Prompt injection attempt | Server rate/LTV retained; exact ₹39,375 quote |
| 7 | Hinglish borrower | Correct 10g / 18K quote of ₹39,375 |
| 8 | Change plan before confirmation | Bullet to EMI refreshes ₹2,02,125 to ₹2,16,562 and re-prompts |
| 9 | Existing application lookup | Fourth tool reports the original GL reference |
| 10 | Investment advice | Refusal; no advice or tool call |

Latest local verification: **100 API/unit tests passed** and **10/10 agent evaluations passed**. The CI workflow reruns migrations, seed, `npm test`, and `npm run eval` on PostgreSQL 16.

## Design and engineering notes

- [ARCHITECTURE.md](./ARCHITECTURE.md) expands the data flow, exact paise pipeline, transaction boundaries, and deployment shape.
- [AI_LOG.md](./AI_LOG.md) records the AI tools/prompts, the premature-purity-rounding mistake, how it was found, and the regression tests for math and duplicate races.

## What I’d do next

- Replace the configured demo benchmark with a sourced MCX feed, signed update timestamps, cache policy, and a circuit breaker.
- Add borrower OTP verification before the final confirmation/submission step.
- Move chat state, rate limits, and duplicate coordination to Redis or a distributed locking service for multi-instance deployment.
- Store uploaded slips in private object storage with signed uploads, file scanning, and explicit retention rules.
- Add authenticated, role-based admin access, observability dashboards, and a review-queue SLA.
- Record a concise two-minute reviewer demo showing the form, tool-grounded agent, confirmation gate, and audit drawer.
