from evomaze.maze import first_maze, normalize
from evomaze.model import TARGET, initial_weights, learn, predict
from evomaze.rng import hash_seed
from evomaze.select import CANDIDATE_SIDES, generate_candidates, select_candidate

FIRST = first_maze()
X = normalize(FIRST.features)
CANDIDATES = generate_candidates(hash_seed(FIRST.seed, 1))


def test_pool_has_32_candidates_across_8_sizes():
    assert len(CANDIDATES) == 32
    assert sorted({m.rows for m in CANDIDATES}) == list(CANDIDATE_SIDES)


def test_selection_is_the_prediction_closest_to_the_target():
    model = learn(initial_weights(), X, 0.8)
    scores, selected, _ = select_candidate(model, CANDIDATES, FIRST)
    gaps = [abs(predict(model, normalize(m.features)) - TARGET) for m in CANDIDATES]
    assert selected == gaps.index(min(gaps))
    assert scores[selected].fit == max(s.fit for s in scores)


def test_poor_run_gets_an_easier_maze_and_strong_run_does_not_shrink():
    poor_scores, poor_i, _ = select_candidate(learn(initial_weights(), X, 0.3), CANDIDATES, FIRST)
    assert poor_scores[poor_i].maze.features["size"] < FIRST.features["size"]
    strong_scores, strong_i, _ = select_candidate(learn(initial_weights(), X, 1.0), CANDIDATES, FIRST)
    assert strong_scores[strong_i].maze.features["size"] >= FIRST.features["size"]


def test_explanation_is_one_sentence():
    _, _, explanation = select_candidate(initial_weights(), CANDIDATES, FIRST)
    assert explanation.startswith("Selected for you: ") and explanation.endswith(".")
