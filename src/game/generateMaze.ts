import { mulberry32 } from './rng'
import { solveMaze } from './solveMaze'
import { getFeatures } from './getFeatures'
import { DIRS, DR, DC, OPP, inBounds, type Dir, type Maze } from './types'

export type MazeSpec = { seed: number; side: number; straightness: number; braid: number }

export const FIRST_MAZE: MazeSpec = { seed: 20260917, side: 8, straightness: 0.5, braid: 0 }

/**
 * Seeded recursive backtracker.
 * straightness: probability of continuing the last direction when possible (fewer turns, longer corridors).
 * braid: fraction of dead ends that get one extra opening afterwards (loops, more junctions).
 */
export function generateMaze(spec: MazeSpec): Maze {
  const { seed, side, straightness, braid } = spec
  const rng = mulberry32(seed)
  const dims = { rows: side, cols: side }
  const open: number[] = new Array(side * side).fill(0)
  const seen = new Uint8Array(side * side)
  const at = (r: number, c: number) => r * side + c

  const stack: [number, number, Dir | 0][] = [[0, 0, 0]]
  seen[0] = 1
  while (stack.length) {
    const [r, c, last] = stack[stack.length - 1]
    const options = DIRS.filter((d) => inBounds(dims, r + DR[d], c + DC[d]) && !seen[at(r + DR[d], c + DC[d])])
    if (!options.length) {
      stack.pop()
      continue
    }
    const d = last && options.includes(last) && rng() < straightness ? last : options[Math.floor(rng() * options.length)]
    const nr = r + DR[d], nc = c + DC[d]
    open[at(r, c)] |= d
    open[at(nr, nc)] |= OPP[d]
    seen[at(nr, nc)] = 1
    stack.push([nr, nc, d])
  }

  if (braid > 0) {
    const deadEnds: number[] = []
    for (let i = 0; i < open.length; i++) if (DIRS.filter((d) => open[i] & d).length === 1) deadEnds.push(i)
    for (let i = deadEnds.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[deadEnds[i], deadEnds[j]] = [deadEnds[j], deadEnds[i]]
    }
    for (const i of deadEnds.slice(0, Math.round(braid * deadEnds.length))) {
      const r = Math.floor(i / side), c = i % side
      const walls = DIRS.filter((d) => inBounds(dims, r + DR[d], c + DC[d]) && !(open[i] & d))
      if (!walls.length) continue
      const d = walls[Math.floor(rng() * walls.length)]
      open[i] |= d
      open[at(r + DR[d], c + DC[d])] |= OPP[d]
    }
  }

  const base = { ...dims, open, start: { r: 0, c: 0 }, goal: { r: side - 1, c: side - 1 } }
  const optimal = solveMaze(base)
  if (!optimal) throw new Error(`unsolvable maze for seed ${seed}`)
  return {
    id: `${side}-${seed}-${straightness}-${braid}`,
    seed,
    straightness,
    braid,
    ...base,
    features: getFeatures(base, optimal),
  }
}
