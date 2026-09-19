from fastapi.testclient import TestClient

from evomaze.maze import Maze, Point, solve
from main import app

client = TestClient(app)


def _first():
    r = client.get("/api/first")
    assert r.status_code == 200
    return r.json()


def test_first_returns_maze_model_and_preview():
    body = _first()
    assert body["maze"]["rows"] == 8 and len(body["model"]["w"]) == 5
    assert body["preview"]["path"][0] == body["preview"]["maze"]["start"]


def test_complete_learns_once_and_returns_32_scored_candidates():
    body = _first()
    maze = Maze.model_validate(body["maze"])
    optimal = solve(maze.rows, maze.cols, maze.open, maze.start, maze.goal)
    path = [p.model_dump() for p in optimal]
    r = client.post("/api/complete", json={"maze": body["maze"], "path": path, "timeMs": 4200, "model": body["model"], "completed": 0})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["run"]["efficiency"] == 1.0 and out["run"]["moves"] == len(path) - 1
    assert out["model"]["w"] != body["model"]["w"]
    assert len(out["scores"]) == 32 and out["nextMaze"]["id"] == out["scores"][out["selectedIndex"]]["maze"]["id"]
    assert out["update"]["confidence"] == "low" and out["update"]["predictionBefore"] > 0.69
    assert out["explanation"].startswith("Selected for you")
    # stateless and deterministic: the same request gives the same answer
    assert client.post("/api/complete", json={"maze": body["maze"], "path": path, "timeMs": 4200, "model": body["model"], "completed": 0}).json() == out


def test_complete_rejects_a_path_that_walks_through_walls_or_stops_short():
    body = _first()
    maze = Maze.model_validate(body["maze"])
    base = {"maze": body["maze"], "model": body["model"], "timeMs": 1, "completed": 0}
    start = maze.start
    off = Point(r=start.r + (1 if start.r == 0 else -1), c=start.c)
    assert client.post("/api/complete", json={**base, "path": [start.model_dump()]}).status_code == 400
    assert client.post("/api/complete", json={**base, "path": [start.model_dump(), off.model_dump(), maze.goal.model_dump()]}).status_code == 400
