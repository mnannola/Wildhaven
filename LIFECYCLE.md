# Aging: first life-cycle pass

This document records the aging implementation. Reproduction and dependent young are now implemented in save format 9 (family data was introduced in format 7); see REPRODUCTION.md for current family behavior, growth, carcasses, and validation.

Animals now have sex, age, a derived life stage, and an individual natural lifespan. Ages are measured in simulated seconds; one displayed simulated day is 240 seconds (four minutes at 1x). Pause, speed controls, and saves use the same simulation clock. These are compressed gameplay ages, not real animal lifespans.

| Species | Adulthood | Elderhood | Maximum natural lifespan |
| ------- | --------: | --------: | -----------------------: |
| Deer    |    2 days |   12 days |                  18 days |
| Wolf    |    3 days |   15 days |                  23 days |
| Bear    |    4 days |   20 days |                  30 days |

Each animal's lifespan is sampled once between elderhood and the species maximum, with an increasing conditional mortality risk as an elder ages. It is saved, so loading or changing simulation speed does not reroll it. The maximum is a bound, not a guarantee of survival: predation, combat, hunger, and thirst still apply.

Player-added animals start as varied adults, at adulthood plus up to 35% of the adult-to-elder interval. A separate deterministic random stream assigns sex, starting age, and lifespan without consuming the existing world RNG used for terrain, personality, and decisions. The subsequent reproduction pass uses sex for mating and creates newborns at age zero.

Life stages are derived from age rather than stored independently, avoiding inconsistent stage/age combinations. Adults keep their existing movement and fatigue rates. From elderhood to maximum age, movement gradually slows by up to 20%, while baseline and movement fatigue accumulate up to 50% faster. Combat damage and health limits are unchanged. Juvenile ages are supported by the data model; dependent young, growth visuals, and juvenile behavior belong to subsequent passes.

Natural death uses the normal carcass and statistics pipeline, records `oldAge` as a separate cause, and ends active plans and pursuits. Age stops when the animal dies, while its carcass continues to decay normally. Old-age carcasses still contain 50 meat units. The inspector shows sex, age, stage, and a recorded cause of death; World activity includes old-age totals by species. Lifespan thresholds are not exposed as a death countdown.

## Save compatibility

Save format 6 persists lifecycle fields and recorded death causes. Versions 1–5 receive deterministic adult lifecycle data when loaded, including existing carcasses whose historical age is unknown. Existing personality, health, pack/herd membership, terrain, and statistics are retained; previous migrations for old food, carcasses, and memories still run. Old saves receive zero old-age death counts, and unknown historical death causes are shown as not recorded. The migration does not infer age from elapsed world time, so old animals are not immediately aged to death.

Format 6 validates required lifecycle values. Invalid ages, sex, or lifespan bounds cause a load error instead of silently producing immortal animals. Resaving upgrades older worlds once; later loads retain the assigned ages and lifespan exactly.

## Validation and remaining work

`npm test` covers life-stage boundaries for all species, seeded adult initialization, elder movement/fatigue effects, natural death and frozen age, save/load across an imminent death, versions 1–5 migration, invalid format-6 lifecycle data, and inspector/statistics output. Existing survival, combat, perception, and deterministic-save tests remain enabled.

Validation completed with 73 passing tests and a successful production build. The post-aging simulation smoke benchmark (`performance-results/aging-smoke.json`) averaged 2.26 / 3.96 / 11.30 ms per step at 50 / 100 / 200 initial animals. It measured 120 steps after 20 warmup steps, using the existing mixed-population seed. These are simulation CPU measurements, not browser FPS.

The second pass now adds mating, pregnancy, births, inherited traits, caregivers, and population controls. The third adds further growth/elder visuals and long-run reproduction balance. Dead animals are not automatically replaced.

Performance reports in `PERFORMANCE.md` predate aging. Their serialized format-5 hashes are historical; the performance script now reports the current save version (9 after territories and dens) and skips comparisons across different save versions.
