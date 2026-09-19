# Unreleased cutover draft — not executable or deployable

The `.draft` files retain the previous in-progress Clerk/frontend/domain port.
They are deliberately excluded from Python imports, TypeScript compilation, and
Vercel uploads. The live frontend continues using the legacy backend.

Do not enable this draft until identity migration, native notifications, planner
concurrency, shared-data authorization, parity tests, and recovery drills pass.
Known blockers include PIN authentication entropy, replayable reset tokens,
incomplete notification workers, and incomplete data contracts. Retaining this
work is not an endorsement of its security or production readiness.
