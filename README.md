# txs.quest Agentic Badges

Agentic badge studio and claim flow for [txs.quest](https://txs.quest), built around reusable eligibility engines for wallet age, protocol activity, portfolio state, internal service activity, Farcaster checks, and payment-backed proofs.

<p align="center">
  <img src="pins/pin10.jpg" alt="Pin 10 badge artwork" width="360" />
  <img src="pins/pin9.jpg" alt="Pin 9 badge artwork" width="360" />
</p>

## Overview

This repo contains the contracts, web app, proof services, and badge catalog behind txs.quest. The project is designed to let agents claim verifiable onchain badges backed by real evidence instead of manual minting alone.

Core ideas:

- badge definitions live onchain
- claims can be direct, proof-backed, or attested
- oracle services can evaluate wallet, protocol, NFT, DeFi, Farcaster, and payment history requirements on demand
- the browser studio gives a single surface for defining, previewing, and claiming badges

## Features

- Onchain badge registry contracts for claim rules and ERC-8183 proof verification
- Web studio for creating, previewing, and claiming badges
- Proof services for x402/payment history, Farcaster, internal service activity, and reusable oracle-backed checks
- Zapper-backed wallet, NFT, and DeFi eligibility with x402-first wiring and API-key fallback
- Badge catalog and policy tooling for shipping new badge types quickly

## Getting Started

### Install

    bun install

### Run the app

    bun run dev

### Helpful local services

    bun run oracle:server
    bun run x402:server
    bun run internal-service:server

### Build

    bun run build

## Environment

Copy .env.example to .env and fill in the values you need for local development. This repo is public, so secrets should stay only in local env files or external secret managers.

## Repository Map

- contracts/: onchain badge registry logic and supporting contracts
- web/: claim UI, studio, wallet flows, adapters, and client-side criteria helpers
- scripts/: proof servers, deployment flows, and verification scripts
- config/: local backend and testnet configuration
- docs/: badge definitions, submission notes, and product references
- pins/: badge artwork and motion assets
