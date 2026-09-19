import { describe, it, expect } from 'vitest'
import { createInitialState, reducer, type State } from './reducer'
import { E, N, S, W, type CompleteResponse, type Maze, type Weights } from '../api/types'

// 2x2: start (0,0) → (0,1) → goal (1,1); (1,0) is a dead end.
const maze: Maze = {
  id: 't', seed: 1, rows: 2, cols: 2, straightness: 0, loops: 0,
  start: { r: 0, c: 0 }, goal: { r: 1, c: 1 }, open: [E | S, W | S, N, N],
  features: { size: 4, optimalPathLength: 2, turnCount: 1, junctionCount: 0, deadEndCount: 2 },
}
const model: Weights = { w: [-1, -1, -1, -1, -1], b: 1.3 }
const result: CompleteResponse = {
  run: { mazeId: 't', path: [maze.start, { r: 0, c: 1 }, maze.goal], moves: 2, optimalMoves: 2, timeMs: 900, wrongTurns: 0, backtracks: 0, efficiency: 1 },
  optimalPath: [maze.start, { r: 0, c: 1 }, maze.goal],
  update: { x: [0, 0, 0, 0, 0], weightsBefore: model.w, weightsAfter: [-0.9, -1, -1, -1, -1], biasBefore: 1.3, biasAfter: 1.7, predictionBefore: 0.7, actualEfficiency: 1, confidence: 'low', signal: 's' },
  scores: [],
  selectedIndex: 0,
  explanation: 'Selected for you: a bigger grid.',
  nextMaze: { ...maze, id: 'next', seed: 2 },
  model: { w: [-0.9, -1, -1, -1, -1], b: 1.7 },
}

const start = reducer(createInitialState(maze, model, null), { type: 'START' })
const finish = (s: State) => reducer(reducer(s, { type: 'MOVE', dir: E, now: 100 }), { type: 'MOVE', dir: S, now: 1000 })

describe('reducer', () => {
  it('ignores blocked moves, counts real ones, starts the clock on the first move', () => {
    expect(reducer(start, { type: 'MOVE', dir: N, now: 1 })).toBe(start)
    const moved = reducer(start, { type: 'MOVE', dir: S, now: 1 })
    expect(moved.path).toHaveLength(2)
    expect(moved.startedAt).toBe(1)
  })

  it('reaching the goal freezes the run and waits for the server', () => {
    const scoring = finish(start)
    expect(scoring.phase).toBe('scoring')
    expect(scoring.finishedAt).toBe(1000)
    expect(scoring.model).toBe(start.model)
    expect(reducer(scoring, { type: 'MOVE', dir: W, now: 2000 })).toBe(scoring)
  })

  it('SCORED applies the server result exactly once', () => {
    const done = reducer(finish(start), { type: 'SCORED', result })
    expect(done.phase).toBe('reviewing-path')
    expect(done.completed).toBe(1)
    expect(done.model).toEqual(result.model)
    expect(done.history).toEqual([{ predicted: 0.7, actual: 1 }])
    expect(done.outcome!.nextMaze.id).toBe('next')
    expect(reducer(done, { type: 'SCORED', result })).toBe(done) // duplicate reply is a no-op
  })

  it('skipping or replaying the animation never changes model, outcome or history', () => {
    const done = reducer(finish(start), { type: 'SCORED', result })
    const skipped = reducer(done, { type: 'SKIP' })
    const replayed = reducer(skipped, { type: 'REPLAY' })
    const stepped = reducer(reducer(reducer(replayed, { type: 'NEXT_STAGE' }), { type: 'NEXT_STAGE' }), { type: 'NEXT_STAGE' })
    expect(skipped.phase).toBe('next-ready')
    expect(replayed.phase).toBe('reviewing-path')
    expect(stepped.phase).toBe('next-ready')
    for (const s of [skipped, replayed, stepped]) {
      expect(s.model).toBe(done.model)
      expect(s.outcome).toBe(done.outcome)
      expect(s.history).toBe(done.history)
      expect(s.completed).toBe(1)
    }
  })

  it('a failed score keeps the old model and lets the player retry', () => {
    const failed = reducer(finish(start), { type: 'SCORE_FAILED', message: 'offline' })
    expect(failed.phase).toBe('playing')
    expect(failed.model).toBe(start.model)
    expect(failed.path).toEqual([maze.start])
    expect(failed.notice).toBe('offline')
  })

  it('TRY_NEXT hands over the selected maze', () => {
    const next = reducer(reducer(finish(start), { type: 'SCORED', result }), { type: 'TRY_NEXT' })
    expect(next.phase).toBe('playing')
    expect(next.maze.id).toBe('next')
    expect(next.path).toEqual([next.maze.start])
    expect(next.outcome).toBeNull()
  })
})
