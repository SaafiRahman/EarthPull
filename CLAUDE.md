# EarthPull

The project's long-term memory is the Obsidian vault in `vault/`.

## Start of every session
Read these before doing anything else:
1. `vault/00 Home.md`
2. `vault/Tasks.md`
3. The latest note in `vault/Dev Log/` (named YYYY-MM-DD)

## During every session
Track tasks in the vault as you do them, not only at the end: add a task to `vault/Tasks.md` when you start it (mark it in progress), tick it off when it's done, and note blockers in the day's Dev Log as they happen.

## End of every session
1. Write a Dev Log note `vault/Dev Log/YYYY-MM-DD.md`: what was done, what broke, what's next. If one already exists for the day, add to it. Link it from `vault/00 Home.md`.
2. Tick off finished tasks in `vault/Tasks.md` and add new ones.
3. Record new decisions and open questions in `vault/Decisions.md`, each with a date and a reason.
4. Update `vault/00 Home.md` (current phase, what to do next) and any other note the work changed.

## Vault rules
- The vault is committed to GitHub. Never put secrets (API keys, passwords, tokens) or personal information in it.
- Use `[[wikilinks]]` between notes and absolute dates.

## Git rules
- Commit and push only as the developer, using their local git config (user.name / user.email) and their GitHub credentials, to this repo's existing `origin` remote.
- Never set or change git author/committer info, and never commit as a Claude or bot account.
- Never add "Co-Authored-By: Claude" or "Generated with Claude Code" lines to commit messages or PR descriptions.
- Ask the developer before every push.
