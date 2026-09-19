import { useEffect, useReducer, useRef, useState } from 'react'
import { MazeBoard } from './components/MazeBoard'
import { ResultCard } from './components/ResultCard'
import { ModelTrainer, TRAIN_MS } from './components/ModelTrainer'
import { CandidateGrid } from './components/CandidateGrid'
import { HowItWorks } from './components/HowItWorks'
import { createInitialState, reducer, type GamePhase } from './game/reducer'
import { fetchFirst, postComplete } from './api/client'
import { N, E, S, W, type Dir, type FirstResponse } from './api/types'
import { clearProgress, loadProgress, saveProgress } from './storage/localProgress'

const KEYS: Record<string, Dir> = {
  ArrowUp: N, w: N, W: N, ArrowRight: E, d: E, D: E, ArrowDown: S, s: S, S: S, ArrowLeft: W, a: W, A: W,
}
/** Replay 2.6 s + model training 6.2 s + selection 1.3 s ≈ 10 s before "Try this maze". The training stage is the point of the app. */
const STAGE_MS: Partial<Record<GamePhase, number>> = { 'reviewing-path': 2600, 'updating-model': TRAIN_MS, 'selecting-maze': 1300 }
const STAGES: [GamePhase, string][] = [['reviewing-path', 'Your route'], ['updating-model', 'Model'], ['selecting-maze', 'Next maze']]
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export default function App() {
  const [first, setFirst] = useState<FirstResponse | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  useEffect(() => {
    fetchFirst().then(setFirst, (e: Error) => setBootError(e.message))
  }, [])
  if (bootError) return <main className="app"><p className="notice">Could not reach the EvoMaze server: {bootError}</p></main>
  if (!first) return <main className="app"><p className="muted centered">Loading…</p></main>
  return <Game first={first} />
}

function Game({ first }: { first: FirstResponse }) {
  const [state, dispatch] = useReducer(reducer, first, (f) => {
    const { saved, invalid } = loadProgress()
    return createInitialState(f.maze, f.model, saved, invalid ? 'Saved progress was invalid and has been reset.' : null)
  })
  const { phase, maze, path, outcome } = state
  const [now, setNow] = useState(0)
  const [help, setHelp] = useState(false)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const move = (dir: Dir) => dispatch({ type: 'MOVE', dir, now: Date.now() })

  // Keyboard (paused while the help panel is open)
  useEffect(() => {
    if (phase !== 'playing' || help) return
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key]
      if (dir) { e.preventDefault(); move(dir) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [phase, help])

  // Timer display
  useEffect(() => {
    if (phase !== 'playing' || state.startedAt === null) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [phase, state.startedAt])

  // Goal reached: send the run to the server once. The reducer ignores a reply unless it is still waiting.
  useEffect(() => {
    if (phase !== 'scoring') return
    let cancelled = false
    postComplete({ maze, path, timeMs: (state.finishedAt ?? 0) - (state.startedAt ?? 0), model: state.model, completed: state.completed }).then(
      (result) => { if (!cancelled) dispatch({ type: 'SCORED', result }) },
      (e: Error) => { if (!cancelled) dispatch({ type: 'SCORE_FAILED', message: `Scoring failed (${e.message}). Your model was kept; try the maze again.` }) },
    )
    return () => { cancelled = true }
  }, [phase])

  // Stage progression (StrictMode-safe: timeout cleared on cleanup). Reduced motion skips straight to the summary.
  useEffect(() => {
    const ms = STAGE_MS[phase]
    if (ms === undefined) return
    if (reducedMotion()) { dispatch({ type: 'SKIP' }); return }
    const id = setTimeout(() => dispatch({ type: 'NEXT_STAGE' }), ms)
    return () => clearTimeout(id)
  }, [phase])

  // Persistence
  useEffect(() => {
    saveProgress({ model: state.model, completed: state.completed, recentRuns: state.recentRuns, lastMaze: maze, history: state.history })
  }, [state.model, state.completed, state.recentRuns, state.history, maze])

  const onPointerDown = (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!swipe.current) return
    const dx = e.clientX - swipe.current.x, dy = e.clientY - swipe.current.y
    swipe.current = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? E : W) : dy > 0 ? S : N)
  }
  const reset = () => {
    if (confirm('Reset all progress? The model forgets everything it learned.')) { clearProgress(); dispatch({ type: 'RESET', maze: first.maze, model: first.model }) }
  }

  const elapsed = state.startedAt ? Math.max(0, (phase === 'playing' ? now : state.finishedAt ?? now) - state.startedAt) : 0
  const animating = STAGE_MS[phase] !== undefined
  const stageIndex = STAGES.findIndex(([p]) => p === phase)

  return (
    <main className={`app app--${phase}`}>
      <div className="topbar">
        <button className="btn btn--ghost help-btn" onClick={() => setHelp(true)}>? How the model learns</button>
      </div>
      <HowItWorks open={help} onClose={() => setHelp(false)} update={outcome?.update ?? null} />

      {phase === 'welcome' && (
        <section className="welcome">
          <h1>EvoMaze</h1>
          <p className="tagline">Solve a maze. The game will learn how you play.</p>
          <MazeBoard maze={first.preview.maze} playerPath={first.preview.path} className="preview" />
          <button className="btn btn--primary btn--big" onClick={() => dispatch({ type: 'START' })}>
            {state.completed ? `Continue · level ${state.completed + 1}` : 'Start'}
          </button>
          {state.notice && <p className="notice">{state.notice}</p>}
          {state.completed > 0 && <button className="btn btn--ghost" onClick={reset}>Reset progress</button>}
        </section>
      )}

      {(phase === 'playing' || phase === 'scoring') && (
        <section className="play">
          <div className="hud">
            <span><b>{(elapsed / 1000).toFixed(1)}</b>s</span>
            <span><b>{path.length - 1}</b> moves</span>
            <span>level <b>{state.completed + 1}</b></span>
          </div>
          {state.notice && <p className="notice centered">{state.notice}</p>}
          <div className="board-wrap" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
            <MazeBoard maze={maze} player={path[path.length - 1]} celebrate={phase === 'scoring'} />
          </div>
          {phase === 'scoring' ? (
            <p className="muted centered">Scoring your run…</p>
          ) : (
            <div className="dpad" aria-label="move">
              <button onClick={() => move(N)} aria-label="up">↑</button>
              <button onClick={() => move(W)} aria-label="left">←</button>
              <button onClick={() => move(S)} aria-label="down">↓</button>
              <button onClick={() => move(E)} aria-label="right">→</button>
            </div>
          )}
        </section>
      )}

      {outcome && phase !== 'playing' && phase !== 'scoring' && phase !== 'welcome' && (
        <section className="review">
          <div className="ribbon" style={{ '--stage': stageIndex < 0 ? STAGES.length : stageIndex + 1 } as React.CSSProperties}>
            {STAGES.map(([p, label]) => <span key={p} className={p === phase || stageIndex < 0 ? 'ribbon__on' : ''}>{label}</span>)}
          </div>

          {(phase === 'reviewing-path' || phase === 'next-ready') && (
            <div className="two-col">
              <div className="board-wrap">
                <MazeBoard
                  key={phase}
                  maze={maze}
                  player={maze.goal}
                  playerPath={outcome.run.path}
                  optimalPath={outcome.optimalPath}
                  celebrate={phase === 'reviewing-path'}
                  className={phase === 'reviewing-path' ? 'board--replay' : 'board--static'}
                />
              </div>
              <ResultCard run={outcome.run} />
            </div>
          )}
          {(phase === 'updating-model' || phase === 'next-ready') && (
            <ModelTrainer key={phase} update={outcome.update} history={state.history} animate={phase === 'updating-model'} />
          )}
          {(phase === 'selecting-maze' || phase === 'next-ready') && (
            <CandidateGrid
              scores={outcome.scores}
              selectedIndex={outcome.selectedIndex}
              explanation={outcome.explanation}
              animate={phase === 'selecting-maze'}
              onTry={() => dispatch({ type: 'TRY_NEXT' })}
            />
          )}

          <div className="controls">
            {animating && <button className="btn btn--ghost" onClick={() => dispatch({ type: 'SKIP' })}>Skip</button>}
            {phase !== 'reviewing-path' && <button className="btn btn--ghost" onClick={() => dispatch({ type: 'REPLAY' })}>Replay</button>}
            <button className="btn btn--ghost" onClick={reset}>Reset progress</button>
          </div>
        </section>
      )}
    </main>
  )
}
