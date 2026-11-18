# Snake & Ladders — Progress

## Current phase

**Live / polish** — multiplayer shipped; ongoing UX polish

## Done

- Phase 0 audit → `ARCHITECTURE.md`
- Phase 1 pure engine under `src/games/snake-ladders/`
- Tests: `node scripts/test-snake-ladders.js` → **13 passed**
- Phase 2 mock UI at `/snake-ladders` (local engine)
- Phase 3 multiplayer wiring
  - Catalog `snake` · cap **6** · WS `roll` · `#snakeGame` live board
- Phase 4 spectator
  - Watch mid-match board via existing `watch` / `snap.spectator`
  - Roll disabled · spectator banner · quit → `unwatch`
- Phase 5 polish
  - Dice pulse + move animation · cell footstep glow · win banner
  - Board fits viewport · lobby seats = room cap (6)
  - Auto-play (same as other modes) · **AUTO** tag on panel avatars
  - Board tokens use profile images (no letter glyphs)
  - Snake-hit / your-turn SFX · bots auto-roll
- Catalog
  - Admin **Game Management** can mark games **Beta**
  - Game Library shows Beta pill when set
- Maps
  - Lobby host picks map (`classic` / `jungle` / `volcano` / `skybridge`)
  - Different snake & ladder layouts via `config/maps.js`

## Notes

- Server engine remains source of truth; `/snake-ladders` mock stays local-only
- Exact landing on 100 required; overshoot keeps position
- FAQ (`/faq`) covers snake, maps, auto, room chat (emoji + private whisper), Beta
