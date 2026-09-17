import { DIRS, DR, DC, idx, type Maze, type Point } from './types'

/** BFS shortest path from start to goal (inclusive). null if unreachable. */
export function solveMaze(m: Pick<Maze, 'rows' | 'cols' | 'open' | 'start' | 'goal'>): Point[] | null {
  const n = m.rows * m.cols
  const parent = new Int32Array(n).fill(-2)
  const s = idx(m, m.start)
  const g = idx(m, m.goal)
  parent[s] = -1
  const queue = [s]
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h]
    if (i === g) break
    const r = Math.floor(i / m.cols)
    const c = i % m.cols
    for (const d of DIRS) {
      if (!(m.open[i] & d)) continue
      const j = (r + DR[d]) * m.cols + (c + DC[d])
      if (parent[j] !== -2) continue
      parent[j] = i
      queue.push(j)
    }
  }
  if (parent[g] === -2) return null
  const path: Point[] = []
  for (let i = g; i !== -1; i = parent[i]) path.push({ r: Math.floor(i / m.cols), c: i % m.cols })
  return path.reverse()
}
