# Territories and dens

Animals can establish familiar home sites after discovering nearby food and water. New reserves still start empty. Sites use existing terrain, do not create resources, and do not block movement.

| Species | Shared place                |    Range | Behavior                                                         |
| ------- | --------------------------- | -------: | ---------------------------------------------------------------- |
| Wolves  | One den per pack            | 12 tiles | Return, rest, patrol, scent-mark, guard the core, and raise pups |
| Bears   | One den per adult/family    | 10 tiles | Return, rest, patrol, mark, and warn nearby rivals               |
| Deer    | One gathering area per herd |  8 tiles | Return and rest together; gathering areas are not defended       |

## Finding and using a home

Healthy adults choose a locally visible, reachable dry site near remembered resources, with a preference for woodland shelter. Fords and river tiles cannot become home sites. Site selection does not reveal new resources or refresh memory ages. Nearby residents can share a small set of remembered food/water locations every ten simulated seconds, preserving the original sighting age; distant members do not receive those memories.

Animals return between survival activities, rest at home when practical, and gravitate back after ranging far away. Late pregnancy encourages a return to shelter, but births occur wherever the mother actually is. Food, thirst, severe fatigue, and immediate threats retain priority. The range is an influence, not a fence.

Predators occasionally travel through familiar ground and scent-mark. Residents can face and warn visible rivals near the core of a home; healthy visitors yield when they encounter the resident owner. This first territory system uses warnings and avoidance, without adding same-species combat or damage bonuses. Animals can risk entering another group's core when resources are critical.

Established predators can make drinking banks persistently dangerous. Resource choice accounts for remembered threats along the approach as well as at the endpoint. Deer with critical thirst (90+) or hunger (95+) reduce their avoidance distance to three tiles, taking a survival risk while still fleeing immediate danger. No thirst, hunger, health, or resource quantities are reset to make homes work.

## Families and ownership

Newborns inherit the maternal home. Dependent wolf pups can wait and rest at the den while their mother forages; she returns periodically between survival activities to nurse them. Urgently needy pups can still seek their mother or resources. Bear cubs and fawns continue following their caregiver; bear cubs leave the maternal home assignment at adulthood.

Pack/herd merges retain one shared home, favoring a site already sheltering young. Obsolete home travel plans are canceled when the group's home changes. A surviving member can take over a wolf/herd site after the founder dies or is deleted.

Empty or invalid sites become abandoned, appear faded, and can be reclaimed by the same species. Unclaimed abandoned markers fade out after 240 simulated seconds, and stale references are removed. Reset animals also clears home sites while keeping terrain and resources.

## Inspecting places

- Home markers are natural hollows/rock dens for predators and grass beds for deer.
- Click an unoccupied marker, or select an animal and choose **View home**.
- **Show range** in the home inspector enables the overlay and centers the camera.
- **Paths & detection** also shows the selected animal's home range and predator core.
- The home inspector lists residents, dependent young, range, and occupancy. World activity counts active sites and abandoned homes.

## Saves and verification

Format 9 saves sites, ownership, knowledge, check/return timers, and the home update clock. Formats 1–8 remain loadable and begin without invented home history. Invalid site/reference data is rejected. Current saves preserve deterministic continuation, including home patrols and family behavior.

Validation covers establishment for every species, survival priorities, pack/herd sharing, pack mergers, bear independence, abandonment/reclamation, return/rest/patrol/guard behavior, den pups, birth inheritance, local resource sharing, risk-aware water choice, save migration, malformed saves, inspector output, and map markers. Existing combat, perception, reproduction, movement, and animation tests remain enabled.

All 123 tests and the production build pass. The instrumented renderer checks marker caching, home selection/ranges, marking/guard poses, and den-pup resting animations, alongside existing sprite and family checks. Three reserves ran for 1,200 simulated seconds with natural resources and needs; each final save round-tripped exactly:

| Scenario           | Initial deer/wolves/bears | Final deer/wolves/bears | Active gathering areas / wolf dens / bear dens | Losses                          |
| ------------------ | ------------------------- | ----------------------- | ---------------------------------------------- | ------------------------------- |
| Mixed, seed 4721   | 24 / 3 / 2                | 35 / 2 / 2              | 2 / 1 / 2                                      | 6 deer predation, 1 wolf hunger |
| Mixed, seed 44     | 24 / 3 / 2                | 63 / 0 / 3              | 2 / 0 / 2                                      | 3 wolves hunger                 |
| Deer-only, seed 44 | 20 / 0 / 0                | 50 / 0 / 0              | 3 / 0 / 0                                      | 1 deer thirst                   |

These runs confirm naturally established homes and family persistence, not population equilibrium. Wolf hunting/food balance still needs work: all three wolves starved in one seed. Wolf births and den-pup routines are covered by focused behavior tests; these particular mixed runs had no wolf births. A bear cub was born in the seed-44 mixed reserve.

The simulation CPU smoke test averaged 2.62 / 6.05 / 17.64 ms per step at 50 / 100 / 200 initial animals, with p95 of 5.34 / 9.93 / 26.22 ms. Those are CPU timings, not browser FPS; high populations at 10x remain a performance concern. Reports are in the generated `homes-*` balance files and `performance-results/homes.json`.

```powershell
npm test
npm run build
npm run perf:render -- homes moving
npm run perf:sim -- homes 120
npm run balance -- mixed 4721 1200 homes
npm run balance -- herbivores 44 1200 homes
```

Generated reports remain local under the ignored `balance-results/` and `performance-results/` folders. Long-run population equilibrium and hardware-accelerated browser FPS remain separate validation work.
