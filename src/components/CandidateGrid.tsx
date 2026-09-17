import { MazeBoard } from './MazeBoard'
import type { CandidateScore } from '../ml/selectCandidate'

type Props = { scores: CandidateScore[]; selectedIndex: number; explanation: string; animate: boolean; onTry: () => void }

export function CandidateGrid({ scores, selectedIndex, explanation, animate, onTry }: Props) {
  const selected = scores[selectedIndex]
  return (
    <div className="card">
      <h3 className="card__title">Choosing your next maze</h3>
      <div className={`grid${animate ? ' grid--animate' : ''}`}>
        {scores.map((s, i) => (
          <div
            key={s.maze.id}
            className={`grid__cell${s.faded ? ' grid__cell--faded' : ''}${i === selectedIndex ? ' grid__cell--selected' : ''}`}
            style={{ '--i': i } as React.CSSProperties}
            title={`${s.maze.rows}×${s.maze.cols} · predicted ${Math.round(s.predicted * 100)}%`}
          >
            <MazeBoard maze={s.maze} mini />
          </div>
        ))}
      </div>
      <p className="explain">{explanation}</p>
      <p className="muted">Predicted challenge fit: <strong>{selected.fit}%</strong> · {selected.maze.rows}×{selected.maze.cols}</p>
      <button className="btn btn--primary" onClick={onTry}>Try this maze</button>
    </div>
  )
}
