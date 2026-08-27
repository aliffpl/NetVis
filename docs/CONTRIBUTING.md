# Contributing

## Setup

```bash
git clone https://github.com/your-username/netvis.git
cd netvis
bun install
bun run dev
```

Verify: `bun run lint` (0 errors), `bun run test` (35/35 pass), `bun run typecheck` (0 errors).

## Code Conventions

- **TypeScript strict mode.** Zero `any` types in NetVis code. All interfaces in `src/types/index.ts`.
- **Zustand stores.** Four focused slices: topology, routing, telemetry, UI. No local `useState` for simulation-impacting data.
- **Immutable updates.** Always produce new object references. Use spread operators, never mutate.
- **`memo()` on custom React Flow nodes/edges.** Prevents re-renders during telemetry ticks.
- **`useMemo` for derived state.** Don't write decorated nodes/edges back to the store.
- **Tailwind utility classes.** No indigo/blue. Use `oklch` for custom colors.
- **Conventional Commits.** `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.

## Running Tests

```bash
bun run test          # Vitest — 35 tests
bun run lint          # ESLint
bun run typecheck     # tsc --noEmit
```

## Key Files

| File | Responsibility |
|------|---------------|
| `src/engine/routingAlgorithms.ts` | All five routing algorithms |
| `src/engine/telemetrySimulator.ts` | PRNG simulator + topology builder |
| `src/store/use*.ts` | Four Zustand store slices |
| `src/services/telemetry/ApiTelemetryService.ts` | Live API integration |
| `src/services/telemetry/liveNodeTargets.ts` | 17-node → RIPE Atlas target mapping |
| `src/app/api/ripe-atlas/route.ts` | API proxy route |
| `src/hooks/useNetworkSimulation.ts` | Debounced routing + decorated nodes |
| `src/hooks/useTelemetryStream.ts` | Polling loop + anomaly pruning |
