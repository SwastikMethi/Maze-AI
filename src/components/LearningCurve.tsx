import type { HistoryPoint } from '../game/reducer'
import { TARGET } from '../ml/onlineModel'

const W = 320, H = 140, L = 28, R = 8, T = 10, B = 22

export function LearningCurve({ history, highlightLast }: { history: HistoryPoint[]; highlightLast: boolean }) {
  const n = history.length
  const xOf = (i: number) => (n <= 1 ? (L + W - R) / 2 : L + ((W - R - L) * i) / (n - 1))
  const yOf = (v: number) => T + (H - T - B) * (1 - v)
  const line = (key: keyof HistoryPoint) => history.map((p, i) => `${xOf(i)},${yOf(p[key])}`).join(' ')

  return (
    <div className="curve">
      <p className="curve__title">Predicted vs actual, level by level</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="learning curve">
        <line className="curve__axis" x1={L} y1={yOf(0)} x2={W - R} y2={yOf(0)} />
        <line className="curve__axis" x1={L} y1={yOf(0)} x2={L} y2={yOf(1)} />
        <text className="curve__tick" x={L - 4} y={yOf(1) + 4} textAnchor="end">1</text>
        <text className="curve__tick" x={L - 4} y={yOf(0) + 4} textAnchor="end">0</text>
        <line className="curve__target" x1={L} y1={yOf(TARGET)} x2={W - R} y2={yOf(TARGET)} />
        <text className="curve__tick" x={W - R} y={yOf(TARGET) - 4} textAnchor="end">target {TARGET}</text>
        {n > 1 && <polyline className="curve__line curve__line--pred" points={line('predicted')} />}
        {n > 1 && <polyline className="curve__line curve__line--actual" points={line('actual')} />}
        {history.map((p, i) => {
          const last = highlightLast && i === n - 1
          return (
            <g key={i}>
              <circle className={`curve__dot curve__dot--pred${last ? ' curve__dot--last' : ''}`} cx={xOf(i)} cy={yOf(p.predicted)} r={last ? 5 : 3.5} />
              <circle className={`curve__dot curve__dot--actual${last ? ' curve__dot--last' : ''}`} cx={xOf(i)} cy={yOf(p.actual)} r={last ? 5 : 3.5} />
              <text className="curve__tick" x={xOf(i)} y={H - 6} textAnchor="middle">{i + 1}</text>
            </g>
          )
        })}
      </svg>
      <p className="legend">
        <span className="swatch swatch--teal swatch--hollow" /> predicted <span className="swatch swatch--coral" /> actual
        {n < 2 && <span className="muted"> · more levels will draw the curve</span>}
      </p>
    </div>
  )
}
