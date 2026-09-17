import type { RunResult } from '../game/types'

export function ResultCard({ run }: { run: RunResult }) {
  const rows: [string, string][] = [
    ['Your moves', String(run.moves)],
    ['Optimal moves', String(run.optimalMoves)],
    ['Efficiency', `${Math.round(run.efficiency * 100)}%`],
    ['Backtracks', String(run.backtracks)],
  ]
  return (
    <div className="card">
      <h3 className="card__title">Your attempt</h3>
      <dl className="stats">
        {rows.map(([k, v]) => (
          <div key={k} className="stats__row"><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className="legend"><span className="swatch swatch--coral" /> your route <span className="swatch swatch--teal" /> shortest route</p>
    </div>
  )
}
