"""Maze generation, solving and feature extraction.

Cells are a flat list of open-side bitmasks (index = r * cols + c). One structure serves
generation, BFS, movement checks on the client and SVG rendering.
"""
from __future__ import annotations

from functools import lru_cache
from math import ceil
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator
from pydantic.alias_generators import to_camel

from .rng import mulberry32


class CamelModel(BaseModel):
    """JSON in camelCase (what the React client speaks), Python in snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


N, E, S, W = 1, 2, 4, 8
DIRS = (N, E, S, W)
DR = {N: -1, E: 0, S: 1, W: 0}
DC = {N: 0, E: 1, S: 0, W: -1}
OPP = {N: S, E: W, S: N, W: E}

# A knocked-out wall must join cells at least this far apart through the maze, so every
# loop it creates has a short arm and a long arm: a wrong turn goes the long way round.
LOOP_MIN_DISTANCE = 8
# The start is chosen among this fraction of cells farthest from the goal (route stays long)
# and is the one with the most exits (no forced opening moves).
START_FAR_FRACTION = 0.15

FEATURE_KEYS = ("size", "optimalPathLength", "turnCount", "junctionCount", "deadEndCount")
# Fixed ceilings (~1.1x the max observed at 24x24 across presets) so normalisation is stable across batches.
FEATURE_MAX = {"size": 576, "optimalPathLength": 352, "turnCount": 224, "junctionCount": 152, "deadEndCount": 78}
FIRST_MAZE = {"seed": 20260917, "side": 8, "straightness": 0.5, "loops": 0.04}


class Point(CamelModel):
    r: int
    c: int


class Maze(CamelModel):
    id: str
    seed: int
    rows: int
    cols: int
    straightness: float
    loops: float
    start: Point
    goal: Point
    open: List[int]
    features: Dict[str, int]

    @field_validator("open")
    @classmethod
    def _check_open(cls, v: List[int], info):
        rows, cols = info.data.get("rows"), info.data.get("cols")
        if rows is not None and cols is not None and len(v) != rows * cols:
            raise ValueError("open must have rows*cols cells")
        if any(b < 0 or b > 15 for b in v):
            raise ValueError("cell bits out of range")
        return v


def degree(open: List[int], i: int) -> int:
    return sum(1 for d in DIRS if open[i] & d)


def distances_from(rows: int, cols: int, open: List[int], src: int, parent: Optional[List[int]] = None) -> List[int]:
    """BFS step distance from one cell to every cell. Unreachable = -1."""
    dist = [-1] * (rows * cols)
    dist[src] = 0
    if parent is not None:
        parent[src] = -1
    queue = [src]
    head = 0
    while head < len(queue):
        i = queue[head]
        head += 1
        r, c = divmod(i, cols)
        bits = open[i]
        for d in DIRS:
            if not bits & d:
                continue
            j = (r + DR[d]) * cols + c + DC[d]
            if dist[j] >= 0:
                continue
            dist[j] = dist[i] + 1
            if parent is not None:
                parent[j] = i
            queue.append(j)
    return dist


def solve(rows: int, cols: int, open: List[int], start: Point, goal: Point) -> Optional[List[Point]]:
    """Shortest path from start to goal (inclusive). None if unreachable."""
    parent = [-2] * (rows * cols)
    s, g = start.r * cols + start.c, goal.r * cols + goal.c
    if distances_from(rows, cols, open, s, parent)[g] < 0:
        return None
    path: List[Point] = []
    i = g
    while i != -1:
        path.append(Point(r=i // cols, c=i % cols))
        i = parent[i]
    path.reverse()
    return path


def get_features(rows: int, cols: int, open: List[int], optimal: List[Point]) -> Dict[str, int]:
    turns = 0
    for i in range(2, len(optimal)):
        a, b, c = optimal[i - 2], optimal[i - 1], optimal[i]
        if (b.r - a.r, b.c - a.c) != (c.r - b.r, c.c - b.c):
            turns += 1
    degrees = [degree(open, i) for i in range(rows * cols)]
    return {
        "size": rows * cols,
        "optimalPathLength": len(optimal) - 1,
        "turnCount": turns,
        "junctionCount": sum(1 for d in degrees if d >= 3),
        "deadEndCount": sum(1 for d in degrees if d == 1),
    }


def normalize(features: Dict[str, int]) -> List[float]:
    """Features -> vector in FEATURE_KEYS order, each clamped to [0, 1]."""
    return [min(1.0, features[k] / FEATURE_MAX[k]) for k in FEATURE_KEYS]


def generate(seed: int, side: int, straightness: float, loops: float) -> Maze:
    """Seeded recursive backtracker + long-way-round loops + open start.

    straightness: probability of continuing the last direction (longer corridors, fewer turns).
    loops: fraction of cells that get an extra opening, each joining cells >= LOOP_MIN_DISTANCE apart.
    """
    rng = mulberry32(seed)
    n = side * side
    open = [0] * n
    seen = [False] * n
    seen[0] = True

    def in_bounds(r: int, c: int) -> bool:
        return 0 <= r < side and 0 <= c < side

    # 1. Perfect maze (a tree) by iterative recursive backtracking.
    stack = [(0, 0, 0)]
    while stack:
        r, c, last = stack[-1]
        options = [d for d in DIRS if in_bounds(r + DR[d], c + DC[d]) and not seen[(r + DR[d]) * side + c + DC[d]]]
        if not options:
            stack.pop()
            continue
        d = last if (last and last in options and rng() < straightness) else options[int(rng() * len(options))]
        nr, nc = r + DR[d], c + DC[d]
        open[r * side + c] |= d
        open[nr * side + nc] |= OPP[d]
        seen[nr * side + nc] = True
        stack.append((nr, nc, d))

    # 2. Long-way-round loops: only knock out walls whose two cells are far apart through the maze.
    target = round(loops * n)
    added = tries = 0
    while added < target and tries < target * 12:
        tries += 1
        i = int(rng() * n)
        r, c = divmod(i, side)
        walls = [d for d in DIRS if in_bounds(r + DR[d], c + DC[d]) and not open[i] & d]
        if not walls:
            continue
        dist = distances_from(side, side, open, i)
        far = [d for d in walls if dist[(r + DR[d]) * side + c + DC[d]] >= LOOP_MIN_DISTANCE]
        if not far:
            continue
        d = far[int(rng() * len(far))]
        open[i] |= d
        open[(r + DR[d]) * side + c + DC[d]] |= OPP[d]
        added += 1

    # 3. Open start: farthest 15% of cells from the goal, then the one with the most exits.
    goal_i = n - 1
    dist = distances_from(side, side, open, goal_i)
    far_cells = sorted((i for i in range(n) if dist[i] >= 0), key=lambda i: -dist[i])[: max(3, ceil(n * START_FAR_FRACTION))]
    start_i = max(far_cells, key=lambda i: degree(open, i))  # max() keeps the first of equal maxima
    start = Point(r=start_i // side, c=start_i % side)
    goal = Point(r=side - 1, c=side - 1)

    optimal = solve(side, side, open, start, goal)
    if optimal is None:
        raise ValueError(f"unsolvable maze for seed {seed}")
    return Maze(
        id=f"{side}-{seed}-{straightness}-{loops}",
        seed=seed,
        rows=side,
        cols=side,
        straightness=straightness,
        loops=loops,
        start=start,
        goal=goal,
        open=open,
        features=get_features(side, side, open, optimal),
    )


@lru_cache(maxsize=1)
def first_maze() -> Maze:
    return generate(**FIRST_MAZE)
