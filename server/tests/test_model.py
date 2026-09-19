import pytest

from evomaze.maze import first_maze, normalize
from evomaze.model import TARGET, build_update, initial_weights, learn, predict

X = normalize(first_maze().features)


def test_prior_predicts_the_target_on_the_first_maze():
    assert predict(initial_weights(), X) == pytest.approx(TARGET, abs=1e-9)


def test_a_completed_run_changes_weights_toward_the_outcome_and_is_pure():
    before = initial_weights()
    after = learn(before, X, 0.3)
    assert after.w != before.w and after.b != before.b
    assert predict(after, X) < predict(before, X)
    assert before.w == initial_weights().w


def test_same_model_and_features_give_the_same_prediction():
    m = learn(initial_weights(), X, 0.9)
    assert predict(m, X) == predict(m, X)


def test_build_update_exposes_raw_numbers_and_a_plain_english_signal():
    before = initial_weights()
    poor = build_update(before, learn(before, X, 0.3), X, 0.3, 1)
    assert len(poor.x) == 5 and poor.weights_before == before.w and poor.bias_after != poor.bias_before
    assert poor.prediction_before == pytest.approx(TARGET, abs=1e-9)
    assert poor.confidence == "low" and poor.signal.startswith("Early signal: You fell short of the prediction")
    strong = build_update(before, learn(before, X, 1.0), X, 1.0, 9)
    assert strong.signal.startswith("You beat the prediction")
