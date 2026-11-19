"use strict";

const { applyPortal } = require("./board");

/**
 * Move from `from` by `dice`. Must land exactly on boardSize to finish.
 * Returns path steps for animation consumers.
 */
function resolveMove(board, from, dice, opts) {
  const start = Math.max(0, Number(from) || 0);
  const roll = Number(dice);
  const goal = board.boardSize;
  const ignoreSnakes = !!(opts && opts.ignoreSnakes);
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    const err = new Error("invalid_dice");
    err.code = "invalid_dice";
    throw err;
  }

  const tentative = start + roll;
  if (tentative > goal) {
    return {
      from: start,
      dice: roll,
      bounced: true,
      landed: start,
      final: start,
      portal: null,
      steps: [],
      won: false,
      angelBlockedSnake: false
    };
  }

  const steps = [];
  for (let p = start + 1; p <= tentative; p++) steps.push({ cell: p, kind: "step" });

  const afterPortal = applyPortal(board, tentative);
  let portal = afterPortal.portal;
  let finalPos = afterPortal.position;
  let angelBlockedSnake = false;
  if (portal && portal.type === "snake" && ignoreSnakes) {
    angelBlockedSnake = true;
    portal = { type: "snake_blocked", from: tentative, to: tentative };
    finalPos = tentative;
    steps.push({ cell: tentative, kind: "snake_blocked", from: tentative });
  } else if (portal) {
    steps.push({
      cell: afterPortal.position,
      kind: afterPortal.portal.type,
      from: afterPortal.portal.from
    });
  }

  return {
    from: start,
    dice: roll,
    bounced: false,
    landed: tentative,
    final: finalPos,
    portal,
    steps,
    won: finalPos === goal,
    angelBlockedSnake
  };
}

module.exports = { resolveMove };
