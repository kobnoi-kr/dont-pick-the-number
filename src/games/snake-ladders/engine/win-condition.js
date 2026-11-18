"use strict";

function isWinningPosition(position, boardSize) {
  return Number(position) === Number(boardSize);
}

function findWinner(state) {
  if (!state || !Array.isArray(state.players)) return null;
  const goal = state.board && state.board.boardSize;
  const hit = state.players.find((p) => isWinningPosition(p.position, goal));
  return hit || null;
}

module.exports = {
  isWinningPosition,
  findWinner
};
