"use strict";

const {
  BOARD_SIZE,
  DEFAULT_LADDERS,
  DEFAULT_SNAKES
} = require("../config/default-board");

function buildPortalMap(ladders, snakes) {
  const map = Object.create(null);
  for (const row of ladders || []) {
    map[Number(row.start)] = { type: "ladder", to: Number(row.end) };
  }
  for (const row of snakes || []) {
    map[Number(row.start)] = { type: "snake", to: Number(row.end) };
  }
  return map;
}

/**
 * Validate board portals. Throws Error with code on failure.
 */
function validateBoardConfig({ boardSize, ladders, snakes } = {}) {
  const size = Number(boardSize) || BOARD_SIZE;
  const L = Array.isArray(ladders) ? ladders : [];
  const S = Array.isArray(snakes) ? snakes : [];
  const starts = new Set();

  function checkPortal(row, kind) {
    const start = Number(row && row.start);
    const end = Number(row && row.end);
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      const err = new Error("invalid_portal");
      err.code = "invalid_portal";
      throw err;
    }
    if (start < 1 || start > size || end < 1 || end > size) {
      const err = new Error("portal_out_of_range");
      err.code = "portal_out_of_range";
      throw err;
    }
    if (kind === "ladder" && !(end > start)) {
      const err = new Error("invalid_ladder");
      err.code = "invalid_ladder";
      throw err;
    }
    if (kind === "snake" && !(end < start)) {
      const err = new Error("invalid_snake");
      err.code = "invalid_snake";
      throw err;
    }
    if (starts.has(start)) {
      const err = new Error("duplicate_portal_start");
      err.code = "duplicate_portal_start";
      throw err;
    }
    starts.add(start);
  }

  for (const row of L) checkPortal(row, "ladder");
  for (const row of S) checkPortal(row, "snake");

  // Detect simple loops / chains that never settle (safety).
  const map = buildPortalMap(L, S);
  for (const startKey of Object.keys(map)) {
    let pos = Number(startKey);
    const seen = new Set();
    let hops = 0;
    while (map[pos] && hops < size + 2) {
      if (seen.has(pos)) {
        const err = new Error("portal_loop");
        err.code = "portal_loop";
        throw err;
      }
      seen.add(pos);
      pos = map[pos].to;
      hops += 1;
    }
  }

  return true;
}

/**
 * Serpentine grid: row 0 bottom is 1→10, next 20→11, etc.
 * Returns 0-based { row, col } from bottom-left.
 */
function cellToGrid(cell, boardSize) {
  const size = Number(boardSize) || BOARD_SIZE;
  const n = Number(cell);
  if (!Number.isInteger(n) || n < 1 || n > size) return null;
  const side = Math.round(Math.sqrt(size));
  const idx = n - 1;
  const rowFromBottom = Math.floor(idx / side);
  const colInRow = idx % side;
  const col = rowFromBottom % 2 === 0 ? colInRow : side - 1 - colInRow;
  return { row: rowFromBottom, col, side };
}

function createBoard(config) {
  const boardSize = Number((config && config.boardSize) || BOARD_SIZE) || BOARD_SIZE;
  const ladders = (config && config.ladders) || DEFAULT_LADDERS;
  const snakes = (config && config.snakes) || DEFAULT_SNAKES;
  validateBoardConfig({ boardSize, ladders, snakes });
  return {
    boardSize,
    ladders: ladders.map((x) => ({ start: x.start, end: x.end })),
    snakes: snakes.map((x) => ({ start: x.start, end: x.end })),
    portals: buildPortalMap(ladders, snakes)
  };
}

function applyPortal(board, position) {
  const hit = board.portals[position];
  if (!hit) return { position, portal: null };
  return { position: hit.to, portal: { type: hit.type, from: position, to: hit.to } };
}

module.exports = {
  createBoard,
  validateBoardConfig,
  cellToGrid,
  applyPortal,
  buildPortalMap
};
