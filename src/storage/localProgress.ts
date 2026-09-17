import type { Maze, RunResult } from '../game/types'
import type { Weights } from '../ml/onlineModel'

const KEY = 'evomaze.v1'

export type Saved = { version: 1; model: Weights; completed: number; recentRuns: RunResult[]; lastMaze: Maze }

function isSaved(v: unknown): v is Saved {
  const s = v as Saved
  return (
    !!s && typeof s === 'object' && s.version === 1 &&
    Array.isArray(s.model?.w) && s.model.w.length === 5 && typeof s.model.b === 'number' &&
    typeof s.completed === 'number' && Array.isArray(s.recentRuns) &&
    !!s.lastMaze && Array.isArray(s.lastMaze.open) && typeof s.lastMaze.rows === 'number'
  )
}

export function saveProgress(s: Omit<Saved, 'version'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, ...s }))
  } catch { /* storage unavailable: play without persistence */ }
}

/** invalid = something was stored but could not be used (and has been cleared). */
export function loadProgress(): { saved: Saved | null; invalid: boolean } {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch { return { saved: null, invalid: false } }
  if (raw === null) return { saved: null, invalid: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isSaved(parsed)) return { saved: parsed, invalid: false }
  } catch { /* fall through */ }
  clearProgress()
  return { saved: null, invalid: true }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}
