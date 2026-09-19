import { DC, DR, idx, samePoint, type CompleteResponse, type Dir, type Maze, type Point, type RunResult, type Weights } from '../api/types'
import type { Saved } from '../storage/localProgress'

export type GamePhase = 'welcome' | 'playing' | 'scoring' | 'reviewing-path' | 'updating-model' | 'selecting-maze' | 'next-ready'

/** Everything the post-level animation needs, as returned by the server in one shot. */
export type LevelOutcome = Omit<CompleteResponse, 'model'>
export type HistoryPoint = { predicted: number; actual: number }

export type State = {
  phase: GamePhase
  maze: Maze
  path: Point[]
  startedAt: number | null
  finishedAt: number | null
  model: Weights
  completed: number
  recentRuns: RunResult[]
  /** One point per completed maze: what the model predicted vs what happened. */
  history: HistoryPoint[]
  outcome: LevelOutcome | null
  notice: string | null
}

export type Action =
  | { type: 'START' }
  | { type: 'MOVE'; dir: Dir; now: number }
  | { type: 'SCORED'; result: CompleteResponse }
  | { type: 'SCORE_FAILED'; message: string }
  | { type: 'NEXT_STAGE' }
  | { type: 'SKIP' }
  | { type: 'REPLAY' }
  | { type: 'TRY_NEXT' }
  | { type: 'RESET'; maze: Maze; model: Weights }

const NEXT: Partial<Record<GamePhase, GamePhase>> = {
  'reviewing-path': 'updating-model',
  'updating-model': 'selecting-maze',
  'selecting-maze': 'next-ready',
}

export function createInitialState(maze: Maze, model: Weights, saved: Saved | null, notice: string | null = null): State {
  return {
    phase: 'welcome',
    maze: saved?.lastMaze ?? maze,
    path: [(saved?.lastMaze ?? maze).start],
    startedAt: null,
    finishedAt: null,
    model: saved?.model ?? model,
    completed: saved?.completed ?? 0,
    recentRuns: saved?.recentRuns ?? [],
    history: saved?.history ?? [],
    outcome: null,
    notice,
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
      const startedAt = state.startedAt ?? action.now
      // Goal reached: freeze the run and hand it to the server (App posts it while phase === 'scoring').
      if (samePoint(next, state.maze.goal)) return { ...state, phase: 'scoring', path, startedAt, finishedAt: action.now }
      return { ...state, path, startedAt }
    }
    case 'SCORED': {
      // The only place the model changes. Ignored unless we are waiting on a score, so a late/duplicate reply can't retrain.
      if (state.phase !== 'scoring') return state
      const { model, ...outcome } = action.result
      const { run, update } = outcome
      return {
        ...state,
        phase: 'reviewing-path',
        model,
        completed: state.completed + 1,
        recentRuns: [...state.recentRuns, run].slice(-10),
        history: [...state.history, { predicted: update.predictionBefore, actual: run.efficiency }].slice(-20),
        outcome,
      }
    }
    case 'SCORE_FAILED':
      // Keep the previous model and let the player retry the same maze; never show a fake learning result.
      return state.phase === 'scoring' ? { ...state, phase: 'playing', path: [state.maze.start], startedAt: null, finishedAt: null, notice: action.message } : state
    case 'NEXT_STAGE':
      return NEXT[state.phase] ? { ...state, phase: NEXT[state.phase]! } : state
    case 'SKIP':
      return NEXT[state.phase] ? { ...state, phase: 'next-ready' } : state
    case 'REPLAY':
      return state.outcome ? { ...state, phase: 'reviewing-path' } : state
    case 'TRY_NEXT':
      if (!state.outcome) return state
      return { ...state, phase: 'playing', maze: state.outcome.nextMaze, path: [state.outcome.nextMaze.start], startedAt: null, finishedAt: null, outcome: null, notice: null }
    case 'RESET':
      return createInitialState(action.maze, action.model, null)
  }
}
