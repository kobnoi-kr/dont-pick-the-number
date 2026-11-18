"use strict";

const { BOARD_SIZE, DEFAULT_LADDERS, DEFAULT_SNAKES } = require("./default-board");

/**
 * Named board layouts — same size, different snake/ladder positions.
 * Host picks `mapId` in lobby; engine receives boardConfig at start.
 */
const SNAKE_MAPS = [
  {
    id: "classic",
    name: "คลาสสิก",
    nameEn: "Classic",
    blurb: "แมพมาตรฐาน — งู/บันไดสมดุล",
    boardSize: BOARD_SIZE,
    ladders: DEFAULT_LADDERS,
    snakes: DEFAULT_SNAKES
  },
  {
    id: "jungle",
    name: "ป่าดงดิบ",
    nameEn: "Jungle",
    blurb: "บันไดยาวหลายเส้น แต่มีงูดักกลางทาง",
    boardSize: BOARD_SIZE,
    ladders: [
      { start: 2, end: 38 },
      { start: 9, end: 31 },
      { start: 21, end: 42 },
      { start: 46, end: 84 },
      { start: 51, end: 67 },
      { start: 71, end: 91 }
    ],
    snakes: [
      { start: 16, end: 6 },
      { start: 49, end: 11 },
      { start: 56, end: 26 },
      { start: 64, end: 36 },
      { start: 87, end: 24 },
      { start: 95, end: 56 },
      { start: 98, end: 78 }
    ]
  },
  {
    id: "volcano",
    name: "ภูเขาไฟ",
    nameEn: "Volcano",
    blurb: "งูเยอะและตกแรง — เสี่ยงสูง รางวัลสูง",
    boardSize: BOARD_SIZE,
    ladders: [
      { start: 4, end: 25 },
      { start: 13, end: 46 },
      { start: 33, end: 70 },
      { start: 50, end: 80 },
      { start: 62, end: 96 }
    ],
    snakes: [
      { start: 18, end: 3 },
      { start: 29, end: 8 },
      { start: 41, end: 19 },
      { start: 59, end: 22 },
      { start: 73, end: 40 },
      { start: 82, end: 45 },
      { start: 92, end: 53 },
      { start: 99, end: 61 }
    ]
  },
  {
    id: "skybridge",
    name: "สะพานฟ้า",
    nameEn: "Sky Bridge",
    blurb: "บันไดเยอะ เดินลื่น — แต่งูท้ายกระดานดักชัยชนะ",
    boardSize: BOARD_SIZE,
    ladders: [
      { start: 1, end: 20 },
      { start: 7, end: 35 },
      { start: 15, end: 44 },
      { start: 27, end: 58 },
      { start: 39, end: 72 },
      { start: 48, end: 79 },
      { start: 63, end: 89 }
    ],
    snakes: [
      { start: 23, end: 5 },
      { start: 37, end: 14 },
      { start: 52, end: 28 },
      { start: 68, end: 47 },
      { start: 81, end: 60 },
      { start: 93, end: 66 },
      { start: 97, end: 75 }
    ]
  }
];

const DEFAULT_MAP_ID = "classic";

function listMaps() {
  return SNAKE_MAPS.map((m) => ({
    id: m.id,
    name: m.name,
    nameEn: m.nameEn,
    blurb: m.blurb,
    boardSize: m.boardSize,
    ladderCount: (m.ladders || []).length,
    snakeCount: (m.snakes || []).length,
    // Layout for lobby mini-preview (same positions as live board)
    ladders: (m.ladders || []).map((x) => ({ start: x.start, end: x.end })),
    snakes: (m.snakes || []).map((x) => ({ start: x.start, end: x.end }))
  }));
}

function getMap(mapId) {
  const id = String(mapId || "").trim() || DEFAULT_MAP_ID;
  return SNAKE_MAPS.find((m) => m.id === id) || SNAKE_MAPS.find((m) => m.id === DEFAULT_MAP_ID) || SNAKE_MAPS[0];
}

function normalizeMapId(mapId) {
  const m = getMap(mapId);
  return m ? m.id : DEFAULT_MAP_ID;
}

function boardConfigForMap(mapId) {
  const m = getMap(mapId);
  return {
    boardSize: m.boardSize,
    ladders: m.ladders.map((x) => ({ start: x.start, end: x.end })),
    snakes: m.snakes.map((x) => ({ start: x.start, end: x.end })),
    mapId: m.id,
    mapName: m.name
  };
}

module.exports = {
  SNAKE_MAPS,
  DEFAULT_MAP_ID,
  listMaps,
  getMap,
  normalizeMapId,
  boardConfigForMap
};
