from evomaze.analyze import analyze_run
from evomaze.maze import E, N, S, W, Maze, Point, solve

# 2x2: (0,0)->(0,1)->(1,1) is optimal; (1,0) is a dead end off (0,0).
MAZE = Maze(
    id="t", seed=0, rows=2, cols=2, straightness=0, loops=0,
    start=Point(r=0, c=0), goal=Point(r=1, c=1),
    open=[E | S, W | S, N, N],
    features={"size": 4, "optimalPathLength": 2, "turnCount": 1, "junctionCount": 0, "deadEndCount": 2},
)
OPTIMAL = solve(2, 2, MAZE.open, MAZE.start, MAZE.goal)


def test_efficiency_is_optimal_over_actual_with_wrong_turns_and_backtracks():
    path = [Point(r=0, c=0), Point(r=1, c=0), Point(r=0, c=0), Point(r=0, c=1), Point(r=1, c=1)]
    run = analyze_run(MAZE, path, OPTIMAL, 1234)
    assert (run.moves, run.optimal_moves, run.wrong_turns, run.backtracks, run.time_ms) == (4, 2, 1, 1, 1234)
    assert run.efficiency == 0.5


def test_perfect_run_clamps_to_one():
    run = analyze_run(MAZE, OPTIMAL, OPTIMAL, 500)
    assert run.efficiency == 1.0 and run.wrong_turns == 0 and run.backtracks == 0
