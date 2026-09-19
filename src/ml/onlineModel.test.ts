import { describe, it, expect } from 'vitest'
import { initialWeights, learn, predict, buildUpdate, TARGET } from './onlineModel'
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

  it('buildUpdate exposes raw inputs, weights and bias with a plain-English signal', () => {
    const before = initialWeights()
    const poor = buildUpdate(before, learn(before, x, 0.3), x, 0.3, 1)
    expect(poor.x).toHaveLength(5)
    expect(poor.weightsBefore).toEqual(before.w)
    expect(poor.biasAfter).not.toBe(poor.biasBefore)
    expect(poor.confidence).toBe('low')
    expect(poor.signal).toMatch(/^Early signal: You fell short of the prediction/)
    const strong = buildUpdate(before, learn(before, x, 1), x, 1, 9)
    expect(strong.signal).toMatch(/^You beat the prediction/)
  })
})
