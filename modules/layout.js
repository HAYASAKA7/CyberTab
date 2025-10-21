// Layout management module

import { GRID, SIDE_MARGIN, TOP_OFFSET } from './constants.js';

export class LayoutManager {
  constructor() {
    this.currentMaxCols = 11;
    this.currentLeftOffset = SIDE_MARGIN;
  }

  computeLayout() {
    const board = document.getElementById("board");
    const bw = board ? Math.max(0, board.clientWidth) : window.innerWidth;
    const minEdge = 64;
    const usable = Math.max(0, bw - minEdge * 2);
    const cols = Math.max(1, Math.floor(usable / GRID));
    this.currentMaxCols = Math.max(1, Math.min(11, cols));
    const totalGridWidth = this.currentMaxCols * GRID;
    const centeredLeft = Math.round((bw - totalGridWidth) / 2);
    this.currentLeftOffset = Math.max(minEdge, centeredLeft);
  }

  getPosition(col, row) {
    const left = this.currentLeftOffset + col * GRID;
    const top = TOP_OFFSET + row * GRID;
    return { left, top };
  }

  getGridPosition(left, top) {
    const col = Math.round((left - this.currentLeftOffset) / GRID);
    const row = Math.round((top - TOP_OFFSET) / GRID);
    return {
      col: Math.max(0, col),
      row: Math.max(0, row)
    };
  }

  isPositionOccupied(items, col, row, excludeId) {
    return items.some(it => it.col === col && it.row === row && it.id !== excludeId);
  }

  findNearestFreePosition(items, targetCol, targetRow, excludeId) {
    if (!this.isPositionOccupied(items, targetCol, targetRow, excludeId)) {
      return { col: targetCol, row: targetRow };
    }
    
    for (let radius = 1; radius < 20; radius++) {
      for (let dRow = -radius; dRow <= radius; dRow++) {
        for (let dCol = -radius; dCol <= radius; dCol++) {
          if (Math.abs(dRow) === radius || Math.abs(dCol) === radius) {
            const col = targetCol + dCol;
            const row = targetRow + dRow;
            if (col >= 0 && row >= 0 && !this.isPositionOccupied(items, col, row, excludeId)) {
              return { col, row };
            }
          }
        }
      }
    }
    
    return { col: targetCol, row: targetRow };
  }
}