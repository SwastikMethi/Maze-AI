import { generateMaze } from '../game/generateMaze'
import { normalize } from '../game/getFeatures'
import { mulberry32 } from '../game/rng'
import type { Maze } from '../game/types'
import { predict, TARGET, type Weights } from './onlineModel'

export const CANDIDATE_SIDES = [6, 8, 10, 12, 14, 16]
/** [straightness, braid] presets: twisty tree, straight tree, twisty loops, straight loops. */
export const PRESETS: [number, number][] = [[0, 0], [0.7, 0], [0, 0.3], [0.7, 0.3]]
const FADE_BAND = 0.15

export type CandidateScore = { maze: Maze; predicted: number; fit: number; faded: boolean }
export type Selection = { scores: CandidateScore[]; selectedIndex: number; explanation: string }

/** 24 deterministic candidates for a level seed. */
export function generateCandidates(levelSeed: number): Maze[] {
  const rng = mulberry32(levelSeed)
  const out: Maze[] = []
  for (const side of CANDIDATE_SIDES)
    for (const [straightness, braid] of PRESETS)
      out.push(generateMaze({ seed: Math.floor(rng() * 2 ** 32), side, straightness, braid }))
  return out
}

function isRepeat(c: Maze, previous: Maze): boolean {
  if (c.rows === previous.rows && c.seed === previous.seed) return true
  const a = normalize(c.features), b = normalize(previous.features)
  return a.every((v, i) => v === b[i])
}

export function selectCandidate(model: Weights, candidates: Maze[], previous: Maze): Selection {
  const scores = candidates.map((maze) => {
    const predicted = predict(model, normalize(maze.features))
    const gap = Math.abs(predicted - TARGET)
    return { maze, predicted, fit: Math.round(100 * (1 - gap)), faded: gap > FADE_BAND }
  })
  const gap = (i: number) => Math.abs(scores[i].predicted - TARGET)
  let selectedIndex = -1
  for (let i = 0; i < scores.length; i++) {
    if (isRepeat(scores[i].maze, previous)) continue
    if (selectedIndex < 0 || gap(i) < gap(selectedIndex)) selectedIndex = i
  }
  if (selectedIndex < 0) selectedIndex = 0
  return { scores, selectedIndex, explanation: explain(scores[selectedIndex].maze, previous) }
}

const DIFFS: [keyof Maze['features'], string, string][] = [
  ['junctionCount', 'more junctions', 'fewer junctions'],
  ['deadEndCount', 'more dead ends', 'fewer dead ends'],
  ['optimalPathLength', 'a longer route', 'a shorter route'],
  ['size', 'a bigger grid', 'a smaller grid'],
]

function explain(selected: Maze, previous: Maze): string {
  const parts = DIFFS.map(([k, more, fewer]) => {
    const rel = (selected.features[k] - previous.features[k]) / Math.max(previous.features[k], 1)
    return { rel, text: rel > 0 ? more : fewer }
  })
    .filter((p) => Math.abs(p.rel) > 0.15)
    .sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel))
    .slice(0, 2)
  return parts.length ? `Selected for you: ${parts.map((p) => p.text).join(', ')}.` : 'Selected for you: a similar layout with a fresh route.'
}
