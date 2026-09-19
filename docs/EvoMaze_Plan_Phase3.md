# EvoMaze — Phase 3: Harder mazes

## Context

The user finds the mazes too easy and correctly identified why: **the start is a corner with one exit**, so the opening moves are forced and the whole route is plannable at a glance. Measured on the current generator: the start cell has degree 1.0 in every tree preset, the first **10 to 23 moves are forced**, and the optimal route has only **1 to 8 real decision points** even at 16×16.

The user's progression expectation: **the maze should grow when the player does well, not when they are solving inefficiently.** They chose to keep pure model-driven selection (no hard gate). The simulation below shows the model alone already satisfies this on the new pool: in 48 simulated levels across four skill profiles, the maze never grew after a sub-target run.

Decisions confirmed with the user:
- Open start + more junctions.
- Braided long-way-round loops (wrong turns cost moves instead of dead-ending quickly).
- Bigger grids, ladder up to 24×24.
- Selection stays pure argmin-to-target. No gate.
- Fog of war: **not chosen**, left out.

The model-training visualization and the help panel are untouched except for feature ceilings and one count in the text.

## Prototype results (validated before planning)

Layering the changes below on the existing tree generator, averaged over 20 seeds each:

| side | loops | start exits | forced moves | decisions on route | junctions | ms / maze |
|---:|---:|---:|---:|---:|---:|---:|
| 8 | 0.04 | 2.4 | 0 | 4.4 | 10 | 0.09 |
| 12 | 0.08 | 3.0 | 0 | 7.8 | 30 | 0.28 |
| 16 | 0.08 | 3.0 | 0 | 13.0 | 55 | 0.62 |
| 24 | 0.08 | 3.6 | 0 | 18.9 | 123 | 2.12 |

Forced opening moves drop to zero everywhere; decision points roughly double versus today. A 32-candidate batch costs about 14 ms, still fine on the main thread.

Simulated 12-level runs with pure model selection: weak player stays 6–8, mid settles at 12, strong at 16, expert climbs to 20–24 and drops back after a bad run. Growth after a below-target efficiency: 0 of 48 levels.

## Design

### 1. Generator: `src/game/generateMaze.ts`

Replace the `braid` knob with a `loops` knob and add two post-passes after the tree carve. `MazeSpec` becomes `{ seed, side, straightness, loops }`.

**Long-way-round loops.** Knock out `round(loops × cells)` walls, but only where the two cells are already **≥ 8 steps apart** through the maze (BFS distance from one endpoint). Each knocked wall creates a loop whose two arms differ a lot in length, so a wrong turn at the junction it creates does not dead-end; it leads the long way round. Attempt budget = 12 × target so a dense maze cannot spin forever. Extract a `distancesFrom(maze, cellIndex): Int32Array` helper in `solveMaze.ts` and have `solveMaze` use it too.

**Open start.** Goal stays bottom-right. Start = among the **15 % of cells farthest from the goal** (BFS distance, so the route stays long), pick the one with the **most exits**; first-found wins ties. Result: start degree 2–4, zero forced moves. `Maze.start` already exists and `MazeBoard`, the reducer and `analyzeRun` all read it rather than assuming `(0,0)`, so nothing downstream changes.

`id` becomes `${side}-${seed}-${straightness}-${loops}`. Braiding code is deleted (loops subsume it).

### 2. Features: `src/game/getFeatures.ts`

Ceilings must cover 24×24 or normalisation clips. New `FEATURE_MAX` from prototype maxima × 1.1:

```
size 576, optimalPathLength 352, turnCount 224, junctionCount 152, deadEndCount 78
```

No new feature. A "decisions on route" feature was considered and rejected: junction count already tracks it closely and the explainer panel names five inputs.

### 3. Candidate pool: `src/ml/selectCandidate.ts`

- `CANDIDATE_SIDES = [6, 8, 10, 12, 14, 16, 20, 24]` (8 sizes).
- `PRESETS = [[0, 0.04], [0.6, 0.04], [0, 0.08], [0.6, 0.08]]` as `[straightness, loops]`. Every preset has loops, so every candidate has an open start and detour loops. **32 candidates per level.**
- Selection logic unchanged: argmin `|pred − TARGET|` with the existing repeat rejection.
- `explain` gains one more comparison key, `turnCount` ("a twistier route" / "a straighter route"), so the sentence can describe the loops presets.

### 4. Model prior: `src/ml/onlineModel.ts`

`initialWeights` derives the bias from the first maze's normalised features, so it adapts to the new ceilings automatically (prototype: bias 1.26, first prediction 0.70). `FIRST_MAZE` becomes `{ seed: 20260917, side: 8, straightness: 0.5, loops: 0.04 }` so the very first maze also has an open start.

### 5. Text and layout touch-ups

- `src/components/HowItWorks.tsx`: "24 candidate mazes" → "32".
- `src/components/CandidateGrid.tsx`: no logic change; 32 cells fill 4 rows of 8 at desktop, 6 columns on phones as today.
- `src/components/MazeBoard.tsx`: at 24×24 the fixed `stroke-width: 0.12` in maze units is fine (it scales with the viewBox). No change expected; verify visually.

### 6. Storage

Old saves hold a `lastMaze` with the previous feature ceilings and a `braid` field. Bump `KEY` to `evomaze.v2`; the loader's invalid-data path already resets cleanly and shows the notice. No migration code.

## Tests (Vitest)

| Test | File |
|---|---|
| Every side × preset × 20 seeds is solvable and deterministic | `generateMaze.test.ts` (update to new sides/presets) |
| Start cell has ≥ 2 exits for every generated maze | `generateMaze.test.ts` new |
| `loops > 0` yields more junctions than `loops = 0` on the same seed | `generateMaze.test.ts` (replaces the braid test) |
| Every opening added by the loops pass joins cells that were ≥ 8 apart before it was added | `generateMaze.test.ts` new, via a small exported `LOOP_MIN_DISTANCE` and re-running the pass with a recording callback, or by diffing `loops=0` vs `loops>0` `open` arrays and checking distance in the `loops=0` maze |
| 32 candidates, 8 distinct sizes; poor run still selects a smaller maze; strong run does not shrink | `selectCandidate.test.ts` |
| Existing reducer, model, storage tests keep passing (storage key bump covered by round-trip) | unchanged |

## Build order

1. `distancesFrom` in `solveMaze.ts`; `solveMaze` rewritten on top of it → tests green.
2. `generateMaze.ts`: loops pass, open-start pass, drop braid; `FIRST_MAZE`; tests.
3. `getFeatures.ts` ceilings.
4. `selectCandidate.ts`: sides, presets, `turnCount` in explain; tests.
5. Storage key bump; help-panel count.
6. `npm test`, `tsc -b`, `vite build`; browser check (below); commit.

## Verification

1. All tests green, build clean.
2. Play level 1: the player starts mid-maze with 2+ open directions, not in a corner.
3. Take a wrong turn at a junction: it loops back around rather than dead-ending within a few cells.
4. Finish efficiently → the pick is at least the current size. Wander badly → the pick is at most the current size. (Model-driven, verified by simulation; confirm once live.)
5. Reach a 20×20 or 24×24 and confirm the board renders crisply and the route replay completes within the stage time.
6. Old save present → reset notice on the welcome screen, no crash.

## Addendum: Python backend

During implementation the user asked for the backend to be Python. Decision: **FastAPI, stateless**. All game and ML logic moved to `server/evomaze/` (maze, analyze, model, select, rng) with the harder generator implemented there directly. The TypeScript `src/game/*` engine and `src/ml/*` were deleted; the React app keeps only the UI state machine, animation, and localStorage. The client sends its weights with each `POST /api/complete`; the server validates the route against the maze walls (trust boundary), recomputes features, learns once, generates and scores 32 candidates, and returns the whole `LevelOutcome` plus the new weights. Vite proxies `/api` in dev; uvicorn serves `dist/` in production.
