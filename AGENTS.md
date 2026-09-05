# TrueBites — working agreement

## Workflow

Every non-trivial change follows this order. Do not skip a stage, do not
merge two stages into one message.

1. **Brainstorm** — invoke `superpowers:brainstorming`. Anything touching UI
   also invokes `frontend-design`. Discuss until the design is agreed.
2. **Plan** — only after I approve the design. Write the plan to
   `docs/plan/YYYY-MM-DD-<topic>.md`. (Plans written before 2026-09-05 live in
   `docs/superpowers/plans/`; read them there, but write new ones to
   `docs/plan/`.)
3. **Execute** — only after I approve the plan.

Never jump straight to code, and never start implementing in the same message
where you present a design.

## Plans must be self-contained

A plan is written for an AI that has none of our conversation. It must be
executable start to finish **without asking me a single question**. Before
calling a plan done, reread it as that stranger and fix anything it could not
act on.

Every plan states, concretely:

- Exact file paths and line numbers for every change.
- The exact final copy for any label, button, or message — never "relabel the
  buttons", always `Sign In` → `Log In`.
- Exact component/prop/route names being added, renamed, or deleted.
- What is deliberately **out of scope**, and why.
- For deferred work ("Round 2"), the full decided detail — not just its name.
  A future round's items must be as specified as the current round's.
- Verification per task: the command to run and the expected result.

## Project boundaries and secrets

- TrueBites uses a React/Vite browser frontend, a Node/Express application
  backend, and managed Supabase services.
- Send business-data operations through the Express `/api` routes. The
  intentional browser-direct integrations are Supabase Auth, Google Maps
  JavaScript SDK, and Photon address search.
- Never read, print, expose, or commit secret values from `.env` files. When
  diagnosing configuration, report only whether a required variable is set.
- Browser code may use only public `VITE_*` credentials. Never expose
  `SUPABASE_SERVICE_KEY`, `GOOGLE_API_KEY`, or `GROQ_API_KEY` to the frontend.
- Keep `VITE_MAPS_BROWSER_KEY` and the backend `GOOGLE_API_KEY` as separate
  Google Cloud credentials. Restrict the browser key by HTTP referrer and keep
  the server key backend-only.
- Preserve all existing uncommitted work. Do not modify unrelated files or
  discard user changes while completing a task.

## Repo rules

- **I commit my own work.** Never run `git commit`, `merge`, `branch`, or
  `push` on your own initiative.
- Default branch for my work: `feature/map-visualization`.
- `docs/` is gitignored — plan files are untracked.
- Frontend unit tests must live in `frontend/src/lib/*.test.mjs`; that glob is
  what `npm run test:unit` runs. Anywhere else and they silently never run.
- Modules reading `import.meta.env` cannot be imported by `node --test` — test
  pages by reading source as text and asserting with `assert.match`.
