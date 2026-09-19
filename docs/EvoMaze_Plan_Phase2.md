# EvoMaze — Phase 2: Make the model training the star

## Context

Phase 1 shipped a working loop (two commits on `main`). The user has reframed the product: **the point of the project is to show how a logistic model learns; the maze is only the vehicle.** The current model card (five percentage bars using an invented "sensitivity" transform) hides the actual mechanics. It must become an animated, honest walkthrough of one gradient step, with the raw equations and live numbers always visible, plus a cross-level chart showing predictions converging on reality.

Decisions confirmed with the user:
- Computation-graph diagram **and** a learning-curve history chart.
- Equations with live numbers **always visible** (no toggle).
- Model stage may take **~6 s** and auto-advance. Skip still jumps to the summary.
- **Difficulty is deferred.** No changes to candidate sizes, target, or maze visibility in this phase.

Design decisions made after review (adopted from the plan-review pass):
- **One reducer phase, one clock.** Keep `updating-model` as a single phase (6200 ms). Sub-stages *predict → compare → learn* are derived from a single `t ∈ [0,1]` by a pure `stageAt(t)`. No new reducer phases, no reducer test churn, the Skip guarantee is untouched.
- **Two SVGs, not one.** A 720-wide SVG scaled to a phone is unreadable. Computation graph (`viewBox 0 0 380 320`) and sigmoid plot (`viewBox 0 0 300 240`) sit side by side ≥ 640 px and stack below, reusing the existing `.two-col` pattern. Equations are HTML underneath.
- **Show raw weights.** Delete `sensitivity`, `GAIN`, `changedFeatures`. Edge thickness = `1 + 2·|w|`, weight value labelled on the edge. No colour-by-sign (weights start at −1 and rarely flip).
- **Render is a pure function of `(stage, t)`.** Each stage assumes prior stages are at `t = 1`. Skip, background tabs, and StrictMode all just work. Remount per phase with `key={phase}` to avoid first-frame flash.

## Files

| File | Change |
|---|---|
| `src/ml/onlineModel.ts` | `LearningUpdate` becomes `{ x, weightsBefore, weightsAfter, biasBefore, biasAfter, actualEfficiency, confidence, signal }` with weights as `number[]` in `FEATURE_KEYS` order. Delete `sensitivity`, `GAIN`. New `signal` wording (below). Everything else unchanged. |
| `src/ml/onlineModel.test.ts` | Drop the sensitivity test; update the `buildUpdate` test to assert on `x.length === 5`, bias before ≠ after, and the new signal shape. |
| `src/game/reducer.ts` | `State.history: { predicted: number; actual: number }[]` (cap 20). `completeLevel` appends `{ predicted: predictionBefore, actual }`. `createInitialState` reads `saved?.history ?? []`. |
| `src/game/reducer.test.ts` | One assertion added: after goal, `history.length === 1` and `history[0].actual === 1`. |
| `src/storage/localProgress.ts` | `Saved.history?: {predicted:number; actual:number}[]`. `isSaved` unchanged (optional field). `saveProgress` receives it. |
| `src/components/ModelTrainer.tsx` | **New.** Replaces `ModelUpdate.tsx` (delete it). Owns the rAF clock, the two SVGs, and the equations block. |
| `src/components/LearningCurve.tsx` | **New.** Small SVG line chart of `history`. |
| `src/App.tsx` | Swap `ModelUpdate` → `ModelTrainer` (pass `history` and `animate`). `STAGE_MS['updating-model'] = 6200`, shorten `reviewing-path` to 2600. Replace hard-coded `animating` with `STAGE_MS[phase] !== undefined`. Add `history` to the save effect. Fix the stage-budget comment. |
| `src/styles.css` | Styles for `.trainer`, `.graph`, `.eq`, `.curve`; a `.two-col`-style grid for the two SVGs. |
| `docs/EvoMaze_Plan.md` | Append this phase. |

## ModelTrainer

**Props:** `{ update: LearningUpdate; history: {predicted; actual}[]; animate: boolean }`

**Clock:** `useProgress(ms, run)` → `t`. `useState(run ? 0 : 1)`; effect captures `performance.now()` at start, `t = clamp((now − start)/ms)`, rAF loop, cancel on cleanup. `animate=false` (next-ready or reduced motion) renders `t = 1` statically.

**Sub-stages** (from `t`, boundaries 0.32 / 0.61 match 2.0 s / 1.8 s / 2.4 s):

| Stage | What moves | Local `u ∈ [0,1]` |
|---|---|---|
| predict | `z` counts up from 0 to `zBefore`; prediction dot slides along the sigmoid to `(zBefore, ŷ)`; "Score" and "Guess" lines fill in | `t / 0.32` |
| compare | dashed "actual" line draws across the plot; "Compare" line appears with the signed error; the new `(predicted, actual)` point appears on the learning curve | `(t − 0.32) / 0.29` |
| learn | edge widths and weight labels lerp before → after; bias label lerps; dot slides to `(zAfter, σ(zAfter))`; five "Learn" rows appear | `(t − 0.61) / 0.39` |

**Computation graph SVG (`0 0 380 320`):**
```
inputs: 5 features + bias, cx=118 r=14, cy = 40, 88, 136, 184, 232, 280 (bias last, x=1)
  label text-anchor=end x=96: "dead ends  0.83"
sum node: cx=330 cy=160 r=22 "Σ"; z value text at (330, 200)
edges: (132, cy_i) → (308, 160); stroke-width = 1 + 2·|w|
weight label: 35% along edge, x=194, y = cy_i + 0.35·(160 − cy_i), 11px, dy=-4
```

**Sigmoid SVG (`0 0 300 240`):** plot box x∈[30,290], y∈[20,200]; `xOf(z) = 30 + (z+5)·26`, `yOf(s) = 200 − 180·s`. Curve as one `<path>` sampled at 60 points. Axis ticks −5 / 0 / 5 and 0 / 1. Prediction dot r=6 coral; dashed teal "actual" horizontal line; a thin vertical error bracket between them during compare. Dashed grey target line at 0.70 (ties the plot to the selector).

**Equations block (HTML, always visible, live numbers):**
```
Score     z = b + Σ wᵢ·xᵢ = 0.85          baseline plus each maze feature times its weight
Guess     ŷ = σ(z) = 1 / (1 + e⁻ᶻ) = 0.70  squash the score into a 0–1 efficiency
Compare   error = y − ŷ = 0.82 − 0.70 = +0.12   actual minus guess; positive means you beat the prediction
Learn     wᵢ ← wᵢ + 1.5 · error · xᵢ         nudge each weight; 1.5 is the step size; bigger input, bigger nudge
          size        x 0.25   −1.00 → −0.96
          long paths  x 0.07   −1.00 → −0.99
          … (5 rows) …
          bias        x 1      +1.32 → +1.50
```
Legend line: "negative weight = this feature slows you down". Below 640 px, hide the per-row factor column; the header states the rule once.

**Signal sentence** (in `buildUpdate`, bias excluded from the argmax):
- error > 0: `You beat the prediction, so every feature now looks a little less costly. <Feature> moved most because this maze had the most of it.`
- error < 0: `You fell short of the prediction, so every feature now looks a little more costly. <Feature> moved most because this maze had the most of it.`
- |error| < 0.02: `Prediction was almost exact, so the weights barely moved.`
Prefix stays "Early signal:" while confidence is low.

## LearningCurve

`{ history: {predicted; actual}[]; highlightLast: boolean }`. SVG `0 0 320 140`. x = level index, y = 0..1. Two polylines: predicted (hollow teal circles), actual (filled coral). Dashed target line at 0.70. Title "Predicted vs actual, level by level". With fewer than 2 points, show the single pair as two dots plus "More levels will draw the curve." Rendered inside `ModelTrainer` under the equations, so it appears in both `updating-model` and `next-ready`.

## Timing

| Phase | ms |
|---|---:|
| reviewing-path | 2600 |
| updating-model | 6200 |
| selecting-maze | 1300 |
| **Total before "Try this maze"** | **≈10 s** |

The user accepted the longer budget; the PRD's 7 s cap is superseded. Update the comment in `App.tsx`.

## Tests

- `onlineModel.test.ts`: `buildUpdate` returns `x` of length 5, `biasAfter !== biasBefore`, signal matches `/^Early signal: You (beat|fell short of) the prediction/` for actual 1.0 and 0.3 respectively.
- `reducer.test.ts`: history grows by one per completion and Skip/Replay leave it unchanged (add to the existing referential-equality loop).
- `localProgress.test.ts`: round-trip includes `history`; a saved blob **without** `history` still loads (backward compatibility with existing users).
- Pure helper `stageAt(t)` exported from `ModelTrainer.tsx` gets a 3-line test: boundaries map to predict / compare / learn.

## Build order

1. `onlineModel.ts` + test → green.
2. `reducer.ts` history + `localProgress.ts` + tests → green.
3. `LearningCurve.tsx` (small, standalone).
4. `ModelTrainer.tsx` static render at `t = 1` first; wire into `App.tsx`; check in browser at desktop and 375 px.
5. Add the clock and per-stage lerps; verify predict → compare → learn reads clearly at 6.2 s; verify Skip mid-animation and reduced motion show the `t = 1` state.
6. Styles pass; `npm test`, `tsc -b`, `vite build`; commit.

## Verification

1. `npm test` green, `npm run build` clean.
2. Play level 1 perfectly: watch z count up, dot land at 0.70, actual line at 1.00, error +0.30, all weights rise, dot slide up. Equations show matching numbers to two decimals.
3. Wander badly on level 2: error negative, weights fall, sentence says "fell short".
4. Learning curve shows two points after level 2, both series, target line.
5. Skip during predict → summary shows `t = 1` values identical to a full run. Replay re-animates.
6. 375 px viewport: graph and plot stack, all text ≥ 11 px equivalent, no horizontal scroll.
7. Reduced motion: static `t = 1` render, no rAF.
8. Refresh mid-session: history persists; clearing `history` from the stored JSON still loads.
