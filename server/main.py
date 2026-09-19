"""EvoMaze API. Stateless: the client keeps the model weights and sends them with each completed maze."""
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import Field

from evomaze.analyze import RunResult, analyze_run
from evomaze.maze import DC, DR, CamelModel, Maze, Point, first_maze, generate, get_features, normalize, solve
from evomaze.model import LearningUpdate, Weights, build_update, initial_weights, learn
from evomaze.rng import hash_seed
from evomaze.select import CandidateScore, generate_candidates, select_candidate

app = FastAPI(title="EvoMaze API")


class Preview(CamelModel):
    maze: Maze
    path: List[Point]


class FirstResponse(CamelModel):
    maze: Maze
    model: Weights
    preview: Preview


class CompleteRequest(CamelModel):
    maze: Maze
    path: List[Point]
    time_ms: int = Field(ge=0)
    model: Weights
    completed: int = Field(ge=0)


class CompleteResponse(CamelModel):
    run: RunResult
    optimal_path: List[Point]
    update: LearningUpdate
    scores: List[CandidateScore]
    selected_index: int
    explanation: str
    next_maze: Maze
    model: Weights


_STEP = {(DR[d], DC[d]): d for d in DR}


def _validate_path(maze: Maze, path: List[Point]) -> None:
    """The route must be a legal walk from start to goal through open walls. Trust boundary."""
    if not path or path[0] != maze.start or path[-1] != maze.goal:
        raise HTTPException(400, "path must run from start to goal")
    for a, b in zip(path, path[1:]):
        if a == maze.goal:
            raise HTTPException(400, "path continues past the goal")
        d = _STEP.get((b.r - a.r, b.c - a.c))
        if d is None or not (0 <= b.r < maze.rows and 0 <= b.c < maze.cols) or not maze.open[a.r * maze.cols + a.c] & d:
            raise HTTPException(400, "path passes through a wall")


@app.get("/api/first", response_model=FirstResponse)
def first() -> FirstResponse:
    preview = generate(seed=7, side=6, straightness=0.3, loops=0.0)
    return FirstResponse(
        maze=first_maze(),
        model=initial_weights(),
        preview=Preview(maze=preview, path=solve(preview.rows, preview.cols, preview.open, preview.start, preview.goal) or []),
    )


@app.post("/api/complete", response_model=CompleteResponse)
def complete(req: CompleteRequest) -> CompleteResponse:
    """The only place the model learns. Analyse -> learn -> generate candidates -> select, in one pass."""
    maze = req.maze
    _validate_path(maze, req.path)
    optimal = solve(maze.rows, maze.cols, maze.open, maze.start, maze.goal)
    if optimal is None:
        raise HTTPException(400, "maze has no route from start to goal")
    run = analyze_run(maze, req.path, optimal, req.time_ms)
    x = normalize(get_features(maze.rows, maze.cols, maze.open, optimal))  # recomputed, never trusted from the client
    level = req.completed + 1
    after = learn(req.model, x, run.efficiency)
    update = build_update(req.model, after, x, run.efficiency, level)
    scores, selected, explanation = select_candidate(after, generate_candidates(hash_seed(maze.seed, level)), maze)
    return CompleteResponse(
        run=run,
        optimal_path=optimal,
        update=update,
        scores=scores,
        selected_index=selected,
        explanation=explanation,
        next_maze=scores[selected].maze,
        model=after,
    )


# Production: serve the built React app from the same process. In dev, Vite proxies /api here.
_dist = Path(__file__).resolve().parent.parent / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="app")
