# Reproduction and dependent young

Reproduction is enabled by default. Add adult animals of both sexes, then let them discover food and meet. The inspector shows sex, breeding readiness, parents, caregiver, pregnancy, and dependent young. Births happen through the simulation; there is no automatic replacement of deaths.

Sex is also visible in the world: adult male deer have antlers; females and fawns are antlerless in every pose, including sleep, feeding, movement, awareness, collapse, and carcass stages. Male wolves and bears have darker coats and slightly larger builds than females. Juvenile male deer gain antlers at adulthood. These art differences do not change combat, speed, or fertility, and apply to existing saves automatically. The renderer harness checks all antlerless texture variants, pose selection, predator size/coat differences, and coat restoration after a damage flash.

Family behaviors also have dedicated animations for all species: courtship head dips and tail movement, nursing nuzzles with a coordinated maternal posture, mothers looking toward stragglers while waiting, and young resting with tucked legs, open eyes, ear flicks, and breathing. Animals face the relevant family member. Feeding, drinking, fishing, sleep, movement, and combat keep visual priority over maternal nursing poses. These animations are driven by current actions and simulation time, freeze on pause, follow game speed, and resume from existing saves without adding overhead text or changing simulation rules.

## Mating and pregnancy

Only adults breed; juveniles and elders do not. A pair must be the same species, opposite sexes, unrelated as parent/offspring or shared-parent siblings, and meet through local sight and reachable terrain. Both need health of at least 75, hunger/thirst no greater than 50, and fatigue no greater than 55. Recent attacks, active hunting, fighting, fleeing, recovery, and raising dependent young prevent mating.

Animals must know a nearby food source: stocked grass for deer; carcasses or prey for wolves; fish, carcasses, or prey for bears. Food knowledge comes from existing memories. This is an opportunity to raise young, not a guarantee that supplies will last. Female adults check for mates at most every 10 simulated seconds. Courtship requires three seconds together and is interrupted when conditions change. Pregnancy continues afterward, with 20% greater hunger accumulation for the mother.

All times below use the existing four-minute simulated day:

| Species | Pregnancy | Litter | Female recovery after birth | Weaning | Adulthood |
| --- | ---: | ---: | ---: | ---: | ---: |
| Deer | 1 day | 1–2 | 2 days | 1.2 days | 2 days |
| Wolf | 1 day | 1–3 | 3 days | 1.8 days | 3 days |
| Bear | 2 days | 1–2 | 4 days | 2.4 days | 4 days |

Males also receive a species recovery interval after conception. Pregnancy stores the father's identity and trait snapshot, so his death or removal does not erase ancestry or change inheritance. The mother's death ends pregnancy.

## Young and caregivers

Young are born near their mother, with age zero and a blend of parental traits plus bounded seeded variation. Deer join her herd and wolves join her pack. Births are counted separately from player additions.

Before weaning, young seek their mother using sight or her recent remembered position. They nurse when close and safe, reducing hunger/thirst while increasing her hunger/thirst. Mothers cannot nurse while hunting, fleeing, fighting, or too depleted. Mothers pause ordinary travel when visible dependents fall behind; urgent survival needs still take priority. Milk costs track the nourishment actually transferred rather than a flat fee per frame.

Young gradually gain movement speed, defensive attack strength, and sprite size as they mature. They have lower food/water needs, avoid confronting predators, cannot initiate food hunts, and do not count toward the four-wolf defense requirement. Weaned juveniles feed independently while staying near family when needs allow. At adulthood they stop following. Maternal death or deletion releases young to independent survival; there is no automatic adoption or guaranteed orphan survival.

Juvenile carcasses contain 15–50 meat units according to maturity at death. Their saved capacity is used by the inspector and carcass visuals. Adult carcasses remain 50 units, and decay rates are unchanged.

## Population controls

The left sidebar has **Reproduction → Natural birth limit**, default **200 living animals**. It is saved with the world and can be set from 0 to 1000. Zero stops new pregnancies and births; manual additions remain available.

Pending litters reserve capacity when conceived. If manual additions or a lowered limit leave insufficient space at delivery, only the available number are born; an unavailable litter ends with an inspector/activity explanation. Each pregnancy resolves once and starts recovery, so blocked deliveries do not retry every step. Lowering the limit does not delete living animals.

## Saves and validation

Save format 9 retains the family data introduced in format 7, terrain pursuit navigation from format 8 (see TERRAIN.md), and home sites and behavior (see HOMES.md). It persists pregnancies, courtship progress, recovery times, parent/caregiver links, father trait snapshots, birth totals, birth limits, and juvenile carcass capacity. Formats 1–8 remain loadable. Existing lifecycle data from format 6 is retained; older formats still receive the first-pass adult migration. No past births are invented. Invalid family or birth-limit values in new saves are rejected.

Tests cover ordinary courtship/conception for all species, deterministic continuation during courtship/pregnancy/nursing, inheritance, restrictions, threats, sight/route limits, reserved capacity and blocked deliveries, nursing costs, following/waiting, orphan survival decisions, weaning, juvenile combat exclusions, juvenile carcasses, old-save migration, and inspector/statistics output.

Two unmodified-terrain reserves were run for 1,200 simulated seconds with natural needs, perception, and predation:

| Scenario | Seed | Initial deer/wolves/bears | Births | Final living deer/wolves/bears |
| --- | ---: | --- | --- | --- |
| Mixed | 4721 | 24 / 3 / 2 | 26 deer, 2 wolves | 37 / 5 / 2 |
| Deer only | 44 | 20 / 0 / 0 | 23 deer | 43 / 0 / 0 |

The mixed run lost eleven deer to predation and two to thirst; the deer-only run had no deaths. Of 28 mixed-reserve offspring, 26 were alive at the end; all 23 deer-only offspring survived. None of the living dependents were orphaned. These runs validate normal family behavior over multiple weaning periods, not a stable long-term equilibrium. The mixed bears did not reproduce in this sample; focused behavior tests exercise bear reproduction. No resources or animals were replenished by the test harness after initialization.

All 106 tests and the production build pass, including the subsequent terrain-aware movement checks. The renderer preparation harness also checks family animation selection for all species, antlerless variants, facing, pause behavior, frame progression, and survival-action priority, alongside its texture and terrain-cache checks. Actual browser frame rate was not measured for this pass.

Reports: `balance-results/reproduction-mixed-4721.json` and `balance-results/reproduction-herbivores-44.json`.

```powershell
npm test
npm run build
npm run balance -- mixed 4721 1200 reproduction
npm run balance -- herbivores 44 1200 reproduction
```

Further age details and longer multi-seed population tuning remain the next life-cycle work. Growth currently scales sprites; family nursing, courtship, waiting, and resting now have dedicated animations.
