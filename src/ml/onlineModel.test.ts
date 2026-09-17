import { describe, it, expect } from 'vitest'
import { initialWeights, learn, predict, sensitivity, buildUpdate, W0, TARGET } from './onlineModel'
import { normalize } from '../game/getFeatures'
import { FIRST_MAZE, generateMaze } from '../game/generateMaze'

const x = normalize(generateMaze(FIRST_MAZE).features)

describe('onlineModel', () => {
  it('prior predicts the target on the first maze', () => {
    expect(predict(initialWeights(), x)).toBeCloseTo(TARGET, 6)
  })

  it('a completed run changes the weights and moves the prediction toward the outcome', () => {
    const before = initialWeights()
    const after = learn(before, x, 0.3)
    expect(after.w).not.toEqual(before.w)
    expect(after.b).not.toBe(before.b)
    expect(predict(after, x)).toBeLessThan(predict(before, x))
    expect(before.w).toEqual(initialWeights().w) // learn is pure
  })

  it('same model and features give the same prediction', () => {
    const m = learn(initialWeights(), x, 0.9)
    expect(predict(m, x)).toBe(predict(m, x))
  })

  it('sensitivity is 50 at the prior and rises when a weight drops', () => {
    expect(sensitivity(W0)).toBeCloseTo(50)
    expect(sensitivity(W0 - 0.2)).toBeGreaterThan(50)
  })

  it('buildUpdate reports only features that visibly changed, with an early-signal sentence', () => {
    const before = initialWeights()
    const after = learn(before, x, 0.3)
    const u = buildUpdate(before, after, x, 0.3, 1)
    expect(u.confidence).toBe('low')
    expect(u.changedFeatures.length).toBeGreaterThan(0)
    expect(u.signal).toMatch(/^Early signal: .* slowed you down\.$/)
  })
})
