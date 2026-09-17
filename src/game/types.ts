export type Point = { r: number; c: number }

/** Open-side bits for a cell. */
export const N = 1
export const E = 2
export const S = 4
export const W = 8
export type Dir = 1 | 2 | 4 | 8
export const DIRS: Dir[] = [N, E, S, W]
export const DR: Record<Dir, number> = { 1: -1, 2: 0, 4: 1, 8: 0 }
export const DC: Record<Dir, number> = { 1: 0, 2: 1, 4: 0, 8: -1 }
export const OPP: Record<Dir, Dir> = { 1: 4, 2: 8, 4: 1, 8: 2 }

export type MazeFeatures = {
  size: number
  optimalPathLength: number
  turnCount: number
  junctionCount: number
  deadEndCount: number
}

export type Maze = {
  id: string
  seed: number
  rows: number
  cols: number
  straightness: number
  braid: number
  start: Point
  goal: Point
  /** Bitmask of open sides per cell, index = r * cols + c. Replaces the TRD's Wall[]. */
  open: number[]
  features: MazeFeatures
}

export type RunResult = {
  mazeId: string
  path: Point[]
  moves: number
  optimalMoves: number
  timeMs: number
  wrongTurns: number
  backtracks: number
  efficiency: number
}

export const idx = (m: { cols: number }, p: Point) => p.r * m.cols + p.c
export const samePoint = (a: Point, b: Point) => a.r === b.r && a.c === b.c
export const inBounds = (m: { rows: number; cols: number }, r: number, c: number) =>
  r >= 0 && c >= 0 && r < m.rows && c < m.cols
