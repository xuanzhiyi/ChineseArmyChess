export type Color = 'red' | 'black';
export type Phase = 'flipping' | 'playing';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export type Rank =
  | 'commander'    // 司令
  | 'general'      // 军长
  | 'lt_general'   // 师长
  | 'major_general'// 旅长
  | 'colonel'      // 团长
  | 'lt_colonel'   // 营长
  | 'major'        // 连长
  | 'captain'      // 排长
  | 'engineer'     // 工兵
  | 'bomb'         // 炸弹
  | 'mine'         // 地雷
  | 'flag';        // 军旗

export const RANK_ORDER: Record<Rank, number> = {
  flag: 0,
  mine: 1,
  engineer: 2,
  captain: 3,
  major: 4,
  lt_colonel: 5,
  colonel: 6,
  major_general: 7,
  lt_general: 8,
  general: 9,
  commander: 10,
  bomb: -1, // special
};

export const RANK_LABELS: Record<Rank, string> = {
  commander: '司令',
  general: '军长',
  lt_general: '师长',
  major_general: '旅长',
  colonel: '团长',
  lt_colonel: '营长',
  major: '连长',
  captain: '排长',
  engineer: '工兵',
  bomb: '炸弹',
  mine: '地雷',
  flag: '军旗',
};

export interface Piece {
  id: string;       // unique piece id
  rank: Rank;
  color: Color;
  faceUp: boolean;
}

export interface Cell {
  piece: Piece | null;
  type: 'normal' | 'camp' | 'hq';
}

// Board is 12 rows x 5 cols, indexed board[row][col] (0-indexed internally)
export type Board = Cell[][];

export interface LastMove {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  type: 'move' | 'flip';
}

export interface GameState {
  board: Board;
  phase: Phase;
  redMines: number;
  blackMines: number;
  lastMove?: LastMove;
}

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  playerRed: string | null;
  playerBlack: string | null;
  currentTurn: Color | null;
  winner: Color | null;
}

// Socket events
export interface ServerToClientEvents {
  room_joined: (data: { room: Room; yourColor: Color | null }) => void;
  game_state: (state: GameState) => void;
  turn_changed: (color: Color) => void;
  color_assigned: (data: { red: string; black: string }) => void;
  game_over: (winner: Color) => void;
  error: (msg: string) => void;
  player_left: () => void;
  my_rooms: (rooms: Array<{ code: string; updatedAt: string }>) => void;
}

export interface ClientToServerEvents {
  create_room: (playerToken: string) => void;
  join_room: (code: string, playerToken: string) => void;
  get_room_state: (code: string) => void;
  flip_piece: (row: number, col: number) => void;
  move_piece: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  leave_room: () => void;
  forfeit: () => void;
  get_my_rooms: (playerToken: string) => void;
}
