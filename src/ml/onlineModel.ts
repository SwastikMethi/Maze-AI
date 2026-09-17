import { FEATURE_KEYS, normalize, type FeatureKey } from '../game/getFeatures'
import { FIRST_MAZE, generateMaze } from '../game/generateMaze'

export type Weights = { w: number[]; b: number }
export type Confidence = 'low' | 'medium' | 'high'
export type LearningUpdate = {
  predictionBefore: number
  actualEfficiency: number
  weightsBefore: Record<FeatureKey, number>
  weightsAfter: Record<FeatureKey, number>
  changedFeatures: FeatureKey[]
  confidence: Confidence
  signal: string
}

export const TARGET = 0.7
export const LR = 1.5 // ponytail: single learning-rate knob; lower if the model overshoots on real players
/** Shared prior weight: "more of any feature is harder". Neutral across features, not zero. */
export const W0 = -1.0
const GAIN = 4 // display-only: spreads small weight changes into visible percentage moves

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  size: 'bigger grids',
  optimalPathLength: 'long paths',
  turnCount: 'turns',
  junctionCount: 'junctions',
  deadEndCount: 'dead ends',
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

/** Prior: every weight W0, bias chosen so the fixed first maze predicts exactly TARGET. */
export function initialWeights(): Weights {
  const x = normalize(generateMaze(FIRST_MAZE).features)
  const b = Math.log(TARGET / (1 - TARGET)) - W0 * x.reduce((a, v) => a + v, 0)
  return { w: FEATURE_KEYS.map(() => W0), b }
}

export function predict(m: Weights, x: number[]): number {
  return sigmoid(m.b + m.w.reduce((s, w, i) => s + w * x[i], 0))
}

/** One SGD step toward the observed efficiency. Returns a new object. */
export function learn(m: Weights, x: number[], actual: number): Weights {
  const err = actual - predict(m, x)
  return { w: m.w.map((w, i) => w + LR * err * x[i]), b: m.b + LR * err }
}

/** 0–100. 50 at the prior; higher means this feature hurts the player more. */
export function sensitivity(w: number): number {
  return 100 * sigmoid(GAIN * (W0 - w))
}

export function confidenceFor(completed: number): Confidence {
  return completed < 3 ? 'low' : completed < 8 ? 'medium' : 'high'
}

export function buildUpdate(before: Weights, after: Weights, x: number[], actual: number, completed: number): LearningUpdate {
  const record = (m: Weights) => Object.fromEntries(FEATURE_KEYS.map((k, i) => [k, m.w[i]])) as Record<FeatureKey, number>
  const deltas = FEATURE_KEYS.map((k, i) => ({ k, d: sensitivity(after.w[i]) - sensitivity(before.w[i]) }))
  const changedFeatures = deltas.filter(({ d }) => Math.abs(d) >= 0.5).map(({ k }) => k)
  const confidence = confidenceFor(completed)
  const top = deltas.reduce((a, b) => (Math.abs(b.d) > Math.abs(a.d) ? b : a))
  const signal =
    changedFeatures.length === 0
      ? 'No measurable change yet.'
      : `${confidence === 'low' ? 'Early signal' : 'Signal'}: ${FEATURE_LABELS[top.k]} ${top.d > 0 ? 'slowed you down' : "didn't trouble you"}.`
  return {
    predictionBefore: predict(before, x),
    actualEfficiency: actual,
    weightsBefore: record(before),
    weightsAfter: record(after),
    changedFeatures,
    confidence,
    signal,
  }
}
