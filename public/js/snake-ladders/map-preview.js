/**
 * Mini board preview for lobby settings (same art as live board).
 */
import { cellToGrid, renderBoardPaths } from "./board-art.js";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * @param {HTMLElement} host
 * @param {{ id?: string, boardSize?: number, ladders?: any[], snakes?: any[] }|null} map
 */
export function paintSnakeMapPreview(host, map) {
  if (!host) return;
  if (!map || !Array.isArray(map.ladders) || !Array.isArray(map.snakes)) {
    host.innerHTML = `<p class="tiny muted" style="margin:0">ยังไม่มีตัวอย่างแมพ</p>`;
    host.removeAttribute("data-map");
    return;
  }
  const size = Number(map.boardSize) || 100;
  const side = Math.round(Math.sqrt(size)) || 10;
  const mapId = String(map.id || "classic");
  const ladderStarts = new Set(map.ladders.map((x) => x.start));
  const snakeStarts = new Set(map.snakes.map((x) => x.start));

  const cells = [];
  for (let cell = 1; cell <= size; cell++) {
    const g = cellToGrid(cell, size);
    if (!g) continue;
    const classes = ["sl-cell"];
    classes.push((g.row + g.col) % 2 === 0 ? "is-light" : "is-dark");
    if (ladderStarts.has(cell)) classes.push("is-ladder-start");
    if (snakeStarts.has(cell)) classes.push("is-snake-start");
    if (cell === 1) classes.push("is-start");
    if (cell === size) classes.push("is-goal");
    const label =
      cell === 1
        ? `<span class="sl-cell-num">1</span>`
        : cell === size
          ? `<span class="sl-cell-num">${size}</span>`
          : String(cell);
    cells.push(
      `<div class="${classes.join(" ")}" style="grid-row:${side - g.row};grid-column:${g.col + 1}">${label}</div>`
    );
  }

  host.dataset.map = mapId;
  host.innerHTML = `
    <div class="sl-map-preview-frame sl-board-frame">
      <div class="sl-board sl-map-preview-board" style="grid-template-columns:repeat(${side},1fr);grid-template-rows:repeat(${side},1fr)">
        ${cells.join("")}
      </div>
      <svg class="sl-paths sl-map-preview-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${renderBoardPaths(
        map.ladders,
        map.snakes,
        size
      )}</svg>
    </div>
    <p class="tiny muted sl-map-preview-caption">ตัวอย่าง · งู ${map.snakes.length} · บันได ${map.ladders.length}</p>
  `;
}
