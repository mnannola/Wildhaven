# Terrain-aware movement and hunting

This is the first part of giving animals a relationship with places: cover, crossings, and routes. It uses the existing landscape, including older saved worlds. Territories and dens now build on this layer; see HOMES.md.

## Terrain rules

| Ground        | Movement and detection                                                             |
| ------------- | ---------------------------------------------------------------------------------- |
| Open grass    | Fast movement and little concealment                                               |
| Woodland edge | Adjacent trees provide cover and slow movement; trees themselves remain impassable |
| River ford    | Walkable stepping stones, crossed at reduced speed                                 |
| Deep water    | Impassable, but does not block sight                                               |

Cover is derived from surrounding trees and capped at 60%. It reduces animal detection distance by up to 33%; moving animals conceal less, and close encounters still reveal animals when the sight line is clear. Solid trees block sight. Resource discovery continues to use nominal perception distance, and the player can still see animals in cover.

At maximum cover, woodland movement factors are 94% for deer, 88% for wolves, and 82% for bears. Ford factors are 72%, 76%, and 82%, respectively. These multiply existing gait, health, fatigue, and age effects. Woodland-edge grass has a subtle shadow; the inspector's **Surroundings** section shows ground, cover, and footing. The detection overlay remains the nominal maximum radius; actual animal detection depends on cover.

## Routes and pursuits

Ordinary routes now use deterministic A\* with terrain travel-time costs, so a slightly longer route over fast ground can beat a slow crossing. Water and tree cells remain excluded. Routes align to tile centers when necessary to avoid clipping corners.

Seeing prey no longer permits straight-line movement through water. Hunters pursue directly only along a walkable segment; otherwise they route around obstacles and through available fords. Detour routes refresh when the target changes tile or after 0.75 simulated seconds, rather than recomputing an entire route every step. Hidden prey are pursued using their last remembered position. Unreachable food hunts are rejected or abandoned, and melee still requires a clear walkable segment.

Fleeing animals search a bounded reachable neighborhood. Escape scoring considers distance from danger, cover, broken sight lines, route cost, and nearby remembered herd positions. Routes that approach danger are penalized. Animals cannot choose an unreachable escape point across water. A final movement-segment check also blocks stale or invalid direct paths, including old saved paths.

Lone wolves also avoid remembered bear danger when choosing food and drinking destinations, including routes that approach a bear. A nearby fit group of four can still confront the bear. This prevents repeated fleeing from and returning to the same unsafe bank.

## Saves

Format 8 adds pursuit route-refresh state so save/load preserves a chase's future behavior. Formats 1–7 still load, with their existing lifecycle and family migrations. Terrain is not regenerated. An animal left inside water or a tree by an older movement bug is moved to the nearest walkable cell on load, preserving identity, health, family data, and statistics. New worlds still start empty.

## Validation

All 106 tests and the production build pass. Coverage includes sight across water, tree occlusion, concealment and motion, weighted routes, river/ford pursuits with deterministic save continuation, unreachable prey, movement collision guards, crossing speed, reachable cover-seeking escapes, bear-safe resource selection, old-save recovery, and inspector output. Existing combat, family, survival, and animation checks remain enabled. The instrumented renderer's terrain, texture, sex-appearance, and family-animation checks pass at 50/100/200 initial animals.

Two 1,200-second diagnostic reserves ran with normal resources, needs, perception, and reproduction:

| Scenario           | Initial deer/wolves/bears | Births            | Final living deer/wolves/bears | Deaths                          |
| ------------------ | ------------------------- | ----------------- | ------------------------------ | ------------------------------- |
| Mixed, seed 4721   | 24 / 3 / 2                | 25 deer, 3 wolves | 34 / 6 / 2                     | 9 deer predation, 6 deer thirst |
| Deer-only, seed 44 | 20 / 0 / 0                | 33 deer           | 51 / 0 / 0                     | 2 deer thirst                   |

These are navigation and survival diagnostics, not a claim of ecosystem equilibrium. The mixed run retained 25 living offspring, including two dependent orphans. Water discovery and long-run population balance still need tuning; no water, food, or replacement animals were supplied by the harness after initialization. Reports are in `balance-results/terrain-*.json`.

```powershell
npm test
npm run build
npm run perf:sim -- terrain 120
npm run perf:render -- terrain moving
npm run balance -- mixed 4721 1200 terrain
npm run balance -- herbivores 44 1200 terrain
```

CPU benchmark reports do not measure actual browser/GPU FPS. These changes intentionally alter encounters and escape outcomes; historical population and checksum reports describe the earlier rules rather than guaranteeing identical results.
