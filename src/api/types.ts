/** Wire types shared with the Python API (server/main.py). Keep in sync by hand; both sides are small. */

export type Point = { r: number; c: number }

/** Open-side bits for a cell. */
export const N = 1, E = 2, S = 4, W = 8
export type Dir = 1 | 2 | 4 | 8
export const DR: Record<Dir, number> = { 1: -1, 2: 0, 4: 1, 8: 0 }
export const DC: Record<Dir, number> = { 1: 0, 2: 1, 4: 0, 8: -1 }

export const FEATURE_KEYS = ['size', 'optimalPathLength', 'turnCount', 'junctionCount', 'deadEndCount'] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  size: 'bigger grids',
  optimalPathLength: 'long paths',
  turnCount: 'turns',
  junctionCount: 'junctions',
  deadEndCount: 'dead ends',
}

/** Mirrors server/evomaze/model.py constants; display only. */
export const TARGET = 0.7
export const LR = 1.5
export const W0 = -1.0
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

export type Maze = {
  id: string
  seed: number
  rows: number
  cols: number
  straightness: number
  loops: number
  start: Point
  goal: Point
  /** Bitmask of open sides per cell, index = r * cols + c. */
  open: number[]
  features: Record<FeatureKey, number>
}

export type Weights = { w: number[]; b: number }

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

export type Confidence = 'low' | 'medium' | 'high'
export type LearningUpdate = {
  x: number[]
  weightsBefore: number[]
  weightsAfter: number[]
  biasBefore: number
  biasAfter: number
  predictionBefore: number
  actualEfficiency: number
  confidence: Confidence
  signal: string
}

export type CandidateScore = { maze: Maze; predicted: number; fit: number; faded: boolean }

export type FirstResponse = { maze: Maze; model: Weights; preview: { maze: Maze; path: Point[] } }
export type CompleteRequest = { maze: Maze; path: Point[]; timeMs: number; model: Weights; completed: number }
export type CompleteResponse = {
  run: RunResult
  optimalPath: Point[]
  update: LearningUpdate
  scores: CandidateScore[]
  selectedIndex: number
  explanation: string
  nextMaze: Maze
  model: Weights
}

export const idx = (m: { cols: number }, p: Point) => p.r * m.cols + p.c
export const samePoint = (a: Point, b: Point) => a.r === b.r && a.c === b.c
