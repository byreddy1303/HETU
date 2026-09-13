# Repository working agreements

Every AI agent must read this file before making or pushing any change to this repository.

- After completing any user-requested change to this repository, commit all task-related changes and push them to `main` on `origin` before the final response.
- All changes must land on `main`. Do not create, commit to, or push any other branch unless the user explicitly asks.
- Before pushing, run `git status` and confirm `main` is current with `origin/main`; push using `git push origin main`.
- Never include unrelated pre-existing or user-authored changes in that commit. If committing or pushing fails, preserve the work and clearly report the exact blocker.