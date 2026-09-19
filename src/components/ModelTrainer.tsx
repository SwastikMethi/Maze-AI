import { useEffect, useState } from 'react'
import type { HistoryPoint } from '../game/reducer'
import { FEATURE_KEYS } from '../game/getFeatures'
import { FEATURE_LABELS, LR, TARGET, sigmoid, type LearningUpdate } from '../ml/onlineModel'
import { LearningCurve } from './LearningCurve'

export const TRAIN_MS = 6200
export type Stage = 'predict' | 'compare' | 'learn'
/** Sub-stage boundaries: 2.0 s predict, 1.8 s compare, 2.4 s learn. */
const P1 = 0.32, P2 = 0.61

export function stageAt(t: number): Stage {
  return t < P1 ? 'predict' : t < P2 ? 'compare' : 'learn'
}
/** Local progress within each stage; earlier stages read as 1 once passed. */
const local = (t: number): Record<Stage, number> => ({
  predict: clamp(t / P1),
  compare: clamp((t - P1) / (P2 - P1)),
  learn: clamp((t - P2) / (1 - P2)),
})
const clamp = (v: number) => Math.min(1, Math.max(0, v))
const ease = (u: number) => 1 - (1 - u) * (1 - u)
const lerp = (a: number, b: number, u: number) => a + (b - a) * u

/** Single time-based clock. Render is a pure function of t, so Skip / StrictMode / hidden tabs are all safe. */
function useProgress(ms: number, run: boolean): number {
  const [t, setT] = useState(run ? 0 : 1)
  useEffect(() => {
    if (!run) return
    const start = performance.now()
    let id = 0
    const tick = (now: number) => {
      const next = clamp((now - start) / ms)
      setT(next)
      if (next < 1) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [ms, run])
  return t
}

type Props = { update: LearningUpdate; history: HistoryPoint[]; animate: boolean }

export function ModelTrainer({ update, history, animate }: Props) {
  const t = useProgress(TRAIN_MS, animate)
  const stage = stageAt(t)
  const u = local(t)
  const { x, weightsBefore: wb, weightsAfter: wa, biasBefore: bb, biasAfter: ba, actualEfficiency: y } = update

  const zBefore = bb + wb.reduce((s, w, i) => s + w * x[i], 0)
  const zAfter = ba + wa.reduce((s, w, i) => s + w * x[i], 0)
  const yhat = sigmoid(zBefore)
  const error = y - yhat

  // Live values: predict counts z up, learn lerps weights and slides z to its new value.
  const k = ease(u.learn)
  const zLive = stage === 'predict' ? zBefore * ease(u.predict) : lerp(zBefore, zAfter, k)
  const wLive = wb.map((w, i) => lerp(w, wa[i], k))
  const bLive = lerp(bb, ba, k)
  const showCompare = t >= P1
  const showLearn = t >= P2

  return (
    <div className="card trainer">
      <h3 className="card__title">
        Training your player model <span className={`badge badge--${update.confidence}`}>{update.confidence} confidence</span>
        <span className="trainer__stage">{STAGE_LABEL[stage]}</span>
      </h3>

      <div className="trainer__viz">
        <Graph x={x} w={wLive} b={bLive} z={zLive} />
        <Sigmoid z={zLive} actual={showCompare ? y : null} reveal={ease(u.compare)} />
      </div>

      <div className="eq">
        <EqRow label="Score" hint="baseline plus each maze feature times its weight">
          z = b + Σ wᵢ·xᵢ = <b>{fmt(zLive)}</b>
        </EqRow>
        <EqRow label="Guess" hint="squash the score into a 0–1 efficiency">
          ŷ = σ(z) = 1 / (1 + e⁻ᶻ) = <b>{fmt(sigmoid(zLive))}</b>
        </EqRow>
        <EqRow label="Compare" hint="actual minus guess; positive means you beat the prediction" dim={!showCompare}>
          error = y − ŷ = {fmt(y)} − {fmt(yhat)} = <b>{signed(error)}</b>
        </EqRow>
        <EqRow label="Learn" hint={`nudge each weight; ${LR} is the step size; bigger input, bigger nudge`} dim={!showLearn}>
          wᵢ ← wᵢ + {LR} · error · xᵢ
        </EqRow>
        <ul className={`eq__rows${showLearn ? '' : ' eq__rows--dim'}`}>
          {FEATURE_KEYS.map((key, i) => (
            <li key={key}>
              <span className="eq__feat">{FEATURE_LABELS[key]}</span>
              <span className="eq__x">x {fmt(x[i])}</span>
              <span className="eq__w">{signed(wb[i])} → <b>{signed(wLive[i])}</b></span>
            </li>
          ))}
          <li>
            <span className="eq__feat">bias</span>
            <span className="eq__x">x 1</span>
            <span className="eq__w">{signed(bb)} → <b>{signed(bLive)}</b></span>
          </li>
        </ul>
        <p className="muted eq__legend">negative weight = this feature slows you down</p>
      </div>

      <p className={`signal${showLearn ? '' : ' signal--dim'}`}>{update.signal}</p>
      <LearningCurve history={showCompare ? history : history.slice(0, -1)} highlightLast={showCompare} />
    </div>
  )
}

const STAGE_LABEL: Record<Stage, string> = { predict: '1 · predict', compare: '2 · compare', learn: '3 · learn' }
const fmt = (v: number) => v.toFixed(2)
const signed = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2)

function EqRow({ label, hint, dim, children }: { label: string; hint: string; dim?: boolean; children: React.ReactNode }) {
  return (
    <div className={`eq__row${dim ? ' eq__row--dim' : ''}`}>
      <span className="eq__label">{label}</span>
      <code className="eq__math">{children}</code>
      <span className="eq__hint">{hint}</span>
    </div>
  )
}

/* ---------- computation graph: inputs → weighted edges → Σ ---------- */
const IN_X = 140, IN_R = 14, SUM_X = 340, SUM_Y = 160, SUM_R = 22
/** Where each weight label sits along its edge (0 = input, 1 = Σ). Outer edges label nearer Σ so labels don't stack. */
const LABEL_T = [0.55, 0.42, 0.3, 0.42, 0.55, 0.42]
const IN_Y = [40, 88, 136, 184, 232, 280]

function Graph({ x, w, b, z }: { x: number[]; w: number[]; b: number; z: number }) {
  const inputs = [...FEATURE_KEYS.map((k, i) => ({ label: FEATURE_LABELS[k], x: x[i], w: w[i] })), { label: 'bias', x: 1, w: b }]
  return (
    <svg className="graph" viewBox="0 0 400 320" role="img" aria-label="model computation graph">
      {inputs.map((inp, i) => {
        const cy = IN_Y[i]
        const lx = IN_X + IN_R + LABEL_T[i] * (SUM_X - SUM_R - IN_X - IN_R)
        const ly = cy + LABEL_T[i] * (SUM_Y - cy)
        return (
          <g key={inp.label}>
            <line className="graph__edge" x1={IN_X + IN_R} y1={cy} x2={SUM_X - SUM_R} y2={SUM_Y} strokeWidth={1 + 2 * Math.abs(inp.w)} />
            <text className="graph__w" x={lx} y={ly} dy={-4} textAnchor="middle">{signed(inp.w)}</text>
            <circle className={`graph__in${inp.label === 'bias' ? ' graph__in--bias' : ''}`} cx={IN_X} cy={cy} r={IN_R} />
            <text className="graph__label" x={IN_X - IN_R - 8} y={cy} dy={4} textAnchor="end">
              {inp.label} <tspan className="graph__x">{inp.label === 'bias' ? '1' : fmt(inp.x)}</tspan>
            </text>
          </g>
        )
      })}
      <circle className="graph__sum" cx={SUM_X} cy={SUM_Y} r={SUM_R} />
      <text className="graph__sigma" x={SUM_X} y={SUM_Y} dy={7} textAnchor="middle">Σ</text>
      <text className="graph__z" x={SUM_X} y={SUM_Y + SUM_R + 18} textAnchor="middle">z = {fmt(z)}</text>
    </svg>
  )
}

/* ---------- sigmoid plot: z on x-axis, σ(z) on y-axis ---------- */
const PX0 = 30, PX1 = 290, PY0 = 200, PY1 = 20
const xOf = (z: number) => PX0 + ((z + 5) / 10) * (PX1 - PX0)
const yOf = (s: number) => PY0 - s * (PY0 - PY1)
const CURVE = Array.from({ length: 61 }, (_, i) => {
  const z = -5 + (i * 10) / 60
  return `${xOf(z).toFixed(1)},${yOf(sigmoid(z)).toFixed(1)}`
}).join(' ')

function Sigmoid({ z, actual, reveal }: { z: number; actual: number | null; reveal: number }) {
  const zc = Math.max(-5, Math.min(5, z))
  const s = sigmoid(zc)
  return (
    <svg className="sig" viewBox="0 0 300 240" role="img" aria-label="sigmoid curve">
      <line className="sig__axis" x1={PX0} y1={PY0} x2={PX1} y2={PY0} />
      <line className="sig__axis" x1={PX0} y1={PY0} x2={PX0} y2={PY1} />
      {[-5, 0, 5].map((v) => <text key={v} className="sig__tick" x={xOf(v)} y={PY0 + 16} textAnchor="middle">{v}</text>)}
      <text className="sig__tick" x={PX0 - 6} y={yOf(0) + 4} textAnchor="end">0</text>
      <text className="sig__tick" x={PX0 - 6} y={yOf(1) + 4} textAnchor="end">1</text>
      <text className="sig__tick" x={(PX0 + PX1) / 2} y={PY0 + 32} textAnchor="middle">score z</text>
      <line className="sig__target" x1={PX0} y1={yOf(TARGET)} x2={PX1} y2={yOf(TARGET)} />
      <text className="sig__tick" x={PX1} y={yOf(TARGET) + 12} textAnchor="end">target {TARGET}</text>
      <polyline className="sig__curve" points={CURVE} />
      {actual !== null && (
        <>
          <line className="sig__actual" x1={PX0} y1={yOf(actual)} x2={PX0 + (PX1 - PX0) * reveal} y2={yOf(actual)} />
          <text className="sig__actual-label" x={PX1} y={yOf(actual) - 5} textAnchor="end" opacity={reveal}>actual {fmt(actual)}</text>
          <line className="sig__error" x1={xOf(zc)} y1={yOf(s)} x2={xOf(zc)} y2={yOf(lerp(s, actual, reveal))} />
        </>
      )}
      <circle className="sig__dot" cx={xOf(zc)} cy={yOf(s)} r={6} />
      <text className="sig__dot-label" x={xOf(zc) - 10} y={yOf(s) + (Math.abs(s - TARGET) < 0.06 ? -8 : 4)} textAnchor="end">ŷ {fmt(s)}</text>
    </svg>
  )
}
