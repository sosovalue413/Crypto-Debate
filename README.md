# CryptoDebate

CryptoDebate is an AI debate layer for crypto decisions. A user enters any crypto thesis, and two AI agents argue both sides: one Bull and one Bear. The debate is grounded in live SoSoValue data, transparent evidence cards, community voting, and a SoDEX action intent after the verdict.

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
- Fetches live SoSoValue market, kline, ETF flow, and news evidence.
- Fetches public SoDEX testnet spot market data for execution context.
- Generates a structured Bull vs Bear debate with OpenAI.
- Shows clickable evidence cards with raw JSON and charts.
- Supports full 3-round debates and Quick Verdict mode.
- Lets the community vote: Bull Won, Bear Won, or Draw.
- Saves debates into a local searchable archive for Wave 1.
- Builds a shareable debate card.
- Creates an unsigned SoDEX order intent that can later be connected to a wallet/API signing flow.

## How It Works

1. The user enters a thesis.
2. The backend resolves token symbols using the SoSoValue currency list.
3. SoSoValue evidence is collected:
   - currency market snapshot
   - daily price klines
   - ETF summary history when the asset is supported
   - token-specific news or hot news
4. SoDEX public spot tickers are loaded.
5. OpenAI receives only the thesis and evidence summaries with evidence IDs.
6. The Bull and Bear agents generate arguments and cite those evidence IDs.
7. The UI renders the debate, evidence panel, raw source data, vote module, archive, share card, and SoDEX intent builder.

If OpenAI fails or the API key is missing, the app falls back to an evidence-only debate frame. If SoSoValue is missing, the app blocks debate generation because live evidence is the core product requirement.

## Core Features

### Debate Engine

The debate engine creates either:

- a full 3-round debate: opening, rebuttal, closing
- a quick verdict: one-line bull case, one-line bear case, balanced verdict, confidence

The AI is instructed not to invent numbers or unsupported claims. It may only cite data points already fetched by the backend.

### Data Evidence Panel

Every evidence card includes:

- source name
- source documentation link
- value summary
- timestamp
- trend classification
- chart when time-series data exists
- raw JSON payload

This makes the debate inspectable instead of just persuasive.

### Community Verdict

Users vote on the debate result. Wave 1 stores lightweight in-memory/local state for demo speed. Wave 2 moves this to persistent user accounts and reputation-weighted voting.

### Archive And Search

Generated debates are saved locally in the browser. Users can search by thesis, token, or outcome. This demonstrates the future product direction: a historical sentiment and thesis archive.

### SoDEX Action Intent

After a debate, the app surfaces a matching SoDEX public market and builds an unsigned order intent. Signed execution is intentionally not submitted yet because that requires wallet/API signing credentials and production-grade transaction safety.

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
  api/debate      debate generation route
  api/featured    daily topic route from SoSoValue hot news
  api/sodex       public SoDEX market route
  api/vote        lightweight demo voting route
components/
  hero-section.tsx  full application UI
lib/
  sosovalue.ts      SoSoValue client and evidence builder
  sodex.ts          SoDEX public market client
  openai-debate.ts  OpenAI debate generator and fallback
  debate-engine.ts  orchestration layer
```

## Environment Variables

Create `.env.local` for local development:

```bash
SOSOVALUE_API_KEY=your_sosovalue_api_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
SODEX_SPOT_ENDPOINT=https://testnet-gw.sodex.dev/api/v1/spot
```

Required:

- `SOSOVALUE_API_KEY`
- `OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL`
- `SODEX_SPOT_ENDPOINT`
- `SOSOVALUE_BASE_URL`

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

The project is ready for Vercel. Required production environment variables:

- `SOSOVALUE_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SODEX_SPOT_ENDPOINT`

Deploy with the Vercel CLI:

```bash
vercel
vercel --prod
```

Or import the project in the Vercel dashboard and set the same environment variables before the production deployment.

## Wave Roadmap

### Wave 1: Working Prototype

- Live thesis input
- Bull and Bear AI debate
- Real SoSoValue evidence cards
- Quick Verdict mode
- Community voting
- Local archive and search
- Share card
- SoDEX public market context and unsigned order intent
- Vercel deployment

### Wave 2: Full Product

- Wallet authentication
- Persistent database for debates, votes, and users
- Reputation-weighted voting
- Public debate pages
- Open Graph image generation
- Trending feed
- Daily featured debate automation
- SoDEX testnet signed execution
- Analyst profiles and leaderboards

### Wave 3: Production Launch

- SoDEX mainnet execution with wallet signing
- Prediction tracking over time
- Mobile PWA
- Telegram bot for daily debates
- API for embedding CryptoDebate in other apps
- Premium debate rooms
- Security review and abuse protection
- Full analytics and retention loops

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
