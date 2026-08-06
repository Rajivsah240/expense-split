# Expense Split

A mobile-first PWA for splitting shared household expenses. You paste what you'd
normally send in the flat's WhatsApp group — `Vegetables - 130/3`, `Chicken - 420 AR`,
`Soap - 40 (B)` — and it works out every share, balance and settlement for you.

```
Paste / photo / type  →  parse  →  review  →  save  →  balances update for everyone
```

---

## How it works

**Parsing is hybrid and on-device first.** A rule parser runs in the browser and
handles the formats you actually use — every dash style, `=`, `/3`, `All`, `Me`,
initials (`A`, `AR`, `A,R`, `A/R`, `A+B`), full and partial names, `@usernames`,
brackets, and single-character typos or OCR damage (`Rajv`, `Ashuosh`). It costs
no network call. Only when confidence is low, a line is ambiguous, or you supply
a photo does it escalate to Gemini.

**The AI never touches money.** It returns `{item, amount, owners}` and nothing
else. Every share, balance, and settlement is computed from integer paise by
[shared/money.ts](shared/money.ts), server-side, with these invariants enforced:

- `sum(splitEvenly(total, owners)) === total` — exactly, for any total and owner count
- `sum(session.shares) === session.total`
- `sum(all balances) === 0`

Shares posted by a client are ignored and recomputed. The old build credited the
payer the full amount while `100/3` only distributed `99.99`, so every three-way
split quietly leaked a paisa to whoever paid.

**Nothing is saved without you.** Parsed rows land in a review table. Rows whose
owners were merely *defaulted* are marked "Assumed shared by all" and are saveable.
Rows whose owners could not be *read* block saving until you pick — the app never
guesses ownership.

**Everyone sees the same data.** One endpoint, `GET /api/groups/:id/state?since=`,
returns a full snapshot at `since=0` and only what changed after that, including
tombstones for deletions. The client polls it every 7s while visible and
immediately on focus, visibility change, and reconnect. The API runs on Vercel
functions, where a long-lived socket has nowhere to live, so delta polling is the
honest choice rather than a WebSocket that would silently degrade.

---

## Running it

**Prerequisites:** Node 20+, a MongoDB Atlas cluster, a Gmail app password, a
Gemini API key.

```bash
npm install
cp .env.example .env      # then fill it in
npm run db:indexes        # optional: build indexes up front
npm run dev               # http://localhost:3000
```

To use it on your phone during development, open `http://<your-machine-ip>:3000`.
Install-to-home-screen needs HTTPS, so that part only works on the deployed URL
(or `localhost`).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Express + Vite dev server on port 3000 |
| `npm run build` | Icons → client bundle → bundled server |
| `npm start` | Serve the production build |
| `npm run lint` | `tsc --noEmit` over client, server and shared code |
| `npm test` | 251 parser + money assertions, no network needed |
| `npm run smoke` | 69 end-to-end API checks against a running dev server |
| `npm run smoke:ai` | Live Gemini checks: messy text, receipt photo, chat import |
| `npm run icons` | Regenerate the PWA icon set |
| `npm run seed:demo` | Populate a demo group; `-- --clean` removes it |
| `npm run db:reset` | Drop every collection (asks for confirmation) |
| `npm run db:indexes` | Create every declared index |

`npm test` needs nothing running. `npm run smoke` and `npm run smoke:ai` need
`npm run dev` in another terminal; both create their own throwaway records and
delete them afterwards, so they are safe against a live database.

---

## Deploying to Vercel

Push the repo and set these environment variables in the project settings:

`MONGODB_URI`, `MONGODB_DB_NAME`, `JWT_SECRET`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `GEMINI_API_KEY`,
`GEMINI_MODEL`, `STATS_TIMEZONE`.

[vercel.json](vercel.json) routes every `/api/*` request into the single function
at [api/index.ts](api/index.ts) and serves the SPA for everything else. Allow the
Vercel egress IPs in Atlas Network Access (or `0.0.0.0/0` for a hobby project).

---

## Layout

```
shared/          used by both browser and server — one definition, no drift
  types.ts       every wire shape; money is integer paise throughout
  money.ts       splitting, balances, direct member-to-member settlement
  parser.ts      the rule-based parser
  categories.ts  auto-categorisation

server/
  api.ts         the single request dispatcher, shared by dev and Vercel
  http.ts        path-template router, typed errors, field validation
  auth.ts        email OTP + JWT
  ai.ts          Gemini extraction (text, receipt, chat) — extraction only
  events.ts      audit trail + per-member notification fan-out
  routes/
    shared.ts    membership guards and the canonical session write path
    ...          auth, groups, sessions, settlements, feed, stats, ai

src/
  screens/       auth, onboarding, groups, and the four in-group tabs
  components/    UI primitives, the review table, the add/settle/session sheets
  hooks/         auth, group list, and the delta-sync engine
  lib/           API client, formatting, PWA registration, image downscaling

scripts/         icon generation, tests, smoke suites, database tools
```

---

## PWA

`npm run icons` generates the icon set from scratch — signed distance fields
rasterised to PNG with Node's `zlib`, no image dependency. It emits `any` and
`maskable` variants at 192/512, an Apple touch icon, and a favicon.

The manifest declares real icons, `display: standalone`, portrait orientation,
theme colour and app shortcuts. (The previous build declared no icons at all,
which is why the install prompt never appeared.) The service worker precaches the
app shell, serves API reads `NetworkFirst` so the last known balances stay
readable offline, caches fonts, and updates itself in the background.

---

## Notes

- `STATS_TIMEZONE` (default `Asia/Kolkata`) decides which month and weekday a
  shopping trip belongs to.
- Display names are snapshotted onto each record, so renaming yourself never
  rewrites history. Live views use your current name.
- A member can't be removed while their balance is non-zero — it would strand
  their share of the ledger.
- Settlements can only be recorded by someone the payment involves.
- Deletes are soft, so other devices learn about them through the delta feed.
