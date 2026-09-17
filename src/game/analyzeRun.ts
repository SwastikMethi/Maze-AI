import { idx, type Maze, type Point, type RunResult } from './types'

/** A move is one successful step into an open neighbour; blocked input never reaches the path. */
export function analyzeRun(maze: Maze, path: Point[], optimalPath: Point[], timeMs: number): RunResult {
  const moves = path.length - 1
  const optimalMoves = optimalPath.length - 1
  const onOptimal = new Set(optimalPath.map((p) => idx(maze, p)))
  const visited = new Set<number>([idx(maze, path[0])])
  let backtracks = 0
  let wrongTurns = 0
  for (let i = 1; i < path.length; i++) {
    const from = idx(maze, path[i - 1])
    const to = idx(maze, path[i])
    if (visited.has(to)) backtracks++
    if (onOptimal.has(from) && !onOptimal.has(to)) wrongTurns++
    visited.add(to)
  }
  const efficiency = moves === 0 ? 1 : Math.min(1, Math.max(0, optimalMoves / moves))
  return { mazeId: maze.id, path, moves, optimalMoves, timeMs, wrongTurns, backtracks, efficiency }
}
