import { BOARD_SIZE } from './board'

export type GridCoord = { row: number; col: number }

export const BOARD_GRID_ROWS = 6
export const BOARD_GRID_COLS = 8

// Maps a linear board position (0..BOARD_SIZE-1) onto a 6-row x 8-column
// perimeter ring: top row left->right, right column top->bottom, bottom row
// right->left, left column bottom->top (clockwise) — the Monopoly/Cashflow
// board shape from info/update_game.md's diagram. Verified cell-by-cell
// against it: 0->(1,1) "1", 8->(2,8) "9", 12->(6,8) "13", 19->(6,1) "20",
// 23->(2,1) "24". Assumes BOARD_SIZE === 24 (a 6x8 rectangle's perimeter is
// 2*6 + 2*8 - 4 corners = 24, matching exactly).
export function boardCellGridPosition(position: number): GridCoord {
  const p = ((position % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE
  if (p <= 7) return { row: 1, col: p + 1 } // top row, left -> right
  if (p <= 12) return { row: p - 6, col: BOARD_GRID_COLS } // right column, top -> bottom
  if (p <= 19) return { row: BOARD_GRID_ROWS, col: 20 - p } // bottom row, right -> left
  return { row: 25 - p, col: 1 } // left column, bottom -> top
}
