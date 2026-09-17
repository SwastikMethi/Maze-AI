import { describe, it, expect } from 'vitest'
import { solveMaze } from './solveMaze'
import { getFeatures } from './getFeatures'
import { N, E, S, W } from './types'

// 3×3, two routes from (0,0) to (2,2): left column + bottom row (4 moves) vs top row + detour (6 moves).
export const tiny = {
  rows: 3,
  cols: 3,
  open: [E | S, E | W, S | W, N | S, E | S, N | W, N | E, N | W | E, W],
  start: { r: 0, c: 0 },
  goal: { r: 2, c: 2 },
}

describe('solveMaze', () => {
  it('returns the shortest path', () => {
    const path = solveMaze(tiny)!
    expect(path.length - 1).toBe(4)
    expect(path[0]).toEqual({ r: 0, c: 0 })
    expect(path[4]).toEqual({ r: 2, c: 2 })
  })

  it('returns null when the goal is unreachable', () => {
    expect(solveMaze({ ...tiny, open: tiny.open.map(() => 0) })).toBeNull()
  })

  it('counts turns, junctions and dead ends', () => {
    const f = getFeatures(tiny, solveMaze(tiny)!)
    expect(f).toEqual({ size: 9, optimalPathLength: 4, turnCount: 1, junctionCount: 1, deadEndCount: 1 })
  })
})
