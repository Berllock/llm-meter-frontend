# LLM Meter Personal — Frontend

A local usage dashboard built with React, TypeScript, Vite, and TanStack Query.
The backend remains the sibling Java/Spring Boot project `../llm-meter-personal`.
This first milestone runs in a browser during development. The agreed product
architecture is desktop with Electron; the Electron shell, packaged Java runtime,
installer, and background process lifecycle are subsequent milestones.

## Run locally

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
The dev/preview proxies are not a production desktop integration: Electron will
need its own local API transport and process management.

## First milestone

- Inclusive period and time-zone filters; Today, 7-day, and 30-day presets.
- Presets follow the selected local day across midnight, checked every minute
  and when the window regains focus. Custom date ranges remain fixed.
- Period totals for input, output, cached input, and input plus output.
- Daily chart with metric selection and keyboard-accessible value details.
- Provider/day records with exact counts and an explicit unavailable state.
- Five-second polling while the window is visible; pause and manual refresh.
- Loading, empty, collection failure, and stale-data states. Previous data is
  clearly marked stale after a refresh error, never relabeled as a current result.
- Responsive layout, native form controls, reduced-motion support, and no external
  fonts, analytics, or demo data in the running application.

## Data contract and limits

The UI consumes `GET /api/usage/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&zone=...`.
It validates responses before display. Missing or null metrics never become zero;
empty coverage does not prove zero account-wide usage. Cached input is already a
subset of input and is not added to observed total tokens. Multiple providers are
aggregated by day without inventing missing day buckets. Raw error payloads are
not displayed.

Counters outside JavaScript's safe integer range are rejected rather than rounded.
Unrepresentable sums remain unavailable. Neither quota, remaining allowance,
model attribution, nor cost estimates are fabricated. Usage timing reflects local
recorded observations, subject to the backend's coverage and attribution rules.

Each request currently rereads the configured backend source. Polling is deliberately
limited to five seconds, has no overlapping retry loop, and pauses in background.
Local requests use `networkMode: 'always'` so they can work without an internet
connection. Changing filters cancels obsolete requests; each request has a 15-second
timeout. Future file watching, incremental collection, and server push should be
based on measured collection cost and correct handling of writes in progress.

## Layout

```text
src/
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

The React UI does not read local files or depend on Electron/Node APIs. This keeps
its domain and presentation reusable when the desktop shell is added. CSS and the
chart are native browser code; icons come from Lucide.

## Validation

```sh
npm run check          # Lint, unit/component tests, type checking, production build
npx playwright install chromium
npm run test:e2e       # Real-browser interactions with explicitly synthetic data
```

Each test has a short English comment describing its intent. Browser tests cover
filters, unknown/empty data, failure recovery, stale results, polling/pause,
responsive layout, and visual checkpoints. Screenshots and browser traces are
ignored under `test-results/`; no real session data belongs in fixtures.

## Next desktop milestones

1. Validate the dashboard against the local backend and real usage patterns.
2. Add the Electron shell, isolated renderer/preload boundary, and a narrow API
   bridge. Reuse the current components and data rules.
3. Manage the Java service lifecycle, readiness, local endpoint configuration,
   and shutdown; bundle a suitable Java runtime per target OS.
4. Add desktop packaging and measure startup time, memory, and collection cost.
5. Investigate file-change-driven updates, then model/cost/quota capabilities only
   when the provider data supports them.

These are planned milestones, not implemented features. Technology choices serve
the product and learning goals (including broad engineering skills for future
roles); no framework choice is a hiring guarantee.

## Project memory

The local ignored `.context` link points to this project's shared Obsidian memory.
Read `AGENTS.md` and that context at the next working session. Code and tests are
the implementation source of truth; only operational state and inbox observations
are captured automatically in the vault.
