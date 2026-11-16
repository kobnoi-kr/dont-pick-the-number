"use strict";

/** @type {null | Record<string, any>} */
let game = null;

function attachGameApi(api) {
  game = api;
}

function getGameApi() {
  return game;
}

module.exports = { attachGameApi, getGameApi };
