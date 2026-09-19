import { analyzeRun } from './analyzeRun'
import { FIRST_MAZE, generateMaze } from './generateMaze'
import { normalize } from './getFeatures'
import { hashSeed } from './rng'
import { solveMaze } from './solveMaze'
import { DR, DC, idx, samePoint, type Dir, type Maze, type Point, type RunResult } from './types'
import { buildUpdate, initialWeights, learn, predict, type LearningUpdate, type Weights } from '../ml/onlineModel'
import { generateCandidates, selectCandidate, type CandidateScore } from '../ml/selectCandidate'
import type { Saved } from '../storage/localProgress'

export type GamePhase = 'welcome' | 'playing' | 'reviewing-path' | 'updating-model' | 'selecting-maze' | 'next-ready'

/** Everything the post-level animation needs, computed once at goal-reached. */
export type LevelOutcome = {
  run: RunResult
  optimalPath: Point[]
  update: LearningUpdate
  scores: CandidateScore[]
  selectedIndex: number
  explanation: string
  nextMaze: Maze
}

export type State = {
  phase: GamePhase
  maze: Maze
  path: Point[]
  startedAt: number | null
  model: Weights
  completed: number
  recentRuns: RunResult[]
  /** One point per completed maze: what the model predicted vs what happened. */
  history: HistoryPoint[]
  outcome: LevelOutcome | null
  notice: string | null
}

export type HistoryPoint = { predicted: number; actual: number }

export type Action =
  | { type: 'START' }
  | { type: 'MOVE'; dir: Dir; now: number }
  | { type: 'NEXT_STAGE' }
  | { type: 'SKIP' }
  | { type: 'REPLAY' }
  | { type: 'TRY_NEXT' }
  | { type: 'RESET' }

const NEXT: Partial<Record<GamePhase, GamePhase>> = {
  'reviewing-path': 'updating-model',
  'updating-model': 'selecting-maze',
  'selecting-maze': 'next-ready',
}

export function createInitialState(saved: Saved | null, notice: string | null = null): State {
  const maze = saved?.lastMaze ?? generateMaze(FIRST_MAZE)
  return {
    phase: 'welcome',
    maze,
    path: [maze.start],
    startedAt: null,
    model: saved?.model ?? initialWeights(),
    completed: saved?.completed ?? 0,
    recentRuns: saved?.recentRuns ?? [],
    history: saved?.history ?? [],
    outcome: null,
    notice,
  }
}

/** The only place the model learns. Runs synchronously; the UI animates from the result. */
function completeLevel(state: State, path: Point[], now: number): State {
  const { maze, model, completed } = state
  const optimalPath = solveMaze(maze)!
  const run = analyzeRun(maze, path, optimalPath, now - (state.startedAt ?? now))
  const x = normalize(maze.features)
  const predicted = predict(model, x)
  const after = learn(model, x, run.efficiency)
  const update = buildUpdate(model, after, x, run.efficiency, completed + 1)
  const { scores, selectedIndex, explanation } = selectCandidate(after, generateCandidates(hashSeed(maze.seed, completed + 1)), maze)
  return {
    ...state,
    phase: 'reviewing-path',
    path,
    model: after,
    completed: completed + 1,
    recentRuns: [...state.recentRuns, run].slice(-10),
    history: [...state.history, { predicted, actual: run.efficiency }].slice(-20),
    outcome: { run, optimalPath, update, scores, selectedIndex, explanation, nextMaze: scores[selectedIndex].maze },
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START':
      return state.phase === 'welcome' ? { ...state, phase: 'playing', path: [state.maze.start], startedAt: null, notice: null } : state
    case 'MOVE': {
      if (state.phase !== 'playing') return state
      const cur = state.path[state.path.length - 1]
      if (!(state.maze.open[idx(state.maze, cur)] & action.dir)) return state
      const next = { r: cur.r + DR[action.dir], c: cur.c + DC[action.dir] }
      const path = [...state.path, next]
      if (samePoint(next, state.maze.goal)) return completeLevel({ ...state, startedAt: state.startedAt ?? action.now }, path, action.now)
      return { ...state, path, startedAt: state.startedAt ?? action.now }
    }
    case 'NEXT_STAGE':
      return NEXT[state.phase] ? { ...state, phase: NEXT[state.phase]! } : state
    case 'SKIP':
      return NEXT[state.phase] ? { ...state, phase: 'next-ready' } : state
    case 'REPLAY':
      return state.outcome ? { ...state, phase: 'reviewing-path' } : state
    case 'TRY_NEXT':
      if (!state.outcome) return state
      return { ...state, phase: 'playing', maze: state.outcome.nextMaze, path: [state.outcome.nextMaze.start], startedAt: null, outcome: null }
    case 'RESET':
      return createInitialState(null)
  }
}
