# Documentation

The [top-level README](../README.md) says what the app is, how to run it, and
what it can do. These go deeper, one question each.

| Document | Answers |
| --- | --- |
| [ARCHITECTURE-AND-REVIEW.md](ARCHITECTURE-AND-REVIEW.md) | How is it built? Which principles does the design honour, and where does it knowingly break them? What did a DevSecOps review find? |
| [FLOWS.md](FLOWS.md) | Which piece talks to which? What happens between clicking **Start** and a finished game landing in the library? |
| [DATA-MODEL.md](DATA-MODEL.md) | What is stored, where does it live, and how does a row get written? |
| [LESSONS-LEARNED.md](LESSONS-LEARNED.md) | What broke, what actually caused it, and what was the wrong explanation that looked right first? |
| [SUPPLY-CHAIN.md](SUPPLY-CHAIN.md) | What does the build enforce, why, how do I audit it, and what would quietly undo it? |
| [DEPLOYMENT.md](DEPLOYMENT.md) | How does it get to Azure, and how do I set that up from scratch? |
| [PHASE-2-UI-ARCHITECTURE.md](PHASE-2-UI-ARCHITECTURE.md) | How does the Phase 2 redesign apply Clean Architecture, SOLID, DRY, DIP, and SRP, and what trade-offs were intentional? |

Two more live outside this folder because convention puts them there:

- [../SECURITY.md](../SECURITY.md) — the threat model and how to report a
  vulnerability. GitHub surfaces this one in the repository's Security tab.
- [../CLAUDE.md](../CLAUDE.md) — working directives: commit format, the secrets
  rule, and the lock file procedure.

## If you are looking for

- **The database schema** — [DATA-MODEL.md § Schema](DATA-MODEL.md#schema),
  with an entity diagram. Source of truth is
  `src/infrastructure/sqlite/schema.ts`.
- **A diagram of how the React components connect** —
  [FLOWS.md § How the pieces are wired](FLOWS.md#how-the-pieces-are-wired).
- **One game, start to finish** —
  [FLOWS.md § A game, start to finish](FLOWS.md#a-game-start-to-finish).
- **Why the board broke on the react-chessboard 5 upgrade** —
  [LESSONS-LEARNED.md](LESSONS-LEARNED.md#react-chessboard-4--5-the-migration-and-a-two-day-dead-end),
  including the remedies that do not work.
- **How to regenerate the lock file without breaking the deploy** —
  [SUPPLY-CHAIN.md § Dependencies install from the lock](SUPPLY-CHAIN.md#2-dependencies-install-from-the-lock).
