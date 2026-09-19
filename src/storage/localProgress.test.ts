import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveProgress, loadProgress, clearProgress } from './localProgress'
import type { Maze } from '../api/types'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

const maze: Maze = {
  id: '2-1-0-0', seed: 1, rows: 2, cols: 2, straightness: 0, loops: 0, start: { r: 0, c: 0 }, goal: { r: 1, c: 1 }, open: [6, 12, 1, 1],
  features: { size: 4, optimalPathLength: 2, turnCount: 1, junctionCount: 0, deadEndCount: 2 },
}
const data = { model: { w: [-1, -1, -1, -1, -1], b: 1.3 }, completed: 3, recentRuns: [], lastMaze: maze, history: [{ predicted: 0.7, actual: 1 }] }

describe('localProgress', () => {
  beforeEach(() => store.clear())

  it('progress survives a save/load round trip', () => {
    saveProgress(data)
    expect(loadProgress()).toEqual({ saved: { version: 2, ...data }, invalid: false })
  })

  it('returns nothing when empty', () => {
    expect(loadProgress()).toEqual({ saved: null, invalid: false })
  })

  it('loads saves that have no history', () => {
    const { history: _h, ...legacy } = data
    store.set('evomaze.v2', JSON.stringify({ version: 2, ...legacy }))
    expect(loadProgress()).toEqual({ saved: { version: 2, ...legacy }, invalid: false })
  })

  it('flags and clears invalid or outdated data', () => {
    store.set('evomaze.v2', '{not json')
    expect(loadProgress()).toEqual({ saved: null, invalid: true })
    expect(store.size).toBe(0)
    store.set('evomaze.v2', JSON.stringify({ version: 1, ...data }))
    expect(loadProgress().invalid).toBe(true)
    clearProgress()
    expect(store.size).toBe(0)
  })
})
