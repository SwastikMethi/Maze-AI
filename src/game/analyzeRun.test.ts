import { describe, it, expect } from 'vitest'
import { analyzeRun } from './analyzeRun'
import { solveMaze } from './solveMaze'
import { N, E, S, W, type Maze } from './types'

const features = { size: 4, optimalPathLength: 2, turnCount: 1, junctionCount: 0, deadEndCount: 2 }
// 2×2: (0,0)→(0,1)→(1,1) is optimal; (1,0) is a dead end off (0,0).
const maze: Maze = {
  id: 't', seed: 0, rows: 2, cols: 2, straightness: 0, braid: 0,
  start: { r: 0, c: 0 }, goal: { r: 1, c: 1 },
  open: [E | S, W | S, N, N], features,
}
const optimal = solveMaze(maze)!

describe('analyzeRun', () => {
  it('computes efficiency = optimal / actual', () => {
    const path = [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }]
    const run = analyzeRun(maze, path, optimal, 1234)
    expect(run.moves).toBe(4)
    expect(run.optimalMoves).toBe(2)
    expect(run.efficiency).toBeCloseTo(0.5)
    expect(run.wrongTurns).toBe(1)
    expect(run.backtracks).toBe(1)
    expect(run.timeMs).toBe(1234)
  })

  it('clamps efficiency to 1 on a perfect run', () => {
    const run = analyzeRun(maze, optimal, optimal, 500)
    expect(run.efficiency).toBe(1)
    expect(run.wrongTurns).toBe(0)
    expect(run.backtracks).toBe(0)
  })
})
