import { describe, it, expect } from 'vitest'
import { generateCandidates, selectCandidate } from './selectCandidate'
import { initialWeights, learn, predict, TARGET } from './onlineModel'
import { normalize } from '../game/getFeatures'
import { FIRST_MAZE, generateMaze } from '../game/generateMaze'
import { hashSeed } from '../game/rng'

const first = generateMaze(FIRST_MAZE)
const x = normalize(first.features)
const candidates = generateCandidates(hashSeed(first.seed, 1))

describe('selectCandidate', () => {
  it('scores 24 solvable candidates', () => {
    expect(candidates).toHaveLength(24)
  })

  it('selects the candidate whose prediction is closest to the target', () => {
    const model = learn(initialWeights(), x, 0.8)
    const { scores, selectedIndex } = selectCandidate(model, candidates, first)
    const gaps = candidates.map((c) => Math.abs(predict(model, normalize(c.features)) - TARGET))
    expect(selectedIndex).toBe(gaps.indexOf(Math.min(...gaps)))
    expect(scores[selectedIndex].fit).toBe(Math.max(...scores.map((s) => s.fit)))
  })

  it('a poor run leads to an easier maze; a strong run does not shrink it', () => {
    const poor = selectCandidate(learn(initialWeights(), x, 0.3), candidates, first)
    expect(poor.scores[poor.selectedIndex].maze.features.size).toBeLessThan(first.features.size)
    const strong = selectCandidate(learn(initialWeights(), x, 1.0), candidates, first)
    expect(strong.scores[strong.selectedIndex].maze.features.size).toBeGreaterThanOrEqual(first.features.size)
  })

  it('explains the selection in one sentence', () => {
    const { explanation } = selectCandidate(initialWeights(), candidates, first)
    expect(explanation).toMatch(/^Selected for you: .+\.$/)
  })
})
