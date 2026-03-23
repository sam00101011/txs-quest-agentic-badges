# txs.quest Synthesis Submission Checklist

This document turns the Synthesis submission flow into a practical checklist for `txs.quest`.

## Ready Now

- [x] Live app URL: `https://txs.quest`
- [x] Public claim surface: `https://txs.quest/claim`
- [x] Cloudflare Pages deployment is configured
- [x] Public badge media builds into `dist/pins/`
- [x] Public claim artifacts build into `dist/claims/`
- [x] Product story is already clear in the repo: live badge claiming, proof-backed unlocks, x402 and MPP payment history, optional identity and reputation

## Still Needed

- [ ] Public GitHub repo URL
- [ ] Final demo video URL
- [ ] Moltbook post URL
- [x] Full conversation log
- [ ] Final track selection
- [ ] Final submission metadata with truthful harness, model, skills, tools, and resource URLs
- [ ] Self-custody transfer completed for every team member

## Submission Fields

### Required

- [ ] `teamUUID`
- [ ] `name`
- [ ] `description`
- [ ] `problemStatement`
- [ ] `repoURL`
- [ ] `trackUUIDs`
- [ ] `conversationLog`
- [ ] `submissionMetadata`

### Strongly Recommended

- [x] `deployedURL`: `https://txs.quest`
- [ ] `videoURL`
- [ ] `pictures`
- [ ] `coverImageURL`

## Good Candidate URLs

- [x] `deployedURL`: `https://txs.quest`
- [x] `coverImageURL` candidate: `https://txs.quest/pins/pin1.jpg`
- [x] `pictures` candidate: `https://txs.quest/pins/pin2.jpg`
- [x] public claim example: `https://txs.quest/claims/trailblazer-loop-claim.json`
- [ ] `videoURL`: upload a real project demo, not just a looping badge asset
- [ ] `repoURL`: publish the code to a public GitHub repo

## Content Checklist

### Description

- [x] Explain what txs.quest is in one sentence
- [x] Explain who it is for
- [x] Explain the core flow: check eligibility, claim a badge, verify or share the claim
- [x] Explain what is novel: proof-backed claims, payment-history unlocks, optional identity and reputation integration

Draft copy:

txs.quest is a live badge and proof network for AI agents that turns real activity, attestations, and payment history into claimable, verifiable, and shareable onchain badges.

It is built for AI agents, agent operators, builders, and agent programs that want portable proof of work, participation, and trust.

The core flow is simple: check live eligibility, claim a badge, then verify or share the resulting claim page and onchain record.

What is novel is that badge eligibility can be backed by real proofs, including x402 and MPP payment-history unlocks, with optional identity and reputation integrations that make badges reflect both activity and trust.

Future direction:

Eventually, as AI systems become more capable, a master agent will be able to craft beautiful new badges on the fly as onchain history evolves, while other agents vote among multiple candidate designs and even submit entirely new badge proposals.

### Problem Statement

- [x] State the actual problem: agents do real work but lack portable, verifiable, shareable proof of achievements
- [x] Explain why normal badge or NFT flows are weak for agent-native proof
- [x] Explain why payment-aware and proof-aware claims matter
- [x] Explain what changes if txs.quest exists

Draft copy:

AI agents increasingly ship code, use paid services, receive attestations, and build onchain history, but they still lack a portable, verifiable, and shareable way to prove those achievements. Most badge and NFT systems are decorative, manually issued, or disconnected from the actual activity that should make a claim credible. They rarely capture whether a specific agent really earned a milestone, whether that milestone can be backed by proof, or whether trust and reputation should influence eligibility.

That gap matters even more for agent-native work. An agent may make x402 or MPP payments, complete tasks, receive peer attestations, or build a persistent identity across multiple systems, but those signals are fragmented across apps, wallets, and services. Without a common claim surface, proof of contribution is easy to lose, hard to verify, and difficult to share.

txs.quest changes this by turning real activity into claimable onchain badges with proof-aware unlocks. It supports proof-backed claims, payment-history unlocks across x402 and MPP, and optional identity and reputation integrations, so a badge can reflect not just that something was minted, but that a specific agent actually earned it. If txs.quest exists, agents gain a portable proof layer for work, participation, and trust, and ecosystems gain a more credible way to discover, verify, and reward meaningful agent behavior.

### Conversation Log

- [x] Capture brainstorms, pivots, and breakthroughs in a submission-ready chronological narrative

Compiled draft:

We started from a simple question: how should AI agents prove that they actually showed up, shipped, contributed, or earned trust? Instead of treating badges as decorative collectibles, we reframed the project around portable proof of agency. That led us from a generic POAP-style idea to a stronger concept: a live badge and proof surface for AI agents, now shipped publicly as `txs.quest`.

The first major product decision was to make the badge format feel worth sharing while still remaining lightweight and verifiable. We chose a video-first system built around looping achievement pins, each with a poster still, a short MP4 loop, and claim metadata that can render cleanly across wallets, feeds, profiles, and public claim pages. The breakthrough here was realizing that the asset experience matters for distribution, but the real value comes from the claim semantics behind it.

From there, we designed the core architecture around a few separate layers: media assets, onchain badge definitions and claims, claim rendering, and public web surfaces. We kept media offchain and stored canonical claim ownership onchain, so the system can present a polished badge wall and shareable claim pages without sacrificing verifiability. We also kept optional reputation writeback in scope so badges could become part of a broader trust graph rather than a closed collectible silo.

The next phase focused on claim logic. We wanted `txs.quest` to support more than one kind of unlock, so we kept direct claims for simple badges while also supporting proof-backed and attestor-mediated paths. A key design choice was to avoid precomputing global eligibility. Instead, proof generation happens only when an agent is actively checking or claiming a badge, which keeps the system more honest, more privacy-aware, and easier to reason about.

One of the most important pivots was around payment-based achievements. Rather than creating separate badge worlds for x402 and MPP, we normalized both rails into one payment-history model. That let us treat paid API usage and paid machine actions as first-class badge signals. The result is that a badge can unlock because an agent actually paid for compute, tools, or services, not just because someone manually decided they deserved recognition.

In parallel, we pushed the identity and trust model further. We explored how optional identity and reputation integrations could strengthen advanced badges, especially for claims that should depend on who the agent is, whether it has persistent identity, or whether trusted peers or issuers should influence eligibility. This led to the policy direction documented in the repo: simple badges should stay simple, while higher-trust badges can opt into richer proof, identity, reputation, and evidence-package requirements.

On the frontend and product side, we built `txs.quest` as a live claim surface instead of a static gallery. The core user flow became: check live eligibility, claim a badge, then verify or share the resulting claim page and onchain record. We also added public claim artifacts, profile and badge wall views, and agent-facing guidance so the product can function as both a consumer surface and a machine-readable trust layer.

We then expanded distribution and access. The project is deployed on Cloudflare Pages, publishes public claim artifacts, and includes Farcaster Mini App support with Quick Auth and a safe claim-entry handoff. That work mattered because the product only becomes useful if agents and operators can discover claims where they already spend time, not just inside a standalone demo.

Another important thread was curation. We developed a seeded badge catalog covering agent activity, payment milestones, longevity, cultural participation, and identity-linked achievements. This helped clarify that `txs.quest` is not only about one-off hackathon trophies; it is a broader system for making onchain and agentic history legible, memorable, and portable.

Throughout the build, we kept tightening the language around what makes the project different. The biggest conceptual breakthrough was moving from “minting badges for agents” to “letting agents earn proof-backed claims that can be verified and shared.” That shift shaped everything else: proof-on-claim instead of blanket assumptions, payment-history unlocks instead of vague participation claims, and optional identity and reputation integrations instead of purely cosmetic NFTs.

The current version of `txs.quest` is the first concrete expression of that idea: a live badge and proof network for AI agents. Looking forward, we expect the badge creation layer itself to become more agentic. Eventually, a master agent should be able to generate beautiful new badge designs as onchain history evolves, while other agents vote across multiple candidate designs and even submit entirely new badge proposals for the network to adopt.

### Submission Metadata

- [ ] `agentFramework`
- [ ] `agentFrameworkOther` if needed
- [ ] `agentHarness`
- [ ] `agentHarnessOther` if needed
- [ ] `model`
- [ ] `skills`
- [ ] `tools`
- [ ] `helpfulResources`
- [ ] `helpfulSkills` if you can justify them specifically
- [ ] `intention`
- [ ] `intentionNotes`
- [ ] `moltbookPostURL`

### Likely Tools To Include Only If Actually Used

- [ ] Bun
- [ ] Vite
- [ ] Cloudflare Pages or Wrangler
- [ ] Solidity or Foundry
- [ ] viem
- [ ] wagmi
- [ ] mppx
- [ ] Playwright

## End-to-End Steps

### 1. Confirm team state

- [ ] Confirm registered Synthesis participant identity exists
- [ ] Confirm team UUID
- [ ] Confirm who the team admin is
- [ ] Check whether a draft project already exists
- API: `GET /teams/:teamUUID`

### 2. Choose tracks

- [ ] Review the live catalog
- [ ] Pick the primary track
- [ ] Pick additional tracks if they are genuinely supported by the shipped product
- [ ] Save the chosen track UUIDs
- API: `GET /catalog?page=1&limit=100`

### 3. Finalize public materials

- [ ] Push code to a public GitHub repo
- [ ] Make sure the repo README explains setup and architecture
- [ ] Verify the deployed site is live and working
- [ ] Record and upload a short demo video
- [ ] Choose final cover image and pictures URLs

### 4. Assemble the submission payload

- [x] Export or compile the conversation log
- [x] Write final description
- [x] Write final problem statement
- [ ] Collect the exact helpful resource URLs that were really opened
- [ ] Confirm the actual skills used, not just installed skills
- [ ] Confirm the actual primary harness and model used during the build

### 5. Create the draft project

- [ ] Send `POST /projects`
- [ ] Save the returned `projectUUID`

### 6. Post on Moltbook

- [ ] Publish a Moltbook post about txs.quest
- [ ] Mention the track or tracks you are entering
- [ ] Link the repo
- [ ] Add the post URL to `submissionMetadata.moltbookPostURL`

### 7. Update the draft

- [ ] Review the draft carefully
- [ ] Fix weak copy or missing links
- [ ] Update `trackUUIDs` only with the full desired list
- [ ] Update `submissionMetadata` only with the full required object

### 8. Complete self-custody transfer

- [ ] Every team member calls `POST /participants/me/transfer/init`
- [ ] Every team member calls `POST /participants/me/transfer/confirm`
- [ ] Verify every member is self-custody before publish

### 9. Publish

- [ ] Team admin calls `POST /projects/:projectUUID/publish`
- [ ] Verify the public project slug and listing

### 10. Post-launch visibility

- [ ] Tweet the project
- [ ] Tag `@synthesis_md`
- [ ] Link the live app or repo

## Track Recommendations

### Strong fits

- `Agents With Receipts — ERC-8004`
  - UUID: `3bf41be958da497bbb69f1a150c76af9`
  - Best fit because the repo explicitly includes identity, reputation, receipts, and ERC-8004-style logic.
- `Agent Services on Base`
  - UUID: `6f0e3d7dcadf4ef080d3f424963caff5`
  - Good fit if the shipped demo shows txs.quest as a live agent service with x402 and Base-aligned payment flows.
- `Synthesis Open Track`
  - UUID: `fdb76d08812b43f6a5f454744b66f590`
  - Safe additional track if the project spans several primitives.

### Stretch fit if the demo clearly supports it

- `ERC-8183 Open Build`
  - UUID: `49c3d90b1f084c44a3585231dc733f83`
  - Plausible because the repo references 8183 evidence packages and advanced proof policies.
  - Only enter if the demo shows substantive ERC-8183 integration, not just future plans.

### Not recommended right now without more work

- `OpenWallet Standard`
  - Do not enter unless txs.quest genuinely uses OWS as part of the product architecture.
- `Ethereum Web Auth / ERC-8128`
  - Wallet input or ENS support alone is not enough.
- `Best Use of Locus`
  - Do not enter without a real Locus integration.
- `Ship Something Real with OpenServ`
  - Do not enter unless OpenServ is actual project infrastructure.
- `Agents that pay`
  - Not a fit. This track requires live GMX perps trading on Arbitrum.

## Risks To Close

- [ ] No public GitHub repo URL found in this workspace
- [ ] No demo video URL yet
- [ ] No Moltbook post URL yet
- [ ] No `agent.json` or `agent_log.json` found for autonomy-heavy tracks
- [ ] Installed skills in `.agents/skills/` are not the same as skills actually used in the build
- [ ] Harness and model should be based on real build history, not guesses

## Suggested Track Set

- [ ] Primary: `Agents With Receipts — ERC-8004`
- [ ] Additional: `Agent Services on Base`
- [ ] Additional: `Synthesis Open Track`
- [ ] Optional fourth: `ERC-8183 Open Build` if the demo supports it
