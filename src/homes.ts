import type { World, Animal, Species, Point } from './sim';
import { lifeStage } from './lifecycle';
import { isDependent } from './reproduction';
import { W, H } from './sim';

export type Home = Point & {
  id: number;
  species: Species;
  kind: 'wolf-den' | 'bear-den' | 'deer-gathering';
  groupId: number;
  ownerId: number;
  radius: number;
  foundedAt: number;
  lastUsedAt: number;
  abandonedAt?: number;
};
export type HomeState = {
  homeId?: number;
  knownHomeIds?: number[];
  homeSearchAt?: number;
  homeVisitAt?: number;
  homePatrolAt?: number;
  homeShareAt?: number;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const homeName = (h: Home) =>
  h.kind === 'wolf-den'
    ? 'Wolf pack den'
    : h.kind === 'bear-den'
      ? 'Bear den'
      : 'Deer gathering area';
export const homeGroup = (a: Animal) =>
  a.species === 'wolf'
    ? (a.packId ?? a.id)
    : a.species === 'deer'
      ? (a.herdId ?? a.id)
      : lifeStage(a) === 'juvenile' && a.caregiverId !== undefined
        ? a.caregiverId
        : a.id;
export const homeFor = (w: World, a: Animal) =>
  w.homes.find((h) => h.id === a.homeId && h.abandonedAt === undefined);
export const residents = (w: World, h: Home) =>
  w.animals.filter((a) => a.alive && a.homeId === h.id);
function remember(a: Animal, id: number) {
  a.knownHomeIds ??= [];
  if (!a.knownHomeIds.includes(id)) a.knownHomeIds.push(id);
}
function event(w: World, text: string) {
  w.events.unshift(text);
  w.events = w.events.slice(0, 30);
}
function locallyReachable(w: World, a: Animal, p: Point) {
  if (distance(a, p) < 0.1) return true;
  const path = w.route(a, p);
  return path.length > 0 && path.length <= 14;
}

export function discoverHomes(w: World, a: Animal) {
  for (const h of w.homes)
    if (
      h.id === a.homeId ||
      (distance(a, h) <= Math.min(8, w.perceptionRadius(a)) && w.canSee(a, h))
    )
      remember(a, h.id);
  const home = homeFor(w, a);
  if (!home || w.time < (a.homeShareAt ?? 0)) return;
  a.homeShareAt = w.time + 10;
  const friends = w.animals
    .filter(
      (b) =>
        b.alive &&
        b.id !== a.id &&
        b.homeId === home.id &&
        distance(a, b) <= 8 &&
        w.canSee(a, b),
    )
    .sort((b, c) => distance(a, b) - distance(a, c) || b.id - c.id)
    .slice(0, 2);
  for (const friend of friends) {
    const resources = friend.memory
      .filter(
        (m) =>
          m.id === undefined &&
          ['water', 'grass', 'fish'].includes(m.kind) &&
          w.time - m.seen <= w.memoryLifetime(a, m) &&
          distance(m, home) < 14,
      )
      .sort((b, c) => distance(b, home) - distance(c, home));
    for (const m of [
      ...resources.filter((m) => m.kind === 'water').slice(0, 4),
      ...resources.filter((m) => m.kind !== 'water').slice(0, 4),
    ]) {
      const old = a.memory.find(
        (v) =>
          v.kind === m.kind &&
          v.x === m.x &&
          v.y === m.y &&
          v.riverId === m.riverId,
      );
      if (!old || old.seen < m.seen) w.remember(a, { ...m });
    }
  }
}

// One shared site per pack/herd, and one family site per bear mother. Merged
// groups retain an occupied home, preferring one already sheltering young.
export function syncHomes(w: World, force = false) {
  if (!force && w.time < w.nextHomeUpdate) return;
  w.nextHomeUpdate = w.time + 1;
  const groups = new Map<string, Animal[]>();
  for (const a of w.animals)
    if (a.alive) {
      const key = a.species + ':' + homeGroup(a),
        members = groups.get(key) ?? [];
      members.push(a);
      groups.set(key, members);
    }
  const used = new Set<number>();
  for (const members of groups.values()) {
    const first = members[0],
      group = homeGroup(first);
    const candidates = w.homes.filter(
      (h) =>
        !used.has(h.id) &&
        h.species === first.species &&
        h.abandonedAt === undefined &&
        w.walkable(h.x, h.y) &&
        !w.cell(h.x, h.y).ford &&
        (h.groupId === group ||
          (first.species !== 'bear' && members.some((a) => a.homeId === h.id))),
    );
    const score = (h: Home) =>
      members.reduce(
        (n, a) =>
          n + (a.homeId === h.id ? (isDependent(a) || a.pregnancy ? 5 : 1) : 0),
        0,
      );
    candidates.sort((a, b) => score(b) - score(a) || a.id - b.id);
    const home = candidates[0];
    if (!home) {
      for (const a of members) {
        if (
          a.homeId !== undefined &&
          (a.plan?.goal === 'Home' ||
            a.action === 'Returning home' ||
            a.action === 'Returning to den')
        )
          w.cancelPlan(a, 'Home no longer available.');
        a.homeId = undefined;
      }
      continue;
    }
    home.groupId = group;
    home.ownerId = (
      members.find((a) => a.id === home.ownerId) ??
      members.find((a) => lifeStage(a) !== 'juvenile') ??
      first
    ).id;
    used.add(home.id);
    for (const a of members) {
      if (
        a.homeId !== home.id &&
        (a.plan?.goal === 'Home' ||
          a.action === 'Returning home' ||
          a.action === 'Returning to den')
      )
        w.cancelPlan(a, 'Group moved to a shared home.');
      a.homeId = home.id;
      remember(a, home.id);
      if (distance(a, home) < 1.5) {
        a.homeVisitAt = w.time;
        home.lastUsedAt = w.time;
      }
    }
  }
  for (const h of w.homes)
    if (!used.has(h.id) && h.abandonedAt === undefined) {
      h.abandonedAt = w.time;
      event(w, homeName(h) + ' was abandoned.');
    }
  w.homes = w.homes.filter(
    (h) => h.abandonedAt === undefined || w.time - h.abandonedAt < 240,
  );
  const ids = new Set(w.homes.map((h) => h.id));
  for (const a of w.animals) {
    if (a.homeId !== undefined && !ids.has(a.homeId)) a.homeId = undefined;
    if (a.knownHomeIds)
      a.knownHomeIds = a.knownHomeIds.filter((id) => ids.has(id));
  }
}

function knownResources(a: Animal) {
  const water = a.memory.filter(
    (m) => m.kind === 'water' || (m.kind === 'fish' && (m.stock ?? 0) >= 1),
  );
  const food = a.memory.filter((m) =>
    a.species === 'deer'
      ? m.kind === 'grass'
      : m.kind === 'carcass' ||
        m.kind === 'deer' ||
        (a.species === 'bear' && m.kind === 'fish' && (m.stock ?? 0) >= 1),
  );
  return { water, food };
}
function suitable(w: World, a: Animal, p: Point) {
  if (
    !w.walkable(p.x, p.y) ||
    w.cell(p.x, p.y).ford ||
    w.cell(p.x, p.y).river !== undefined
  )
    return false;
  if (
    w.homes.some(
      (h) =>
        h.abandonedAt === undefined &&
        h.species !== 'deer' &&
        h.id !== a.homeId &&
        distance(p, h) < 4 &&
        a.knownHomeIds?.includes(h.id),
    )
  )
    return false;
  return !a.memory.some((m) =>
    a.species === 'deer'
      ? (m.kind === 'wolf' || m.kind === 'bear') && distance(p, m) < 5
      : a.species === 'wolf'
        ? m.kind === 'bear' && distance(p, m) < 8
        : false,
  );
}

export function establishHome(w: World, a: Animal) {
  const existing = w.homes.find(
    (h) =>
      h.species === a.species &&
      h.groupId === homeGroup(a) &&
      h.abandonedAt === undefined,
  );
  if (existing) {
    a.homeId = existing.id;
    remember(a, existing.id);
    return existing;
  }
  if (
    lifeStage(a) === 'juvenile' ||
    a.hunger > 60 ||
    a.thirst > 60 ||
    a.fatigue > 75 ||
    ['Fleeing', 'Fighting', 'Hunting'].includes(a.action) ||
    w.time < (a.homeSearchAt ?? 0)
  )
    return;
  a.homeSearchAt = w.time + 30;
  const { water, food } = knownResources(a);
  if (!water.length || !food.length) return;
  const nearby = w.homes
    .filter(
      (h) =>
        h.abandonedAt !== undefined &&
        h.species === a.species &&
        distance(a, h) <= 7 &&
        w.canSee(a, h) &&
        suitable(w, a, h) &&
        locallyReachable(w, a, h),
    )
    .sort((h, j) => distance(a, h) - distance(a, j));
  let place: Point | undefined = nearby[0];
  if (!place) {
    const candidates: { p: Point; score: number }[] = [];
    for (
      let y = Math.max(0, Math.floor(a.y) - 5);
      y <= Math.min(H - 1, Math.floor(a.y) + 5);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(a.x) - 5);
        x <= Math.min(W - 1, Math.floor(a.x) + 5);
        x++
      ) {
        const p = { x: x + 0.5, y: y + 0.5 };
        if (distance(a, p) > 5 || !suitable(w, a, p) || !w.canSee(a, p))
          continue;
        const dw = Math.min(...water.map((m) => distance(p, m))),
          df = Math.min(...food.map((m) => distance(p, m)));
        if (dw > 12 || df > 14) continue;
        candidates.push({
          p,
          score:
            w.coverAt(p) * 5 -
            Math.abs(dw - 4) * 0.4 -
            df * 0.25 -
            distance(a, p) * 0.1,
        });
      }
    candidates.sort(
      (a, b) => b.score - a.score || a.p.y - b.p.y || a.p.x - b.p.x,
    );
    place = candidates.slice(0, 12).find((c) => locallyReachable(w, a, c.p))?.p;
  }
  if (!place) return;
  const home: Home = nearby[0] ?? {
    id: w.nextHomeId++,
    species: a.species,
    kind:
      a.species === 'wolf'
        ? 'wolf-den'
        : a.species === 'bear'
          ? 'bear-den'
          : 'deer-gathering',
    groupId: homeGroup(a),
    ownerId: a.id,
    radius: a.species === 'wolf' ? 12 : a.species === 'bear' ? 10 : 8,
    x: place.x,
    y: place.y,
    foundedAt: w.time,
    lastUsedAt: w.time,
  };
  const reclaimed = home.abandonedAt !== undefined;
  home.abandonedAt = undefined;
  home.groupId = homeGroup(a);
  home.ownerId = a.id;
  home.lastUsedAt = w.time;
  if (!w.homes.includes(home)) w.homes.push(home);
  for (const member of w.animals)
    if (
      member.alive &&
      member.species === a.species &&
      homeGroup(member) === home.groupId
    ) {
      member.homeId = home.id;
      member.homeVisitAt = w.time;
      member.homePatrolAt = w.time + 60;
      remember(member, home.id);
    }
  event(
    w,
    a.name +
      (reclaimed ? ' reclaimed a ' : ' established a ') +
      homeName(home).toLowerCase() +
      '.',
  );
  return home;
}

export function rivalHome(w: World, a: Animal, p: Point) {
  return w.homes.find(
    (h) =>
      h.abandonedAt === undefined &&
      h.species === a.species &&
      h.species !== 'deer' &&
      h.groupId !== homeGroup(a) &&
      a.knownHomeIds?.includes(h.id) &&
      distance(h, p) < h.radius * 0.4,
  );
}

export function homeDecision(w: World, a: Animal, goal: string) {
  if (
    lifeStage(a) === 'juvenile' ||
    ['Drink', 'Eat'].includes(goal) ||
    a.hunger > 60 ||
    a.thirst > 60 ||
    a.fatigue > 85
  )
    return false;
  const home = homeFor(w, a) ?? establishHome(w, a);
  if (!home) return false;
  if (a.species !== 'deer' && a.health > 60) {
    const rival = rivalHome(w, a, a),
      owner = rival && w.animals.find((b) => b.id === rival.ownerId && b.alive);
    if (owner && distance(owner, rival!) < 4 && w.canSee(a, owner)) {
      w.fleeFrom(a, owner, "Yielding space around another group's home.");
      return true;
    }
    const intruder = w.animals.find(
      (b) =>
        b.alive &&
        b.species === a.species &&
        lifeStage(b) !== 'juvenile' &&
        homeGroup(b) !== home.groupId &&
        distance(b, home) < home.radius * 0.35 &&
        distance(a, home) < home.radius * 0.5 &&
        w.canSee(a, b),
    );
    if (intruder && w.time >= (a.homePatrolAt ?? 0)) {
      w.setGoal(
        a,
        'Home',
        'Guarding territory',
        'Warning an intruder near the home site.',
      );
      a.facing = intruder.x < a.x ? -1 : 1;
      a.plan = {
        goal: 'Home',
        steps: [{ kind: 'mark', label: 'Guarding territory' }],
        index: 0,
        elapsed: 0,
      };
      return true;
    }
  }
  const d = distance(a, home),
    expecting = !!a.pregnancy && a.pregnancy.dueAt - w.time < 60;
  const feedingPups =
    a.species === 'wolf' &&
    a.sex === 'female' &&
    w.time - (a.homeVisitAt ?? 0) > 30 &&
    w.animals.some(
      (b) =>
        b.alive &&
        b.caregiverId === a.id &&
        isDependent(b) &&
        b.homeId === home.id &&
        distance(b, home) < 2.5,
    );
  if (
    d > 1.5 &&
    ((goal === 'Rest' && a.fatigue < 80 && d < 8) ||
      expecting ||
      feedingPups ||
      d > home.radius ||
      w.time - (a.homeVisitAt ?? 0) > 90)
  ) {
    const path = w.route(a, home);
    if (path.length && path.length < 30) {
      w.setGoal(
        a,
        goal === 'Rest' ? 'Rest' : 'Home',
        'Returning home',
        expecting
          ? 'Returning to familiar shelter before giving birth.'
          : 'Returning to familiar ground between survival activities.',
        home,
      );
      a.path = path;
      return true;
    }
  }
  if (goal === 'Rest' && d <= 1.5) {
    w.setGoal(a, 'Rest', 'Sleeping', 'Resting at the familiar home site.');
    return true;
  }
  if (
    a.species !== 'deer' &&
    d < home.radius &&
    w.time >= (a.homePatrolAt ?? 0) &&
    !a.pregnancy
  ) {
    const index = (Math.floor(w.time / 60) + a.id) % 8;
    for (let i = 0; i < 8; i++) {
      const angle = ((index + i) / 8) * Math.PI * 2,
        p = {
          x: Math.floor(home.x + Math.cos(angle) * home.radius * 0.6) + 0.5,
          y: Math.floor(home.y + Math.sin(angle) * home.radius * 0.6) + 0.5,
        };
      if (!suitable(w, a, p) || !w.canSee(a, p) || rivalHome(w, a, p)) continue;
      const path = w.route(a, p);
      if (!path.length) continue;
      w.setGoal(
        a,
        'Home',
        'Patrolling territory',
        'Checking familiar ground and its boundary.',
        p,
      );
      a.path = path;
      a.plan!.steps.push({ kind: 'mark', label: 'Marking territory' });
      a.homePatrolAt = w.time + 60;
      return true;
    }
    w.setGoal(
      a,
      'Home',
      'Marking territory',
      'Checking and scent-marking familiar ground.',
    );
    a.plan = {
      goal: 'Home',
      steps: [{ kind: 'mark', label: 'Marking territory' }],
      index: 0,
      elapsed: 0,
    };
    return true;
  }
  return false;
}

export function advanceHomePlan(w: World, a: Animal, dt: number) {
  const plan = a.plan,
    step = plan?.steps[plan.index];
  if (!plan || step?.kind !== 'mark') return false;
  const home = homeFor(w, a);
  if (!home) {
    w.cancelPlan(a, 'Home no longer available.');
    return true;
  }
  a.path = [];
  a.action = step.label;
  plan.elapsed += dt;
  if (plan.elapsed >= 2) {
    a.homePatrolAt = w.time + 60;
    if (distance(a, home) < 1.5) a.homeVisitAt = w.time;
    home.lastUsedAt = w.time;
    w.cancelPlan(a, 'Home check complete.');
  }
  return true;
}

export function validateHomes(w: World) {
  if (
    !Array.isArray(w.homes) ||
    !Number.isSafeInteger(w.nextHomeId) ||
    w.nextHomeId < 1 ||
    !Number.isFinite(w.nextHomeUpdate) ||
    w.nextHomeUpdate < 0
  )
    throw Error('Invalid homes in save');
  const ids = new Set<number>();
  for (const h of w.homes) {
    if (
      !h ||
      !Number.isSafeInteger(h.id) ||
      h.id < 1 ||
      ids.has(h.id) ||
      h.id >= w.nextHomeId ||
      !['deer', 'wolf', 'bear'].includes(h.species) ||
      h.kind !==
        (h.species === 'wolf'
          ? 'wolf-den'
          : h.species === 'bear'
            ? 'bear-den'
            : 'deer-gathering') ||
      !Number.isFinite(h.x) ||
      !Number.isFinite(h.y) ||
      !w.walkable(h.x, h.y) ||
      w.cell(h.x, h.y).ford ||
      !Number.isSafeInteger(h.groupId) ||
      h.groupId < 1 ||
      !Number.isSafeInteger(h.ownerId) ||
      h.ownerId < 1 ||
      h.radius !==
        (h.species === 'wolf' ? 12 : h.species === 'bear' ? 10 : 8) ||
      [h.foundedAt, h.lastUsedAt, h.abandonedAt].some(
        (v) => v !== undefined && (!Number.isFinite(v) || v < 0 || v > w.time),
      )
    )
      throw Error('Invalid home site in save');
    ids.add(h.id);
  }
  for (const a of w.animals) {
    if (
      (a.homeId !== undefined &&
        (!ids.has(a.homeId) ||
          w.homes.find((h) => h.id === a.homeId)?.species !== a.species)) ||
      (a.knownHomeIds !== undefined &&
        (!Array.isArray(a.knownHomeIds) ||
          a.knownHomeIds.some((id) => !ids.has(id)))) ||
      [a.homeSearchAt, a.homeVisitAt, a.homePatrolAt, a.homeShareAt].some(
        (v) => v !== undefined && (!Number.isFinite(v) || v < 0),
      )
    )
      throw Error('Invalid animal home in save');
  }
}
