import pytest

from evomaze.maze import DC, DIRS, DR, E, LOOP_MIN_DISTANCE, N, S, W, Point, degree, distances_from, generate, get_features, solve
from evomaze.select import CANDIDATE_SIDES, PRESETS

SEEDS = range(1, 7)


@pytest.mark.parametrize("side", CANDIDATE_SIDES)
@pytest.mark.parametrize("preset", PRESETS)
def test_every_maze_is_solvable_with_an_open_start_and_deterministic(side, preset):
    straightness, loops = preset
    for seed in SEEDS:
        m = generate(seed, side, straightness, loops)
        assert solve(m.rows, m.cols, m.open, m.start, m.goal) is not None
        assert degree(m.open, m.start.r * m.cols + m.start.c) >= 2, "start must offer a real choice"
    a, b = generate(3, side, straightness, loops), generate(3, side, straightness, loops)
    assert a.open == b.open and a.start == b.start and a.features == b.features


def test_loops_add_junctions_and_only_join_far_apart_cells():
    side = 12
    tree = generate(11, side, 0.0, 0.0)
    looped = generate(11, side, 0.0, 0.08)
    assert looped.features["junctionCount"] > tree.features["junctionCount"]
    added = 0
    for i, (t, l) in enumerate(zip(tree.open, looped.open)):
        for d in (E, S):  # each wall counted once from one side
            if (l & ~t) & d:
                j = (i // side + DR[d]) * side + i % side + DC[d]
                assert distances_from(side, side, tree.open, i)[j] >= LOOP_MIN_DISTANCE
                added += 1
    assert added > 0


def test_solver_returns_the_shortest_path_and_features_count_correctly():
    # 3x3, two routes from (0,0) to (2,2): left column + bottom row (4 moves) vs a 6-move detour.
    open = [E | S, E | W, S | W, N | S, E | S, N | W, N | E, N | W | E, W]
    path = solve(3, 3, open, Point(r=0, c=0), Point(r=2, c=2))
    assert path is not None and len(path) - 1 == 4
    assert path[0] == Point(r=0, c=0) and path[-1] == Point(r=2, c=2)
    assert solve(3, 3, [0] * 9, Point(r=0, c=0), Point(r=2, c=2)) is None
    assert get_features(3, 3, open, path) == {"size": 9, "optimalPathLength": 4, "turnCount": 1, "junctionCount": 1, "deadEndCount": 1}
    assert [degree(open, i) for i in range(9)].count(1) == 1 and DIRS == (N, E, S, W)
