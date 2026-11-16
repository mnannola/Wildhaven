# Performance at 50, 100, and 200 animals

Measured on this Windows host with Node v22.20.0. These are CPU timings, not a promise of browser frame rate. Raw measurements are generated locally in `performance-results/`, which is ignored by Git and is not distributed with the source. The tables below retain the historical results.

## Simulation results

The same seeded worlds were measured before and after optimization: seed 4721, approximately 85% deer, 10% wolves, and 5% bears, spread across the map. Each run warms up for 20 steps, then measures 120 steps of 0.1 simulated seconds. Population counts are initial counts; normal predation remains enabled.

| Initial animals | Before mean step | After mean step | Before p95 | After p95 | Speedup |
| --- | ---: | ---: | ---: | ---: | ---: |
| 50 | 6.38 ms | 2.19 ms | 23.77 ms | 3.92 ms | 2.9x |
| 100 | 11.98 ms | 3.82 ms | 37.55 ms | 6.05 ms | 3.1x |
| 200 | 34.96 ms | 10.28 ms | 65.08 ms | 14.69 ms | 3.4x |

Sources: `baseline-clean.json` and `final.json`. Serialized final-world SHA-256 checksums matched the original at every population size when this optimization was measured, including animal behavior, resources, statistics, and memories. These reports predate aging and use save format 5. The benchmark checks matching 120-step spread runs only when save versions agree; it explicitly skips historical hash comparisons across different save versions.

A longer 600-step run (60 measured simulated seconds) averaged 1.85 / 3.81 / 9.17 ms, with p95 of 3.48 / 5.96 / 12.98 ms. It ended with 47 / 95 / 190 living animals. This is a short sustained load check, not a long-term population balance test; see `BALANCE.md` for the latter.

A crowded layout also ran for 300 measured steps with inclusive method profiling enabled. At 200 initial animals it averaged 17.35 ms, with p95 34.11 ms and 194 survivors. Profiling itself adds overhead, so this is a stress diagnostic rather than a direct comparison with the clean table. Dense packs and herds still increase sight and coordination work. High simulation speeds can require multiple steps in one browser frame.

## Changes

- Compute nearby herd members once per regroup destination search.
- Reuse resource memory entries and index remembered resources and animal IDs during perception.
- Avoid repeated terrain lookups along sight rays while retaining the original sampling rules; reject out-of-range sightings with squared distances.
- Update sprite properties only when they change and remove unused overhead text objects.
- Skip rebuilding fish graphics when simulation time and fish catches are unchanged.
- Rebuild terrain only when a visible terrain property changes, including forage appearance thresholds, rather than whenever food quantities change.

No gameplay rates or decision rules were intentionally changed.

## Rendering and live measurements

The render harness executes the actual scene update with instrumented display objects. It verifies generated animation texture references and terrain cache invalidation. At 200 animals over 300 moving frames, texture updates fell from an unconditional 60,000 to 8,930. Terrain fill-rectangle calls fell from approximately 53,132 to 2,268 after terrain caching. Unchanged paused sprites issue no repeated property setters after their initial setup.

This harness excludes real Phaser display-object costs, browser layout, rasterization, and GPU drawing. Its CPU timings must not be read as actual frame rate. Real browser FPS could not be verified here because headless Edge did not expose its debugging endpoint. The optional browser benchmark is included for a host where Chromium debugging works; its SwiftShader software rendering also differs from a normal hardware-accelerated session.

Enable **Paths & detection** in the game to see live FPS, simulation step CPU time, and scene update CPU time. Scene update timing excludes simulation and GPU drawing; timings are smoothed. Use actual browser FPS to assess the experience on the player's machine.

## Reproduce

```powershell
npm run perf:sim -- trial
npm run perf:sim -- sustained-trial 600
npm run perf:sim -- clustered-trial 300 profile clustered
npm run perf:render -- trial moving
npm run perf:render -- trial paused
npm run perf:browser -- trial
npm test
npm run build
```

`perf:browser` needs a Chromium executable (set `PERF_BROWSER` if needed) and free local ports 5189 and 9287. It launches a temporary development server and an isolated headless browser profile. Reports are written as JSON under `performance-results/`. The simulation benchmark runs without a baseline. To enable optional local behavior comparisons, run `npm run perf:sim -- baseline-clean` before changing simulation code, then run `npm run perf:sim -- trial` afterward. Preserve that local baseline between runs; generating it again replaces the comparison reference.
