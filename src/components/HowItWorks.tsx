import { useEffect, useRef } from 'react'
import { FEATURE_KEYS } from '../game/getFeatures'
import { FEATURE_LABELS, LR, TARGET, W0, sigmoid, type LearningUpdate } from '../ml/onlineModel'

type Props = { open: boolean; onClose: () => void; update: LearningUpdate | null }

/** Side panel explaining the model. Native <dialog>: Esc closes, focus is trapped, backdrop is free. */
export function HowItWorks({ open, onClose, update }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="help" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="help-title">
      <div className="help__body">
        <header className="help__head">
          <h2 id="help-title">How the model learns</h2>
          <button className="btn btn--ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <p className="help__lead">
          The game keeps a tiny model of you: <b>six numbers</b>. Five are weights, one per maze feature, and one is a bias, a baseline.
          That is the entire model. It never sees your route. It only sees the maze's features and how efficiently you finished.
        </p>

        <h3>The five inputs</h3>
        <p>Every maze is boiled down to five numbers between 0 and 1. 0 means as little as mazes here ever have, 1 means as much.</p>
        <ul className="help__list">
          <li><b>bigger grids</b> how many cells</li>
          <li><b>long paths</b> how long the shortest route is</li>
          <li><b>turns</b> corners along the shortest route</li>
          <li><b>junctions</b> cells with three or more openings, where a wrong choice is possible</li>
          <li><b>dead ends</b> corridors that go nowhere</li>
        </ul>

        <h3>Step 1 · Predict</h3>
        <p>
          Each weight says how much its feature is expected to hurt you (negative) or help you (positive). Multiply every input by its weight,
          add them all up plus the bias, and you get the <b>score z</b>. A score can be any number, but efficiency lives between 0 and 1, so the
          <b> sigmoid</b> curve squashes it: a large positive score lands near 1, a large negative one near 0, and zero lands at exactly 0.5.
          The squashed value <b>ŷ</b> is the model's guess at your efficiency on this maze.
        </p>
        <p className="help__eq">z = b + Σ wᵢ·xᵢ &nbsp;&nbsp; ŷ = 1 / (1 + e⁻ᶻ)</p>

        <h3>Step 2 · Compare</h3>
        <p>
          <b>y</b> is what actually happened: optimal moves divided by your moves. The <b>error</b> is y minus ŷ. Positive means you did
          better than the guess, negative means worse. This single number is all the feedback the model ever gets.
        </p>
        <p className="help__eq">error = y − ŷ</p>

        <h3>Step 3 · Learn</h3>
        <p>Every weight moves by <b>{LR} × error × its input</b>. Three things follow from that rule.</p>
        <ul className="help__list">
          <li><b>Direction</b> comes from the sign of the error. Beat the guess and every weight rises, so the model expects more of you next time. Fall short and they all drop.</li>
          <li><b>Size</b> scales with the input. A feature this maze had a lot of gets the biggest correction. The model blames what was actually present.</li>
          <li><b>{LR}</b> is the learning rate. Bigger means faster but jumpier learning. The bias moves by {LR} × error, as if its input were always 1.</li>
        </ul>
        <p className="help__eq">wᵢ ← wᵢ + {LR} · error · xᵢ &nbsp;&nbsp; b ← b + {LR} · error</p>
        <p>
          That rule is <b>gradient descent on logistic regression</b>, the same maths behind many real-world classifiers, applied one example
          at a time. Learning from each example as it arrives is called <b>online learning</b>.
        </p>

        <h3>Why the weights start negative</h3>
        <p>
          Every weight starts at {W0.toFixed(1)}: "more of anything makes a maze harder". Over the levels they separate. A feature that never
          troubles you drifts toward zero or above. One that consistently does becomes more negative. Thicker lines in the diagram mean
          weights further from zero, so a feature the model feels strongly about.
        </p>

        <h3>How the next maze is chosen</h3>
        <p>
          After learning, the game builds 24 candidate mazes of different sizes and styles, runs each one through the updated model to predict
          your efficiency, and picks the candidate closest to <b>{TARGET}</b>: hard enough to be interesting, easy enough to finish.
          There is no "you won, so harder" rule anywhere. If you struggled, small mazes now predict near {TARGET}. If you cruised, big ones do.
          Faded candidates are the ones predicted far from the target.
        </p>

        <h3>Confidence</h3>
        <p>Just how many levels the model has seen. Fewer than 3 is low, fewer than 8 is medium. Early on, one level can swing the weights a lot.</p>

        <h3>Symbols</h3>
        <dl className="help__glossary">
          <dt>xᵢ</dt><dd>an input: one maze feature, scaled 0 to 1</dd>
          <dt>wᵢ</dt><dd>the weight for that feature</dd>
          <dt>b</dt><dd>the bias, a baseline added to every score</dd>
          <dt>z</dt><dd>the score: weighted sum of inputs plus bias</dd>
          <dt>σ</dt><dd>the sigmoid, squashes any number into 0 to 1</dd>
          <dt>ŷ</dt><dd>the guess: predicted efficiency</dd>
          <dt>y</dt><dd>the truth: your actual efficiency</dd>
          <dt>error</dt><dd>y − ŷ</dd>
          <dt>{LR}</dt><dd>the learning rate, or step size</dd>
        </dl>

        <h3>This level in numbers</h3>
        {update ? <ThisLevel update={update} /> : <p className="muted">Finish a maze and this section fills in with your own numbers.</p>}
      </div>
    </dialog>
  )
}

function ThisLevel({ update }: { update: LearningUpdate }) {
  const { x, weightsBefore: wb, weightsAfter: wa, biasBefore: bb, actualEfficiency: y } = update
  const z = bb + wb.reduce((s, w, i) => s + w * x[i], 0)
  const yhat = sigmoid(z)
  const error = y - yhat
  const top = x.indexOf(Math.max(...x))
  const f = (v: number) => v.toFixed(2)
  return (
    <ol className="help__steps">
      <li>Inputs: {FEATURE_KEYS.map((k, i) => `${FEATURE_LABELS[k]} ${f(x[i])}`).join(', ')}.</li>
      <li>Score: {f(bb)} (bias) {wb.map((w, i) => ` + (${f(w)} × ${f(x[i])})`).join('')} = <b>{f(z)}</b>.</li>
      <li>Guess: squash {f(z)} through the sigmoid → <b>ŷ = {f(yhat)}</b>.</li>
      <li>Truth: you scored <b>y = {f(y)}</b>, so error = {f(y)} − {f(yhat)} = <b>{error >= 0 ? '+' : '−'}{f(Math.abs(error))}</b>.</li>
      <li>
        Learn: the largest input was <b>{FEATURE_LABELS[FEATURE_KEYS[top]]}</b> at {f(x[top])}, so its weight moved most: {f(wb[top])} + {LR} × {error >= 0 ? '' : '(−'}{f(Math.abs(error))}{error >= 0 ? '' : ')'} × {f(x[top])} = <b>{f(wa[top])}</b>.
      </li>
    </ol>
  )
}
