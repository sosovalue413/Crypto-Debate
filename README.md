# CryptoDebate

CryptoDebate is an AI debate layer for crypto decisions. A user enters any crypto thesis, and two AI agents argue both sides: one Bull and one Bear. The debate is grounded in live SoSoValue data, SoSoValue Indexes, SoSoValue Macro events, transparent evidence cards, community voting, outcome tracking, and a SoDEX action intent after the verdict.

The product is built for WaveHack as a memorable live demo: type a thesis, watch the debate form, inspect the data behind every claim, vote on the winner, and prepare the next action.

## The Problem

Crypto investors often make decisions inside echo chambers:

- bullish timelines reward confirmation bias
- private groups amplify their own bags
- influencers rarely show the strongest opposing view
- data is scattered across market pages, ETF trackers, news feeds, and exchange screens

CryptoDebate turns one thesis into a balanced research workflow. It forces both sides into the same room before the user acts.

## What The App Does

- Accepts any crypto thesis, such as `BTC will hit $200k by the end of 2026`.
- Resolves the relevant assets from the thesis.
- Fetches live SoSoValue market, kline, ETF flow, Macro calendar, news, and SoSoValue Index evidence.
- Fetches public SoDEX testnet spot market data for execution context.
- Generates a structured Bull vs Bear debate with OpenAI.
- Runs a grounding audit that rejects invalid evidence IDs and repairs unsupported numeric claims.
- Produces a decision brief with assumptions, invalidation signals, evidence gaps, and next metrics to watch.
- Creates an outcome baseline with 7D, 30D, and 90D checkpoints.
- Shows clickable evidence cards with raw JSON and charts.
- Supports full 3-round debates and Quick Verdict mode.
- Lets the community vote: Bull Won, Bear Won, or Draw, with one anonymous ballot per browser voter per debate.
- Saves debates and votes into a persistent server archive with Redis REST, Vercel Blob, and local file fallback support.
- Exposes public debate, archive, leaderboard, SoDEX readiness, and methodology pages.
- Builds a shareable debate card.
- Connects an injected wallet for signer context and creates an unsigned SoDEX order intent with the signed-write endpoint, EIP-712 signing scheme, required headers, and readiness checklist.

## How It Works

1. The user enters a thesis.
2. The backend resolves token symbols using the SoSoValue currency list.
3. SoSoValue evidence is collected:
   - currency market snapshot
   - daily price klines
   - ETF summary history when the asset is supported
   - SoSoValue Index constituents, market snapshot, and daily klines
   - SoSoValue Macro calendar events and historical actual/forecast data
   - token-specific news or hot news
4. SoDEX public spot tickers are loaded.
5. OpenAI receives only the thesis and evidence summaries with evidence IDs.
6. The Bull and Bear agents generate adversarial arguments, cite evidence IDs, and produce a decision brief.
7. The backend keeps only valid evidence IDs, rebuilds unsupported numeric claims, and stores a grounding audit.
8. The UI renders the debate, decision brief, outcome tracker, evidence panel, raw source data, vote module, archive, share card, and SoDEX intent builder.

If OpenAI fails or the API key is missing, the app falls back to an evidence-only debate frame. If SoSoValue is missing, the app blocks debate generation because live evidence is the core product requirement.

## Core Features

### Debate Engine

The debate engine creates either:

- a full 3-round debate: opening, rebuttal, closing
- a quick verdict: one-line bull case, one-line bear case, balanced verdict, confidence

The AI is instructed not to invent numbers or unsupported claims. It may only cite data points already fetched by the backend. The server then validates the generated output after the model returns.

### Grounding Audit

Wave 3 keeps a visible hallucination-prevention layer:

- every retained citation ID must match a collected evidence card
- speeches with no valid citations receive fallback evidence
- speeches or decision briefs with unsupported numeric claims are rebuilt from live evidence
- the UI displays grounding status, cited cards, repaired speeches, and blocked claims
- the public methodology page documents the evidence pipeline

### Macro And China Lens

Wave 3 adds a real macro evidence layer from the SoSoValue Macro API:

- `/macro/events` supplies the live macro calendar.
- `/macro/events/{event}/history` supplies actual, forecast, and previous values when SoSoValue returns history for the selected event.
- China-related theses prefer live events whose names match China, yuan, CNY, PBOC, Hong Kong, Asia, PMI, stimulus, tariff, or liquidity context.
- If the live calendar does not return a China-specific event, the app labels the card as China macro context and explains that it selected the highest-ranked available macro event instead.
- Non-China theses still receive the most relevant live macro event when available.
- Macro cards are treated like every other evidence card: they receive an evidence ID, can be cited by the debate, appear in the raw-payload panel, and are included in grounding checks.

### Data Evidence Panel

Every evidence card includes:

- source name
- source documentation link
- value summary
- timestamp
- trend classification
- chart when time-series data exists
- redacted raw payload shape in public responses; full provider payloads stay server-side

This makes the debate inspectable instead of just persuasive.

### Community Verdict

Users vote on the debate result. Wave 3 stores votes server-side and uses one anonymous browser ballot per debate, so changing a vote moves the tally instead of inflating it. The store uses Redis REST when configured, Vercel Blob when `BLOB_READ_WRITE_TOKEN` is present, and an ignored local file for development.

### Archive And Search

Generated debates are saved in the server archive and mirrored locally in the browser for fast reloads. In production, each debate is also written to its own private Blob object so public share pages can read the debate directly instead of depending only on the aggregate archive index. Users can search the public archive by thesis, token, winner, or grounding status. Public debate pages and the dynamic archive page turn debates into shareable research memory.

### Leaderboard

The leaderboard page summarizes product quality and community signal:

- analyst reputation score from debate count, evidence count, votes, verified grounding, and tracked outcomes
- top debates ranked by confidence, evidence, votes, and grounding quality
- asset leaderboard showing community lean and vote share by token

### SoDEX Action Intent

After a debate, the app surfaces a matching SoDEX public market, can connect an injected wallet for signer context, and builds an unsigned order intent. The intent resolves live SoDEX spot symbol rules from `/markets/symbols`, includes the schema-level `symbolID`, integer enum values for side/type/time-in-force, the spot batch order path, EIP-712 signing scheme, required signed-write headers, risk context from the debate, and the missing steps before submission. Signed execution is intentionally not submitted without account ID, validated precision/notional rules, a configured verifying contract, wallet/API signing credentials, and explicit user confirmation.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Node.js route handlers
- SoSoValue OpenAPI
- SoDEX REST API
- OpenAI Responses API
- Recharts
- Shaders React
- Vercel deployment target

## Project Structure

```txt
app/
  api/archive       server archive and asset vote history route
  api/debate        debate generation route
  api/featured      daily topic route from SoSoValue hot news
  api/health        safe production health/config check
  api/sodex         public SoDEX market route
  api/sodex/intent  unsigned SoDEX order intent route
  api/vote          persistent anonymous ballot route
  archive           public archive and asset vote history page
  debate/[id]       public debate page
  leaderboard       analyst score and asset leaderboard page
  methodology       public grounding architecture page
  sodex             public SoDEX market and signed-write readiness page
components/
  hero-section.tsx  full application UI
  site-nav.tsx      shared public page navigation
lib/
  sosovalue.ts      SoSoValue client and evidence builder
  sodex.ts          SoDEX public market client
  sodex-intent.ts   SoDEX signed-write readiness builder
  openai-debate.ts  OpenAI debate generator and fallback
  debate-store.ts   Redis/Blob/file archive, ballot, and vote history store
  debate-engine.ts  orchestration layer
  leaderboard.ts    analyst score and leaderboard aggregations
```

## Environment Variables

Create `.env.local` for local development:

```bash
SOSOVALUE_API_KEY=your_sosovalue_api_key
SOSOVALUE_BASE_URL=https://openapi.sosovalue.com/openapi/v1
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SODEX_SPOT_ENDPOINT=https://testnet-gw.sodex.dev/api/v1/spot
BLOB_READ_WRITE_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
KV_REST_API_URL=
KV_REST_API_TOKEN=
CRYPTODEBATE_STORE_PREFIX=cryptodebate
CRYPTODEBATE_FILE_STORE_NAME=cryptodebate-store.json
SODEX_ACCOUNT_ID=
SODEX_EIP712_VERIFYING_CONTRACT=
```

Required:

- `SOSOVALUE_API_KEY`
- `OPENAI_API_KEY` for OpenAI generation. Without it, the app uses the evidence-only fallback.

Optional:

- `OPENAI_MODEL`
- `NEXT_PUBLIC_SITE_URL`
- `SODEX_SPOT_ENDPOINT`
- `SOSOVALUE_BASE_URL`
- `BLOB_READ_WRITE_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `CRYPTODEBATE_STORE_PREFIX`
- `CRYPTODEBATE_FILE_STORE_NAME`
- `SODEX_ACCOUNT_ID`
- `SODEX_EIP712_VERIFYING_CONTRACT`

Never place real keys in source code. `.env*` files are ignored by git.

## Local Development

```bash
corepack pnpm install
corepack pnpm dev
```

Open:

```txt
http://localhost:3000
```

If port `3000` is busy:

```bash
corepack pnpm dev --hostname 127.0.0.1 --port 3001
```

## Quality Checks

```bash
corepack pnpm lint
corepack pnpm build
```

`pnpm lint` currently runs `tsc --noEmit` because this template did not include ESLint as a dependency.

## Deployment

The project is ready for Vercel. Required production environment variables for the full live demo:

- `SOSOVALUE_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `NEXT_PUBLIC_SITE_URL`
- `SODEX_SPOT_ENDPOINT`
- `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL`/`KV_REST_API_TOKEN` for durable production persistence

Optional SoDEX signed-write readiness variables:

- `SODEX_ACCOUNT_ID`
- `SODEX_EIP712_VERIFYING_CONTRACT`

Deploy with the Vercel CLI:

```bash
vercel
vercel --prod
```

Or import the project in the Vercel dashboard and set the same environment variables before the production deployment.

Production health check:

```txt
/api/health
```

The health route reports whether required keys are configured, which persistence backend is active, whether archive reads work, and whether SoDEX public markets are live. It returns booleans and counts only; it never returns secret values.

When `BLOB_READ_WRITE_TOKEN` is configured, the app also caches SoSoValue GET responses in private Blob storage. Live SoSoValue data is still requested first when cache entries expire, but cached responses reduce repeated provider calls during demos and allow stale cached evidence to be used if SoSoValue temporarily rate-limits a request.

## SoSoValue API Contract

The app follows the current SoSoValue API docs:

1. Base URL defaults to `https://openapi.sosovalue.com/openapi/v1`.
2. Every request sends `x-soso-api-key` from `SOSOVALUE_API_KEY`.
3. The client expects the documented wrapper response with `code`, `message`, and `data`.
4. Provider `429` responses, `42901`, and `402901` are handled as rate limits.
5. `Retry-After`, `X-RateLimit-Reset`, and `details.retry_after` are used when present.
6. A local in-memory SoSoValue request budget keeps a cold debate below the documented 20 requests/minute provider limit.
7. Vercel Blob caching reduces repeated SoSoValue GET requests and allows stale reads only when the provider rate-limits.

SoSoValue endpoints currently used:

1. `/currencies`
2. `/currencies/{currency_id}/market-snapshot`
3. `/currencies/{currency_id}/klines`
4. `/etfs/summary-history`
5. `/indices`
6. `/indices/{index_ticker}/constituents`
7. `/indices/{index_ticker}/market-snapshot`
8. `/indices/{index_ticker}/klines`
9. `/macro/events`
10. `/macro/events/{event}/history`
11. `/news`
12. `/news/hot`

## Wave Delivery

### Wave 1: Prototype Completed

- Live thesis input
- Bull and Bear AI debate
- Real SoSoValue evidence cards
- Quick Verdict mode
- Community voting
- Local archive and search
- Share card
- SoDEX public market context and unsigned order intent
- Vercel deployment

### Wave 2: Product Completed

- Persistent database-backed debates and community ballots
- Vercel Blob production persistence with per-debate direct records for faster public-page reads
- Private Blob cache for SoSoValue GET responses to reduce provider rate-limit pressure
- One anonymous vote per browser voter per debate
- Per-asset vote history for longitudinal sentiment
- Public debate pages with Open Graph metadata
- Public archive/trending feed
- Dedicated leaderboard page for analyst score and asset signal
- Dedicated SoDEX readiness page with live public markets and signed-write gates
- Public methodology page documenting the evidence-grounding architecture
- SoSoValue Indexes integration for constituents, returns, and klines
- Decision brief with assumptions, invalidation signals, metrics, and evidence gaps
- Outcome baseline with 7D, 30D, and 90D checkpoints
- SoDEX signed-write readiness flow with EIP-712 metadata and required headers
- Live SoDEX `symbolID` and spot trading-rule resolution for schema-accurate unsigned order previews
- Injected wallet connection for signer context
- Analyst score and asset leaderboard in the product UI
- Separate public pages for archive, leaderboard, SoDEX readiness, methodology, and individual debates
- Production health route that reports config/storage/readiness without exposing secrets
- Robots, sitemap, canonical metadata, Open Graph, and Twitter metadata
- Vercel production deployment at `https://cryptodebate.vercel.app`
- Hardcoded credential and placeholder cleanup: secrets stay in environment variables, and incomplete SoDEX signing fields return `null` plus a readiness checklist

### Wave 3: Final Production Version Completed

- SoSoValue Macro integration for calendar and event history evidence.
- China-focused macro thesis matching using live SoSoValue event names, not static market data.
- Evidence mix panel showing market, technical, flow, index, macro, news, and SoDEX coverage.
- Wave 3 UI copy and loading states.
- Rate-limit hardening against the documented SoSoValue 20 requests/minute key limit.
- Tighter SoSoValue Index selection to avoid duplicate constituent calls.
- Server and browser request timeouts so provider, storage, OpenAI, and SoDEX delays fail cleanly instead of hanging the app.
- Environment-driven SoSoValue and SoDEX base URLs are normalized at runtime, so production can switch endpoints without code changes or double-slash URL bugs.
- Vercel Analytics is enabled only on Vercel deployments, preventing local/self-hosted production builds from logging a missing analytics script.
- SoSoValue source links updated to point at the API docs for evidence inspection.
- README and methodology updated to match the shipped feature set.

### Final Release Verification

Wave 3 was finalized with the SoSoValue docs checked against the current markdown documentation for rate limits, index endpoints, and macro endpoints. The final verification pass covers:

- TypeScript validation with `pnpm lint`.
- Production build with `pnpm build`.
- Production HTTP smoke checks for `/`, `/archive`, `/leaderboard`, `/sodex`, `/methodology`, `/robots.txt`, `/sitemap.xml`, `/api/health`, `/api/archive`, `/api/sodex`, `/api/sodex/intent`, `/api/debate`, and `/api/vote`.
- Real China macro debate generation through `/api/debate`, including a macro evidence card from live SoSoValue data.
- Public debate page loading from the generated debate ID.
- Vote changes persisting as one ballot per browser voter.
- Final Vercel production deployment from this working tree.

## Production Readiness Checklist

1. `SOSOVALUE_API_KEY` is configured in production.
2. `OPENAI_API_KEY` and `OPENAI_MODEL` are configured for AI generation.
3. `NEXT_PUBLIC_SITE_URL` points at the production domain.
4. `SODEX_SPOT_ENDPOINT` points at the intended SoDEX spot API environment.
5. At least one durable persistence backend is configured: Vercel Blob, Upstash Redis REST, or Vercel KV REST.
6. `/api/health` returns `status: ok` after deployment.
7. `pnpm lint` passes.
8. `pnpm build` passes.
9. A full debate can be generated from a China macro thesis.
10. A public debate page opens from the generated debate ID.
11. Voting updates once per browser voter and persists in the archive.
12. Evidence cards include source links, redacted raw payload shape, timestamps, and charts where series data exists.
13. SoDEX intent generation returns an unsigned preview and a readiness checklist, not an accidental live order.
14. Browser and server requests have bounded timeouts for live providers and persistence backends.
15. No source file contains production secrets; credentials live only in environment variables.

### Post-Launch Improvements

- Signed SoDEX order submission after account ID, symbol precision, verifying contract, wallet signature, API nonce, and user confirmation are fully configured
- Automated outcome tracking jobs that update 7D, 30D, and 90D checkpoints
- Stronger abuse protection with durable rate limits, bot filtering, and moderation controls
- Mobile PWA install flow and offline-friendly saved debate views
- Embeddable API/widgets for partner apps
- Analytics dashboards for retention, debate quality, grounding repair rates, and conversion from research to action
- Security review before enabling real execution flows

## Hackathon Demo Script

1. Open the app.
2. Enter: `BTC will hit $200k by the end of 2026`.
3. Run a full debate.
4. Show Bull and Bear arguments.
5. Click evidence cards and show raw SoSoValue data.
6. Vote on the winner.
7. Copy the share card.
8. Build a SoDEX unsigned order intent.

That flow demonstrates the full loop: data, analysis, community signal, and execution intent.
