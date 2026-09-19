import { FEATURE_KEYS, normalize, type FeatureKey } from '../game/getFeatures'
import { FIRST_MAZE, generateMaze } from '../game/generateMaze'

export type Weights = { w: number[]; b: number }
export type Confidence = 'low' | 'medium' | 'high'
/** Everything the trainer visual needs. Weights are in FEATURE_KEYS order. */
export type LearningUpdate = {
  x: number[]
  weightsBefore: number[]
  weightsAfter: number[]
  biasBefore: number
  biasAfter: number
  actualEfficiency: number
  confidence: Confidence
  signal: string
}

export const TARGET = 0.7
export const LR = 1.5 // ponytail: single learning-rate knob; lower if the model overshoots on real players
/** Shared prior weight: "more of any feature is harder". Neutral across features, not zero. */
export const W0 = -1.0

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  size: 'bigger grids',
  optimalPathLength: 'long paths',
  turnCount: 'turns',
  junctionCount: 'junctions',
  deadEndCount: 'dead ends',
}

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))
export const score = (m: Weights, x: number[]) => m.b + m.w.reduce((s, w, i) => s + w * x[i], 0)

/** Prior: every weight W0, bias chosen so the fixed first maze predicts exactly TARGET. */
export function initialWeights(): Weights {
  const x = normalize(generateMaze(FIRST_MAZE).features)
  const b = Math.log(TARGET / (1 - TARGET)) - W0 * x.reduce((a, v) => a + v, 0)
  return { w: FEATURE_KEYS.map(() => W0), b }
}

export function predict(m: Weights, x: number[]): number {
  return sigmoid(score(m, x))
}

/** One SGD step toward the observed efficiency. Returns a new object. */
export function learn(m: Weights, x: number[], actual: number): Weights {
  const err = actual - predict(m, x)
  return { w: m.w.map((w, i) => w + LR * err * x[i]), b: m.b + LR * err }
}

export function confidenceFor(completed: number): Confidence {
  return completed < 3 ? 'low' : completed < 8 ? 'medium' : 'high'
}

export function buildUpdate(before: Weights, after: Weights, x: number[], actual: number, completed: number): LearningUpdate {
  const error = actual - predict(before, x)
  const confidence = confidenceFor(completed)
  const prefix = confidence === 'low' ? 'Early signal: ' : ''
  // Δw_i ∝ x_i, so the feature with the largest input moves most (bias excluded: its input is always 1).
  const top = FEATURE_KEYS[x.indexOf(Math.max(...x))]
  const signal =
    Math.abs(error) < 0.02
      ? `${prefix}Prediction was almost exact, so the weights barely moved.`
      : `${prefix}You ${error > 0 ? 'beat' : 'fell short of'} the prediction, so every feature now looks a little ${error > 0 ? 'less' : 'more'} costly. ` +
        `${cap(FEATURE_LABELS[top])} moved most because this maze had the most of it.`
  return {
    x,
    weightsBefore: before.w,
    weightsAfter: after.w,
    biasBefore: before.b,
    biasAfter: after.b,
    actualEfficiency: actual,
    confidence,
    signal,
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
