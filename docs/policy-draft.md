# Badge Policy Draft

This repo's current badge unlock model stores low-level verificationType and verificationData.

The next upgrade should move toward an optional higher-level BadgePolicy model that combines:

- 8004 for agent identity and reputation
- 8183 for portable proof and evidence packages
- the existing registry for canonical claim ownership

## Compatibility

BadgePolicy should be optional.

That means:

- normal badges should keep working with the current verificationType and verificationData model
- only badges that need richer identity, reputation, or evidence rules should opt into BadgePolicy
- the product should still support lightweight campaign badges with simple claim logic

The intended split is:

- default badges
  use the existing unlock adapters and current claim flow
- advanced badges
  attach a BadgePolicy for extra 8004 and 8183 constraints

## Current Repo Status

The optional advanced path is now partially implemented in this repo:

- ORACLE_8183 badge policies are live
- AGENT_8183 badge policies are live
- the browser badge form exposes advanced criteria behind an opt-in toggle
- claim and detail views show proofHash-backed evidence summaries
- operator CLIs exist for issuing agent proofs and rotating badge verification policy

Useful commands:

- `node scripts/issue-agent-proof.mjs ...`
- `bun run update:badge-policy --deployment web/public/local/anvil-deployment.json --definition-id <id> ...`

## Proposed Solidity Shape

See [BadgePolicyTypes.sol](/Users/samuelzeller/conductor/agentic%20poap/contracts/src/libraries/BadgePolicyTypes.sol).

The core shape is:

    struct BadgePolicy {
        PolicyRuleKind ruleKind;
        IdentityPolicy identity;
        EvidencePolicy evidence;
        ScarcityPolicy scarcity;
        OnchainPolicy onchain;
        bytes32 merkleRoot;
    }

When ruleKind is NONE, the badge should behave like a normal badge with no advanced policy enforcement.

## What Each Part Means

### IdentityPolicy

- requireRegisteredAgent
  Enforce 8004 identity registration before a claim can succeed.
- requirePrimaryWallet
  Require the submitting wallet to match the agent's primary wallet in the 8004 identity registry.
- uniquePerAgent
  Enforce one claim per agent identity, not just per wallet.
- minSubjectReputation
  Only let agents with enough 8004 reputation earn the badge.
- minIssuerReputation
  Only let trusted attestors or agents issue evidence for the badge.

### EvidencePolicy

- schemaId
  Names the 8183 evidence schema. Example: keccak256("agentic-poap.oracle-event.v1").
- contextId
  Names the campaign or event context. Example: keccak256("trailblazer-launch-2026").
- requiredIssuer
  Restricts the accepted signer or oracle.
- maxAge
  Rejects stale evidence even if it has not reached absolute expiry.
- requireExpiry
  Requires an explicit expiresAt inside the 8183 package.
- nonceScope
  Controls replay protection.

### ScarcityPolicy

- startsAt
  Optional claim start time.
- endsAt
  Optional claim end time.
- maxClaims
  Optional global cap for the badge line.

### OnchainPolicy

- target
  Contract used for onchain state checks.
- selector
  View function selector used for eligibility reads.
- threshold
  Threshold or minimum value for that check.

## How It Maps To Current Unlocks

- BADGE_COUNT
  ruleKind = ONCHAIN_STATE
  onchain.target = badge registry
  onchain.selector = getAgentBadgeCount(address)
- TOKEN_BALANCE
  ruleKind = ONCHAIN_STATE
  onchain.target = token contract
  onchain.selector = balanceOf(address)
- ORACLE_EVENT
  ruleKind = ORACLE_8183
  evidence.requiredIssuer = trusted event signer
  evidence.contextId = event slug hash
- AGENT_REP
  ruleKind = AGENT_8183
  identity.minIssuerReputation = trusted-agent threshold

This mapping is meant to extend the existing unlocks, not replace them.

## Recommended 8183 Envelope

The proof package should include:

    {
      "issuer": "0xIssuer",
      "subject": "0xAgent",
      "registry": "0xBadgeRegistry",
      "chainId": 31337,
      "definitionId": 4,
      "schemaId": "0x...",
      "contextId": "0x...",
      "issuedAt": 1711111111,
      "expiresAt": 1711114711,
      "nonce": "0x...",
      "evidenceUri": "ipfs://...",
      "evidenceHash": "0x...",
      "signature": "0x..."
    }

The contract should verify:

- issuer
- subject
- badge or definition id
- registry address
- chain id
- issuedAt and expiresAt
- nonce unused
- signature valid

Then the registry should store only:

- claim ownership
- proofHash

The full 8183 package stays offchain and is displayed in the UI as evidence.

## Product Principle

BadgePolicy should never narrow the product into only "special" badges.

The system should continue to support:

- simple event and campaign badges
- paid mints with basic verification
- attestor-issued pilot badges
- richer prestige or provenance badges when a project wants them

In other words:

- simple badge = current path
- special badge = current path plus optional advanced policy

## User-Facing Outcome

This model lets the project support badges like:

- one per 8004 agent identity
- only for agents above a reputation threshold
- only for agents vouched for by trusted peer agents
- only for agents with a signed event attendance package
- only for the first N unique agents in a launch cohort

That gives the badge collection more personality and stronger provenance without making the registry itself heavy.
