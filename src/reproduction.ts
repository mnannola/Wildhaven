import type { Animal, World, Traits, Point } from './sim';
import { DAY_SECONDS, lifeStage, maturity } from './lifecycle';

export const REPRODUCTION = {
  deer: {
    pregnancy: DAY_SECONDS,
    recovery: 2 * DAY_SECONDS,
    litter: 2,
    wean: 1.2 * DAY_SECONDS,
  },
  wolf: {
    pregnancy: DAY_SECONDS,
    recovery: 3 * DAY_SECONDS,
    litter: 3,
    wean: 1.8 * DAY_SECONDS,
  },
  bear: {
    pregnancy: 2 * DAY_SECONDS,
    recovery: 4 * DAY_SECONDS,
    litter: 2,
    wean: 2.4 * DAY_SECONDS,
  },
};
export type Pregnancy = {
  fatherId: number;
  fatherName: string;
  fatherTraits: Traits;
  conceivedAt: number;
  dueAt: number;
  litterSize: number;
};
export type FamilyState = {
  parentIds?: [number, number];
  parentNames?: [string, string];
  caregiverId?: number;
  pregnancy?: Pregnancy;
  nextBreedAt?: number;
  mateId?: number;
  familyCheckAt?: number;
  birthStatus?: string;
  carcassCapacity?: number;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export const isDependent = (a: Animal) =>
  a.age < REPRODUCTION[a.species].wean && a.caregiverId !== undefined;
export const dependents = (w: World, a: Animal) =>
  w.animals.filter((b) => b.alive && b.caregiverId === a.id && isDependent(b));
export function related(a: Animal, b: Animal) {
  return !!(
    a.parentIds?.includes(b.id) ||
    b.parentIds?.includes(a.id) ||
    a.parentIds?.some((id) => b.parentIds?.includes(id))
  );
}
export function reservedPopulation(w: World) {
  return w.animals.reduce(
    (n, a) => n + (a.alive ? 1 + (a.pregnancy?.litterSize ?? 0) : 0),
    0,
  );
}

export function breedingStatus(w: World, a: Animal): string {
  if (!a.alive) return 'Deceased';
  if (lifeStage(a) !== 'adult')
    return lifeStage(a) === 'juvenile'
      ? 'Too young to breed'
      : 'Past breeding age';
  if (a.pregnancy) return 'Pregnant';
  if ((a.nextBreedAt ?? 0) > w.time) return 'Recovering between litters';
  if (a.health < 75 || a.hunger > 50 || a.thirst > 50 || a.fatigue > 55)
    return 'Needs food, water, rest, or healing';
  if (
    a.target !== undefined ||
    ['Fleeing', 'Fighting', 'Hunting', 'Searching for prey'].includes(
      a.action,
    ) ||
    (a.lastHit !== undefined && w.time - a.lastHit < 10)
  )
    return 'Avoiding danger or hunting';
  if (dependents(w, a).length) return 'Raising dependent young';
  if (reservedPopulation(w) >= w.birthLimit)
    return 'Natural birth limit reached';
  if (!knownFood(w, a)) return 'Needs a known nearby food source';
  return 'Ready to find a mate';
}

function knownFood(w: World, a: Animal) {
  return a.memory.some((m) => {
    if (distance(a, m) > 12) return false;
    if (a.species === 'deer')
      return (
        m.kind === 'grass' &&
        w.cell(m.x, m.y).forage &&
        w.cell(m.x, m.y).food >= 25
      );
    if (a.species === 'bear' && m.kind === 'fish') return (m.stock ?? 0) >= 2;
    if (m.kind === 'carcass') {
      const food = w.animals.find((b) => b.id === m.id);
      return (
        !!food &&
        !food.alive &&
        food.carcass >= 10 &&
        (a.species !== 'bear' || food.species !== 'bear')
      );
    }
    return m.kind === 'deer' || (a.species === 'bear' && m.kind === 'wolf');
  });
}

function stopCourtship(w: World, a: Animal, why: string) {
  const other = w.animals.find((b) => b.id === a.mateId);
  a.mateId = undefined;
  w.cancelPlan(a, why);
  if (other?.mateId === a.id) {
    other.mateId = undefined;
    if (other.goal === 'Mate') w.cancelPlan(other, why);
  }
}

function courtshipPlan(w: World, a: Animal, b: Animal) {
  if (distance(a, b) > 1.2) {
    const path = w.route(a, b);
    if (!path.length) {
      stopCourtship(w, a, 'Mate is unreachable.');
      a.familyCheckAt = w.time + 10;
      return false;
    }
    a.goal = 'Mate';
    a.action = 'Seeking mate';
    a.reason = 'Approaching a nearby compatible adult.';
    a.path = path;
    a.plan = {
      goal: 'Mate',
      steps: [{ kind: 'mate', label: 'Approach and court mate' }],
      index: 0,
      elapsed: 0,
    };
  } else {
    if (a.plan?.goal !== 'Mate') {
      a.plan = {
        goal: 'Mate',
        steps: [{ kind: 'mate', label: 'Court nearby mate' }],
        index: 0,
        elapsed: 0,
      };
    }
    a.goal = 'Mate';
    a.action = 'Courting';
    a.reason = 'Spending time together before conception.';
    a.path = [];
  }
  return true;
}

// Called after immediate threats, before ordinary socializing and exploration.
export function familyDecision(w: World, a: Animal): boolean {
  if (lifeStage(a) === 'juvenile') {
    if (a.species !== 'deer') {
      const danger = w.animals.find(
        (b) =>
          b.alive &&
          b.species !== a.species &&
          b.species !== 'deer' &&
          w.canSee(a, b) &&
          (distance(a, b) < 4 || b.target === a.id),
      );
      if (danger) {
        w.fleeFrom(a, danger, 'Too young to confront a predator.');
        return true;
      }
    }
    const mother = w.animals.find(
      (b) => b.id === a.caregiverId && b.alive && b.species === a.species,
    );
    if (
      !mother ||
      a.fatigue > 85 ||
      (!isDependent(a) && (a.hunger > 45 || a.thirst > 45))
    ) {
      if (a.goal === 'Family')
        w.cancelPlan(
          a,
          'Caregiver unavailable or independent needs take priority.',
        );
      return false;
    }
    const den =
      a.species === 'wolf' && isDependent(a)
        ? w.homes.find((h) => h.id === a.homeId && h.abandonedAt === undefined)
        : undefined;
    if (den && distance(mother, den) > 3 && a.hunger < 75 && a.thirst < 75) {
      if (distance(a, den) > 1.5) {
        const path = w.route(a, den);
        if (path.length) {
          w.setGoal(
            a,
            'Family',
            'Returning to den',
            'Returning to familiar shelter while mother forages.',
            den,
          );
          a.path = path;
          return true;
        }
      } else {
        a.goal = 'Family';
        a.action = 'Resting at den';
        a.reason = 'Waiting at the pack den while mother forages.';
        a.path = [];
        a.plan = {
          goal: 'Family',
          steps: [{ kind: 'care', label: 'Rest at den' }],
          index: 0,
          elapsed: 0,
        };
        return true;
      }
    }
    const seen = w.canSee(a, mother),
      last = a.memory.find((m) => m.id === mother.id && w.time - m.seen < 30),
      destination = seen ? mother : last;
    if (!destination) {
      if (a.goal === 'Family')
        w.cancelPlan(a, 'Caregiver is out of sight; searching independently.');
      return false;
    }
    if (distance(a, destination) > 1.2) {
      const path = w.route(a, destination);
      if (!path.length) {
        if (a.goal === 'Family') w.cancelPlan(a, 'Caregiver is unreachable.');
        return false;
      }
      w.setGoal(
        a,
        'Family',
        'Following mother',
        'Staying close to a remembered caregiver.',
        destination,
      );
      a.path = path;
      return true;
    }
    if (
      isDependent(a) &&
      (a.hunger > 22 || a.thirst > 20) &&
      mother.hunger < 80 &&
      mother.thirst < 85
    ) {
      a.goal = 'Family';
      a.action = 'Nursing';
      a.reason = 'Receiving nourishment from mother.';
      a.path = [];
      a.plan = {
        goal: 'Family',
        steps: [{ kind: 'nurse', label: 'Nurse from mother' }],
        index: 0,
        elapsed: 0,
      };
      return true;
    }
    if (a.hunger <= 45 && a.thirst <= 45) {
      a.goal = 'Family';
      a.action = 'Resting near mother';
      a.reason = 'Staying near the family until independent.';
      a.path = [];
      a.plan = {
        goal: 'Family',
        steps: [{ kind: 'care', label: 'Rest near mother' }],
        index: 0,
        elapsed: 0,
      };
      return true;
    }
    if (a.goal === 'Family')
      w.cancelPlan(a, 'Nursing unavailable; seeking food or water.');
    return false;
  }
  // Mothers pause ordinary travel when a visible dependent falls behind.
  if (
    a.hunger < 60 &&
    a.thirst < 60 &&
    a.fatigue < 80 &&
    (!a.plan || ['Family', 'Explore', 'Socialize', 'Mate'].includes(a.goal))
  ) {
    const child = dependents(w, a).find((b) => {
      const den =
        a.species === 'wolf'
          ? w.homes.find(
              (h) =>
                h.id === b.homeId &&
                h.id === a.homeId &&
                h.abandonedAt === undefined,
            )
          : undefined;
      return (
        !(den && distance(b, den) < 2.5 && distance(a, den) > 3) &&
        distance(a, b) > 2.5 &&
        w.canSee(a, b)
      );
    });
    if (child) {
      a.goal = 'Family';
      a.action = 'Waiting for young';
      a.reason = 'Letting dependent young catch up.';
      a.path = [];
      a.plan = {
        goal: 'Family',
        steps: [{ kind: 'care', label: 'Wait for young' }],
        index: 0,
        elapsed: 0,
      };
      return true;
    }
  }
  if (a.goal === 'Family' && a.plan) {
    w.cancelPlan(a, 'Family is together; resuming survival.');
  }
  if (a.mateId !== undefined) {
    const other = w.animals.find((b) => b.id === a.mateId);
    if (!other || other.mateId !== a.id || !compatible(w, a, other)) {
      stopCourtship(w, a, 'Courtship interrupted by changing conditions.');
      return false;
    }
    return courtshipPlan(w, a, other);
  }
  if (a.sex !== 'female' || w.time < (a.familyCheckAt ?? 0)) return false;
  a.familyCheckAt = w.time + 10;
  if (
    breedingStatus(w, a) !== 'Ready to find a mate' ||
    !knownFood(w, a) ||
    (a.plan && !['Explore', 'Socialize'].includes(a.goal))
  )
    return false;
  const other = w.animals
    .filter(
      (b) =>
        b.sex === 'male' &&
        b.mateId === undefined &&
        compatible(w, a, b) &&
        w.canSee(a, b) &&
        knownFood(w, b),
    )
    .sort((b, c) => distance(a, b) - distance(a, c) || b.id - c.id)[0];
  if (!other) return false;
  w.cancelPlan(a, 'Seeking a mate.');
  w.cancelPlan(other, 'Responding to a nearby mate.');
  a.mateId = other.id;
  other.mateId = a.id;
  if (!courtshipPlan(w, a, other)) return false;
  courtshipPlan(w, other, a);
  return true;
}

function compatible(w: World, a: Animal, b: Animal) {
  return (
    a.id !== b.id &&
    a.species === b.species &&
    a.sex !== b.sex &&
    !related(a, b) &&
    breedingStatus(w, a) === 'Ready to find a mate' &&
    breedingStatus(w, b) === 'Ready to find a mate'
  );
}

export function advanceFamilyPlan(w: World, a: Animal, dt: number): boolean {
  const plan = a.plan,
    step = plan?.steps[plan.index];
  if (!plan || !step || !['mate', 'nurse', 'care'].includes(step.kind))
    return false;
  if (step.kind === 'mate') {
    const other = w.animals.find((b) => b.id === a.mateId);
    if (
      !other ||
      other.mateId !== a.id ||
      !compatible(w, a, other) ||
      !w.canSee(a, other)
    ) {
      stopCourtship(w, a, 'Mate unavailable or survival needs take priority.');
      return true;
    }
    if (distance(a, other) > 1.2) return true;
    a.path = [];
    a.action = 'Courting';
    plan.elapsed += dt;
    if (
      a.sex === 'female' &&
      plan.elapsed >= 3 &&
      other.action === 'Courting'
    ) {
      if (!knownFood(w, a) || !knownFood(w, other)) {
        stopCourtship(w, a, 'Food is too scarce to begin raising young.');
        return true;
      }
      const settings = REPRODUCTION[a.species],
        slots = w.birthLimit - reservedPopulation(w),
        litterSize = Math.min(
          slots,
          1 + Math.floor(w.random() * settings.litter),
        );
      if (litterSize < 1) {
        stopCourtship(w, a, 'Natural birth limit reached.');
        return true;
      }
      a.pregnancy = {
        fatherId: other.id,
        fatherName: other.name,
        fatherTraits: { ...other.traits },
        conceivedAt: w.time,
        dueAt: w.time + settings.pregnancy,
        litterSize,
      };
      a.birthStatus = undefined;
      other.nextBreedAt = w.time + settings.recovery;
      stopCourtship(w, a, 'Pregnancy started.');
      w.events.unshift(`${a.name} is expecting ${litterSize} young.`);
      w.events = w.events.slice(0, 30);
    }
    return true;
  }
  if (step.kind === 'care') {
    if (a.action === 'Resting near mother' || a.action === 'Resting at den')
      a.fatigue = clamp(a.fatigue - dt * 2);
    return true;
  }
  const mother = w.animals.find((b) => b.id === a.caregiverId && b.alive);
  if (
    !mother ||
    !isDependent(a) ||
    distance(a, mother) > 1.4 ||
    !w.clearLine(a, mother) ||
    mother.hunger >= 80 ||
    mother.thirst >= 85 ||
    ['Fleeing', 'Fighting', 'Hunting'].includes(mother.action)
  ) {
    w.cancelPlan(a, 'Nursing unavailable; returning to survival.');
    return true;
  }
  const food = Math.min(Math.max(0, a.hunger - 15), dt * 3),
    water = Math.min(Math.max(0, a.thirst - 12), dt * 4);
  a.hunger -= food;
  a.thirst -= water;
  mother.hunger = clamp(mother.hunger + food * 0.35);
  mother.thirst = clamp(mother.thirst + water * 0.1);
  a.path = [];
  a.action = 'Nursing';
  if (a.hunger <= 16 && a.thirst <= 13) w.cancelPlan(a, 'Finished nursing.');
  return true;
}

export function updateFamilies(w: World) {
  // Resolve each pregnancy once. Births are appended after the normal animal step.
  for (const mother of [...w.animals]) {
    const pregnancy = mother.pregnancy;
    if (!pregnancy || !mother.alive || pregnancy.dueAt > w.time) continue;
    mother.pregnancy = undefined;
    mother.nextBreedAt = w.time + REPRODUCTION[mother.species].recovery;
    const slots = Math.max(
        0,
        w.birthLimit - w.animals.filter((a) => a.alive).length,
      ),
      count = Math.min(slots, pregnancy.litterSize);
    let born = 0;
    for (let i = 0; i < count; i++) {
      const offsets = [
          [-1, 0],
          [0, 1],
          [1, 0],
          [0, -1],
        ],
        offset = offsets[i % offsets.length],
        spot = {
          x: Math.floor(mother.x) + 0.5 + offset[0],
          y: Math.floor(mother.y) + 0.5 + offset[1],
        };
      const place =
        w.walkable(spot.x, spot.y) && w.route(mother, spot).length
          ? spot
          : mother;
      const child = w.spawn(mother.species, place.x, place.y, true);
      if (!child) break;
      child.age = 0;
      child.hunger = 25;
      child.thirst = 20;
      child.fatigue = 5;
      child.parentIds = [mother.id, pregnancy.fatherId];
      child.parentNames = [mother.name, pregnancy.fatherName];
      child.caregiverId = mother.id;
      child.homeId = mother.homeId;
      child.knownHomeIds = mother.homeId === undefined ? [] : [mother.homeId];
      if (child.species === 'deer') child.herdId = mother.herdId ?? mother.id;
      if (child.species === 'wolf') child.packId = mother.packId ?? mother.id;
      for (const key of Object.keys(child.traits) as (keyof Traits)[])
        child.traits[key] = clamp(
          (mother.traits[key] + pregnancy.fatherTraits[key]) / 2 +
            (w.random() - 0.5) * 16,
        );
      born++;
    }
    mother.birthStatus = born
      ? `Gave birth to ${born} young`
      : 'Pregnancy ended: no space for a birth';
    w.events.unshift(
      `${mother.name} ${born ? `gave birth to ${born} young.` : 'could not give birth because the natural birth limit was reached.'}`,
    );
    w.events = w.events.slice(0, 30);
  }
}

export function juvenileMeat(a: Animal) {
  return Math.round(50 * (0.3 + 0.7 * maturity(a)));
}

export function validFamily(a: Animal, time: number) {
  const finite = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
  const p = a.pregnancy;
  return (
    (a.parentIds === undefined ||
      (Array.isArray(a.parentIds) &&
        a.parentIds.length === 2 &&
        a.parentIds.every((v) => id(v) && v !== a.id) &&
        a.parentIds[0] !== a.parentIds[1])) &&
    (a.parentNames === undefined ||
      (Array.isArray(a.parentNames) &&
        a.parentNames.length === 2 &&
        a.parentNames.every((v) => typeof v === 'string'))) &&
    (a.caregiverId === undefined ||
      (id(a.caregiverId) && a.caregiverId !== a.id)) &&
    (a.mateId === undefined || (id(a.mateId) && a.mateId !== a.id)) &&
    [a.nextBreedAt, a.familyCheckAt].every(
      (v) => v === undefined || finite(v),
    ) &&
    (p === undefined ||
      (!!p &&
        a.alive &&
        a.sex === 'female' &&
        id(p.fatherId) &&
        p.fatherId !== a.id &&
        typeof p.fatherName === 'string' &&
        finite(p.conceivedAt) &&
        p.conceivedAt <= time &&
        finite(p.dueAt) &&
        p.dueAt >= p.conceivedAt &&
        Number.isInteger(p.litterSize) &&
        p.litterSize >= 1 &&
        p.litterSize <= REPRODUCTION[a.species].litter &&
        !!p.fatherTraits &&
        Object.keys(a.traits).every(
          (k) =>
            finite(p.fatherTraits[k as keyof Traits]) &&
            p.fatherTraits[k as keyof Traits] <= 100,
        ))) &&
    (a.carcassCapacity === undefined ||
      (finite(a.carcassCapacity) &&
        a.carcassCapacity >= 15 &&
        a.carcassCapacity <= 50))
  );
}
