export type CellType =
  | 'PAYDAY'
  | 'DEAL'
  | 'DOODAD'
  | 'MARKET'
  | 'CHARITY'
  | 'BABY'
  | 'DOWNSIZED'

export const BOARD_SIZE = 24

const CELL_TYPES: Record<number, CellType> = {
  0:  'DEAL',
  1:  'DOODAD',
  2:  'DEAL',
  3:  'CHARITY',
  4:  'DEAL',
  5:  'PAYDAY',
  6:  'DEAL',
  7:  'MARKET',

  8:  'DEAL',
  9:  'DOODAD',
  10: 'DEAL',
  11: 'BABY',
  12: 'DEAL',
  13: 'PAYDAY',
  14: 'DEAL',
  15: 'MARKET',

  16: 'DEAL',
  17: 'DOODAD',
  18: 'DEAL',
  19: 'DOWNSIZED',
  20: 'DEAL',
  21: 'PAYDAY',
  22: 'DEAL',
  23: 'MARKET',
}

export function cellTypeAt(position: number): CellType {
  const idx = ((position % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE
  return CELL_TYPES[idx]
}

export const CELL_LABELS: Record<CellType, string> = {
  PAYDAY:    'Payday',
  DEAL:      'Deal',
  DOODAD:    'Doodad',
  MARKET:    'Market',
  CHARITY:   'Charity',
  BABY:      'Baby',
  DOWNSIZED: 'Downsized',
}

export const CELL_SHORT_LABELS: Record<CellType, string> = {
  PAYDAY:    'Payday',
  DEAL:      'Deal',
  DOODAD:    'Doodad',
  MARKET:    'Market',
  CHARITY:   'Charity',
  BABY:      'Baby',
  DOWNSIZED: 'Down',
}

export const CELL_COLORS: Record<CellType, string> = {
  PAYDAY:    'bg-emerald-500/20 border-emerald-500 text-emerald-300',
  DEAL:      'bg-indigo-500/20 border-indigo-500 text-indigo-300',
  DOODAD:    'bg-red-500/20 border-red-500 text-red-300',
  MARKET:    'bg-cyan-500/20 border-cyan-500 text-cyan-300',
  CHARITY:   'bg-purple-500/20 border-purple-500 text-purple-300',
  BABY:      'bg-pink-500/20 border-pink-500 text-pink-300',
  DOWNSIZED: 'bg-orange-700/20 border-orange-700 text-orange-300',
}

export function cellLabelAt(position: number): string {
  return CELL_LABELS[cellTypeAt(position)]
}

export function cellShortLabelAt(position: number): string {
  return CELL_SHORT_LABELS[cellTypeAt(position)]
}

export function cellColorAt(position: number): string {
  return CELL_COLORS[cellTypeAt(position)]
}