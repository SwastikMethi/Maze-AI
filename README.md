# EvoMaze

A maze that learns how you play. After every completed maze a small logistic-regression model takes one gradient step on your result, and the game shows that step happening: inputs, weighted sum, sigmoid, error, weight updates. The updated model then scores 32 candidate mazes and picks the one predicted to sit closest to a 70 % efficiency target.

The maze is the vehicle. The model walkthrough is the point.

## Layout

```
server/            Python (FastAPI). All game + ML logic lives here.
  evomaze/         rng, maze generation/solving/features, run analysis, model, candidate selection
  main.py          two endpoints: GET /api/first, POST /api/complete
  tests/           pytest
src/               React + TypeScript + Vite. Thin client: input, animation, localStorage.
  api/             wire types and fetch client
  game/reducer.ts  UI state machine (welcome → playing → scoring → review stages → next-ready)
  components/      MazeBoard, ResultCard, ModelTrainer, LearningCurve, CandidateGrid, HowItWorks
docs/              PRD, TRD, phase plans
```

The server is stateless. The browser keeps the model weights and history in `localStorage` and sends the weights with every completed run. No database, no accounts.

## Run it

Two terminals from the repo root.

```bash
# 1. API
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time only
.venv/bin/uvicorn main:app --reload --port 8000

# 2. UI (proxies /api to the server above)
npm install        # first time only
npm run dev        # http://localhost:5173
```

Single-process production: `npm run build`, then run uvicorn as above and open `http://localhost:8000`. The server serves `dist/` when it exists.

## Tests

```bash
cd server && .venv/bin/python -m pytest -q   # generator, solver, model, selection, API
npm test                                     # reducer, storage, animation stage mapping
```

## How the model works

Open **? How the model learns** in the app for the full explanation with your own level's numbers plugged in. In short: five maze features scaled 0–1, five weights and a bias, `ŷ = σ(b + Σ wᵢxᵢ)`, `error = y − ŷ`, `wᵢ += 1.5 · error · xᵢ`. Weights start at −1 so every feature is assumed to hurt until proven otherwise. Constants live at the top of `server/evomaze/model.py`.

## Mazes

Seeded recursive backtracker, then two passes that make them worth solving: walls are knocked out only between cells at least 8 steps apart (wrong turns loop the long way round instead of dead-ending), and the start is placed far from the goal at the cell with the most exits (no forced opening moves). Candidate pool: 8 sizes from 6×6 to 24×24, four straightness/loop presets. Knobs are at the top of `server/evomaze/maze.py` and `server/evomaze/select.py`.
