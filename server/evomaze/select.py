"""Generate a candidate pool and pick the maze whose predicted efficiency is closest to the target."""
from __future__ import annotations

from typing import List, Tuple

from .maze import CamelModel, Maze, generate, normalize
from .model import TARGET, Weights, predict
from .rng import mulberry32

CANDIDATE_SIDES = (6, 8, 10, 12, 14, 16, 20, 24)
# (straightness, loops): twisty / straight, fewer / more detour loops. Every candidate has an open start.
PRESETS: Tuple[Tuple[float, float], ...] = ((0.0, 0.04), (0.6, 0.04), (0.0, 0.08), (0.6, 0.08))
FADE_BAND = 0.15


class CandidateScore(CamelModel):
    maze: Maze
    predicted: float
    fit: int
    faded: bool


def generate_candidates(level_seed: int) -> List[Maze]:
    """32 deterministic candidates for a level seed."""
    rng = mulberry32(level_seed)
    out: List[Maze] = []
    for side in CANDIDATE_SIDES:
        for straightness, loops in PRESETS:
            out.append(generate(int(rng() * 2**32), side, straightness, loops))
    return out


def _is_repeat(c: Maze, previous: Maze) -> bool:
    if c.rows == previous.rows and c.seed == previous.seed:
        return True
    return normalize(c.features) == normalize(previous.features)


def select_candidate(model: Weights, candidates: List[Maze], previous: Maze) -> Tuple[List[CandidateScore], int, str]:
    scores: List[CandidateScore] = []
    for maze in candidates:
        predicted = predict(model, normalize(maze.features))
        gap = abs(predicted - TARGET)
        scores.append(CandidateScore(maze=maze, predicted=predicted, fit=int(100 * (1 - gap) + 0.5), faded=gap > FADE_BAND))
    selected = -1
    for i, s in enumerate(scores):
        if _is_repeat(s.maze, previous):
            continue
        if selected < 0 or abs(s.predicted - TARGET) < abs(scores[selected].predicted - TARGET):
            selected = i
    if selected < 0:
        selected = 0
    return scores, selected, _explain(scores[selected].maze, previous)


_DIFFS = (
    ("junctionCount", "more junctions", "fewer junctions"),
    ("deadEndCount", "more dead ends", "fewer dead ends"),
    ("optimalPathLength", "a longer route", "a shorter route"),
    ("turnCount", "a twistier route", "a straighter route"),
    ("size", "a bigger grid", "a smaller grid"),
)


def _explain(selected: Maze, previous: Maze) -> str:
    parts = []
    for key, more, fewer in _DIFFS:
        rel = (selected.features[key] - previous.features[key]) / max(previous.features[key], 1)
        if abs(rel) > 0.15:
            parts.append((abs(rel), more if rel > 0 else fewer))
    parts.sort(key=lambda p: -p[0])
    if not parts:
        return "Selected for you: a similar layout with a fresh route."
    return "Selected for you: " + ", ".join(text for _, text in parts[:2]) + "."
