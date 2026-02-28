# GongIntel

## What This Is

A web application that analyzes Gong sales call transcripts using Claude AI. It authenticates users via Google SSO (restricted to @cast.ai), pulls transcript files from a shared Google Drive folder via service account, runs 8-dimension AI analysis (summary, sentiment, objections, action items, topics, talk ratio, competitor mentions, speaker mapping), stores results in Firestore, and presents a React dashboard with export capability.

## Core Value

Turn raw call transcripts into structured, actionable sales intelligence — automatically.

## Tech Stack

- **Runtime:** Bun
- **API:** Hono (TypeScript)
- **Frontend:** React + Tailwind CSS + Vite
- **Database:** Firestore (Firebase Admin SDK)
- **AI:** Claude (Anthropic SDK)
- **Auth:** Google OAuth 2.0 SSO (domain-restricted)
- **Storage:** Google Drive (service account, read-only)
- **Deployment:** Google Cloud Run (API) + Cloud Storage (static frontend)
- **Structure:** Bun monorepo (`apps/api`, `apps/web`)

## Requirements

### Validated

- ✓ Google SSO with @cast.ai domain restriction — v1.0
- ✓ Service account access to Google Drive Gong folder — v1.0
- ✓ Parse Gong transcript format (header metadata + speaker turns) — v1.0
- ✓ Email-based participant matching and access control — v1.0
- ✓ Claude-powered 8-dimension call analysis — v1.0
- ✓ Firestore persistence for users, calls, and analyses — v1.0
- ✓ React dashboard with call list, detail view, and analysis display — v1.0
- ✓ Markdown export of analysis reports — v1.0
- ✓ Structured error handling with retries, timeouts, and JSON logging — v1.0
- ✓ Custom error hierarchy with typed operational errors — v1.0
- ✓ React ErrorBoundary for graceful crash recovery — v1.0
- ✓ Startup environment validation — v1.0

### Active

(None — next milestone not yet planned)

### Out of Scope

- PDF export — markdown sufficient for v1, PDF requires headless browser
- Mobile app — web-only, responsive CSS handles mobile viewports
- Pagination/caching — acceptable for current call volume, revisit at scale
- JWT refresh tokens — 7-day expiry, user re-authenticates after
- Rate limiting — internal tool with domain restriction, low abuse risk
- Automated testing — no unit/integration/e2e tests yet

## Context

Shipped v1.0 with 3,296 LOC TypeScript across 33 source files.
Architecture: Bun monorepo with Hono API backend (16 TS files) and React frontend (17 TSX/TS files).
TypeScript compiles with zero errors on both apps.
Deployment infrastructure written (Dockerfile + Cloud Run script) but not yet tested against live GCP.

## Key Decisions

| # | Decision | Rationale | Outcome |
|---|----------|-----------|---------|
| 1 | Bun monorepo over Next.js | Simpler deployment, separate API/frontend scaling | ✓ Good |
| 2 | Hono over Express | Lighter, better TypeScript support, edge-compatible | ✓ Good |
| 3 | Service account for Drive (not user OAuth) | Admin-level access, no per-user Drive permissions | ✓ Good |
| 4 | Firestore over PostgreSQL | Schemaless fits evolving analysis shape, Firebase Admin SDK simplifies auth | ✓ Good |
| 5 | Fire-and-forget background analysis | Non-blocking UX, status polling from frontend | ✓ Good |
| 6 | Deterministic user IDs from email | No UUID generation needed, same email always maps to same ID | ✓ Good |
| 7 | In-memory participant filtering | Firestore array-contains doesn't work on object arrays; acceptable at current scale | ⚠️ Revisit at scale |
| 8 | Custom error hierarchy (AppError) | Consistent HTTP status mapping, operational vs programmer error distinction | ✓ Good |
| 9 | JSON structured logging | Cloud Run captures automatically, enables log-based alerting | ✓ Good |

## Constraints

- Domain restricted to @cast.ai — enforced at OAuth callback
- Single Google Drive folder as transcript source — configured via env var
- Claude model pinned to claude-sonnet-4-20250514 — can be updated in analyzer.ts
- No tests — tech debt carried into v1.1

---
*Last updated: 2026-02-24 after v1.0 milestone*
