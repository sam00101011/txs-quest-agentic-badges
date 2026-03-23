# Farcaster Mini App Activation

`txs.quest` already has the app-side Mini App pieces:

- `/.well-known/farcaster.json`
- `fc:miniapp` and `fc:frame` metadata on the homepage and `/claim`
- `Quick Auth` inside the claim flow
- an `Open in Farcaster` handoff outside the Mini App

The one missing piece is the signed domain association from the Warpcast Mini App Manifest Tool.

## 1. Generate Domain Association

Open:

- `https://farcaster.xyz/~/developers/new`

Then:

1. Sign in with the Farcaster account that should own the Mini App.
2. Add the domain: `txs.quest`
3. If desktop fails, do the signing step inside the Farcaster mobile Mini App.
4. Copy the three generated values:
   - `header`
   - `payload`
   - `signature`

These are the values that make `/.well-known/farcaster.json` valid.

## 2. Save The Values Into This Repo

Run:

```bash
bun run farcaster:set-domain --header '<HEADER>' --payload '<PAYLOAD>' --signature '<SIGNATURE>'
```

That writes the three values into [.env](/Users/samuelzeller/conductor/agentic%20poap/.env).

## 3. Rebuild And Publish

Run:

```bash
bun run build
bunx wrangler pages deploy dist --project-name txs-quest --branch main
```

`bun run build` regenerates:

- [web/public/.well-known/farcaster.json](/Users/samuelzeller/conductor/agentic%20poap/web/public/.well-known/farcaster.json)
- [web/public/farcaster-manifest.example.json](/Users/samuelzeller/conductor/agentic%20poap/web/public/farcaster-manifest.example.json)

## 4. Verify The Live Manifest

After deploy, check:

- `https://txs.quest/.well-known/farcaster.json`

It should:

- return JSON, not HTML
- contain your real `header`, `payload`, and `signature`
- point `homeUrl` at `https://txs.quest/claim?farcaster=1`

## 5. Verify The Mini App Entry

Check:

- `https://txs.quest/claim`

It should expose Farcaster metadata and launch into:

- `https://txs.quest/claim?farcaster=1`

Inside Farcaster, the claim flow should:

1. open the claim assistant
2. detect Mini App context
3. run Quick Auth
4. resolve the authenticated wallet
5. continue badge checking / claiming for Farcaster-only badges

## Notes

- Outside Farcaster, `Connect Farcaster` intentionally becomes an `Open in Farcaster` handoff.
- The current handoff opens a Farcaster compose URL with `txs.quest/claim` embedded, which is a safe public entrypoint while the full Mini App domain association is being finalized.
- If the live `/.well-known/farcaster.json` still contains placeholder values, the Mini App is not fully valid yet.
