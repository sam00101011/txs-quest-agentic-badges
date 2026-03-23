# Agentic POAP — Looping Achievement Pins for AI Agents

> Proof of agency as collectible enamel-pin loops. Poster stills, 5-second MP4 pins, Tempo-native claim records, and reputation writeback.

## Current Direction

Agentic POAP is now a video-first badge system.

- the primary badge asset is a short looping MP4
- each badge also has a poster still
- the current source media lives in [`pins/`](/Users/samuelzeller/conductor/agentic%20poap/pins)
- the first shipped set is:
  - [`pin1.mp4`](/Users/samuelzeller/conductor/agentic%20poap/pins/pin1.mp4) with [`pin1.jpg`](/Users/samuelzeller/conductor/agentic%20poap/pins/pin1.jpg)
  - [`pin2.mp4`](/Users/samuelzeller/conductor/agentic%20poap/pins/pin2.mp4) with [`pin2.jpg`](/Users/samuelzeller/conductor/agentic%20poap/pins/pin2.jpg)

## Why It Matters

POAP-like records still matter for agents. We want a portable proof that an agent showed up, shipped, survived, contributed, or earned trust.

This version is designed for:

- lightweight playback in wallets, feeds, and profile pages
- easy sharing without special rendering requirements
- Tempo-native claim issuance
- optional reputation writeback through registry integrations

## Product Shape

Each badge should work in two primary modes:

1. Poster mode
   A clean still image for compact surfaces.
2. Loop mode
   A seamless 5-second MP4 for richer claim pages and badge detail views.

The product should optimize for:

- autoplaying muted loops
- mobile-safe file sizes
- recognizable silhouettes and finishes
- consistent timing and pacing across a badge family

## Architecture

```text
┌────────────────────┐     ┌──────────────────────┐     ┌────────────────────┐
│ Pin Source Media   │────▶│ Asset Registry       │────▶│ Claim Metadata     │
│ (mp4 + jpg)        │     │ (video, poster,      │     │ (image +           │
│                    │     │ hashes, detail page) │     │ animation_url)     │
└────────────────────┘     └─────────┬────────────┘     └─────────┬──────────┘
                                      │                            │
                                      ▼                            ▼
                           ┌──────────────────────┐     ┌────────────────────┐
                           │ AgenticBadgeRegistry │────▶│ Web Pin Gallery    │
                           │ (definitions, claims,│     │ and claim detail   │
                           │ attestors, claimURI) │     │ playback           │
                           └─────────┬────────────┘     └─────────┬──────────┘
                                     │                            │
                                     ▼                            ▼
                           ┌──────────────────────┐     ┌────────────────────┐
                           │ Reputation Writeback │     │ Wallet / Feed      │
                           │ (optional)           │     │ poster + loop use  │
                           └──────────────────────┘     └────────────────────┘
```

## Project Structure

```text
agentic-poap/
├── contracts/
│   └── src/
│       ├── AgenticBadgeRegistry.sol
│       ├── BadgeAssetRegistry.sol
│       ├── BadgeClaimRenderer.sol
│       └── libraries/
├── pins/
│   ├── pin1.mp4
│   ├── pin1.jpg
│   ├── pin2.mp4
│   └── pin2.jpg
├── scripts/
│   ├── generate-sample-assets.mjs
│   ├── deploy-local.mjs
│   └── mpp-mint-server.mjs
├── web/
│   ├── index.html
│   ├── app.js
│   ├── tempoClaimStudio.js
│   ├── onchainBadgeClient.js
│   └── public/
│       ├── pins/
│       ├── claims/
│       └── local/
└── agenticpoap.md
```

## Asset Model

The asset registry should store:

- `videoUri`
- `posterUri`
- `detailUri`
- `videoHash`
- `posterHash`
- `edition`
- `loopSeconds`

The onchain registry should only point at assets. It should not try to store media.

## Claim Metadata Shape

Claims should resolve to metadata like:

```json
{
  "name": "Trailblazer",
  "description": "Awarded to early agent contributors and first-wave builders.",
  "image": "/pins/pin1.jpg",
  "animation_url": "/pins/pin1.mp4",
  "external_url": "/index.html?claim=/claims/trailblazer-loop-claim.json",
  "assets": [
    {
      "uri": "/pins/pin1.mp4",
      "mime_type": "video/mp4"
    }
  ],
  "properties": {
    "record_type": "tempo-badge-claim",
    "video_uri": "/pins/pin1.mp4",
    "poster_hash": "0x...",
    "video_hash": "0x...",
    "edition": "trailblazer-launch",
    "loop_seconds": 5
  }
}
```

## Web Experience

The web app should now do four things well:

1. preview a looping pin and poster
2. define badge records against poster + video assets
3. issue or mint Tempo-native claims
4. browse a gallery of claimed pins

The app should not depend on realtime rendering for any core experience.

## Claim Flow

There are two main issuance paths:

1. Direct wallet issuance
   A connected wallet self-claims or attestor-claims against the live registry.
2. MPP minting
   A user pays through MPP and a mint service records the claim.

## Unlock Types

The unlock logic remains the same:

- event attendance
- onchain state checks
- oracle attestations
- agent attestations

Only the media format changed.

## Badge Policy Direction

The current registry stores verificationType plus raw verificationData.

The next upgrade should move toward an optional first-class BadgePolicy model that combines:

- 8004 identity and reputation checks
- 8183 evidence packages for signed event and peer attestations
- the existing claim registry as the canonical source of badge ownership

This should remain an advanced path, not the default for every badge.

Normal badges should still be able to use today's simpler unlock flows with no 8004 or 8183 dependency at all.

At a high level:

    8004 = who the agent is and how trusted they are
    8183 = why this badge was earned
    AgenticBadgeRegistry = whether the badge is actually claimed

A draft Solidity shape now lives in [BadgePolicyTypes.sol](/Users/samuelzeller/conductor/agentic%20poap/contracts/src/libraries/BadgePolicyTypes.sol), with a fuller implementation note in [policy-draft.md](/Users/samuelzeller/conductor/agentic%20poap/docs/policy-draft.md).

That policy model is meant to support badges with criteria like:

- one claim per registered 8004 agent identity
- minimum subject reputation
- minimum issuer reputation
- signed event proofs scoped to a specific event or campaign
- replay protection with evidence nonces
- limited release windows and capped claim counts

The intended product split is:

- standard badges use the existing verificationType plus verificationData model
- advanced badges may opt into BadgePolicy when they need stronger identity, reputation, or evidence rules

## Payment History Direction

MPP and x402 should feed one optional payment-history badge system instead of creating parallel badge ownership silos.

The working model is:

- the connected agent wallet remains the self-claiming subject
- x402 request history and MPP payer history are normalized into one payment-history evaluation
- proof generation happens only at claim time, so we do not precompute eligibility for every wallet
- legacy x402-only badges remain supported for low-friction cases
- combined payment-history badges can require MPP, x402, or both rails

At a high level:

    payment history service = spend and usage evidence across MPP and x402
    optional 8004 identity = who the agent is
    8183 proof = why the cross-rail badge is claimable
    AgenticBadgeRegistry = canonical claimed badge ownership

## Roadmap

### Phase 1 — Pin Ingest

- standardize the checked-in `pins/` assets
- copy source media into the web app’s public media directory
- confirm poster + video pairings and hashes
- confirm seamless looping and mobile-safe playback

### Phase 2 — Video Metadata

- point claim metadata at poster + looping video assets
- finalize `videoUri` asset registration
- generate sample claim packages from the checked-in pins

### Phase 3 — Tempo-native Issuance

- define badge assets onchain
- issue claims with wallets
- support paid minting through MPP
- write back reputation where appropriate

### Phase 4 — Gallery Surfaces

- claim gallery
- badge detail playback
- agent profile shelves
- shareable claim pages

### Phase 5 — Production Unlock Sources

- expiring signed event attendance proof packages
- real onchain token balance gates
- production agent attestation flows
- operator tooling to issue and rotate unlock signers safely

### Phase 6 — Unified Payment History

- keep x402-only badges working for lightweight paid-API milestones
- add a combined payment-history badge path for MPP, x402, or both
- request proof evaluation only when the connected wallet actively claims
- allow an optional connected MPP payer wallet to authorize inclusion in the same proof
- expose payment-proof health, recent decisions, and badge definition controls in the operator surface

Current repo status:

- signed event proof packages are implemented
- token balance gates are implemented
- optional AGENT_8183 peer-attestation policies are implemented
- operator tooling now exists at [issue-agent-proof.mjs](/Users/samuelzeller/conductor/agentic%20poap/scripts/issue-agent-proof.mjs) and [update-badge-proof-policy.mjs](/Users/samuelzeller/conductor/agentic%20poap/scripts/update-badge-proof-policy.mjs)
- x402 history badges now support both local file-backed proofs and remote/backend proof sources through [x402-proof-server.mjs](/Users/samuelzeller/conductor/agentic%20poap/scripts/x402-proof-server.mjs)
- unified payment-history badges can now aggregate x402 and optional MPP payer history at claim time while keeping x402-only badges compatible
- testnet deployment manifests can now be generated with [deploy-network.mjs](/Users/samuelzeller/conductor/agentic%20poap/scripts/deploy-network.mjs) and [config/testnet.example.json](/Users/samuelzeller/conductor/agentic%20poap/config/testnet.example.json)
- payment proof backends can now be configured with either [payment-backend.example.json](/Users/samuelzeller/conductor/agentic%20poap/config/payment-backend.example.json) or the legacy [x402-backend.example.json](/Users/samuelzeller/conductor/agentic%20poap/config/x402-backend.example.json) shape
- the web app now includes an operator surface for x402 service health and recent proof decisions
- optional 8004 identity registration is now exposed in the browser for deployments that include an identity registry
- wallet diagnostics now show deployment profile, chain alignment, and identity status for both contract and payer wallets
- deployment manifests now carry richer service metadata for payment-proof and MPP URLs so the browser can hydrate testnet operator endpoints directly

## Immediate Priorities

1. Treat the checked-in pin media as the source of truth.
2. Keep every badge package to poster + MP4.
3. Keep Tempo claims as the primary onchain primitive.
4. Optimize the web app for lightweight playback and sharing.
5. Graduate local unlock demos into production-ready proof and token flows.
6. Treat payment history as an optional shared rail across MPP and x402 instead of duplicating badge ownership per payment system.

## Summary

Agentic POAP is a looping-pin badge system for agents:

- achievements unlock from real agent behavior
- each badge ships as poster + looping video
- Tempo claim records are the main issuance surface
- wallet and gallery experiences should be media-light and easy to share

The repo should now evolve entirely around that model.
