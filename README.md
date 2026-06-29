# Early

Early is a proof-of-discovery app for cultural internet moments.

The v1 flow lets a user paste an X post URL, generate a Reclaim Protocol proof that their authenticated X account liked and replied under that post, and receive an Early receipt only after the proof callback is verified server-side.

The long-term protocol goal is a private curator resume: prove you found something before it became culturally obvious, without exposing your Web2 identity on-chain.

## Current State

This repository currently ships:

- A polished Next.js App Router frontend for the Early proof flow.
- A working custom Reclaim provider for X endorsed contributions.
- Reclaim JS SDK integration for creating proof sessions.
- Supabase-backed proof session tracking.
- A Reclaim callback endpoint that stores and verifies returned proofs before the UI shows a receipt.

Zama FHE and Stellar/Soroban integrations are planned next, but are not yet production-wired in this app.

## How It Works

1. The user pastes an X post URL into Early.
2. Early creates a Reclaim proof session on the server.
3. The session is inserted into Supabase as `pending`.
4. The user is redirected to the Reclaim portal to complete the authenticated X verification.
5. Reclaim POSTs the proof payload to Early's callback endpoint.
6. Early verifies the proof with `@reclaimprotocol/js-sdk`.
7. Supabase updates the session to `succeeded` or `failed`.
8. The frontend polls the session endpoint and only shows the Early Card when the verified callback is stored.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- GSAP
- Reclaim Protocol JS SDK
- Supabase Postgres via REST API

## Environment Variables

Create `.env.local` from `.env.example`.

```bash
cp .env.example .env.local
```

Required values:

```txt
RECLAIM_APP_ID=
RECLAIM_APP_SECRET=
RECLAIM_PROVIDER_ID=
RECLAIM_PROVIDER_VERSION=1.0.0
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Notes:

- `RECLAIM_APP_SECRET` must stay server-side.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side. Never expose it in client code.
- For Vercel, set `NEXT_PUBLIC_APP_URL` to the deployed URL, for example `https://early-psi.vercel.app`.

## Supabase Setup

Run the SQL in:

```txt
supabase/reclaim_proof_sessions.sql
```

The table stores Reclaim proof sessions and enables Row Level Security. The app accesses the table only from server routes using the Supabase service role key.

For this development milestone, the full Reclaim proof payload is stored as `jsonb`. A later privacy hardening pass should minimize or redact stored proof data before production use.

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the dev server:

```bash
pnpm dev
```

Open:

```txt
http://localhost:3000
```

For local proof callbacks, Reclaim may not be able to POST back to `localhost`. Use the deployed Vercel URL or a tunnel when testing full end-to-end callbacks.

## Scripts

```bash
pnpm lint
pnpm build
pnpm start
pnpm dev
```

## Reclaim Provider

Current provider:

```txt
Name: Early X Endorsed Contribution
Provider ID: fe0767e9-8172-48c0-ba64-702703c4c745
Version: 1.0.0
```

The provider verifies that an authenticated X user has:

- liked the parent post,
- replied under the same parent post,
- a reply timestamp from X's server response,
- account identity fields needed for proof extraction.

Because X's web GraphQL internals can change, the provider may need maintenance if X rotates the `TweetDetail` query id or response shape.

## Deployment

The app is Vercel-ready.

Use:

```txt
Framework Preset: Next.js
Install Command: pnpm install
Build Command: pnpm build
Output Directory: leave blank
```

Add all required environment variables in Vercel before deploying.

## Roadmap

Near-term:

- Parse and display real extracted proof fields more cleanly.
- Add proof payload minimization before storing data.
- Add clearer failure and retry states.
- Explore Reclaim browser extension UX to reduce repeated portal logins.

Protocol milestones:

- Encrypt sensitive handle/timestamp data with Zama FHE.
- Submit encrypted proof metadata to an fhEVM contract.
- Add a public receipt or verification layer on Stellar/Soroban for hackathon-compatible ZK proof settlement.

## Security Notes

- Do not commit `.env.local`.
- Do not paste `RECLAIM_APP_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` in chat, issues, commits, or frontend code.
- Keep Supabase RLS enabled.
- Use dedicated test X accounts during repeated Reclaim portal testing to avoid X login throttling.
