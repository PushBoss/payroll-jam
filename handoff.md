# Handoff Redirect

The active multi-agent handoff file for this repo is:

- [docs/TASK_HANDOFF.md](docs/TASK_HANDOFF.md)

Use that file as the single coordination source for Codex, Claude, Gemini, and other AI tools.

Why this redirect exists:
- this root file previously contained outdated architectural planning
- the repo now uses `docs/TASK_HANDOFF.md` as the maintained operator handoff
- redirecting here helps prevent divergent instructions across tools

Recommended startup order for any agent:
1. Read `docs/TASK_HANDOFF.md`
2. Read `AGENTS.md`
3. Read `gitnexus://repo/payroll-jam/context`
4. Run `git status --short`
