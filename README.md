# LLM Meter Personal — Frontend

A local usage dashboard built with React, TypeScript, Vite, and TanStack Query.
The backend remains the sibling Java/Spring Boot project `../llm-meter-personal`.
The Electron desktop shell starts and stops its own Java backend. The browser
workflow remains available. Linux x64 portable releases bundle Java and require no
Java, Maven, or Node installation to run. See [distribution instructions](docs/distribution.md).

## Run the desktop application

Development prerequisites: Node.js 22.12+, npm, Java 21, and Maven available in the
terminal. Linux has been validated; macOS remains unverified and the preparation
script currently rejects Windows. Keep the frontend and backend sibling folders.

```sh
npm ci
npm run desktop
```

This builds the executable backend JAR, React assets, and Electron sources, then
opens the application. No separate Spring or Vite server is required. Close any
existing desktop window before launching updated code: the single-instance guard
otherwise focuses the already-running application. The first
Electron launch can download its runtime. After preparing, `npm run desktop:start`
reopens the existing build; rerun `npm run desktop` after source changes.

Desktop startup discovers existing default sources at `~/.codex/sessions` and
`~/.gemini/antigravity/brain`. Use **Choose sessions folder** for Codex and
**Choose Antigravity brain folder** for Antigravity; each source is saved separately
in Electron's user-data settings. Existing Codex-only settings remain readable.
**Restart service** recovers from startup or process failures. No usage history is
persisted by this setting. Invalid source contents still yield a safe collection failure. Valid identified
sessions without counters are reported as pending alongside proven observations.

Java binds to loopback on an OS-selected free port, independent of an IDE backend
on 8080. Readiness is published only after Spring is ready. Main-process requests
carry a random per-launch token; port and token stay outside the renderer. Closing
the application terminates only its owned Java process, escalating after five
seconds if needed. Abrupt process kills/system crashes are not covered by graceful
shutdown; there is no tray/background service in this milestone.

The renderer is sandboxed and context-isolated, with no Node access. A narrow
preload bridge supports usage reads, cancellation, state, restart, and native folder
selection; IPC accepts only the application top-level frame. Production assets use
relative paths and a local content security policy. Browser mode uses its existing
same-origin HTTP transport.

Optional development overrides:

- `LLM_METER_JAVA`: Java executable path, for example an installed Java 21 binary.
- `JAVA_HOME`: runtime installation used when no explicit executable is configured.
- `LLM_METER_BACKEND_PROJECT`: backend project path for preparation.
- `LLM_METER_SESSIONS_DIRECTORY`: initial Codex source override (not automatically saved).
- `LLM_METER_ANTIGRAVITY_BRAIN_DIRECTORY`: initial Antigravity brain source override.
- `LLM_METER_USER_DATA_DIR`: isolated settings directory, also supported by packaged builds.
  Java and source overrides above apply only to development; packaged builds use
  the included runtime and the normal saved source selection.

Preparation resolves `java.home` from the backend directory and writes an ignored,
machine-local runtime locator beside the JAR. This supports project-based version
managers such as asdf when Java later starts from a temporary working directory.
Moving/removing that runtime requires preparing again or setting the Java override.
The JAR and locator under `resources/backend/` are generated artifacts, not installers.

## Run in a browser

Use Node.js 22.12+ (Node 24 LTS recommended) and npm.

1. Start the backend with exactly one configured Codex source. For example, from
   `../llm-meter-personal`:

   ```sh
   mvn spring-boot:run -Dspring-boot.run.arguments="--server.address=127.0.0.1 --llm-meter.codex.sessions-directory=/home/berllock/.codex/sessions"
   ```

   Alternatively, keep your existing IDE Spring configuration running.
   Change the example path for your own computer. Do not configure `session-file`
   and `sessions-directory` together.

2. From this frontend directory:

   ```sh
   npm ci
   npm run dev
   ```

3. Open **http://127.0.0.1:5173**.

Vite forwards `/api` to `http://127.0.0.1:8080` in development and preview. To use
another backend port, copy `.env.example` to `.env.local`, set
`LLM_METER_API_TARGET`, and restart Vite. The value configures the local proxy;
it is not a frontend secret. No backend CORS changes are required for this setup.
`npm run preview` previews the production build at `http://127.0.0.1:4173`.
The desktop bridge bypasses these Vite proxies; its backend has its own private port.

## First milestone

- Agent selection: all configured agents, Codex, or Antigravity. Cards, chart,
  table, and coverage use the same query scope; caches stay isolated by agent.
- Inclusive period and time-zone filters; Today, 7-day, and 30-day presets.
- Presets follow the selected local day across midnight, checked every minute
  and when the window regains focus. Custom date ranges remain fixed.
- Period totals for input, output, cached input, and input plus output.
- Daily chart with metric selection and keyboard-accessible value details.
- Provider/day records with exact counts and an explicit unavailable state.
- Five-second polling, pause, and manual refresh. Desktop polling continues while
  minimized or hidden; browser polling pauses in background.
- Loading, empty, collection failure, and stale-data states. Previous data is
  clearly marked stale after a refresh error, never relabeled as a current result.
- Responsive layout, native form controls, reduced-motion support, and no external
  fonts, analytics, or demo data in the running application.

## Data contract and limits

The UI consumes `GET /api/usage/daily/collection?from=YYYY-MM-DD&to=YYYY-MM-DD&zone=...`.
Optional `provider=CODEX` or `provider=ANTIGRAVITY` selects an agent before backend
collection. Without it, normalized observations from all configured agents are
combined in the dashboard. Antigravity input is normalized to include cached reads;
see the backend [integration contract](../llm-meter-personal/docs/antigravity-integration.md).
The response echoes the period and includes `usage`, `coverage` per provider, and
`status` (`COMPLETE` or `PARTIAL`). Legacy array and cumulative endpoints remain
strict and are not used by the dashboard.
It validates responses before display. Missing or null metrics never become zero;
empty coverage does not prove zero account-wide usage. Cached input is already a
subset of input and is not added to observed total tokens. Multiple providers are
aggregated by day without inventing missing day buckets. Raw error payloads are
not displayed.

Counters outside JavaScript's safe integer range are rejected rather than rounded.
Unrepresentable sums remain unavailable. Neither quota, remaining allowance,
model attribution, nor cost estimates are fabricated. Usage timing reflects local
recorded observations, subject to the backend's coverage and attribution rules.

Each request rediscovers the configured files and reads their bytes to validate
content. A bounded in-memory backend cache reuses unchanged parsed observations;
it does not persist history or eliminate disk reads. Polling is deliberately
limited to five seconds and has no overlapping retry loop. Browser polling pauses
in background; desktop polling continues while minimized or hidden and can be
paused with Auto-refresh. This keeps collecting from files while you use another
application, at the cost of continued source reads while the desktop is open.
Local requests use `networkMode: 'always'` so they can work without an internet
connection. Changing filters cancels obsolete requests; each request has a 15-second
timeout. Future file watching, incremental collection, and server push should be
based on measured collection cost and correct handling of writes in progress.

Build the portable Linux release with `npm run desktop:dist`; verify it with
`npm run test:packaged`. Build requirements and generated artifact paths are
documented in [docs/distribution.md](docs/distribution.md).

## Layout

```text
desktop/                       Electron main, preload, settings, Java lifecycle
shared/                        Renderer/main bridge types
scripts/                       Backend preparation and real desktop verification
src/
  desktop/                     Optional bridge adapter and readiness state
  app/                         Application composition and query provider
  features/usage/
    api/                       HTTP transport and runtime contract validation
    model/                     Date, metric, and aggregation rules
    hooks/                     Query lifecycle and refresh policy
    components/                Dashboard, filters, chart, and records
  test/                        Shared test setup
  styles.css                   Responsive visual system
e2e/                           Browser scenarios with synthetic API responses
```

The React UI never reads local files or imports Electron/Node APIs. Its optional
transport bridge preserves reusable domain and presentation code. CSS and the
chart are native browser code; icons come from Lucide.

## Validation

```sh
npm run check          # Lint, unit/component/lifecycle tests, UI and desktop builds
npx playwright install chromium
npm run test:e2e       # Real-browser interactions with explicitly synthetic data
npm run desktop:prepare
npm run test:desktop   # Real Electron + Java, synthetic sessions, desktop display required
```

Each test has a short English comment describing its intent. Browser tests cover
filters, unknown/empty data, failure recovery, stale results, polling/pause,
responsive layout, and visual checkpoints. Screenshots and browser traces are
ignored under `test-results/`; no real session data belongs in fixtures.

## Next milestones

1. Validate provider formats and strengthen multi-agent source workflows.
2. Define reliable project/session attribution across agents before adding project
   filters; do not infer ownership from a folder basename alone.
3. Define durable history and model/cost/quota capabilities only where supported
   by validated source data.
4. Improve the dashboard around these workflows. Distribution polish is deferred
   until core integrations and product features are ready.

There is no database or new historical store. Calendar coverage still depends on
available session observations. Collection validates the entire source before date
filtering. Valid identified sessions without counters stay pending; malformed data,
unsafe attribution, conflicting copies, and other hard failures still return 503.
Coverage counts unique source sessions, not files, token percentages, or sessions
within the selected date range. Pending usage cannot yet be attributed to a date.
`COMPLETE` means no pending sessions in this source snapshot, not complete billing
or account-wide usage; unknown metrics remain unavailable.

The UI labels values as observations and warns about partial coverage, including
pending-only periods without invented zeros. Each collection rechecks pending files.
Hard failures retain the last successful collection and its coverage in memory,
explicitly marked stale/current coverage unknown. This cache is scoped to the same
period and source generation and does not survive an application restart. Token
metric controls apply to the chart and its observed-token summary; cards/table
retain all metrics. Full backend contract: `../llm-meter-personal/docs/usage-coverage.md`.

## Project memory

The local ignored `.context` link points to this project's shared Obsidian memory.
Read `AGENTS.md` and that context at the next working session. Code and tests are
the implementation source of truth; only operational state and inbox observations
are captured automatically in the vault.
