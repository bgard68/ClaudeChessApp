import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NewGameScreen, summarise } from './NewGameScreen'

const markup = () => renderToStaticMarkup(<NewGameScreen onStart={vi.fn()} />)

describe('summarise', () => {
  it('NewGameScreen_ComputerGame_NamesSeatOpponentAndClock', () => {
    expect(summarise('computer', 'white', 'Club', '10+0')).toBe(
      'You play White · Computer · Club · 10+0',
    )
  })

  it('NewGameScreen_PlayingBlack_SaysWhichSideYouTook', () => {
    expect(summarise('computer', 'black', 'Club', '10+0')).toContain('You play Black')
  })

  // Choosing at random means the seat is genuinely not known yet, so the
  // summary must not name one.
  it('NewGameScreen_RandomSeat_NamesNoColour', () => {
    const line = summarise('computer', 'random', 'Club', '10+0')
    expect(line).toContain('Colour drawn at random')
    expect(line).not.toContain('You play')
  })

  it('NewGameScreen_PassAndPlay_DescribesOneDeviceWithoutADifficulty', () => {
    const line = summarise('human', 'white', 'Club', '5+3')
    expect(line).toBe('You play White · Two players, one device · 5+3')
    expect(line).not.toContain('Club')
  })

  // Nobody has a seat when both sides are the engine, so the sentence drops
  // the seat rather than claiming one.
  it('NewGameScreen_EngineVsEngine_DropsTheSeatEntirely', () => {
    const line = summarise('engines', 'white', 'Grandmaster', '3+2')
    expect(line).toBe('Stockfish vs Stockfish · Grandmaster · 3+2')
    expect(line).not.toContain('You play')
  })
})

describe('NewGameScreen', () => {
  it('NewGameScreen_Introduction_SaysWhatTheScreenIsFor', () => {
    expect(markup()).toContain('Choose your match')
  })

  it('NewGameScreen_BoardPreview_ShowsTheBoardAboutToBePlayed', () => {
    expect(markup().match(/data-square=/g)).toHaveLength(64)
    expect(markup()).toContain('White perspective')
  })

  // The setup screen is where the licence attribution lives, and it is the
  // first screen every visitor sees.
  it('NewGameScreen_CreditsPanel_IsCarried', () => {
    expect(markup()).toContain('Credits and licences')
  })

  /*
   * The settings live in a portal into the shell's right rail, which only
   * exists after the shell's first paint. This render is that first paint,
   * so the panel is legitimately absent — what matters is that the screen
   * renders anyway instead of throwing on a null portal target.
   */
  it('NewGameScreen_RailPortalTargetMissing_StillRenders', () => {
    expect(() => markup()).not.toThrow()
    expect(markup()).not.toContain('aria-label="Game settings"')
  })
})
