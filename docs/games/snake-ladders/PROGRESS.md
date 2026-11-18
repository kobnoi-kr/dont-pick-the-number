# Snake & Ladders — Progress

## Current phase

**Phase 3 — Multiplayer / room / WS** ✅ complete

## Done

- Phase 0 audit → `ARCHITECTURE.md`
- Phase 1 pure engine under `src/games/snake-ladders/`
- Tests: `node scripts/test-snake-ladders.js` → **13 passed**
- Phase 2 mock UI at `/snake-ladders` (local engine)
- Phase 3 multiplayer wiring
  - Catalog mode `snake` (library / create modal / admin) · max **6**
  - `src/games/snake-ladders/room-bridge.js`
  - Server: `cat=snake` → `phase=snake` · WS `t:"roll"` → engine → broadcast `snake` in state
  - Bot/auto roll via turn timer
  - Play UI `#snakeGame` + `public/js/snake-ladders/live-board.js` (server-driven)
  - Persist `gameMode: "snake"`

## Not started

- Phase 4 spectator polish for snake board
- Phase 5 polish (UX / art / balance)

## Notes

- Server engine remains source of truth; mock page still local-only
- Exact landing on 100 required; overshoot keeps position
- Capacity override is mode-aware (`roomMaxPlayers`)
