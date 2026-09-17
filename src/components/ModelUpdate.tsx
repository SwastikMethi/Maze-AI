import { useEffect, useState } from 'react'
import { FEATURE_LABELS, sensitivity, type LearningUpdate } from '../ml/onlineModel'

export function ModelUpdate({ update, animate }: { update: LearningUpdate; animate: boolean }) {
  const [settled, setSettled] = useState(!animate)
  useEffect(() => {
    if (!animate) return
    setSettled(false)
    const id = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(id)
  }, [animate, update])

  return (
    <div className="card">
      <h3 className="card__title">
        Updating your player model <span className={`badge badge--${update.confidence}`}>{update.confidence} confidence</span>
      </h3>
      {update.changedFeatures.length === 0 ? (
        <p className="muted">No measurable change yet.</p>
      ) : (
        <ul className="weights">
          {update.changedFeatures.map((k) => {
            const before = sensitivity(update.weightsBefore[k])
            const after = sensitivity(update.weightsAfter[k])
            return (
              <li key={k} className="weights__row">
                <span className="weights__label">{cap(FEATURE_LABELS[k])} sensitivity</span>
                <span className="weights__nums">{before.toFixed(0)}% → <strong>{after.toFixed(0)}%</strong></span>
                <span className="bar"><span className="bar__fill" style={{ width: `${settled ? after : before}%` }} /></span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="signal">{update.signal}</p>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
