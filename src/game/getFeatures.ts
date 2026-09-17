import { DIRS, type Maze, type MazeFeatures, type Point } from './types'

export const FEATURE_KEYS = ['size', 'optimalPathLength', 'turnCount', 'junctionCount', 'deadEndCount'] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

/** Fixed denominators: ~1.1× the max observed at 16×16 across all presets. Stable across batches. */
export const FEATURE_MAX: Record<FeatureKey, number> = {
  size: 256,
  optimalPathLength: 212,
  turnCount: 123,
  junctionCount: 44,
  deadEndCount: 38,
}

export function getFeatures(m: Pick<Maze, 'rows' | 'cols' | 'open'>, optimalPath: Point[]): MazeFeatures {
  let turnCount = 0
  for (let i = 2; i < optimalPath.length; i++) {
    const a = optimalPath[i - 2], b = optimalPath[i - 1], c = optimalPath[i]
    if (b.r - a.r !== c.r - b.r || b.c - a.c !== c.c - b.c) turnCount++
  }
  let junctionCount = 0, deadEndCount = 0
  for (const bits of m.open) {
    const deg = DIRS.filter((d) => bits & d).length
    if (deg >= 3) junctionCount++
    if (deg === 1) deadEndCount++
  }
  return { size: m.rows * m.cols, optimalPathLength: optimalPath.length - 1, turnCount, junctionCount, deadEndCount }
}

/** Features → vector in FEATURE_KEYS order, each clamped to [0, 1]. */
export function normalize(f: MazeFeatures): number[] {
  return FEATURE_KEYS.map((k) => Math.min(1, f[k] / FEATURE_MAX[k]))
}
