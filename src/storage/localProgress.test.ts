import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveProgress, loadProgress, clearProgress } from './localProgress'
import { initialWeights } from '../ml/onlineModel'
import { FIRST_MAZE, generateMaze } from '../game/generateMaze'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

describe('localProgress', () => {
  beforeEach(() => store.clear())

  it('progress survives a save/load round trip', () => {
    const data = { model: initialWeights(), completed: 3, recentRuns: [], lastMaze: generateMaze(FIRST_MAZE) }
    saveProgress(data)
    expect(loadProgress()).toEqual({ saved: { version: 1, ...data }, invalid: false })
  })

  it('returns nothing when empty', () => {
    expect(loadProgress()).toEqual({ saved: null, invalid: false })
  })

  it('flags and clears invalid data', () => {
    store.set('evomaze.v1', '{not json')
    expect(loadProgress()).toEqual({ saved: null, invalid: true })
    expect(store.size).toBe(0)
    store.set('evomaze.v1', JSON.stringify({ version: 2 }))
    expect(loadProgress().invalid).toBe(true)
    clearProgress()
    expect(store.size).toBe(0)
  })
})
