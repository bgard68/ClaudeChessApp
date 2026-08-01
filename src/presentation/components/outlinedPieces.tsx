import { defaultPieces } from 'react-chessboard'
import type { CSSProperties } from 'react'

interface PieceRendererProps {
  readonly fill?: string
  readonly square?: string
  readonly svgStyle?: CSSProperties
}
type PieceKey = keyof typeof defaultPieces

const WHITE_FILL = '#f8f8f4'
// CSS variables let the phone layout strengthen contrast without creating a
// second renderer map (and without changing the established desktop artwork).
const WHITE_OUTLINE = 'var(--contrast-white-piece-outline, #17191d)'
const BLACK_FILL = 'var(--contrast-black-piece-fill, #111318)'
const BLACK_OUTLINE = 'var(--contrast-black-piece-outline, #f2f1ea)'

const PIECE_KEYS = [
  'wP', 'wR', 'wN', 'wB', 'wQ', 'wK',
  'bP', 'bR', 'bN', 'bB', 'bQ', 'bK',
] as const satisfies readonly PieceKey[]

/**
 * Fixed-colour SVG renderers for react-chessboard v5.
 *
 * The library's SVG geometry remains intact, while the app owns the colours
 * and high-contrast edge. Keeping this map at module scope is important: the
 * play screen ticks several times a second and a new map on every render would
 * repeatedly reconfigure react-chessboard.
 */
export const OUTLINED_PIECES = Object.fromEntries(
  PIECE_KEYS.map((pieceKey) => {
    const isWhite = pieceKey.startsWith('w')
    const fill = isWhite ? WHITE_FILL : BLACK_FILL
    const outline = isWhite ? WHITE_OUTLINE : BLACK_OUTLINE
    const DefaultPiece = defaultPieces[pieceKey]!

    return [
      pieceKey,
      ({ square, svgStyle }: PieceRendererProps = {}) => (
        <span
          className="contrast-piece"
          data-contrast-piece={pieceKey}
          aria-hidden="true"
        >
          <DefaultPiece
            fill={fill}
            square={square}
            svgStyle={{ ...svgStyle, ...pieceSvgStyle(outline) }}
          />
        </span>
      ),
    ]
  }),
) as typeof defaultPieces

function pieceSvgStyle(outline: string): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    height: '100%',
    forcedColorAdjust: 'none',
    colorScheme: 'only light',
    filter: [
      `drop-shadow(0 0 0.8px ${outline})`,
      `drop-shadow(0 0 0.8px ${outline})`,
      `drop-shadow(0 0 1.4px ${outline})`,
    ].join(' '),
  }
}
