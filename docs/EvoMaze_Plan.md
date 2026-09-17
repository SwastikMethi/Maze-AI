# EvoMaze — Implementation Plan

## Context

`/Users/swastik.methi/Projects/Maze AI` holds only `EvoMaze_PRD.md` and `EvoMaze_TRD.md`. No code exists. The goal is a browser-only maze game where a small online-learning model updates after every completed maze and picks the next one from a scored candidate pool. Success = a player can see, in a sub-7-second post-level sequence, that their behaviour changed the next maze (PRD §9).

## Decisions

Confirmed with the user:
- **No Web Worker.** All post-level computation (analyse run → learn → generate 24 candidates → score → select) runs synchronously inside the reducer the moment the goal cell is entered, producing one immutable `LevelOutcome`. Every animation stage only reads from it. This is what guarantees Skip/Replay never trains twice. Measured cost: <1 ms for 30 candidates at 16×16.
- **CSS + SVG only.** No Framer Motion. Path replay via `stroke-dasharray`/`stroke-dashoffset`; screen changes via CSS. `prefers-reduced-motion` jumps straight to the final screen, which always shows all three cards statically.
- **Scaffold in this folder.** Vite root = `Maze AI/`. PRD and TRD move to `docs/`. `git init` here. npm.

Made during design (validated by simulation, flagged for review):
- **Model prior is not all-zeros.** TRD §9 says "neutral weights". All-zero weights make the first selections bias-only, so a strong player can be handed 6×6 mazes (fails PRD §9 criterion 5). Instead every feature weight starts at `W0 = −1.0` (neutral *across* features: "more of anything is harder") and the bias is set so the fixed first 8×8 maze predicts exactly the 0.70 target. Simulation: weak player stays 6×6, mid 6–10, strong 8–12, expert 10–16; one poor run (eff 0.3) on maze 1 selects 6×6 next. One constant to change if you disagree.
- **`Maze.open: number[]` bitmask instead of TRD's `Wall[]`.** One representation serves generation, BFS, movement checks and SVG rendering; `Wall[]` would need a second lookup structure. Noted as a deliberate deviation.
- **Pure reducer in `src/game/reducer.ts`** (one file beyond TRD §12) so the "skip doesn't retrain" rule is a unit test, not a manual check.

## Stack & layout

React 19 + TypeScript + Vite, Vitest, no other runtime deps.

```
Maze AI/
├── docs/EvoMaze_PRD.md, EvoMaze_TRD.md      (moved)
├── src/
│   ├── game/  types.ts rng.ts generateMaze.ts solveMaze.ts getFeatures.ts analyzeRun.ts reducer.ts
│   ├── ml/    onlineModel.ts selectCandidate.ts
│   ├── storage/localProgress.ts
│   ├── components/ MazeBoard.tsx ResultCard.tsx ModelUpdate.tsx CandidateGrid.tsx
│   ├── App.tsx  main.tsx  styles.css
│   └── **/*.test.ts (beside the module)
```

## A. Maze engine (`src/game/`)

**types.ts**
```ts
export type Point = { r: number; c: number };
export const N = 1, E = 2, S = 4, W = 8;            // open-side bits
export type Dir = 1 | 2 | 4 | 8;
export type MazeFeatures = { size: number; optimalPathLength: number; turnCount: number; junctionCount: number; deadEndCount: number };
export type Maze = { id: string; seed: number; rows: number; cols: number; straightness: number; braid: number;
                     start: Point; goal: Point; open: number[]; features: MazeFeatures };
export type RunResult = { mazeId: string; path: Point[]; moves: number; optimalMoves: number; timeMs: number;
                          wrongTurns: number; backtracks: number; efficiency: number };
```

**rng.ts** — `mulberry32(seed): () => number` (10 lines, stdlib-free, deterministic).

**generateMaze.ts** — `generateMaze(spec: {seed, side, straightness, braid}): Maze`
- Iterative recursive backtracker over `open = new Array(side*side).fill(0)`; carving sets bits on both cells.
- `straightness ∈ [0,1]`: probability of continuing the last direction when it is available → fewer turns, longer corridors.
- `braid ∈ [0,1]`: after carving, shuffle dead-end cells and open one extra wall on `round(braid × count)` of them → loops, fewer dead ends, more junctions. These two knobs are what make candidates "difficult in a different way".
- start `(0,0)`, goal `(side−1, side−1)`, `id = \`${side}-${seed}-${straightness}-${braid}\``.
- Calls `solveMaze` + `getFeatures` and stores `features`.

**solveMaze.ts** — `solveMaze(maze): Point[] | null` — BFS with parent array, path reconstruction. `null` if goal unreachable (generator always reaches it, but selection rejects on `null` anyway).

**getFeatures.ts** — `getFeatures(maze, optimalPath): MazeFeatures` and `normalize(f): number[]` (fixed order = `FEATURE_KEYS`).
- junction = cell with ≥3 open sides; dead end = exactly 1; turnCount = direction changes along the optimal path.
- **Fixed denominators** (from max observed at 16×16 across presets, ×1.1, so normalisation is stable across batches, not min-max per batch): `size 256, optimalPathLength 212, turnCount 123, junctionCount 44, deadEndCount 38`. Clamp to [0,1].

**Candidate space** — `CANDIDATE_SIDES = [6,8,10,12,14,16]` × `PRESETS = [[0,0],[0.7,0],[0,0.3],[0.7,0.3]]` (straightness, braid) = **24 candidates** per level. Seeds come from `mulberry32(levelSeed)` where `levelSeed = hash(previousMaze.seed, levelIndex)`, so the whole sequence is reproducible. First maze: `{ side: 8, seed: FIRST_SEED, straightness: 0.5, braid: 0 }`.

**analyzeRun.ts** — `analyzeRun(maze, path, optimalPath, timeMs): RunResult`
- A *move* = one successful step into an adjacent open cell; blocked input is not a move. `moves = path.length − 1`.
- `backtracks` = moves that land on an already-visited cell.
- `wrongTurns` = moves that leave the optimal-path set (from an on-path cell to an off-path cell).
- `efficiency = clamp(optimalMoves / moves, 0, 1)`.

## B. Model & selection (`src/ml/`)

**onlineModel.ts**
```ts
export type Weights = { w: number[]; b: number };       // w in FEATURE_KEYS order
export const LR = 1.5;                                   // ponytail: single learning-rate knob
export const W0 = -1.0;                                  // shared prior weight
export function initialWeights(): Weights;               // w = [W0×5], b = ln(0.7/0.3) − W0·Σnormalize(firstMaze.features)  (≈1.32)
export function predict(m: Weights, x: number[]): number;            // sigmoid(b + Σ w_i x_i)
export function learn(m: Weights, x: number[], actual: number): Weights;  // one SGD step, returns new object
export function sensitivity(w: number): number;          // 100·sigmoid(4·(W0 − w)) → 50 at prior; GAIN=4 is a display knob
export function confidenceFor(completed: number): 'low'|'medium'|'high';  // <3 low, <8 medium
export type LearningUpdate = { predictionBefore: number; actualEfficiency: number;
  weightsBefore: Record<string, number>; weightsAfter: Record<string, number>;
  changedFeatures: string[]; confidence: 'low'|'medium'|'high'; signal: string };
export function buildUpdate(before: Weights, after: Weights, x, actual, completed): LearningUpdate;
```
- `changedFeatures` = features whose `sensitivity` moved ≥ 0.5 percentage points.
- `signal` = feature with the largest |Δsensitivity|: Δ>0 → "junctions slowed you down", Δ<0 → "junctions didn't trouble you"; prefixed "Early signal:" while confidence is low, "Signal:" otherwise. Labels: size→"bigger grids", optimalPathLength→"long paths", turnCount→"turns", junctionCount→"junctions", deadEndCount→"dead ends".

**selectCandidate.ts**
```ts
export const TARGET = 0.70;
export type CandidateScore = { maze: Maze; predicted: number; fit: number; faded: boolean };
export function generateCandidates(levelSeed: number): Maze[];                 // 24, deterministic
export function selectCandidate(model: Weights, candidates: Maze[], previous: Maze):
  { scores: CandidateScore[]; selectedIndex: number; explanation: string };
```
- Reject: `solveMaze === null`, side outside 6..16, same side+seed as previous, or identical feature vector to previous.
- Selected = argmin `|predicted − 0.70|`, first index wins ties. `fit = round(100·(1 − |pred − 0.70|))`; `faded = |pred − 0.70| > 0.15`.
- Explanation: compare selected vs previous on junctionCount, deadEndCount, optimalPathLength, size; take the two largest relative changes >15% → "Selected for you: more junctions, fewer dead ends." Fallback: "Selected for you: a similar layout with a fresh route."

## C. State machine (`src/game/reducer.ts`)

```ts
type GamePhase = 'welcome'|'playing'|'reviewing-path'|'updating-model'|'selecting-maze'|'next-ready';
type LevelOutcome = { run: RunResult; optimalPath: Point[]; update: LearningUpdate;
                      scores: CandidateScore[]; selectedIndex: number; explanation: string; nextMaze: Maze };
type State = { phase: GamePhase; maze: Maze; path: Point[]; startedAt: number|null; levelIndex: number;
               model: Weights; completed: number; recentRuns: RunResult[]; outcome: LevelOutcome|null; notice: string|null };
type Action = {type:'START'} | {type:'MOVE'; dir: Dir; now: number} | {type:'NEXT_STAGE'} | {type:'SKIP'}
            | {type:'REPLAY'} | {type:'TRY_NEXT'} | {type:'RESET'};
```
- `MOVE`: blocked → return same state. Else append cell; set `startedAt` on first move. If the new cell is the goal → `completeLevel()` (analyse → learn → generateCandidates → select) → `{ phase:'reviewing-path', outcome, model: after, completed+1, recentRuns: last 10 }`. **This is the only place `learn` is called.**
- `NEXT_STAGE`: reviewing-path → updating-model → selecting-maze → next-ready. `SKIP` → next-ready. `REPLAY` → reviewing-path. Neither touches `model`/`outcome`.
- `TRY_NEXT`: phase playing, `maze = outcome.nextMaze`, `path=[start]`, `startedAt=null`, `outcome=null`, `levelIndex+1`.
- `RESET`: fresh state (caller does `confirm()` first).
- Reducer init uses a lazy initialiser that calls `loadProgress()`, so save-effects can never race the load.

**App.tsx wiring**
- `useReducer(reducer, undefined, init)`.
- Input: one `keydown` effect (arrows/WASD → `Dir`), pointer swipe on the board (`pointerdown`/`pointerup`, dominant axis ≥ 24 px, board has `touch-action: none`), and on-screen D-pad shown under `@media (pointer: coarse)`. All three dispatch `MOVE`.
- Timer: display `Date.now() − startedAt` via a 100 ms interval only while `phase==='playing' && startedAt`. Starts on first move.
- Stage progression: one `useEffect([phase])` → `setTimeout(() => dispatch(NEXT_STAGE), STAGE_MS[phase])`, cleared on cleanup (StrictMode-safe). Reduced motion → `STAGE_MS` all 0 and the reducer's `reviewing-path` entry is treated as `SKIP`.
- Persistence: `useEffect([model, completed, recentRuns, maze.seed])` → `saveProgress`.

## D. Persistence (`src/storage/localProgress.ts`)

```ts
const KEY = 'evomaze.v1';
type Saved = { version: 1; model: Weights; completed: number; recentRuns: RunResult[]; lastMaze: Maze };
export function saveProgress(s: Saved): void;
export function loadProgress(): Saved | null;   // null on missing, bad JSON, wrong version, or shape check failure
export function clearProgress(): void;
```
Shape check is a hand-written `isSaved()` (six field checks), no schema lib. On `null` with something present in storage → `notice: 'Saved progress was invalid and has been reset.'` shown once on the welcome screen. Reset progress button → `confirm()` → `clearProgress()` + `RESET`.

## E. Components (`src/components/`)

- **MazeBoard** — `<svg viewBox="0 0 cols rows">`; walls as one `<path>` built from closed sides (stroke `--navy`, `stroke-linecap: square`); goal `<rect>` (soft green, pulses 400 ms on arrival); player `<circle>` (coral). Optional `playerPath`/`optimalPath` as `<polyline>` with `pathLength="1"`, `stroke-dasharray="1"` and a `dashoffset 1→0` CSS animation whose duration comes from CSS vars (`--replay-ms`, `--optimal-ms`, `--optimal-delay`). `mini` prop for the candidate grid (no player, thinner stroke). Same component powers the welcome preview with a looping dash animation.
- **ResultCard** — four rows: Your moves / Optimal moves / Efficiency / Backtracks.
- **ModelUpdate** — only rows in `changedFeatures` ("No measurable change yet" if empty). Each row: label, `before% → after%`, a bar whose width transitions on mount (class flipped in a `useEffect`). Confidence badge + signal sentence.
- **CandidateGrid** — 24 mini boards, `animation-delay: calc(var(--i) * 40ms)` fade-in, `.faded { opacity: .3 }`, `.selected` gets a teal ring + slight scale; below: explanation + "Predicted challenge fit: N%" + **Try this maze**.
- **Learning ribbon** — a stage header with three labels (Your route · Model · Next maze) and a 3 px teal bar underneath whose `width` transitions to the active stage. CSS-only, connects the three stages visually.
- **Screens by phase**: welcome (title, tagline, Start, preview, Reset); playing (board + HUD: time/moves/level + D-pad); reviewing-path (board with replay + ResultCard); updating-model (ModelUpdate); selecting-maze (CandidateGrid); next-ready (all three cards compact + Try this maze — this is also what Skip and reduced-motion users see). Skip/Replay buttons visible in the three animated phases.
- **Colour tokens** (`styles.css` `:root`): `--bg #faf8f5`, `--navy #1f2a44`, `--slate #5b6577`, `--teal #159a8e`, `--coral #ff6f61`, `--green #7bc47f`, cards `border-radius 16px`, `box-shadow 0 4px 16px rgb(31 42 68 / .08)`.

## F. Timing (PRD §7)

| Phase | Contents | ms |
|---|---|---:|
| reviewing-path | goal pulse 400 → player replay 1400 → optimal reveal 1000 → hold 600 | 3400 |
| updating-model | bars animate | 1300 |
| selecting-maze | staggered reveal + fade + highlight | 1300 |
| → playing | CSS fade | 500 |
| **Total** | | **≈6.5 s** |

## G. Tests (Vitest, TRD §15 mapped one-to-one)

| TRD bullet | File · test |
|---|---|
| Mazes always solvable | `generateMaze.test.ts` · every side×preset×20 seeds → `solveMaze` non-null; same seed → identical `open` |
| Solver returns shortest | `solveMaze.test.ts` · hand-built 3×3 with two routes → returns the shorter, exact length |
| Efficiency correct | `analyzeRun.test.ts` · `optimal/actual`, clamp at 1; backtracks + wrongTurns on a hand path |
| Run changes weights | `onlineModel.test.ts` · `learn` returns different `w`/`b`; prediction moves toward `actual` |
| Deterministic prediction | `onlineModel.test.ts` · `predict(m,x)` equal across calls |
| Selection uses predictions | `selectCandidate.test.ts` · selected index equals independently computed argmin |
| Easier maze after poor run | `selectCandidate.test.ts` · `learn(first8x8, 0.3)` → selected `size ≤ 64` |
| Skip doesn't retrain | `reducer.test.ts` · MOVE into goal, then SKIP, REPLAY → `model` and `outcome` referentially unchanged |
| Progress survives refresh | `localProgress.test.ts` · stubbed `localStorage` save→load round-trip; bad JSON / wrong version → `null` |

## H. Build order (each step ends runnable)

1. **Scaffold** — `npm create vite@latest . -- --template react-ts`, add `vitest`, `npm test` script, `mkdir docs && mv *.md docs/`, copy this plan to `docs/EvoMaze_Plan.md`, `git init`, commit.
2. **game/** types, rng, generateMaze, solveMaze, getFeatures + tests → green.
3. **analyzeRun** + test.
4. **ml/** onlineModel, selectCandidate + tests (incl. easier-after-poor-run).
5. **reducer.ts** + test (the skip/replay guarantee).
6. **Playable shell** — App + MazeBoard + keyboard; phases jump straight to next-ready; verify a full loop in the browser (`npm run dev`).
7. **Post-level sequence** — ResultCard, ModelUpdate, CandidateGrid, stage timing, ribbon, Skip/Replay, reduced motion.
8. **Persistence** — localProgress + save effect + Reset + invalid-data notice + test.
9. **Touch & polish** — swipe, D-pad, welcome preview, styles; `npm run build` clean; commit.

**Bug hotspots to watch**
- StrictMode double-running the stage `setTimeout` → must clear on cleanup.
- Save effect before load → solved by lazy reducer init, keep it that way.
- Braiding runs *before* solve/features (a knocked-out wall can shorten the optimal path).
- Swipe vs. page scroll on mobile → `touch-action: none` on the board only.
- Key auto-repeat dispatching many MOVEs → fine, but each must be a real cell step.

## Verification

1. `npm test` — all 9 mapped tests green. `npm run build` — no TS errors.
2. `npm run dev`, play 3 mazes end-to-end; confirm post-level sequence < 7 s (count or record).
3. Deliberately wander on a maze → next maze is smaller/simpler and the explanation says so. Play the next one cleanly twice → the maze grows. (PRD §9 criterion 5.)
4. Skip mid-replay → next-ready card values identical to a non-skipped run of the same seed.
5. Refresh → level count, model card values and last maze persist. Reset progress → confirm dialog → back to level 1.
6. DevTools → emulate `prefers-reduced-motion: reduce` → after goal, static three-card screen appears immediately.
7. DevTools device mode → swipe and D-pad move the player; page doesn't scroll on swipe.
