import { describe, it, expect } from 'vitest'
import { createInitialState, reducer, type State } from './reducer'
import { solveMaze } from './solveMaze'
import { DIRS, DR, DC, type Dir, type Point } from './types'

const dirBetween = (a: Point, b: Point): Dir => DIRS.find((d) => a.r + DR[d] === b.r && a.c + DC[d] === b.c)!

function playOptimal(state: State): State {
  const path = solveMaze(state.maze)!
  let s = state
  for (let i = 1; i < path.length; i++) s = reducer(s, { type: 'MOVE', dir: dirBetween(path[i - 1], path[i]), now: 1000 + i * 100 })
  return s
}

describe('reducer', () => {
  const start = reducer(createInitialState(null), { type: 'START' })

  it('ignores blocked moves and counts real ones', () => {
    const blocked = DIRS.find((d) => !(start.maze.open[0] & d))!
    expect(reducer(start, { type: 'MOVE', dir: blocked, now: 1 })).toBe(start)
    const open = DIRS.find((d) => start.maze.open[0] & d)!
    const moved = reducer(start, { type: 'MOVE', dir: open, now: 1 })
    expect(moved.path).toHaveLength(2)
    expect(moved.startedAt).toBe(1)
  })

  it('reaching the goal trains the model once and prepares the next maze', () => {
    const done = playOptimal(start)
    expect(done.phase).toBe('reviewing-path')
    expect(done.completed).toBe(1)
    expect(done.model).not.toEqual(start.model)
    expect(done.outcome!.run.efficiency).toBe(1)
    expect(done.outcome!.scores).toHaveLength(24)
    expect(done.outcome!.nextMaze.id).not.toBe(start.maze.id)
  })

  it('skipping or replaying the animation never trains the model again', () => {
    const done = playOptimal(start)
    const skipped = reducer(done, { type: 'SKIP' })
    expect(skipped.phase).toBe('next-ready')
    const replayed = reducer(skipped, { type: 'REPLAY' })
    expect(replayed.phase).toBe('reviewing-path')
    const stepped = reducer(reducer(reducer(replayed, { type: 'NEXT_STAGE' }), { type: 'NEXT_STAGE' }), { type: 'NEXT_STAGE' })
    expect(stepped.phase).toBe('next-ready')
    for (const s of [skipped, replayed, stepped]) {
      expect(s.model).toBe(done.model)
      expect(s.outcome).toBe(done.outcome)
      expect(s.completed).toBe(1)
    }
  })

  it('TRY_NEXT hands over the selected maze', () => {
    const done = playOptimal(start)
    const next = reducer(done, { type: 'TRY_NEXT' })
    expect(next.phase).toBe('playing')
    expect(next.maze).toBe(done.outcome!.nextMaze)
    expect(next.path).toEqual([next.maze.start])
    expect(next.outcome).toBeNull()
  })
})
