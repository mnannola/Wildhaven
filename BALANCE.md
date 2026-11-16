# Ecosystem balance pass

Validation uses the real simulation at 0.1-second steps, without revealing resources to animals, replacing deaths, or changing their needs after spawning. Each run lasts 1,200 simulated seconds (20 minutes). All initial animals retain their seeded personalities. No animals are added during a run.

## Matched results

Mixed reserves start with 24 deer, 3 wolves, and 2 bears. Deer-only reserves start with 20 deer.

| Scenario | Seed | Before: survivors (deer/wolves/bears) | After: survivors | Before: thirst deaths | After: thirst deaths |
| --- | --- | --- | --- | --- | --- |
| Mixed | 4721 | 15 / 3 / 2 | 14 / 3 / 2 | 3 | 0 |
| Mixed | 44 | 10 / 3 / 2 | 14 / 3 / 2 | 8 | 0 |
| Deer only | 4721 | 20 / 0 / 0 | 20 / 0 / 0 | 0 | 0 |

All deaths in the two tuned mixed runs were predation, with no hunger deaths. Wolves still needed to hunt: the two runs killed 10 deer each. Bears caught 34 and 32 fish. Grass finished at 98–99% of capacity; fish at 92–96%. This is a modest population, not a carrying-capacity test.

## Additional validation

| Scenario | Seed | Initial population | Survivors | Hunger deaths | Thirst deaths |
| --- | --- | --- | --- | --- | --- |
| Mixed, additional seed | 101 | 24 / 3 / 2 | 11 / 3 / 2 | 0 | 0 |
| Predator-heavy | 4721 | 12 / 6 / 2 | 4 / 4 / 2 | 2 wolves | 0 |

The crowded run deliberately has too few deer for six wolves. Scarcity and predator losses remain possible. This tuning does not promise that every population mix survives.

## Changes

- Urgent needs interrupt an action plan only when they outweigh its current goal. Being both hungry and thirsty previously could keep restarting the shoreline safety check without ever drinking.
- Resource selection rejects unreachable locations and considers alternative banks when a direct-looking route requires a long detour.
- Animals without known resources search farther in a consistent direction, turn away from map edges, and reject excessive search detours.
- Water memories last 900 seconds instead of 300. Static shorelines are remembered longer than transient food supplies.
- Social regrouping stops when hunger or thirst exceeds 55. Pack hunt recruitment requires hunger of at least 50 rather than 30.
- Deer avoid passive bears within 4 tiles, while detecting a bear hunting them at their full perception radius. A distant fishing bear no longer makes the whole shoreline unusable.
- Grass regrowth is 0.04 units per tile per second instead of 0.12. Fish recovery is 0.0125 per section per second instead of 0.025.

Hunger/thirst accumulation, sparse food-patch density, 50-unit carcasses, doubled carcass decay, and the single-wolf/four-wolf combat rules remain intact.

## Reproduce and tune

Rates and thresholds are centralized in `src/balance.ts`.

```text
npm run balance -- mixed 4721 1200 review
npm run balance -- mixed 44 1200 review
npm run balance -- herbivores 4721 1200 review
npm run balance -- crowded 4721 1200 review
```

Reports are written to `balance-results/`, which is ignored by Git. Historical local `baseline-*` reports recorded the original runs, and `validated-*` reports recorded the final tuning summarized above. Raw reports are generated artifacts and are not distributed with the source. Simulation durations and populations are explicit in each report; elapsed wall-clock time is not a rendering FPS benchmark.

These reports predate reproduction. They establish a healthier short-to-medium observation window rather than an indefinite equilibrium. Reproduction is now implemented; see REPRODUCTION.md for subsequent family-behavior runs and their limits.
