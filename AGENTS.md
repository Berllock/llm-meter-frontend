# Frontend project guidance

- This is the frontend of LLM Meter Personal; the Java backend is the sibling
  `../llm-meter-personal`. Do not confuse it with the enterprise observability project.
- Follow `.context/AGENTS.md` and read `.context/current-state.md` before substantial
  work. The local link shares the existing project memory; do not recreate or
  promote canonical vault notes automatically.
- Use English for code, identifiers, UI text, documentation, test comments, and
  project memory. Explain work to the user in Portuguese.
- Keep feature-specific transport, domain rules, hooks, and components under
  `src/features`. Keep React presentation independent of desktop runtime APIs.
- Unknown metrics are not zero. Do not fill absent days with invented observations,
  add cached input to input totals, fabricate costs/quotas, or expose backend errors.
- The dashboard consumes `/api/usage/daily/collection`, with observed rows and
  source-wide session coverage. Never label partial observations as complete totals
  or turn session counts into token coverage percentages. Preserve hard failures,
  stale coverage labeling, and query/source isolation. Legacy endpoints remain strict.
- Add a brief English comment above new tests explaining what they validate.
  Run `npm run check` and relevant browser scenarios after behavioral changes.
- The desktop shell is Electron with a sandboxed renderer and narrow preload IPC.
  The main process owns Java startup, readiness, token-protected local requests,
  restart, and shutdown. Java 21 is currently installed separately; runtime bundling
  and installers remain future work. Preserve browser development mode.
- Do not stage, commit, push, publish, or modify global settings automatically.
