/**
 * Shared board art helpers (snakes / ladders SVG) for live + mock UI.
 */

export function cellToGrid(cell, boardSize = 100) {
  const size = Number(boardSize) || 100;
  const n = Number(cell);
  if (!Number.isInteger(n) || n < 1 || n > size) return null;
  const side = Math.round(Math.sqrt(size));
  const idx = n - 1;
  const rowFromBottom = Math.floor(idx / side);
  const colInRow = idx % side;
  const col = rowFromBottom % 2 === 0 ? colInRow : side - 1 - colInRow;
  return { row: rowFromBottom, col, side };
}

export function cellCenterPercent(cell, boardSize = 100) {
  const g = cellToGrid(cell, boardSize);
  if (!g) return null;
  return {
    x: ((g.col + 0.5) / g.side) * 100,
    y: ((g.side - 1 - g.row + 0.5) / g.side) * 100
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pointOnQuad(a, c, b, t) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y
  };
}

function tangentOnQuad(a, c, b, t) {
  return {
    x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x),
    y: 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y)
  };
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/** Wooden ladder with rails + rungs */
export function ladderSvg(a, b, key) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const half = 1.55;
  const a1 = { x: a.x + px * half, y: a.y + py * half };
  const a2 = { x: a.x - px * half, y: a.y - py * half };
  const b1 = { x: b.x + px * half, y: b.y + py * half };
  const b2 = { x: b.x - px * half, y: b.y - py * half };
  const rungs = [];
  const count = Math.max(3, Math.round(len / 7));
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const p = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    rungs.push(
      `<line x1="${p.x + px * half}" y1="${p.y + py * half}" x2="${p.x - px * half}" y2="${p.y - py * half}" stroke="#a86b34" stroke-width="0.85" stroke-linecap="round"/>`,
      `<line x1="${p.x + px * half}" y1="${p.y + py * half}" x2="${p.x - px * half}" y2="${p.y - py * half}" stroke="#e6b983" stroke-width="0.35" stroke-linecap="round"/>`
    );
  }
  return `
    <g class="sl-art-ladder" data-key="${key}">
      <line x1="${a1.x}" y1="${a1.y}" x2="${b1.x}" y2="${b1.y}" stroke="#6b3f14" stroke-width="1.15" stroke-linecap="round"/>
      <line x1="${a2.x}" y1="${a2.y}" x2="${b2.x}" y2="${b2.y}" stroke="#6b3f14" stroke-width="1.15" stroke-linecap="round"/>
      <line x1="${a1.x}" y1="${a1.y}" x2="${b1.x}" y2="${b1.y}" stroke="#d4a574" stroke-width="0.45" stroke-linecap="round"/>
      <line x1="${a2.x}" y1="${a2.y}" x2="${b2.x}" y2="${b2.y}" stroke="#d4a574" stroke-width="0.45" stroke-linecap="round"/>
      ${rungs.join("")}
    </g>
  `;
}

/** Cartoon snake: thick S-curve body + head with eyes */
export function snakeSvg(a, b, key) {
  // a = head (higher cell / start), b = tail
  const side = a.x < b.x ? 1 : -1;
  const c1 = {
    x: lerp(a.x, b.x, 0.33) + side * 10,
    y: lerp(a.y, b.y, 0.28)
  };
  const c2 = {
    x: lerp(a.x, b.x, 0.66) - side * 9,
    y: lerp(a.y, b.y, 0.72)
  };
  const d = `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
  const mid = pointOnQuad(a, { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }, b, 0.08);
  const tan = normalize(tangentOnQuad(a, c1, b, 0.02));
  const nx = -tan.y;
  const ny = tan.x;
  const eye1 = { x: a.x + nx * 0.85 - tan.x * 0.2, y: a.y + ny * 0.85 - tan.y * 0.2 };
  const eye2 = { x: a.x - nx * 0.85 - tan.x * 0.2, y: a.y - ny * 0.85 - tan.y * 0.2 };
  return `
    <g class="sl-art-snake" data-key="${key}">
      <path d="${d}" fill="none" stroke="#7f1d1d" stroke-width="3.6" stroke-linecap="round" opacity="0.35"/>
      <path d="${d}" fill="none" stroke="#e11d48" stroke-width="2.7" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="#fb7185" stroke-width="1.05" stroke-linecap="round" stroke-dasharray="1.2 1.6" opacity="0.85"/>
      <circle cx="${a.x}" cy="${a.y}" r="2.35" fill="#be123c" stroke="#7f1d1d" stroke-width="0.35"/>
      <circle cx="${eye1.x}" cy="${eye1.y}" r="0.55" fill="#fff"/>
      <circle cx="${eye2.x}" cy="${eye2.y}" r="0.55" fill="#fff"/>
      <circle cx="${eye1.x}" cy="${eye1.y}" r="0.22" fill="#111"/>
      <circle cx="${eye2.x}" cy="${eye2.y}" r="0.22" fill="#111"/>
      <circle cx="${b.x}" cy="${b.y}" r="1.15" fill="#9f1239"/>
      <circle cx="${mid.x}" cy="${mid.y}" r="0.01" fill="none"/>
    </g>
  `;
}

export function renderBoardPaths(ladders, snakes, boardSize) {
  const size = boardSize || 100;
  const parts = [];
  (ladders || []).forEach((lad, i) => {
    const a = cellCenterPercent(lad.start, size);
    const b = cellCenterPercent(lad.end, size);
    if (!a || !b) return;
    parts.push(ladderSvg(a, b, `L${i}`));
  });
  (snakes || []).forEach((sn, i) => {
    const a = cellCenterPercent(sn.start, size);
    const b = cellCenterPercent(sn.end, size);
    if (!a || !b) return;
    parts.push(snakeSvg(a, b, `S${i}`));
  });
  return parts.join("");
}

/** Dice face with pips 1–6 (or em dash) */
export function diceFaceHtml(n) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 6) {
    return `<span class="sl-dice-blank">—</span>`;
  }
  const map = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };
  const on = new Set(map[v]);
  const dots = [];
  for (let i = 1; i <= 9; i++) {
    dots.push(`<span class="sl-pip${on.has(i) ? " on" : ""}"></span>`);
  }
  return `<div class="sl-dice-face" data-n="${v}">${dots.join("")}</div>`;
}
