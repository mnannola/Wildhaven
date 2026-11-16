import type { Species } from './sim';

export const DAY_SECONDS = 240;
export type Sex = 'female' | 'male';
export type LifeStage = 'juvenile' | 'adult' | 'elder';
export type Lifecycle = { sex: Sex; age: number; naturalDeathAge: number };

// Compressed gameplay ages in simulated seconds, not biological lifespans.
export const LIFE_CYCLE: Record<
  Species,
  { adult: number; elder: number; maximum: number }
> = {
  deer: {
    adult: 2 * DAY_SECONDS,
    elder: 12 * DAY_SECONDS,
    maximum: 18 * DAY_SECONDS,
  },
  wolf: {
    adult: 3 * DAY_SECONDS,
    elder: 15 * DAY_SECONDS,
    maximum: 23 * DAY_SECONDS,
  },
  bear: {
    adult: 4 * DAY_SECONDS,
    elder: 20 * DAY_SECONDS,
    maximum: 30 * DAY_SECONDS,
  },
};

export function lifeStage(a: { species: Species; age: number }): LifeStage {
  const ages = LIFE_CYCLE[a.species];
  return a.age < ages.adult
    ? 'juvenile'
    : a.age < ages.elder
      ? 'adult'
      : 'elder';
}

export function elderProgress(a: { species: Species; age: number }) {
  const ages = LIFE_CYCLE[a.species];
  return Math.max(
    0,
    Math.min(1, (a.age - ages.elder) / (ages.maximum - ages.elder)),
  );
}
export const maturity = (a: { species: Species; age: number }) =>
  Math.max(0, Math.min(1, a.age / LIFE_CYCLE[a.species].adult));
export const juvenileSize = (a: { species: Species; age: number }) =>
  0.55 + 0.45 * maturity(a);
export const ageSpeedFactor = (a: { species: Species; age: number }) =>
  (0.65 + 0.35 * maturity(a)) * (1 - 0.2 * elderProgress(a));
export const ageFatigueFactor = (a: { species: Species; age: number }) =>
  1 + 0.5 * elderProgress(a);

// A separate deterministic stream leaves terrain, traits, and behavior RNG intact.
export function createLifecycle(
  species: Species,
  seed: number,
  id: number,
): Lifecycle {
  let state =
    (seed ^
      Math.imul(id, 0x9e3779b9) ^
      { deer: 11, wolf: 23, bear: 37 }[species]) >>>
    0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
  const ages = LIFE_CYCLE[species],
    sex = random() < 0.5 ? 'female' : 'male',
    age = ages.adult + random() * (ages.elder - ages.adult) * 0.35;
  // Sampling once gives a rising conditional mortality risk through elderhood,
  // independent of step size and without a random roll for every living animal.
  const naturalDeathAge =
    ages.elder + (ages.maximum - ages.elder) * Math.sqrt(random());
  return { sex, age, naturalDeathAge };
}

export function validLifecycle(a: Lifecycle & { species: Species }) {
  const ages = LIFE_CYCLE[a.species];
  return (
    !!ages &&
    (a.sex === 'female' || a.sex === 'male') &&
    Number.isFinite(a.age) &&
    a.age >= 0 &&
    Number.isFinite(a.naturalDeathAge) &&
    a.naturalDeathAge >= ages.elder &&
    a.naturalDeathAge <= ages.maximum
  );
}
