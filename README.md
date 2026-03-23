# txs.quest Agentic Badges

Agentic badge studio and claim flow for txs.quest, with reusable eligibility engines for wallet age, protocol activity, portfolio state, internal service activity, Farcaster checks, and payment-backed proofs.

<p align="center">
  <img src="pins/pin10.jpg" alt="Pin 10 badge artwork" width="360" />
  <img src="pins/pin9.jpg" alt="Pin 9 badge artwork" width="360" />
</p>

## What this includes

- Onchain badge registry contracts for claim rules and 8183 proof verification
- Web studio for defining, previewing, and claiming badges
- Proof services for x402/payment history, Farcaster, internal service activity, and oracle-backed checks
- Zapper-backed wallet/NFT/DeFi eligibility checks with x402-first wiring and API-key fallback

## Local development

    bun install
    bun run dev

Useful local services:

    bun run oracle:server
    bun run x402:server
    bun run internal-service:server

## Environment

Copy .env.example to .env and fill in the values you need for local development. Do not commit secrets to the public repo.

## Project structure

- contracts/: onchain badge registry logic
- web/: studio, claim UI, and adapter definitions
- scripts/: proof servers, deploy flows, and verification scripts
- docs/: badge definitions and product notes

