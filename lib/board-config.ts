// All positions are 0-indexed: row 0-11, col 0-4
// User-facing: row 1-12, col 1-5

export const ROWS = 12;
export const COLS = 5;

// Camp positions (行营) - pieces inside cannot be attacked
export const CAMP_POSITIONS = new Set([
  '2,1', '2,3', // row 3 (0-indexed: row 2), col 2 and 4
  '3,2',        // row 4, col 3
  '4,1', '4,3', // row 5, col 2 and 4
  '7,1', '7,3', // row 8, col 2 and 4
  '8,2',        // row 9, col 3
  '9,1', '9,3', // row 10, col 2 and 4
]);

// HQ positions (大本营) - regular squares, just visual
export const HQ_POSITIONS = new Set([
  '0,1', '0,3',   // row 1, col 2 and 4
  '11,1', '11,3', // row 12, col 2 and 4
]);

export function isCamp(row: number, col: number): boolean {
  return CAMP_POSITIONS.has(`${row},${col}`);
}

export function isHQ(row: number, col: number): boolean {
  return HQ_POSITIONS.has(`${row},${col}`);
}

// Railway rows (0-indexed): rows 1, 5, 6, 10
export const RAILWAY_ROWS = new Set([1, 5, 6, 10]);

// Railway cols (0-indexed): cols 0, 4 (rows 1-10), col 2 (rows 5-6 only)
// Vertical railway connections: [row, col] -> [row+1, col]
function isVerticalRailway(row: number, col: number): boolean {
  // Connection between row and row+1
  if (col === 0 || col === 4) return row >= 1 && row <= 9;
  if (col === 2) return row === 5;
  return false;
}

function isHorizontalRailway(row: number): boolean {
  return RAILWAY_ROWS.has(row);
}

// Vertical connections that DON'T exist (0-indexed)
// (c4,r1)↔(c4,r2) = col3,row0 -> col3,row1: no connection
// (c2,r11)↔(c2,r12) = col1,row10 -> col1,row11: no connection
// (c2,r6)↔(c2,r7) = col1,row5 -> col1,row6: no connection
// (c4,r6)↔(c4,r7) = col3,row5 -> col3,row6: no connection
const MISSING_VERTICAL = new Set([
  '0,3',  // row0-row1, col3
  '10,1', // row10-row11, col1
  '5,1',  // row5-row6, col1
  '5,3',  // row5-row6, col3
]);

function hasVerticalConnection(row: number, col: number): boolean {
  // row -> row+1 connection exists?
  if (row < 0 || row >= ROWS - 1) return false;
  if (MISSING_VERTICAL.has(`${row},${col}`)) return false;
  return true;
}

function hasHorizontalConnection(row: number, col: number): boolean {
  // col -> col+1 connection exists?
  return col >= 0 && col < COLS - 1;
}

// Diagonal connections only through camps (0-indexed)
// Each camp connects to its 4 diagonal neighbors
const DIAGONAL_CONNECTIONS: Array<[[number, number], [number, number]]> = [];

for (const pos of CAMP_POSITIONS) {
  const [r, c] = pos.split(',').map(Number);
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      // Avoid duplicates: only add if r < nr, or (r === nr && c < nc)
      if (r < nr || (r === nr && c < nc)) {
        DIAGONAL_CONNECTIONS.push([[r, c], [nr, nc]]);
      }
    }
  }
}

const DIAGONAL_SET = new Set(
  DIAGONAL_CONNECTIONS.map(([[r1, c1], [r2, c2]]) => {
    const a = `${r1},${c1}`, b = `${r2},${c2}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  })
);

function hasDiagonalConnection(r1: number, c1: number, r2: number, c2: number): boolean {
  const a = `${r1},${c1}`, b = `${r2},${c2}`;
  return DIAGONAL_SET.has(a < b ? `${a}|${b}` : `${b}|${a}`);
}

// Returns all directly adjacent positions reachable from (row, col) in one step
// Does NOT filter for piece occupancy - that's the caller's job
export function getAdjacentCells(row: number, col: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];

  // Orthogonal
  if (hasVerticalConnection(row - 1, col)) result.push([row - 1, col]);
  if (hasVerticalConnection(row, col)) result.push([row + 1, col]);
  if (hasHorizontalConnection(row, col - 1)) result.push([row, col - 1]);
  if (hasHorizontalConnection(row, col)) result.push([row, col + 1]);

  // Diagonal (only via camp connections)
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const nr = row + dr, nc = col + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      if (hasDiagonalConnection(row, col, nr, nc)) {
        result.push([nr, nc]);
      }
    }
  }

  return result;
}

// Railway reachable cells for a regular piece (straight line, no turns)
// Returns all cells reachable along railway from (row, col), not including (row, col)
// Stops at first occupied cell (can capture it but not go beyond)
export function getRailwayReachable(
  row: number,
  col: number,
  board: { piece: unknown | null }[][]
): Array<[number, number]> {
  const result: Array<[number, number]> = [];

  // Directions: up, down, left, right
  const directions: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const [dr, dc] of directions) {
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      // Check if this step is along railway
      if (dc === 0) {
        // vertical step: connection between r-dr and r
        const fromRow = dr > 0 ? r - 1 : r;
        if (!isVerticalRailway(fromRow, c)) break;
        if (MISSING_VERTICAL.has(`${fromRow},${c}`)) break;
      } else {
        // horizontal step: both cells must be on railway row
        if (!isHorizontalRailway(r)) break;
      }

      result.push([r, c]);
      if (board[r][c].piece !== null) break; // blocked, can capture but not pass
      r += dr;
      c += dc;
    }
  }

  return result;
}

// Railway reachable cells for engineer (can turn, BFS along railway edges)
export function getEngineerRailwayReachable(
  row: number,
  col: number,
  board: { piece: unknown | null }[][]
): Array<[number, number]> {
  const visited = new Set<string>();
  const result: Array<[number, number]> = [];
  const queue: Array<[number, number]> = [[row, col]];
  visited.add(`${row},${col}`);

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;

    // Try all 4 directions along railway
    const directions: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of directions) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited.has(`${nr},${nc}`)) continue;

      // Check railway connection
      let onRailway = false;
      if (dc === 0) {
        const fromRow = dr > 0 ? r : nr;
        onRailway = isVerticalRailway(fromRow, nc) && !MISSING_VERTICAL.has(`${fromRow},${nc}`);
      } else {
        onRailway = isHorizontalRailway(r) && isHorizontalRailway(nr);
        // Both must be on same railway row
        onRailway = isHorizontalRailway(r) && nr === r;
        // Actually for horizontal: both r and nr are same row, check if row is railway
        onRailway = isHorizontalRailway(r);
      }

      if (!onRailway) continue;

      visited.add(`${nr},${nc}`);
      result.push([nr, nc]);

      // Only continue BFS if cell is empty (can't pass through pieces)
      if (board[nr][nc].piece === null) {
        queue.push([nr, nc]);
      }
    }
  }

  return result;
}
