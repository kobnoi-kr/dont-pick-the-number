# Snake & Ladders — Progress

## Current phase

**Phase 2 — UI Mock** ✅ complete

## Done

- Phase 0 audit → `ARCHITECTURE.md`
- Phase 1 pure engine under `src/games/snake-ladders/`
  - `config/default-board.js`
  - `engine/board.js` (serpentine + portals)
  - `engine/dice.js` (crypto random 1–6)
  - `engine/movement.js`
  - `engine/turn-manager.js`
  - `engine/win-condition.js`
  - `engine/game-engine.js` (`createGame` / `startGame` / `roll`)
  - `index.js`
- Tests: `node scripts/test-snake-ladders.js` → **13 passed**
- Phase 2 mock UI (no Socket / DB)
  - `public/snake-ladders.html` → `/snake-ladders`
  - `public/css/snake-ladders.css`
  - `public/js/snake-ladders/engine.js` (browser port of Phase 1 rules)
  - `public/js/snake-ladders/mock-app.js` (board, dice, panel, step animation, bot auto-roll)

## Not started

- Phase 3 multiplayer / room / WS wiring
- Phase 4 spectator
- Phase 5 polish

## Notes

- Phase 1–2: no edits to `server.js`, auth, Prisma, or existing game modes
- Exact landing on 100 required; overshoot keeps position
- Server engine under `src/games/snake-ladders/` remains source of truth for Phase 3+
