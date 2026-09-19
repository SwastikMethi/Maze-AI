import type { CSSProperties } from 'react'
import { E, S, W, N, type Maze, type Point } from '../api/types'

type Props = {
  maze: Pick<Maze, 'rows' | 'cols' | 'open' | 'start' | 'goal'>
  player?: Point
  playerPath?: Point[]
  optimalPath?: Point[]
  mini?: boolean
  celebrate?: boolean
  className?: string
  style?: CSSProperties
}

function wallPath(m: Props['maze']): string {
  const d: string[] = []
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      const bits = m.open[r * m.cols + c]
      if (!(bits & N)) d.push(`M${c} ${r}h1`)
      if (!(bits & W)) d.push(`M${c} ${r}v1`)
      if (r === m.rows - 1 && !(bits & S)) d.push(`M${c} ${r + 1}h1`)
      if (c === m.cols - 1 && !(bits & E)) d.push(`M${c + 1} ${r}v1`)
    }
  return d.join('')
}

const pts = (path: Point[]) => path.map((p) => `${p.c + 0.5},${p.r + 0.5}`).join(' ')

export function MazeBoard({ maze, player, playerPath, optimalPath, mini, celebrate, className, style }: Props) {
  const pad = mini ? 0.08 : 0.12
  return (
    <svg
      className={`board${mini ? ' board--mini' : ''}${className ? ' ' + className : ''}`}
      style={style}
      viewBox={`${-pad} ${-pad} ${maze.cols + 2 * pad} ${maze.rows + 2 * pad}`}
      role="img"
      aria-label={mini ? 'candidate maze' : 'maze'}
    >
      <rect
        className={`goal${celebrate ? ' goal--celebrate' : ''}`}
        x={maze.goal.c + 0.15} y={maze.goal.r + 0.15} width={0.7} height={0.7} rx={0.15}
      />
      {optimalPath && <polyline className="route route--optimal" points={pts(optimalPath)} pathLength={1} />}
      {playerPath && <polyline className="route route--player" points={pts(playerPath)} pathLength={1} />}
      <path className="walls" d={wallPath(maze)} />
      {player && <circle className="player" cx={player.c + 0.5} cy={player.r + 0.5} r={0.28} />}
    </svg>
  )
}
