"""Turn a recorded route into the numbers the model learns from."""
from __future__ import annotations

from typing import List

from .maze import CamelModel, Maze, Point


class RunResult(CamelModel):
    maze_id: str
    path: List[Point]
    moves: int
    optimal_moves: int
    time_ms: int
    wrong_turns: int
    backtracks: int
    efficiency: float


def analyze_run(maze: Maze, path: List[Point], optimal: List[Point], time_ms: int) -> RunResult:
    """A move is one step into an open neighbour; blocked input never reaches the path."""

    def idx(p: Point) -> int:
        return p.r * maze.cols + p.c

    moves = len(path) - 1
    optimal_moves = len(optimal) - 1
    on_optimal = {idx(p) for p in optimal}
    visited = {idx(path[0])}
    backtracks = wrong_turns = 0
    for a, b in zip(path, path[1:]):
        i, j = idx(a), idx(b)
        if j in visited:
            backtracks += 1
        if i in on_optimal and j not in on_optimal:
            wrong_turns += 1
        visited.add(j)
    efficiency = 1.0 if moves == 0 else min(1.0, max(0.0, optimal_moves / moves))
    return RunResult(
        maze_id=maze.id,
        path=path,
        moves=moves,
        optimal_moves=optimal_moves,
        time_ms=time_ms,
        wrong_turns=wrong_turns,
        backtracks=backtracks,
        efficiency=efficiency,
    )
