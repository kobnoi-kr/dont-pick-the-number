"use strict";

const config = require("./config/default-board");
const maps = require("./config/maps");
const board = require("./engine/board");
const dice = require("./engine/dice");
const movement = require("./engine/movement");
const turnManager = require("./engine/turn-manager");
const winCondition = require("./engine/win-condition");
const engine = require("./engine/game-engine");

module.exports = {
  ...config,
  ...maps,
  ...board,
  ...dice,
  ...movement,
  ...turnManager,
  ...winCondition,
  ...engine
};
