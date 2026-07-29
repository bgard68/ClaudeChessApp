import { useEffect, useRef } from 'react'
import { toMovePairs } from '@application/selectors'

interface MoveListProps {
  readonly sanMoves: readonly string[]
  /** Half-move currently shown on the board; 0 is the starting position. */
  readonly currentPly?: number
  readonly onSelectPly?: (ply: number) => void
}

export function MoveList({ sanMoves, currentPly, onSelectPly }: MoveListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const container = scrollRef.current
    const active = activeRef.current
    if (container === null || active === null) return

    // Deliberately not `scrollIntoView`: that scrolls every scrollable
    // ancestor, which on a phone drags the surrounding panel — and its Back
    // button — out of view. This moves only this list.
    const containerBox = container.getBoundingClientRect()
    const activeBox = active.getBoundingClientRect()

    if (activeBox.top < containerBox.top || activeBox.bottom > containerBox.bottom) {
      container.scrollTop +=
        activeBox.top - containerBox.top - (containerBox.height - activeBox.height) / 2
    }
  }, [currentPly, sanMoves.length])

  return (
    <div className="move-list-scroll" ref={scrollRef}>
      {sanMoves.length === 0 ? (
        <p className="move-list__empty">No moves yet.</p>
      ) : (
        <ol className="move-list">
          {toMovePairs(sanMoves).map((pair) => {
            const whitePly = (pair.moveNumber - 1) * 2 + 1
            return (
              <li key={pair.moveNumber} className="move-list__row">
                <span className="move-list__number">{pair.moveNumber}.</span>
                <MoveCell
                  san={pair.white}
                  ply={whitePly}
                  currentPly={currentPly}
                  onSelectPly={onSelectPly}
                  activeRef={activeRef}
                />
                <MoveCell
                  san={pair.black}
                  ply={whitePly + 1}
                  currentPly={currentPly}
                  onSelectPly={onSelectPly}
                  activeRef={activeRef}
                />
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function MoveCell({
  san,
  ply,
  currentPly,
  onSelectPly,
  activeRef,
}: {
  san: string | null
  ply: number
  currentPly: number | undefined
  onSelectPly: ((ply: number) => void) | undefined
  activeRef: React.RefObject<HTMLButtonElement | null>
}) {
  if (san === null) return <span className="move-list__cell" />

  const isCurrent = currentPly === ply

  return (
    <button
      type="button"
      ref={isCurrent ? activeRef : null}
      className={`move-list__cell${isCurrent ? ' move-list__cell--current' : ''}`}
      disabled={onSelectPly === undefined}
      onClick={() => onSelectPly?.(ply)}
    >
      {san}
    </button>
  )
}
