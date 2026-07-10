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

export const CELL_COLORS: Record<CellType, string> = {
  PAYDAY:    'bg-teal-500/20 border-teal-500 text-teal-300',
  DEAL:      'bg-amber-500/20 border-amber-500 text-amber-300',
  DOODAD:    'bg-blue-500/20 border-blue-500 text-blue-300',
  MARKET:    'bg-emerald-500/20 border-emerald-500 text-emerald-300',
  CHARITY:   'bg-purple-500/20 border-purple-500 text-purple-300',
  BABY:      'bg-slate-500/20 border-slate-500 text-slate-300',
  DOWNSIZED: 'bg-rose-500/20 border-rose-500 text-rose-300',
}

export function cellLabelAt(position: number): string {
  return CELL_LABELS[cellTypeAt(position)]
}

export function cellColorAt(position: number): string {
  return CELL_COLORS[cellTypeAt(position)]
}