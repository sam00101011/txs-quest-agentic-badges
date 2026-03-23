# Solidity Verification Process

## Purpose

Use this document whenever we need to verify Solidity code in this repo.

The goal is not just to "run an audit tool." The goal is to combine:

- current production guidance from `ethskills.com`,
- fast parallel checklist coverage from `pashov/skills`,
- deep vulnerability and exploit research from `evmresearch.io/index`,
- manual protocol-specific reasoning,
- concrete Foundry verification.

## Source Stack

### 1. `ethskills.com`

Use `ethskills` as the routing and reality-check layer.

Default pages:

- `https://ethskills.com/security/SKILL.md`
- `https://ethskills.com/testing/SKILL.md`
- `https://ethskills.com/audit/SKILL.md`

Load more only if the contract needs them, for example:

- `standards` for token or signature standards
- `building-blocks` for DeFi integrations
- `addresses` when an external protocol address matters
- `l2s` or chain-specific references when deployment assumptions matter

### 2. `pashov/skills`

Use the Pashov `solidity-auditor` workflow as the fast parallel scan layer.

Primary repo:

- `https://github.com/pashov/skills`

In this Codex environment, the local skill is already available and should be used whenever I am asked to audit or review Solidity for security.

### 3. `evmresearch`

Use the EVM Research index as the deep pattern lookup layer.

Primary index:

- `https://evmresearch.io/index`

I use it after I understand the protocol surface so I can traverse:

- `vulnerability-patterns`
- `exploit-analyses`
- `security-patterns`
- `protocol-mechanics`
- `evm-internals`
- `solidity-behaviors`

This is where I expand from "I think this area is risky" to "what specific failure modes and real exploit analogs match this design?"

## Default Workflow

### 1. Establish scope

Before checking anything, identify:

- which contracts are in scope,
- whether I am reviewing the whole codebase or only changed files,
- what assets move,
- what privileges exist,
- what external protocols or tokens are trusted,
- what chain-specific assumptions exist.

If there is a spec, I read it first. If there is no spec, I derive one from the code before judging correctness.

## 2. Build a threat model

For each contract, write down:

- who can call each state-changing function,
- what state is supposed to remain true,
- what funds can be lost,
- what can be griefed or DOSed,
- what trust assumptions are offchain, owner-based, operator-based, or oracle-based.

I always ask:

- Who can steal?
- Who can censor?
- Who can brick funds?
- Who can mint value accidentally?
- Who can violate accounting without direct theft?

## 3. Run baseline verification

Before deeper review, verify the code actually builds and tests cleanly.

Typical commands in this repo:

```bash
forge fmt
forge build
forge test
```

If the protocol touches math or stateful workflows, extend with:

```bash
forge test --fuzz-runs 1000
```

If the code integrates external protocols, prefer fork tests instead of mocks when feasible.

## 4. Route with ethskills

Use `ethskills` to select the right review lenses.

Minimum Solidity verification set:

- `security`
- `testing`
- `audit`

Add focused context when needed:

- ERC20 or token handling: `security`, `standards`
- DeFi mechanics: `building-blocks`
- chain assumptions: `l2s`
- integrations and addresses: `addresses`

What I extract from `ethskills`:

- known defensive patterns,
- testing expectations,
- current ecosystem footguns,
- chain or token-specific reality checks.

## 5. Run the Pashov scan

Use the local `solidity-auditor` skill for fast structured coverage.

Default trigger:

- audit the codebase, or
- audit the specific Solidity files being changed.

I treat this as triage, not final truth.

What it is good at:

- broad checklist coverage,
- surfacing obvious and semi-obvious bug classes quickly,
- parallel domain scanning,
- finding places that deserve deeper human reasoning.

What it is not enough for by itself:

- protocol-specific economic attacks,
- trust-model mismatches,
- assumptions hidden in the spec,
- subtle invariant failures spanning multiple files.

## 6. Expand with EVM Research

After I know the contract type, I use `evmresearch` to expand the attack surface.

Typical mapping:

- `vulnerability-patterns` for bug classes that match the code shape
- `exploit-analyses` for historical analogs
- `security-patterns` for mitigations and safe designs
- `protocol-mechanics` for protocol-specific failure modes
- `evm-internals` and `solidity-behaviors` for low-level execution or compiler questions

Examples:

- commit-reveal system: check front-running, commitment binding, replay, and reveal liveness
- vault or accounting system: check rounding, inflation, share conversion, stale accounting
- DEX or auction flow: check settlement ordering, partial fills, griefing, and price manipulation
- bonded operator system: check slashing objectivity, liveness, censorship, and stale-funds escape paths

## 7. Do the manual verification passes

After the tool-assisted passes, review the code manually in these categories.

### Authorization

- Can any caller do something they should not?
- Are owner or operator powers too broad?
- Are there missing role checks?
- Can governance or operators rewrite trust assumptions?

### Accounting

- Are balances, shares, deposits, withdrawals, or claims internally consistent?
- Are decimals normalized correctly?
- Can rounding leak value?
- Can value be double-counted, stranded, or silently burned?

### External calls

- Are token transfers or low-level calls safe?
- Is CEI followed?
- Is reentrancy possible through callbacks or token hooks?
- Does failure handling preserve state correctness?

### State machine

- Are transitions valid in every phase?
- Can users cancel, reclaim, or finalize in the wrong order?
- Can an order or position be closed twice?
- Can a disputed or stale object still be finalized?

### DOS and liveness

- Can loops grow unbounded?
- Can a malicious participant block progress?
- Is there a path for user funds to escape if operators stall?
- Is there a practical recovery path after disputes or failed execution?

### Economic security

- Does the mechanism still work if all rational actors pursue edge-case profit?
- Can a participant manipulate price, ordering, or eligibility?
- Is there a griefing vector cheaper than the loss it causes?
- Are bonds, fees, limits, and time windows economically meaningful?

### Signatures and commitments

- Is signed data domain-separated?
- Are nonces, expiries, and replay protections complete?
- Are commitments bound to the right sender and context?
- Can the same authorization be replayed across epochs, chains, or contracts?

### Upgrade and storage risk

- Is the system immutable, proxied, or partially upgradeable?
- If proxied, is storage layout safe?
- Can initialization be replayed or skipped?
- Are immutable assumptions actually immutable?

## 8. Turn risks into tests

Every non-trivial concern should become one of:

- a unit test,
- a fuzz test,
- an invariant test,
- a fork test,
- or an explicit documented assumption.

If a security concern cannot be encoded as a test yet, I document why.

## 9. Report findings in the right format

When I report Solidity verification results, findings come first.

Each finding should include:

- severity,
- file and line reference,
- root cause,
- exploit or failure mode,
- concrete remediation.

After findings:

- open questions,
- assumptions,
- tests run,
- residual risks.

If no findings are found, I still mention testing gaps and what I did not verify.

## 10. Exit criteria

I consider Solidity verification complete only when all of these are true:

- the code builds,
- relevant tests pass,
- the contract type has been routed through the right `ethskills` pages,
- the Pashov scan has been used for broad coverage,
- the relevant `evmresearch` branches were checked for analogous attack patterns,
- manual review covered authorization, accounting, external calls, state machine, DOS, and economic security,
- findings or residual risks are written down clearly.

## How To Invoke This Process

Use prompts like:

- `Read audit.md and audit the Solidity codebase.`
- `Use audit.md and verify src/contract.sol for security issues.`
- `Use audit.md and review the latest Solidity changes.`
- `Use audit.md and turn the current security concerns into forge tests.`

## Repo Notes

- This process is intentionally heavier than a quick lint pass.
- For small diffs, I can scope the review to changed Solidity files.
- For protocol changes, I should review the whole affected state machine, not just the edited lines.
- If the protocol is high-stakes, the correct mode is deep review plus added tests, not just a checklist scan.

## Reference Links

- [EVM Research Index](https://evmresearch.io/index)
- [ethskills security](https://ethskills.com/security/SKILL.md)
- [ethskills testing](https://ethskills.com/testing/SKILL.md)
- [ethskills audit](https://ethskills.com/audit/SKILL.md)
- [Pashov Audit Group Skills](https://github.com/pashov/skills)
- [EVM Audit Master Skill](https://raw.githubusercontent.com/austintgriffith/evm-audit-skills/main/evm-audit-master/SKILL.md)
