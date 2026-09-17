import { describe, it, expect } from 'vitest'
import { generateMaze } from './generateMaze'
import { solveMaze } from './solveMaze'
import { CANDIDATE_SIDES, PRESETS } from '../ml/selectCandidate'

describe('generateMaze', () => {
  it('always produces a maze with a path from start to goal', () => {
    for (const side of CANDIDATE_SIDES)
      for (const [straightness, braid] of PRESETS)
        for (let seed = 1; seed <= 20; seed++) {
          const m = generateMaze({ seed, side, straightness, braid })
          expect(solveMaze(m)).not.toBeNull()
        }
  })

  it('is deterministic for the same seed', () => {
    const a = generateMaze({ seed: 42, side: 10, straightness: 0.7, braid: 0.3 })
    const b = generateMaze({ seed: 42, side: 10, straightness: 0.7, braid: 0.3 })
    expect(a.open).toEqual(b.open)
    expect(a.features).toEqual(b.features)
  })

  it('braiding reduces dead ends', () => {
    const plain = generateMaze({ seed: 7, side: 12, straightness: 0, braid: 0 })
    const braided = generateMaze({ seed: 7, side: 12, straightness: 0, braid: 0.3 })
    expect(braided.features.deadEndCount).toBeLessThan(plain.features.deadEndCount)
  })
})
