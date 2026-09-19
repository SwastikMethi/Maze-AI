"""Online logistic regression: five weights and a bias, one SGD step per completed maze."""
from __future__ import annotations

import math
from typing import List

from pydantic import field_validator

from .maze import FEATURE_KEYS, CamelModel, first_maze, normalize

TARGET = 0.7
LR = 1.5  # ponytail: single learning-rate knob; lower if the model overshoots on real players
W0 = -1.0  # shared prior weight: "more of any feature is harder"; neutral across features, not zero

FEATURE_LABELS = {
    "size": "bigger grids",
    "optimalPathLength": "long paths",
    "turnCount": "turns",
    "junctionCount": "junctions",
    "deadEndCount": "dead ends",
}


class Weights(CamelModel):
    w: List[float]
    b: float

    @field_validator("w")
    @classmethod
    def _five(cls, v: List[float]):
        if len(v) != len(FEATURE_KEYS):
            raise ValueError(f"expected {len(FEATURE_KEYS)} weights")
        return v


class LearningUpdate(CamelModel):
    """Everything the trainer visual needs. Weights are in FEATURE_KEYS order."""

    x: List[float]
    weights_before: List[float]
    weights_after: List[float]
    bias_before: float
    bias_after: float
    prediction_before: float
    actual_efficiency: float
    confidence: str
    signal: str


def sigmoid(z: float) -> float:
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    ez = math.exp(z)
    return ez / (1.0 + ez)


def score(m: Weights, x: List[float]) -> float:
    return m.b + sum(w * xi for w, xi in zip(m.w, x))


def predict(m: Weights, x: List[float]) -> float:
    return sigmoid(score(m, x))


def learn(m: Weights, x: List[float], actual: float) -> Weights:
    """One SGD step toward the observed efficiency. Returns a new object."""
    err = actual - predict(m, x)
    return Weights(w=[w + LR * err * xi for w, xi in zip(m.w, x)], b=m.b + LR * err)


def initial_weights() -> Weights:
    """Prior: every weight W0, bias chosen so the fixed first maze predicts exactly TARGET."""
    x = normalize(first_maze().features)
    return Weights(w=[W0] * len(FEATURE_KEYS), b=math.log(TARGET / (1 - TARGET)) - W0 * sum(x))


def confidence_for(completed: int) -> str:
    return "low" if completed < 3 else "medium" if completed < 8 else "high"


def build_update(before: Weights, after: Weights, x: List[float], actual: float, completed: int) -> LearningUpdate:
    prediction = predict(before, x)
    err = actual - prediction
    confidence = confidence_for(completed)
    prefix = "Early signal: " if confidence == "low" else ""
    # Δw_i ∝ x_i, so the feature with the largest input moves most (bias excluded: its input is always 1).
    top = FEATURE_LABELS[FEATURE_KEYS[x.index(max(x))]]
    if abs(err) < 0.02:
        signal = f"{prefix}Prediction was almost exact, so the weights barely moved."
    else:
        beat = err > 0
        signal = (
            f"{prefix}You {'beat' if beat else 'fell short of'} the prediction, so every feature now looks a little "
            f"{'less' if beat else 'more'} costly. {top[0].upper() + top[1:]} moved most because this maze had the most of it."
        )
    return LearningUpdate(
        x=x,
        weights_before=before.w,
        weights_after=after.w,
        bias_before=before.b,
        bias_after=after.b,
        prediction_before=prediction,
        actual_efficiency=actual,
        confidence=confidence,
        signal=signal,
    )
