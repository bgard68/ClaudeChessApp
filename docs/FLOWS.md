# Application flows

How a game gets from the setup screen to a stored result, and which piece talks
to which along the way. The layering that makes this shape possible is in
[ARCHITECTURE-AND-REVIEW.md](ARCHITECTURE-AND-REVIEW.md); what the stored result
looks like is in [DATA-MODEL.md](DATA-MODEL.md).

---

## How the pieces are wired

React sees two things and never more: `services` (the long-lived adapters) and
`factory` (which assembles use cases). Both arrive through `ServicesContext`, so
no screen ever constructs an engine, a database client, or a clock.

```mermaid
flowchart TD
    subgraph comp["composition/"]
        SC["services.ts<br/><i>names the concrete classes</i>"]
        GF["GameFactory<br/><i>assembles use cases</i>"]
    end

    subgraph pres["presentation/"]
        CTX["ServicesContext"]
        APP["App.tsx<br/><i>owns the current view</i>"]
        NGS["NewGameScreen"]
        PS["PlayScreen"]
        AS["ArchiveScreen"]
        RS["ReplayScreen"]
        BOARD["ChessBoardView"]
        CLOCK["ClockPanel"]
        MOVES["MoveList"]
        BANNER["OutcomeBanner"]
    end

    subgraph applayer["application/"]
        LG["LiveGame"]
        RSESS["ReplaySession"]
    end

    SC --> CTX
    GF --> CTX
    CTX --> APP
    APP --> NGS & PS & AS & RS
    NGS -- "onStart(configuration)" --> APP
    APP -- "factory.createLiveGame" --> LG
    APP -- "factory.createReplaySession" --> RSESS
    LG --> PS
    RSESS --> RS
    PS --> BOARD & CLOCK & MOVES & BANNER
    AS -- "onOpenGame(id)" --> APP
```

Two things this picture is meant to make obvious:

- **Screens do not talk to each other.** `NewGameScreen` reports a configuration
  upward and `ArchiveScreen` reports an id upward; `App` decides what that
  becomes. No screen imports another.
- **`LiveGame` sits below the UI, not inside it.** It has no idea React exists.
  `PlayScreen` subscribes to it, and could be replaced wholesale without the game
  noticing.

---

## Screen flow

`App.tsx` owns which screen shows and the lifetime of what that screen drives.
Games and replay sessions hold real resources — an engine worker, a running
timer — so every transition disposes what it replaces rather than leaving it to
each screen's unmount.

```mermaid
stateDiagram-v2
    [*] --> setup
    setup --> play: Start game
    setup --> archive: Browse championship games
    archive --> setup: Back
    archive --> loading: open a game
    loading --> replay: PGN parsed
    loading --> error: parse failed
    error --> archive: Back
    replay --> archive: Back
    play --> setup: New game

    note right of play
        disposes engine worker
        and ticker on exit
    end note
```


---

## A game, start to finish

The concrete path for one game against the engine — every hop from the click on
**Start** to a row in the library.

```mermaid
sequenceDiagram
    autonumber
    actor You
    participant NGS as NewGameScreen
    participant App as App.tsx
    participant GF as GameFactory
    participant LG as LiveGame
    participant Eng as EngineOpponent
    participant SF as Stockfish worker
    participant PS as PlayScreen
    participant Store as GameStore
    participant SQL as SQLite worker

    You->>NGS: choose colour, difficulty, time control
    NGS->>App: onStart(configuration)
    App->>GF: createLiveGame(configuration)
    GF->>Eng: new EngineOpponent(engine, difficulty)
    GF-->>App: LiveGame
    App->>LG: start()

    loop until the game ends
        LG->>PS: publish(state)
        You->>PS: drag a piece
        PS->>LG: submitMove(intent)
        LG->>Eng: requestMove(position, legalMoves, clock)
        Eng->>SF: UCI: position + go
        SF-->>Eng: bestmove
        Eng-->>LG: MoveIntent
        LG->>PS: publish(state)
    end

    LG->>PS: publish(state with outcome)
    PS->>PS: recordGame(state, details)
    PS->>Store: save(RecordedGame)
    Store->>SQL: INSERT ... (one statement)
    SQL-->>Store: ok
    App->>LG: dispose() on leaving the screen
```

Worth noticing:

- **`recordGame` is a pure function.** It turns game state into a storable
  record with no database, browser, or clock involved — which is why it is
  testable on its own.
- **The engine's move and yours take the same path.** Both arrive at `LiveGame`
  as a `MoveIntent` from an `Opponent`. The loop has no branch for which is
  which.
- **Disposal is `App`'s job, not the screen's.** Leaving the game tears down the
  worker and the ticker. Leaving that to unmount would eventually leak one.

---

## The turn loop

The abstraction the whole design turns on is `Opponent`. A person at the
keyboard and a search engine satisfy the same contract, so `LiveGame` runs **one**
loop rather than a branch per game mode.

```mermaid
sequenceDiagram
    participant UI as PlayScreen
    participant Game as LiveGame
    participant Opp as Opponent
    participant Rules as ChessRules
    participant Tick as Ticker

    Game->>Opp: requestMove({position, legalMoves, clock})
    alt human
        UI->>Game: submitMove(intent)
        Game->>Opp: offerMove(intent) resolves the pending promise
    else engine
        Opp->>Opp: UCI to Stockfish worker
    end
    Opp-->>Game: MoveIntent
    Game->>Rules: applyMove(position, intent)
    Rules-->>Game: new Position + legal moves
    Tick-->>Game: onTick(elapsedMs)
    Game->>UI: publish(state)
```

A human move resolves a pending promise; the engine's resolves from a worker.
A networked opponent would be a third implementation and the loop would not
change.


---

## How state reaches the screen

`LiveGame` publishes; it does not know who is listening.

```mermaid
flowchart LR
    LG["LiveGame"] -- "publish(state)" --> OBS["Observable<br/><i>application/Observable.ts</i>"]
    OBS -- "subscribe(listener)" --> HOOK["useObservableStore<br/><i>useSyncExternalStore</i>"]
    HOOK -- "state" --> PS["PlayScreen"]
    PS --> BOARD["ChessBoardView"]
    PS --> CLOCK["ClockPanel"]
    PS --> MOVES["MoveList"]
```

The subscription is the whole seam. `LiveGame` calls `publish()` after every
move, every tick, and every outcome; `useObservableStore` turns that into a
re-render. Nothing in `application/` imports React to make it happen, and a
different UI would subscribe the same way.

---

## Threads

Three execution contexts, each for a hard reason:

```mermaid
flowchart LR
    Main["Main thread<br/>React, rules, turn loop"]
    SF["Stockfish worker<br/>stockfish-18-lite-single"]
    SQL["SQLite worker<br/>sqlite.worker.ts"]
    OPFS[("OPFS<br/>chess-library.sqlite")]

    Main -- "UCI text" --> SF
    SF -- "bestmove" --> Main
    Main -- "SqlStatement[]" --> SQL
    SQL -- "rows" --> Main
    SQL --> OPFS
```

- **SQLite must be in a worker.** `createSyncAccessHandle`, which the persistent
  storage backend is built on, exists only in worker scope. On the main thread it
  is `undefined` and nothing could ever be saved. Keeping queries off the main
  thread is a side effect, not the reason.
- **Stockfish is in a worker** because search is CPU-bound and would otherwise
  freeze the board on every move it thinks about.
- The **single-threaded** engine build is deliberate: the threaded builds need
  `SharedArrayBuffer`, which needs COOP/COEP headers, which would cost the app
  its ability to deploy as plain static files.
