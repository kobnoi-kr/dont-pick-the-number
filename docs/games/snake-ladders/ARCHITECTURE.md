# Snake & Ladders — Architecture (NUMVERSE)

Based on Phase 0 repository audit. Stack assumptions from the original
spec (Next.js / Socket.IO / TypeScript) do **not** match this repo.

## Existing stack (actual)

- Node.js + vanilla JS (`public/`, `src/`, `server.js`)
- Realtime: `ws` WebSocket (not Socket.IO)
- DB: Prisma + PostgreSQL
- Current game modes: `secret`, `wheel` in lobby/room flow
- Auth / rooms / host / dashboard already exist — reuse, do not duplicate

## Target module layout

```text
src/games/snake-ladders/
├── config/default-board.js
├── engine/
│   ├── board.js
│   ├── dice.js
│   ├── movement.js
│   ├── turn-manager.js
│   ├── win-condition.js
│   └── game-engine.js
└── index.js
```

UI / WS integration come in later phases. Engine stays pure (no DOM, no Prisma, no `server.js` imports).

## Integration plan (later phases)

1. Add catalog mode `snake` without breaking `secret` / `wheel`
2. Room capacity override 2–6 for this mode only
3. Server-authoritative roll via WS command → engine → broadcast state
4. Play UI board overlay in existing play flow

## Guardrails

- No auth / schema / shared API contract changes without approval
- Prefer additive files over broad refactors of `server.js` / `game.js`
