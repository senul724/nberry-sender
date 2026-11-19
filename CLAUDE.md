# CLAUDE.md

At the start of every session, read `memory.md` for project context before doing anything else.

Keep `memory.md` up to date as you work: record decisions (with the reason), stack and structure changes, how to run the app, current focus and next steps, and a one-line session log entry. Replace stale info instead of appending endlessly.

The backend lives at `/Users/senul/projects/nberry-vibe` (Go, `github.com/senul724/nberry-server-revamped`) and is the source of truth for every endpoint. Never invent an endpoint; check its handlers under `internal/` when unsure.
