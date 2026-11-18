"use strict";

/** Prototype snakes & ladders. Adjust without touching the engine. */
const DEFAULT_LADDERS = [
  { start: 3, end: 22 },
  { start: 8, end: 30 },
  { start: 28, end: 55 },
  { start: 58, end: 77 },
  { start: 75, end: 95 }
];

const DEFAULT_SNAKES = [
  { start: 17, end: 7 },
  { start: 54, end: 34 },
  { start: 62, end: 19 },
  { start: 88, end: 24 },
  { start: 99, end: 78 }
];

const BOARD_SIZE = 100;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

module.exports = {
  BOARD_SIZE,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_LADDERS,
  DEFAULT_SNAKES
};
