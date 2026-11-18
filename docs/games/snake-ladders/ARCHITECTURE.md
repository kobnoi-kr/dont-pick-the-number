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

Server engine stays pure (no DOM, no Prisma, no `server.js` imports).

### Phase 2 mock UI (local only)

```text
public/snake-ladders.html
public/css/snake-ladders.css
public/js/snake-ladders/
├── engine.js    # browser port of Phase 1 rules
└── mock-app.js  # board / dice / panel / animations
```

Open `/snake-ladders` — no WS or DB (Phase 2 mock remains).

### Phase 3 multiplayer

```text
src/games/snake-ladders/room-bridge.js
public/js/snake-ladders/live-board.js   # mounted in /play #snakeGame
WS: t:"roll" (+ optional commandId)
snap.snake = publicState(room.snake)
phase: "snake" while playing
```

Catalog id `snake`, capacity 2–6 via `roomMaxPlayers(room)`.

## Phases 4–5 (done)

- Spectators receive `snap(..., { spectator: true })` with full `snake` public state
- Client: `show("snakeGame")`, roll locked, banner, quit → `unwatch`
- Polish: dice pulse, win banner, waiting copy, CSS scoped for `/play`

## Guardrails

- No auth / schema / shared API contract changes without approval
- Prefer additive files over broad refactors of `server.js` / `game.js`
