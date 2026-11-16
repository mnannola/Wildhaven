import { BALANCE } from './balance';
import { coverAt, terrainSpeed, terrainRoute, escapeRoute } from './terrain';
import {
  syncHomes,
  discoverHomes,
  homeDecision,
  advanceHomePlan,
  rivalHome,
  validateHomes,
} from './homes';
import type { Home, HomeState } from './homes';
import {
  createLifecycle,
  validLifecycle,
  ageSpeedFactor,
  ageFatigueFactor,
} from './lifecycle';
import type { Lifecycle } from './lifecycle';
import { lifeStage, maturity } from './lifecycle';
import {
  familyDecision,
  advanceFamilyPlan,
  updateFamilies,
  juvenileMeat,
  validFamily,
} from './reproduction';
import type { FamilyState } from './reproduction';
import { createStatistics, population } from './statistics';
import type { DeathCause, EcosystemSample } from './statistics';
export const W = 72,
  H = 52,
  TILE = 24;
export const CARCASS_MEAT = 50,
  CARCASS_DECAY = 0.09;
export type Species = 'deer' | 'wolf' | 'bear';
export type Traits = {
  caution: number;
  boldness: number;
  sociability: number;
  exploration: number;
  persistence: number;
  sleepNeed: number;
};
export type Point = { x: number; y: number };
export type Memory = Point & {
  kind: 'water' | 'grass' | 'deer' | 'wolf' | 'bear' | 'fish' | 'carcass';
  id?: number;
  seen: number;
  alarm?: boolean;
  riverId?: number;
  stock?: number;
  species?: Species;
};
export type ActionStep = {
  kind:
    | 'travel'
    | 'check'
    | 'drink'
    | 'graze'
    | 'feed'
    | 'rest'
    | 'hunt'
    | 'fish'
    | 'mate'
    | 'nurse'
    | 'care'
    | 'mark';
  label: string;
  destination?: Point;
};
export type ActionPlan = {
  goal: string;
  steps: ActionStep[];
  index: number;
  elapsed: number;
};
export type CombatEntry = {
  time: number;
  direction: 'dealt' | 'received';
  opponentId: number;
  opponentName: string;
  opponentSpecies: Species;
  damage: number;
};
export type Animal = Point &
  Lifecycle &
  FamilyState &
  HomeState & {
    navigation?: Point & { repathAt: number };
    deathCause?: DeathCause;
    id: number;
    name: string;
    species: Species;
    memory: Memory[];
    herdId?: number;
    herdStatus?: string;
    packId?: number;
    packRole?: string;
    plan?: ActionPlan;
    planNote?: string;
    traits: Traits;
    hunger: number;
    thirst: number;
    fatigue: number;
    health: number;
    alive: boolean;
    goal: string;
    action: string;
    reason: string;
    path: Point[];
    target?: number;
    foodTarget?: number;
    fishingRiver?: number;
    combatTarget?: number;
    combatLog: CombatEntry[];
    trackedHunt?: number;
    searchHeading?: number;
    diedAt?: number;
    depletedAt?: number;
    lastHit?: number;
    lastStrike?: { time: number; targetId: number; x: number; y: number };
    lastCatch?: { time: number; riverId: number };
    retreatUntil?: number;
    think: number;
    history: string[];
    scores: Record<string, number>;
    facing: number;
    carcass: number;
  };
export type RiverSection = {
  id: number;
  name: string;
  tiles: number[];
  fish: number;
  capacity: number;
};
export type Cell = {
  kind: 'grass' | 'water' | 'tree';
  food: number;
  variant: number;
  forage: boolean;
  river?: number;
  ford?: boolean;
};
export const clamp = (v: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, v));
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const isSprinting = (a: Animal) =>
  a.alive &&
  a.path.length > 0 &&
  (a.action === 'Hunting' || a.action === 'Fleeing');
export const movementSpeed = (a: Animal) =>
  (a.action === 'Fleeing'
    ? a.species === 'bear'
      ? 2.3
      : 2.8
    : a.action === 'Hunting'
      ? a.species === 'bear'
        ? 2.55
        : 2.65
      : a.action === 'Following mother'
        ? a.species === 'deer'
          ? 1.35
          : a.species === 'wolf'
            ? 1.45
            : 1.25
        : a.species === 'deer'
          ? 0.85
          : a.species === 'bear'
            ? 0.8
            : 0.95) *
  (1 - a.fatigue * 0.006) *
  (0.65 + (0.35 * a.health) / 100) *
  ageSpeedFactor(a);
export class World {
  homes: Home[] = [];
  nextHomeId = 1;
  nextHomeUpdate = 0;
  birthLimit = 200;
  stats = createStatistics();
  seed: number;
  rivers: RiverSection[] = [];
  cells: Cell[] = [];
  animals: Animal[] = [];
  time = 0;
  nextId = 1;
  events: string[] = [];
  constructor(seed = 4721, populate = false) {
    this.seed = seed;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const water =
          ((x - 28) / 8) ** 2 + ((y - 24) / 6) ** 2 < 1 ||
          ((x - 55) / 5) ** 2 + ((y - 38) / 4) ** 2 < 1;
        this.cells.push({
          kind: water ? 'water' : this.random() < 0.065 ? 'tree' : 'grass',
          food: 70 + this.random() * 30,
          variant: Math.floor(this.random() * 5),
          forage: false,
        });
      }
    for (const c of this.cells) {
      c.forage = c.kind === 'grass' && c.food < 75.4;
      c.food = c.forage ? 70 + ((c.food - 70) / 5.4) * 30 : 0;
    }
    this.generateRivers();
    if (populate) {
      for (let i = 0; i < 22; i++)
        this.spawn('deer', 12 + this.random() * 43, 9 + this.random() * 32);
      for (let i = 0; i < 3; i++)
        this.spawn('wolf', 52 + this.random() * 9, 10 + this.random() * 9);
    }
    this.recordSample(true);
  }
  snapshot(): EcosystemSample {
    const counts = population();
    let meat = 0,
      hungry = 0,
      thirsty = 0,
      exhausted = 0,
      grass = 0,
      grassCapacity = 0;
    for (const a of this.animals) {
      if (a.alive) {
        counts[a.species]++;
        if (a.hunger >= 80) hungry++;
        if (a.thirst >= 80) thirsty++;
        if (a.fatigue >= 80) exhausted++;
      } else meat += a.carcass;
    }
    for (const c of this.cells)
      if (c.kind === 'grass' && c.forage) {
        grass += c.food;
        grassCapacity += 100;
      }
    return {
      time: this.time,
      population: counts,
      grass,
      grassCapacity,
      fish: this.rivers.reduce((n, r) => n + r.fish, 0),
      fishCapacity: this.rivers.reduce((n, r) => n + r.capacity, 0),
      meat,
      hungry,
      thirsty,
      exhausted,
    };
  }
  recordSample(force = false) {
    const samples = this.stats.samples,
      last = samples.at(-1);
    if (
      !force &&
      last &&
      Math.floor(this.time / 5) === Math.floor(last.time / 5)
    )
      return;
    const point = this.snapshot();
    if (last && Math.abs(last.time - this.time) < 1e-8)
      samples[samples.length - 1] = point;
    else samples.push(point);
    if (samples.length > 720) samples.splice(0, samples.length - 720);
  }
  finishHunt(a: Animal, success = false) {
    if (a.trackedHunt === undefined) return;
    if (a.species === 'wolf' || a.species === 'bear')
      this.stats.hunts[a.species][success ? 'successful' : 'failed']++;
    a.trackedHunt = undefined;
  }
  generateRivers() {
    this.rivers = [];
    const mainX = (y: number) =>
      Math.round(44 + y * 0.18 + 4 * Math.sin(y / 6));
    const carve = (x: number, y: number, ford = false) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const id = 1 + Math.floor(y / 6),
        c = this.cells[y * W + x];
      Object.assign(c, {
        kind: ford ? 'grass' : 'water',
        food: 0,
        forage: false,
        river: id,
        ford,
      });
    };
    for (let y = 0; y < H; y++)
      for (let dx = -1; dx <= 1; dx++)
        carve(mainX(y) + dx, y, [12, 32, 46].includes(y));
    for (let x = 29; x <= mainX(25); x++) {
      const y = 25 + Math.round(Math.sin(x / 4));
      for (let dy = -1; dy <= 1; dy++) carve(x, y + dy, x === 38);
    }
    // Clear bank vegetation so animals can approach fishing and drinking spots.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = this.cells[y * W + x];
        if (c.river === undefined) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const bank = this.cell(x + dx, y + dy);
          if (bank.kind === 'tree') bank.kind = 'grass';
        }
      }
    for (let id = 1; id <= Math.ceil(H / 6); id++) {
      const tiles = this.cells.flatMap((c, i) =>
        c.river === id && c.kind === 'water' ? [i] : [],
      );
      if (!tiles.length) continue;
      const capacity = Math.round(12 + tiles.length * 0.4);
      this.rivers.push({
        id,
        name: 'Fernwater · section ' + id,
        tiles,
        capacity,
        fish: Math.round(capacity * (0.65 + this.random() * 0.3)),
      });
    }
  }
  catchFish(sectionId: number, amount = 1) {
    const section = this.rivers.find((r) => r.id === sectionId);
    if (!section || !Number.isFinite(amount) || amount <= 0) return 0;
    const caught = Math.min(section.fish, amount);
    section.fish -= caught;
    this.stats.fishCaught += caught;
    return caught;
  }
  removeAnimal(id: number) {
    const removed = this.animals.find((a) => a.id === id);
    if (!removed) return false;
    if (removed.alive) this.stats.removed[removed.species]++;
    this.finishHunt(removed);
    this.animals = this.animals.filter((a) => a.id !== id);
    for (const a of this.animals) {
      a.memory = a.memory.filter((m) => m.id !== id);
      if (a.target === id || a.foodTarget === id || a.combatTarget === id) {
        this.finishHunt(a);
        a.target = undefined;
        a.combatTarget = undefined;
        a.foodTarget = undefined;
        a.navigation = undefined;
        a.plan = undefined;
        a.planNote = 'Target removed; choosing a new plan.';
        a.path = [];
        a.goal = 'Explore';
        a.action = 'Wandering';
        a.reason = 'Looking for a new destination.';
        a.think = 0;
      }
    }
    syncHomes(this, true);
    this.recordSample(true);
    return true;
  }
  resetAnimals() {
    this.homes = [];
    this.nextHomeId = 1;
    this.nextHomeUpdate = this.time;
    this.animals = [];
    this.events = [];
    this.stats = createStatistics(this.time);
    this.recordSample(true);
  }
  random() {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  cell(x: number, y: number): Cell {
    if (x < 0 || y < 0 || x >= W || y >= H)
      return { kind: 'tree', food: 0, variant: 0, forage: false };
    return this.cells[Math.floor(y) * W + Math.floor(x)];
  }
  walkable(x: number, y: number) {
    return (
      x >= 0 && y >= 0 && x < W && y < H && this.cell(x, y)?.kind === 'grass'
    );
  }
  spawn(species: Species, x: number, y: number, born = false) {
    let p = this.nearest({ x, y }, (i) => this.cells[i].kind === 'grass');
    if (!p) return undefined;
    const id = this.nextId++;
    const names =
      species === 'deer'
        ? [
            'Fern',
            'Clover',
            'Willow',
            'Hazel',
            'Juniper',
            'Maple',
            'Aspen',
            'Briar',
          ]
        : species === 'wolf'
          ? ['Ash', 'Flint', 'Slate', 'Ember', 'Storm']
          : ['Kodiak', 'Cedar', 'Boulder', 'Copper', 'Moss'];
    const a: Animal = {
      ...createLifecycle(species, this.seed, id),
      id,
      memory: [],
      combatLog: [],
      name: names[(id - 1) % names.length] + ' ' + id,
      species,
      x: p.x,
      y: p.y,
      traits: {
        caution: 30 + this.random() * 55,
        boldness: 20 + this.random() * 60,
        sociability: 30 + this.random() * 60,
        exploration: 20 + this.random() * 60,
        persistence: 30 + this.random() * 50,
        sleepNeed: 30 + this.random() * 40,
      },
      hunger: 15 + this.random() * 40,
      thirst: 10 + this.random() * 35,
      fatigue: this.random() * 40,
      health: 100,
      alive: true,
      goal: 'Explore',
      action: 'Wandering',
      reason: 'Getting to know the meadow.',
      path: [],
      think: 0,
      history: [],
      scores: {},
      facing: 1,
      carcass: CARCASS_MEAT,
    };
    if (species === 'wolf') a.packId = a.id;
    else if (species === 'deer') a.herdId = a.id;
    this.animals.push(a);
    if (born) this.stats.births[species]++;
    else this.stats.added[species]++;
    this.recordSample(true);
    return a;
  }
  nearest(p: Point, test: (i: number) => boolean) {
    let best = Infinity,
      out: Point | undefined;
    for (let i = 0; i < this.cells.length; i++) {
      if (!test(i)) continue;
      const q = { x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 },
        d = distance(p, q);
      if (d < best) {
        best = d;
        out = q;
      }
    }
    return out;
  }
  coverAt(p: Point) {
    return coverAt(this, p);
  }
  terrainSpeed(p: Point, species: Species = 'deer') {
    return terrainSpeed(this, p, species);
  }
  route(a: Point, b: Point): Point[] {
    return terrainRoute(this, a, b, (a as Partial<Animal>).species ?? 'deer');
  }
  pursuitPath(a: Animal, p: Point) {
    if (this.clearLine(a, p)) {
      a.navigation = undefined;
      a.path = [{ x: p.x, y: p.y }];
      return;
    }
    const old = a.navigation;
    if (
      !old ||
      !a.path.length ||
      Math.floor(old.x) !== Math.floor(p.x) ||
      Math.floor(old.y) !== Math.floor(p.y) ||
      this.time >= old.repathAt
    ) {
      a.path = this.route(a, p);
      if (
        a.path.length &&
        this.clearLine(a.path.at(-1)!, p) &&
        distance(a.path.at(-1)!, p) > 0.01
      )
        a.path.push({ x: p.x, y: p.y });
      a.navigation = { x: p.x, y: p.y, repathAt: this.time + 0.75 };
    }
  }
  clearLine(a: Point, b: Point) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 10));
    let previous = -1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        x = a.x + dx * t,
        y = a.y + dy * t;
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const index = (y | 0) * W + (x | 0);
      if (index !== previous) {
        if (this.cells[index]?.kind !== 'grass') return false;
        previous = index;
      }
    }
    return true;
  }
  sightLine(a: Point, b: Point) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 10));
    let previous = -1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        x = a.x + dx * t,
        y = a.y + dy * t;
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const index = (y | 0) * W + (x | 0);
      if (index !== previous) {
        if (this.cells[index]?.kind === 'tree') return false;
        previous = index;
      }
    }
    return true;
  }

  perceptionRadius(a: Animal) {
    return a.species === 'deer'
      ? 3 + a.traits.caution * 0.075
      : 10 + a.traits.exploration * 0.1;
  }
  memoryLifetime(a: Animal, m: Memory) {
    return m.kind === 'water'
      ? BALANCE.waterMemory
      : m.kind === 'fish'
        ? 180
        : m.kind === 'grass'
          ? 120
          : m.kind === 'wolf'
            ? 5 + a.traits.caution * 0.15
            : 8 + a.traits.persistence * 0.4;
  }
  canSee(a: Animal, p: Point) {
    const dx = a.x - p.x,
      dy = a.y - p.y,
      target = p as Partial<Animal>,
      cover =
        target.id === undefined
          ? 0
          : this.coverAt(p) *
            (target.path?.length
              ? isSprinting(target as Animal)
                ? 0.35
                : 0.65
              : 1),
      r = Math.max(1.5, this.perceptionRadius(a) * (1 - cover * 0.55));
    return dx * dx + dy * dy <= r * r && this.sightLine(a, p);
  }
  remember(a: Animal, m: Memory) {
    const old = a.memory.find(
      (b) =>
        b.kind === m.kind &&
        (m.id !== undefined
          ? b.id === m.id
          : b.x === m.x && b.y === m.y && b.riverId === m.riverId),
    );
    if (old) Object.assign(old, m);
    else a.memory.push(m);
  }
  perceive(a: Animal) {
    a.memory = a.memory.filter(
      (m) => this.time - m.seen <= this.memoryLifetime(a, m),
    );
    const key = (
        kind: Memory['kind'],
        x: number,
        y: number,
        riverId?: number,
      ) =>
        x +
        y * W +
        (kind === 'water'
          ? 0
          : kind === 'grass'
            ? 1
            : kind === 'fish'
              ? 10 + (riverId ?? 0)
              : 2) *
          W *
          H,
      resources = new Map<number, Memory>(),
      invalid = new Set<Memory>();
    for (const m of a.memory)
      if (m.id === undefined && ['water', 'grass', 'fish'].includes(m.kind))
        resources.set(key(m.kind, m.x, m.y, m.riverId), m);
    const rememberResource = (
      kind: 'water' | 'grass' | 'fish',
      x: number,
      y: number,
      riverId?: number,
      stock?: number,
    ) => {
      const id = key(kind, x, y, riverId),
        old = resources.get(id);
      if (old) {
        old.seen = this.time;
        if (kind === 'fish') old.stock = stock;
      } else {
        const m: Memory =
          kind === 'fish'
            ? { x, y, kind, riverId, stock, seen: this.time }
            : { x, y, kind, seen: this.time };
        a.memory.push(m);
        resources.set(id, m);
      }
    };
    const r = this.perceptionRadius(a);
    for (
      let y = Math.max(0, Math.floor(a.y - r));
      y <= Math.min(H - 1, Math.floor(a.y + r));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(a.x - r));
        x <= Math.min(W - 1, Math.floor(a.x + r));
        x++
      ) {
        const p = { x: x + 0.5, y: y + 0.5 };
        if (!this.walkable(p.x, p.y) || !this.canSee(a, p)) continue;
        const index = y * W + x,
          east = x < W - 1 ? this.cells[index + 1] : undefined,
          west = x > 0 ? this.cells[index - 1] : undefined,
          south = y < H - 1 ? this.cells[index + W] : undefined,
          north = y > 0 ? this.cells[index - W] : undefined,
          water =
            east?.kind === 'water' ||
            west?.kind === 'water' ||
            south?.kind === 'water' ||
            north?.kind === 'water';
        if (a.species === 'bear') {
          const sections = new Set(
            [east, west, south, north]
              .filter((c) => c?.kind === 'water' && c.river !== undefined)
              .map((c) => c!.river!),
          );
          for (const riverId of sections) {
            const river = this.rivers.find((r) => r.id === riverId);
            if (river) rememberResource('fish', p.x, p.y, riverId, river.fish);
          }
        }
        for (const kind of ['water', 'grass'] as const) {
          const exists =
            kind === 'water'
              ? water
              : this.cell(x, y).forage && this.cell(x, y).food > 12;
          if (exists) rememberResource(kind, p.x, p.y);
          else {
            const old = resources.get(key(kind, p.x, p.y));
            if (old) invalid.add(old);
          }
        }
      }
    const visible = this.animals.filter(
        (b) => b.id !== a.id && this.canSee(a, b),
      ),
      visibleIds = new Set(visible.map((b) => b.id));
    a.memory = a.memory.filter(
      (m) => !invalid.has(m) && (m.id === undefined || !visibleIds.has(m.id)),
    );
    for (const b of visible)
      if (b.alive || b.carcass > 0)
        a.memory.push({
          x: b.x,
          y: b.y,
          id: b.id,
          kind: b.alive ? b.species : 'carcass',
          species: b.species,
          seen: this.time,
        });
    const animalsById = new Map(this.animals.map((b) => [b.id, b]));
    a.memory = a.memory.filter((m) => {
      if (m.id === undefined || !this.canSee(a, m)) return true;
      const b = animalsById.get(m.id);
      return !!b && distance(b, m) < 0.75 && (b.alive || b.carcass > 0);
    });
  }

  herdMembers(a: Animal) {
    return a.species === 'deer'
      ? this.animals.filter(
          (b) =>
            b.alive && b.species === 'deer' && b.herdId === (a.herdId ?? a.id),
        )
      : [];
  }
  knownHerd(a: Animal) {
    const ids = new Set(this.herdMembers(a).map((b) => b.id));
    return this.known(a, 'deer').filter(
      (m) => ids.has(m.id!) && this.time - m.seen < 8,
    );
  }
  nearbyHerd(a: Animal) {
    return this.herdMembers(a).filter(
      (b) => b.id !== a.id && distance(a, b) <= 8 && this.clearLine(a, b),
    );
  }
  coordinateHerd(a: Animal) {
    if (a.species !== 'deer') return;
    a.herdId ??= a.id;
    if (a.traits.sociability >= 35) {
      const mate = this.animals
        .filter(
          (b) =>
            b.alive &&
            b.species === 'deer' &&
            b.id !== a.id &&
            b.traits.sociability >= 35 &&
            distance(a, b) <= 6 &&
            this.canSee(a, b),
        )
        .sort((b, c) => b.id - c.id)[0];
      if (mate) {
        const old = a.herdId,
          other = mate.herdId ?? mate.id,
          id = Math.min(old, other);
        for (const b of this.animals)
          if (b.species === 'deer' && (b.herdId === old || b.herdId === other))
            b.herdId = id;
      }
    }
    if (a.traits.sociability >= 35)
      for (const mate of this.nearbyHerd(a))
        for (const m of mate.memory) {
          if (m.kind !== 'wolf' || this.time - m.seen > 3) continue;
          const old = a.memory.find((b) => b.kind === 'wolf' && b.id === m.id);
          if (!old || old.seen < m.seen)
            this.remember(a, { ...m, alarm: true });
        }
    a.herdStatus = this.herdMembers(a).length > 1 ? 'With herd' : 'Independent';
  }
  herdCenter(a: Animal): Point | undefined {
    const mates = this.knownHerd(a);
    if (!mates.length) return;
    return {
      x: mates.reduce((n, m) => n + m.x, 0) / mates.length,
      y: mates.reduce((n, m) => n + m.y, 0) / mates.length,
    };
  }
  regroupHerd(a: Animal) {
    if (
      a.species !== 'deer' ||
      a.traits.sociability < 35 ||
      a.hunger > BALANCE.socialNeedLimit ||
      a.thirst > BALANCE.socialNeedLimit ||
      a.fatigue > 65 ||
      (a.plan && !['Explore', 'Socialize'].includes(a.plan.goal))
    )
      return false;
    const center = this.herdCenter(a);
    if (!center || distance(a, center) < 7 - a.traits.sociability * 0.035)
      return false;
    const nearby = this.nearbyHerd(a);
    const p = this.nearest(
      center,
      (i) =>
        this.cells[i].kind === 'grass' &&
        !nearby.some(
          (b) =>
            distance(b, { x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 }) < 1.5,
        ),
    );
    if (!p || !this.route(a, p).length) return false;
    if (a.action === 'Rejoining herd') return false;
    this.setGoal(
      a,
      'Socialize',
      'Rejoining herd',
      'Sociability draws this deer toward remembered herd positions.',
      p,
    );
    a.herdStatus = 'Rejoining herd';
    return true;
  }
  resourceDestination(a: Animal, kind: 'water' | 'grass' | 'carcass' | 'fish') {
    const wolfHazards =
      a.species === 'wolf' &&
      !(
        this.combatReady(a) &&
        this.nearbyPack(a).filter((b) => this.combatReady(b)).length >= 3
      )
        ? this.known(a, 'bear')
        : [];
    const deerHazards =
      a.species === 'deer'
        ? [...this.known(a, 'wolf'), ...this.known(a, 'bear')]
        : [];
    const candidates =
      kind === 'grass' ? this.grazingChoices(a) : this.known(a, kind);
    let best: Memory | undefined,
      bestLength = Infinity,
      checked = 0;
    for (const p of candidates) {
      if (kind === 'fish' && (p.stock ?? 0) < 1) continue;
      if (
        a.species === 'bear' &&
        kind === 'carcass' &&
        p.species !== 'deer' &&
        p.species !== 'wolf'
      )
        continue;
      const danger = deerHazards.some(
        (m) => distance(m, p) < this.dangerRadius(a, m) + 0.5,
      );
      if (
        danger ||
        wolfHazards.some((b) => distance(b, p) < 7.5) ||
        (a.hunger < 75 && a.thirst < 75 && rivalHome(this, a, p))
      )
        continue;
      const direct = distance(a, p);
      if (direct < 0.7) return p;
      const path = this.route(a, p);
      checked++;
      if (
        deerHazards.some((b) =>
          path.some(
            (q) =>
              distance(q, b) < this.dangerRadius(a, b) &&
              distance(q, b) < distance(a, b) - 0.25,
          ),
        )
      )
        continue;
      if (
        wolfHazards.some((b) =>
          path.some(
            (q) => distance(q, b) < 7 && distance(q, b) < distance(a, b) - 0.25,
          ),
        )
      )
        continue;
      if (path.length && path.length < bestLength) {
        best = p;
        bestLength = path.length;
        if (path.length <= direct * 1.6 + 2) return p;
      }
      if (checked >= 8 && best) return best;
    }
    return best;
  }

  dangerRadius(a: Animal, m: Memory) {
    const predator = this.animals.find((b) => b.id === m.id),
      passive = m.kind === 'bear' && predator?.target !== a.id,
      base = passive
        ? Math.min(this.perceptionRadius(a), BALANCE.idleBearDangerRadius)
        : this.perceptionRadius(a);
    return a.thirst >= 90 || a.hunger >= 95 ? Math.min(base, 3) : base;
  }
  perceivedThreat(a: Animal, m: Memory) {
    const radius = this.dangerRadius(a, m),
      desperate = a.thirst >= 90 || a.hunger >= 95,
      passive =
        m.kind === 'bear' &&
        this.animals.find((b) => b.id === m.id)?.target !== a.id;
    return (
      distance(a, m) < radius ||
      (!desperate &&
        !passive &&
        m.alarm &&
        this.time - m.seen <= 3 &&
        distance(a, m) < 16)
    );
  }
  grazingChoices(a: Animal) {
    const mates = this.nearbyHerd(a),
      threats = this.known(a, 'wolf');
    return this.known(a, 'grass')
      .filter(
        (p) =>
          !threats.some(
            (b) => distance(b, p) < 2 + (100 - a.traits.boldness) * 0.035,
          ),
      )
      .sort((p, q) => {
        const cost = (v: Point) =>
          distance(a, v) +
          mates.reduce((n, b) => {
            const dest =
              b.plan?.steps.find((s) => s.kind === 'travel')?.destination ?? b;
            return n + (distance(dest, v) < 1.5 ? 5 : 0);
          }, 0);
        return cost(p) - cost(q);
      });
  }
  packMembers(a: Animal) {
    return a.species === 'wolf'
      ? this.animals.filter(
          (b) =>
            b.alive && b.species === 'wolf' && b.packId === (a.packId ?? a.id),
        )
      : [];
  }
  nearbyPack(a: Animal) {
    return this.packMembers(a).filter(
      (b) => b.id !== a.id && distance(a, b) <= 12 && this.clearLine(a, b),
    );
  }
  coordinatePack(a: Animal) {
    if (a.species !== 'wolf') return;
    a.packId ??= a.id;
    // Social wolves form stable packs on meeting; distant packs cannot communicate.
    if (a.traits.sociability >= 35) {
      const friend = this.animals
        .filter(
          (b) =>
            b.alive &&
            b.species === 'wolf' &&
            b.id !== a.id &&
            b.traits.sociability >= 35 &&
            distance(a, b) < 8 &&
            this.canSee(a, b),
        )
        .sort((b, c) => b.id - c.id)[0];
      if (friend) {
        const old = a.packId,
          other = friend.packId ?? friend.id,
          id = Math.min(old, other);
        for (const b of this.animals)
          if (b.species === 'wolf' && (b.packId === old || b.packId === other))
            b.packId = id;
      }
    }
    for (const friend of this.nearbyPack(a))
      for (const m of friend.memory) {
        if (
          !['deer', 'bear', 'carcass', 'water'].includes(m.kind) ||
          this.time - m.seen > this.memoryLifetime(a, m)
        )
          continue;
        const old = a.memory.find(
          (b) =>
            b.kind === m.kind &&
            (m.id !== undefined ? b.id === m.id : b.x === m.x && b.y === m.y),
        );
        if (!old || old.seen < m.seen) this.remember(a, { ...m });
      }
    a.packRole = this.packMembers(a).length > 1 ? 'Pack member' : 'Lone wolf';
  }
  joinPackHunt(a: Animal) {
    if (
      a.species !== 'wolf' ||
      lifeStage(a) === 'juvenile' ||
      a.hunger < BALANCE.packJoinHunger ||
      a.thirst > 80 ||
      a.fatigue >= 50 + a.traits.persistence * 0.4 ||
      a.traits.sociability < 35
    )
      return false;
    const hunter = this.nearbyPack(a)
      .filter(
        (b) =>
          b.plan?.steps[b.plan.index]?.kind === 'hunt' &&
          b.target !== undefined,
      )
      .sort((b, c) => b.id - c.id)[0];
    if (!hunter) return false;
    const prey = a.memory.find(
      (m) =>
        m.id === hunter.target &&
        (m.kind === 'deer' || m.kind === 'bear') &&
        this.time - m.seen <= this.memoryLifetime(a, m),
    );
    if (!prey) return false;
    if (a.target === prey.id && a.plan?.steps[a.plan.index]?.kind === 'hunt')
      return false;
    if (a.plan?.goal === 'Eat' && a.action === 'Feeding') return false;
    this.cancelPlan(a, 'Joining the pack hunt.');
    a.target = prey.id;
    this.setGoal(
      a,
      'Eat',
      'Hunting',
      'Joining nearby packmates pursuing prey #' + prey.id + '.',
      prey,
    );
    return true;
  }
  huntingGroup(a: Animal) {
    return [
      a,
      ...this.nearbyPack(a).filter(
        (b) =>
          b.target === a.target && b.plan?.steps[b.plan.index]?.kind === 'hunt',
      ),
    ].sort((b, c) => b.fatigue - c.fatigue || b.id - c.id);
  }
  packPursuitPoint(a: Animal, prey: Animal): Point {
    const group = this.huntingGroup(a),
      index = group.findIndex((b) => b.id === a.id);
    a.packRole =
      group.length < 2
        ? 'Solo hunter'
        : index === 0
          ? 'Chaser'
          : index % 2
            ? 'Left flank'
            : 'Right flank';
    if (index <= 0 || distance(a, prey) < 2) return prey;
    const lead = group[0],
      d = Math.max(0.1, distance(lead, prey)),
      dx = (prey.x - lead.x) / d,
      dy = (prey.y - lead.y) / d,
      side = index % 2 ? 1 : -1;
    const p = {
      x: prey.x + dx * 1.5 - dy * side * 1.5,
      y: prey.y + dy * 1.5 + dx * side * 1.5,
    };
    return this.clearLine(a, p) && this.clearLine(prey, p) ? p : prey;
  }
  reachablePrey(a: Animal, kind: 'deer' | 'wolf') {
    return this.known(a, kind).find(
      (m) => this.clearLine(a, m) || this.route(a, m).length > 0,
    );
  }
  known(a: Animal, kind: Memory['kind']) {
    return a.memory
      .filter((m) => m.kind === kind)
      .sort((b, c) => distance(a, b) - distance(a, c));
  }
  pursue(a: Animal) {
    const corpse = this.animals.find(
      (b) =>
        b.id === a.target && !b.alive && b.carcass > 0 && this.canSee(a, b),
    );
    if (corpse) {
      a.foodTarget = corpse.id;
      a.target = undefined;
      this.setGoal(
        a,
        'Eat',
        'Seeking carcass',
        'Sharing the pack kill.',
        corpse,
      );
      return;
    }
    const prey = this.animals.find((b) => b.id === a.target && b.alive);
    if (prey && this.canSee(a, prey)) {
      this.remember(a, {
        x: prey.x,
        y: prey.y,
        id: prey.id,
        kind: prey.species,
        species: prey.species,
        seen: this.time,
      });
      a.action = 'Hunting';
      if (
        prey.species !== 'deer' &&
        distance(a, prey) < 1.1 &&
        this.clearLine(a, prey)
      ) {
        a.action = 'Fighting';
        a.path = [];
        return;
      }
      const aim = a.species === 'wolf' ? this.packPursuitPoint(a, prey) : prey;
      a.reason =
        this.huntingGroup(a).length > 1
          ? a.packRole + ' in a coordinated pack hunt.'
          : 'Pursuing visible prey.';
      this.pursuitPath(a, aim);
      if (!a.path.length) {
        this.cancelPlan(a, 'Prey is unreachable; seeking another food source.');
        a.reason = 'Prey is unreachable; seeking another food source.';
        return;
      }
      if (!this.clearLine(a, aim))
        a.reason =
          'Routing toward prey through a safe crossing or around obstacles.';
      return;
    }
    const last = a.memory.find(
      (m) =>
        m.id === a.target &&
        (m.kind === 'deer' || m.kind === 'wolf' || m.kind === 'bear') &&
        this.time - m.seen <= this.memoryLifetime(a, m),
    );
    if (last && distance(a, last) > 0.7) {
      a.action = 'Searching for prey';
      a.reason = 'Prey lost from sight. Checking its last known location.';
      this.pursuitPath(a, last);
      a.reason = 'Prey out of sight; searching its last remembered position.';
    } else {
      a.memory = a.memory.filter((m) => m.id !== a.target);
      this.cancelPlan(a, 'Prey lost; choosing a new plan.');
      a.action = 'Wandering';
      a.goal = 'Explore';
    }
  }

  combatReady(a: Animal) {
    return (
      a.alive &&
      lifeStage(a) !== 'juvenile' &&
      a.health > 25 &&
      a.fatigue < 70 &&
      a.thirst < 90
    );
  }
  defendingWolves(bear: Animal, wolf: Animal) {
    return this.packMembers(wolf).filter(
      (b) =>
        this.combatReady(b) &&
        distance(b, bear) < 6 &&
        this.canSee(b, bear) &&
        (b.id === wolf.id || this.canSee(wolf, b)),
    );
  }
  fleeFrom(a: Animal, threat: Point, reason: string) {
    const center =
        a.species === 'deer' && a.traits.sociability >= 35
          ? this.herdCenter(a)
          : undefined,
      escape = escapeRoute(this, a, threat, center);
    this.cancelPlan(a, reason);
    this.setGoal(a, 'Safety', 'Fleeing', reason);
    a.path = escape.path;
    a.plan = {
      goal: 'Safety',
      steps: escape.path.length
        ? [
            {
              kind: 'travel',
              label: 'Fleeing',
              destination: escape.path.at(-1),
            },
          ]
        : [],
      index: 0,
      elapsed: 0,
    };
    if (escape.cover > 0) a.reason += ' Using woodland cover.';
    a.retreatUntil = this.time + 5;
  }
  assessCombat(a: Animal) {
    if (a.species === 'deer' || lifeStage(a) === 'juvenile') return false;
    const enemies = this.animals
      .filter(
        (b) =>
          b.alive &&
          ((a.species === 'wolf' && b.species === 'bear') ||
            (a.species === 'bear' && b.species === 'wolf')) &&
          this.canSee(a, b),
      )
      .sort((b, c) => distance(a, b) - distance(a, c));
    const enemy = enemies[0];
    if (!enemy) return false;
    const attackers = enemies.filter(
      (b) => b.target === a.id && ['Hunting', 'Fighting'].includes(b.action),
    );
    if (a.species === 'wolf') {
      const allies = this.defendingWolves(enemy, a);
      if (distance(a, enemy) > 7 && !attackers.length) return false;
      if (allies.length >= 4 && a.health > 25 && a.fatigue < 80) {
        if (
          a.target !== enemy.id ||
          a.plan?.steps[a.plan.index]?.kind !== 'hunt'
        ) {
          this.cancelPlan(a, 'Pack defending against bear.');
          a.target = enemy.id;
          this.setGoal(
            a,
            'Defend',
            'Hunting',
            'Four or more nearby fit packmates can confront the bear.',
            enemy,
          );
        }
        return true;
      }
      this.fleeFrom(
        a,
        enemy,
        'Bear nearby; insufficient fit packmates or too injured to fight.',
      );
      return true;
    }
    const largePack = enemies.some(
      (w) => this.defendingWolves(a, w).length >= 4,
    );
    if (
      (largePack && distance(a, enemy) < 8) ||
      (attackers.length && a.health < 25)
    ) {
      this.fleeFrom(
        a,
        enemy,
        'Retreating from a strong wolf pack or serious injuries.',
      );
      return true;
    }
    if (attackers.length) {
      const target = attackers[0];
      if (a.target !== target.id) {
        this.cancelPlan(a, 'Defending against wolves.');
        a.target = target.id;
        this.setGoal(
          a,
          'Defend',
          'Hunting',
          'Defending against an attacking wolf.',
          target,
        );
      }
      return true;
    }
    return false;
  }
  logDamage(
    a: Animal,
    opponent: Animal,
    direction: CombatEntry['direction'],
    damage: number,
  ) {
    if (damage <= 0) return;
    if (direction === 'dealt')
      a.lastStrike = {
        time: this.time,
        targetId: opponent.id,
        x: opponent.x,
        y: opponent.y,
      };
    const time = Math.floor(this.time),
      entry = a.combatLog.find(
        (e) =>
          e.time === time &&
          e.direction === direction &&
          e.opponentId === opponent.id,
      );
    if (entry) entry.damage += damage;
    else
      a.combatLog.unshift({
        time,
        direction,
        opponentId: opponent.id,
        opponentName: opponent.name,
        opponentSpecies: opponent.species,
        damage,
      });
    a.combatLog = a.combatLog.slice(0, 60);
  }
  resolveCombat(dt: number) {
    const alive = this.animals.filter((a) => a.alive),
      hits = new Map<number, number>(),
      sources = new Map<number, Animal>(),
      strikes: { attacker: Animal; target: Animal; damage: number }[] = [];
    for (const a of alive) {
      if (a.species === 'deer') continue;
      let target = alive.find(
        (b) => b.id === a.target && ['Hunting', 'Fighting'].includes(a.action),
      );
      if (!target || distance(a, target) > 1.2 || !this.clearLine(a, target))
        target = alive
          .filter(
            (b) =>
              b.target === a.id &&
              ['Hunting', 'Fighting'].includes(b.action) &&
              distance(a, b) <= 1.2 &&
              this.clearLine(a, b),
          )
          .sort((b, c) => distance(a, b) - distance(a, c))[0];
      if (!target || distance(a, target) > 1.2 || !this.clearLine(a, target))
        continue;
      const damage =
        (a.species === 'bear' ? 32 : target.species === 'deer' ? 30 : 12) *
        (1 - a.fatigue * 0.004) *
        (0.6 + (0.4 * a.health) / 100) *
        (0.2 + 0.8 * maturity(a)) *
        dt;
      hits.set(target.id, (hits.get(target.id) ?? 0) + damage);
      sources.set(target.id, a);
      strikes.push({ attacker: a, target, damage });
      a.combatTarget = target.id;
      a.fatigue = clamp(a.fatigue + dt * 0.8);
    }
    for (const hit of strikes) {
      const actual =
        hit.damage *
        Math.min(
          1,
          hit.target.health / (hits.get(hit.target.id) ?? hit.damage),
        );
      this.logDamage(hit.attacker, hit.target, 'dealt', actual);
      this.logDamage(hit.target, hit.attacker, 'received', actual);
    }
    for (const a of alive) {
      const damage = hits.get(a.id);
      if (damage) {
        a.health = Math.max(0, a.health - damage);
        a.lastHit = this.time;
        a.think = 0;
      } else a.combatTarget = undefined;
    }
    for (const a of alive)
      if (a.health <= 0) {
        const killer = sources.get(a.id)!;
        this.die(
          a,
          'was hunted by ' + killer.name,
          a.species === 'deer' || alive.some((b) => b.trackedHunt === a.id)
            ? 'predation'
            : 'combat',
        );
        for (const hunter of alive)
          if (hunter.alive && hunter.target === a.id) {
            this.finishHunt(hunter, this.canSee(hunter, a));
            this.cancelPlan(hunter, 'Target defeated.');
            hunter.foodTarget = a.id;
            this.setGoal(
              hunter,
              'Eat',
              'Seeking carcass',
              'Feeding after the encounter.',
              a,
            );
          }
      }
  }
  cancelPlan(a: Animal, why: string) {
    this.finishHunt(a);
    a.plan = undefined;
    a.action = 'Wandering';
    a.path = [];
    a.target = undefined;
    a.combatTarget = undefined;
    a.foodTarget = undefined;
    a.fishingRiver = undefined;
    a.navigation = undefined;
    a.mateId = undefined;
    a.planNote = why;
    a.think = 0;
  }
  setGoal(a: Animal, goal: string, action: string, reason: string, p?: Point) {
    a.navigation = undefined;
    const hunt =
      goal === 'Eat' &&
      action === 'Hunting' &&
      (a.species === 'wolf' || a.species === 'bear');
    if (a.trackedHunt !== undefined && (!hunt || a.trackedHunt !== a.target))
      this.finishHunt(a);
    if (hunt && a.target !== undefined && a.trackedHunt === undefined) {
      a.trackedHunt = a.target;
      this.stats.hunts[a.species as 'wolf' | 'bear'].started++;
    }
    if (a.goal !== goal) {
      a.history.unshift(Math.floor(this.time) + 's · ' + goal);
      a.history = a.history.slice(0, 5);
    }
    a.goal = goal;
    a.action = action;
    a.reason = reason;
    a.path = p ? this.route(a, p) : [];
    const steps: ActionStep[] = [];
    if (action === 'Hunting')
      steps.push(
        { kind: 'hunt', label: 'Pursue prey' },
        { kind: 'feed', label: 'Feed on carcass' },
      );
    else {
      if (p)
        steps.push({
          kind: 'travel',
          label: action,
          destination: { x: p.x, y: p.y },
        });
      if (goal !== 'Safety')
        steps.push({ kind: 'check', label: 'Check surroundings' });
      const kind =
        goal === 'Drink'
          ? 'drink'
          : goal === 'Eat'
            ? a.species === 'deer'
              ? 'graze'
              : action === 'Seeking fish'
                ? 'fish'
                : 'feed'
            : goal === 'Rest'
              ? 'rest'
              : undefined;
      if (kind)
        steps.push({
          kind,
          label:
            kind === 'drink'
              ? 'Drink'
              : kind === 'graze'
                ? 'Graze'
                : kind === 'feed'
                  ? 'Feed'
                  : kind === 'fish'
                    ? 'Catch fish'
                    : 'Rest',
        });
    }
    a.plan = { goal, steps, index: 0, elapsed: 0 };
    a.planNote = '';
  }
  advancePlan(a: Animal, dt: number) {
    if (advanceHomePlan(this, a, dt)) return;
    if (advanceFamilyPlan(this, a, dt)) return;
    const plan = a.plan;
    if (!plan) return;
    const step = plan.steps[plan.index];
    if (!step) {
      this.cancelPlan(a, 'Plan complete.');
      return;
    }
    const next = () => {
      plan.index++;
      plan.elapsed = 0;
      if (plan.index >= plan.steps.length) this.cancelPlan(a, 'Plan complete.');
    };
    if (step.kind === 'travel') {
      a.action = step.label;
      if (!a.path.length) {
        if (step.destination && distance(a, step.destination) > 1) {
          const p = step.destination;
          a.memory = a.memory.filter(
            (m) => m.id !== undefined || distance(m, p) > 0.1,
          );
          this.cancelPlan(a, 'Destination unreachable; choosing another plan.');
          return;
        }
        next();
      }
      return;
    }
    if (step.kind === 'check') {
      a.action = 'Checking surroundings';
      a.path = [];
      plan.elapsed += dt;
      if (plan.elapsed >= 0.4 + a.traits.caution * 0.008) {
        this.perceive(a);
        next();
      }
      return;
    }
    if (step.kind === 'hunt') return;
    if (step.kind === 'fish') {
      const adjacent = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const c = this.cell(Math.floor(a.x) + dx, Math.floor(a.y) + dy);
        return c.kind === 'water' && c.river === a.fishingRiver;
      });
      const river = this.rivers.find((r) => r.id === a.fishingRiver);
      if (!adjacent || !river || river.fish < 1) {
        for (const m of a.memory)
          if (m.kind === 'fish' && m.riverId === a.fishingRiver) m.stock = 0;
        this.cancelPlan(
          a,
          'Fishing spot empty or unavailable; looking for another food source.',
        );
        return;
      }
      a.action = 'Fishing';
      a.path = [];
      plan.elapsed += dt;
      if (plan.elapsed >= 3) {
        const caught = this.catchFish(river.id, 1);
        if (caught > 0) a.lastCatch = { time: this.time, riverId: river.id };
        a.hunger = clamp(a.hunger - caught * 12);
        a.thirst = clamp(a.thirst - caught * 3);
        plan.elapsed = 0;
        for (const m of a.memory)
          if (m.kind === 'fish' && m.riverId === river.id) m.stock = river.fish;
      }
      if (a.hunger <= 15) next();
      return;
    }
    if (step.kind === 'drink') {
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(
        ([dx, dy]) =>
          this.cell(Math.floor(a.x) + dx, Math.floor(a.y) + dy).kind ===
          'water',
      );
      if (!near) {
        this.cancelPlan(a, 'Water unavailable; searching again.');
        return;
      }
      a.action = 'Drinking';
      if (a.thirst <= 15) next();
    }
    if (step.kind === 'graze') {
      const c = this.cell(a.x, a.y);
      if (!c.forage || c.food <= 0) {
        this.cancelPlan(a, 'Food patch depleted; finding another.');
        return;
      }
      a.action = 'Grazing';
      if (a.hunger <= 15) next();
    }
    if (step.kind === 'feed') {
      const food = this.animals.find(
        (b) => b.id === a.foodTarget && !b.alive && b.carcass > 0,
      );
      if (!food || distance(a, food) >= 1) {
        this.cancelPlan(a, 'Carcass unavailable; searching again.');
        return;
      }
      a.action = 'Feeding';
      if (a.hunger <= 15) next();
    }
    if (step.kind === 'rest') {
      a.action = 'Sleeping';
      if (a.fatigue <= 10) next();
    }
  }

  decide(a: Animal) {
    this.perceive(a);
    this.coordinatePack(a);
    this.coordinateHerd(a);
    discoverHomes(this, a);
    const others = this.animals.filter(
      (b) => b.alive && b.id !== a.id && this.canSee(a, b),
    );
    const threat =
      a.species === 'deer'
        ? [...this.known(a, 'wolf'), ...this.known(a, 'bear')]
            .filter((b) => this.perceivedThreat(a, b))
            .sort((b, c) => distance(a, b) - distance(a, c))[0]
        : undefined;
    a.scores = {
      Eat: a.hunger,
      Drink: a.thirst * 1.12,
      Rest: a.fatigue,
      Explore: 18 + a.traits.exploration * 0.1,
      Socialize: a.traits.sociability * 0.32,
      Safety: threat ? 130 : 0,
    };
    if (threat) {
      a.herdStatus = 'Fleeing danger';
      this.fleeFrom(
        a,
        threat,
        `Predator nearby. Caution ${Math.round(a.traits.caution)} controls detection distance.`,
      );
      return;
    }
    if (lifeStage(a) === 'juvenile' && familyDecision(this, a)) return;
    if (this.assessCombat(a)) return;
    if (lifeStage(a) !== 'juvenile' && familyDecision(this, a)) return;
    if (this.joinPackHunt(a)) return;
    if (this.regroupHerd(a)) return;
    if (a.plan && a.plan.goal !== 'Safety') {
      const current = a.scores[a.goal] ?? 0,
        urgent =
          ((a.action === 'Hunting' || a.action === 'Searching for prey') &&
            a.fatigue >= 50 + a.traits.persistence * 0.4) ||
          (a.thirst > BALANCE.urgentThirst &&
            a.goal !== 'Drink' &&
            a.scores.Drink > current + 8) ||
          (a.hunger > BALANCE.urgentHunger &&
            a.goal !== 'Eat' &&
            a.scores.Eat > current + 8) ||
          (a.fatigue > BALANCE.urgentFatigue &&
            a.goal !== 'Rest' &&
            a.scores.Rest > current + 8);
      if (!urgent) return;
      this.cancelPlan(a, 'An urgent need interrupted the plan.');
    }
    let goal = Object.entries(a.scores).sort(
      (p, q) =>
        q[1] + (q[0] === a.goal ? 7 : 0) - (p[1] + (p[0] === a.goal ? 7 : 0)),
    )[0][0];
    if (homeDecision(this, a, goal)) return;
    if (goal === 'Drink') {
      const p = this.resourceDestination(a, 'water');
      if (p) {
        this.setGoal(
          a,
          goal,
          distance(a, p) < 0.7 ? 'Drinking' : 'Seeking water',
          'Returning to a discovered shoreline.',
          p,
        );
        return;
      }
    }
    if (goal === 'Eat') {
      if (a.species === 'deer') {
        const p = this.resourceDestination(a, 'grass');
        if (p) {
          this.setGoal(
            a,
            goal,
            distance(a, p) < 0.7 ? 'Grazing' : 'Seeking grass',
            'Hunger is high. Boldness affects how close to predators it will feed.',
            p,
          );
          return;
        }
      } else {
        if (a.species === 'bear') {
          const spot = this.resourceDestination(a, 'fish');
          if (spot) {
            a.fishingRiver = spot.riverId;
            this.setGoal(
              a,
              goal,
              'Seeking fish',
              'Fish are preferred. Returning to a remembered fishing bank.',
              spot,
            );
            return;
          }
        }
        const dead = this.resourceDestination(a, 'carcass');
        if (dead) {
          a.foodTarget = dead.id;
          this.setGoal(
            a,
            goal,
            'Seeking carcass',
            'Scavenging conserves energy compared with hunting.',
            dead,
          );
          return;
        }
        const prey =
          a.species === 'wolf'
            ? this.reachablePrey(a, 'deer')
            : (this.reachablePrey(a, 'deer') ??
              this.known(a, 'wolf').find((m) => {
                const wolf = this.animals.find((b) => b.id === m.id);
                return (
                  wolf &&
                  this.canSee(a, wolf) &&
                  this.defendingWolves(a, wolf).length < 4 &&
                  (this.clearLine(a, wolf) || this.route(a, wolf).length > 0)
                );
              }));
        if (
          prey &&
          lifeStage(a) !== 'juvenile' &&
          a.fatigue < 50 + a.traits.persistence * 0.4
        ) {
          a.target = prey.id;
          this.setGoal(
            a,
            goal,
            'Hunting',
            `Pursuing remembered prey #${prey.id}. Persistence controls when exhaustion ends the hunt.`,
            prey,
          );
          return;
        }
        goal = a.fatigue > 60 ? 'Rest' : 'Explore';
      }
    }
    if (goal === 'Rest') {
      this.setGoal(
        a,
        goal,
        'Sleeping',
        'Restoring energy. Sleep requirement controls fatigue accumulation.',
      );
      return;
    }
    if (goal === 'Socialize' && a.species !== 'bear') {
      const friend = others
        .filter(
          (b) =>
            b.species === a.species &&
            (a.species === 'wolf'
              ? b.packId === a.packId
              : b.herdId === a.herdId) &&
            distance(a, b) > 3 &&
            distance(a, b) < 15,
        )
        .sort((b, c) => distance(a, b) - distance(a, c))[0];
      if (friend) {
        this.setGoal(
          a,
          goal,
          'Joining group',
          'Sociability draws this animal toward companions.',
          friend,
        );
        return;
      }
    }
    if (
      a.species === 'wolf' &&
      a.traits.sociability >= 35 &&
      a.hunger < BALANCE.socialNeedLimit &&
      a.thirst < BALANCE.socialNeedLimit &&
      a.fatigue < 65
    ) {
      const mate = this.known(a, 'wolf').find(
        (m) =>
          this.packMembers(a).some((b) => b.id === m.id) && distance(a, m) > 5,
      );
      if (mate) {
        this.setGoal(
          a,
          'Socialize',
          'Regrouping',
          'Returning to a packmate’s last known position.',
          mate,
        );
        return;
      }
    }
    const searchingWater =
        a.thirst > 40 && !this.resourceDestination(a, 'water'),
      searchingFood =
        a.hunger > 40 &&
        (a.species === 'deer'
          ? !this.resourceDestination(a, 'grass')
          : !this.resourceDestination(a, 'carcass') &&
            (a.species !== 'bear' || !this.resourceDestination(a, 'fish')));
    if (a.goal === 'Explore' && a.path.length) return;
    const searching = searchingWater || searchingFood;
    if (searching) a.searchHeading ??= this.random() * Math.PI * 2;
    else a.searchHeading = undefined;
    for (let n = 0; n < 15; n++) {
      const r = searching
          ? 8 + a.traits.exploration * 0.08
          : 3 + a.traits.exploration * 0.1,
        angle = searching
          ? a.searchHeading! + (this.random() - 0.5) * 1.4
          : this.random() * Math.PI * 2,
        p = {
          x: clamp(a.x + Math.cos(angle) * r, 0.5, W - 0.5),
          y: clamp(a.y + Math.sin(angle) * r, 0.5, H - 0.5),
        };
      if (
        searching &&
        (a.x + Math.cos(angle) * r < 0.5 ||
          a.x + Math.cos(angle) * r > W - 0.5 ||
          a.y + Math.sin(angle) * r < 0.5 ||
          a.y + Math.sin(angle) * r > H - 0.5)
      ) {
        a.searchHeading! += Math.PI * 0.55;
        continue;
      }
      if (!searching) {
        p.x = clamp(a.x + (this.random() - 0.5) * r, 0.5, W - 0.5);
        p.y = clamp(a.y + (this.random() - 0.5) * r, 0.5, H - 0.5);
      }
      if (
        distance(a, p) > (searching ? 2 : 0.3) &&
        this.walkable(p.x, p.y) &&
        this.route(a, p).length
      ) {
        if (searching && this.route(a, p).length > r * 2.5) {
          a.searchHeading! += Math.PI * 0.55;
          continue;
        }
        if (searching) a.searchHeading = angle;
        this.setGoal(
          a,
          'Explore',
          'Wandering',
          searchingWater
            ? 'Searching new ground for water.'
            : searchingFood
              ? 'Searching new ground for food.'
              : 'Exploring the surrounding habitat.',
          p,
        );
        return;
      }
      if (searching) a.searchHeading! += Math.PI * 0.55;
    }
  }
  step(dt: number) {
    this.time += dt;
    syncHomes(this);
    for (const r of this.rivers)
      r.fish = Math.min(r.capacity, r.fish + dt * BALANCE.fishRegrowth);
    for (const c of this.cells)
      if (c.kind === 'grass' && c.forage)
        c.food = clamp(c.food + dt * BALANCE.grassRegrowth);
    for (const a of this.animals) {
      if (!a.alive) {
        const before = a.carcass;
        a.carcass = Math.max(0, a.carcass - dt * CARCASS_DECAY);
        if (a.carcass === 0 && before > 0) a.depletedAt = this.time;
        continue;
      }
      a.age = Math.min(a.age + dt, a.naturalDeathAge);
      if (a.age >= a.naturalDeathAge) {
        this.die(a, 'died of old age', 'oldAge');
        continue;
      }
      a.hunger = clamp(
        a.hunger +
          dt *
            BALANCE.hunger *
            (0.55 + 0.45 * maturity(a)) *
            (a.pregnancy ? 1.2 : 1),
      );
      a.thirst = clamp(
        a.thirst + dt * BALANCE.thirst * (0.55 + 0.45 * maturity(a)),
      );
      a.fatigue = clamp(
        a.fatigue +
          dt * (0.06 + a.traits.sleepNeed * 0.0012) * ageFatigueFactor(a),
      );
      a.think -= dt;
      const emergency =
        a.species === 'deer' &&
        a.goal !== 'Safety' &&
        this.animals.some(
          (b) =>
            b.alive &&
            (b.species === 'wolf' || b.species === 'bear') &&
            this.canSee(a, b) &&
            (b.species !== 'bear' ||
              b.target === a.id ||
              distance(a, b) < BALANCE.idleBearDangerRadius),
        );
      const attacked = this.animals.some(
        (b) => b.alive && b.target === a.id && distance(a, b) < 3,
      );
      const closeBear =
        a.species === 'wolf' &&
        a.goal !== 'Safety' &&
        this.animals.some(
          (b) =>
            b.alive &&
            b.species === 'bear' &&
            distance(a, b) < 4 &&
            this.canSee(a, b),
        );
      if (a.think <= 0 || emergency || attacked || closeBear) {
        this.decide(a);
        a.think = 0.7 + this.random() * 0.5;
      }
      this.advancePlan(a, dt);
      if (
        a.action === 'Hunting' ||
        a.action === 'Searching for prey' ||
        a.action === 'Fighting'
      )
        this.pursue(a);
      if (a.path.length) {
        const sprinting = isSprinting(a),
          p = a.path[0],
          d = distance(a, p);
        const speed = movementSpeed(a) * this.terrainSpeed(a, a.species);
        const move = Math.min(d, speed * dt);
        if (d > 0) {
          const next = {
            x: a.x + ((p.x - a.x) / d) * move,
            y: a.y + ((p.y - a.y) / d) * move,
          };
          if (this.clearLine(a, next)) {
            a.facing = p.x < a.x ? -1 : 1;
            a.x = next.x;
            a.y = next.y;
          } else {
            a.path = [];
            a.navigation = undefined;
            a.think = 0;
          }
        }
        if (move >= d - 1e-8) a.path.shift();
        a.fatigue = clamp(
          a.fatigue +
            dt *
              (sprinting ? (a.species === 'wolf' ? 0.7 : 1.7) : 0.08) *
              ageFatigueFactor(a),
        );
      }

      if (!a.path.length) {
        if (
          a.action === 'Drinking' &&
          a.plan?.steps[a.plan.index]?.kind === 'drink'
        ) {
          const near = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(
            ([dx, dy]) =>
              this.cell(Math.floor(a.x) + dx, Math.floor(a.y) + dy)?.kind ===
              'water',
          );
          if (near) {
            a.action = 'Drinking';
            a.thirst = clamp(a.thirst - dt * 10);
          }
        }
        if (
          a.action === 'Grazing' &&
          a.plan?.steps[a.plan.index]?.kind === 'graze' &&
          a.species === 'deer'
        ) {
          const c = this.cell(a.x, a.y);
          if (c?.kind === 'grass' && c.forage && c.food > 0) {
            a.action = 'Grazing';
            const amount = Math.min(c.food, dt * 5);
            c.food -= amount;
            this.stats.grassEaten += amount;
            a.hunger = clamp(a.hunger - amount * 1.5);
          }
        }
        if (
          a.action === 'Feeding' &&
          a.plan?.steps[a.plan.index]?.kind === 'feed' &&
          (a.species === 'wolf' || a.species === 'bear')
        ) {
          const food = this.animals.find(
            (b) => b.id === a.foodTarget && !b.alive,
          );
          if (food && distance(a, food) < 1 && food.carcass > 0) {
            a.action = 'Feeding';
            const amount = Math.min(food.carcass, dt * 6);
            food.carcass -= amount;
            this.stats.meatEaten += amount;
            if (food.carcass === 0 && food.depletedAt === undefined)
              food.depletedAt = this.time;
            a.hunger = clamp(a.hunger - amount * 2);
          }
        }
        if (
          a.action === 'Sleeping' &&
          a.plan?.steps[a.plan.index]?.kind === 'rest'
        )
          a.fatigue = clamp(a.fatigue - dt * 4);
      }
      if (a.hunger > 97 || a.thirst > 97) a.health -= dt * 0.7;
      else if (a.lastHit === undefined || this.time - a.lastHit > 10)
        a.health = clamp(a.health + dt * 0.05);
      if (a.health <= 0)
        this.die(
          a,
          a.thirst > 97 ? 'died of thirst' : 'died of hunger',
          a.thirst > 97 ? 'thirst' : 'hunger',
        );
    }
    this.resolveCombat(dt);
    updateFamilies(this);
    this.recordSample();
  }
  die(a: Animal, why: string, cause: DeathCause = 'other') {
    if (!a.alive) return;
    this.finishHunt(a);
    this.stats.deaths[cause][a.species]++;
    a.diedAt = this.time;
    a.deathCause = cause;
    a.depletedAt = undefined;
    a.navigation = undefined;
    a.carcassCapacity = juvenileMeat(a);
    a.carcass = a.carcassCapacity;
    a.pregnancy = undefined;
    a.mateId = undefined;
    a.combatTarget = undefined;
    a.target = undefined;
    a.plan = undefined;
    a.alive = false;
    a.health = 0;
    a.path = [];
    a.action = 'Deceased';
    this.events.unshift(`${a.name} ${why}.`);
    this.events = this.events.slice(0, 30);
    this.recordSample(true);
  }
  serialize() {
    return JSON.stringify(
      {
        version: 9,
        homes: this.homes,
        nextHomeId: this.nextHomeId,
        nextHomeUpdate: this.nextHomeUpdate,
        birthLimit: this.birthLimit,
        stats: this.stats,
        rivers: this.rivers,
        seed: this.seed,
        cells: this.cells,
        animals: this.animals,
        time: this.time,
        nextId: this.nextId,
        events: this.events,
      },
      (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
            )
          : value,
    );
  }
  static restore(raw: string) {
    const d = JSON.parse(raw);
    if (
      ![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(d.version) ||
      d.cells?.length !== W * H ||
      !Array.isArray(d.animals)
    )
      throw new Error('Invalid save');
    const w = new World(1, false);
    Object.assign(w, d);
    if (d.version < 9) {
      w.homes = [];
      w.nextHomeId = 1;
      w.nextHomeUpdate = w.time;
      for (const a of w.animals) {
        a.homeId = undefined;
        a.knownHomeIds = undefined;
        a.homeSearchAt = undefined;
        a.homeVisitAt = undefined;
        a.homePatrolAt = undefined;
        a.homeShareAt = undefined;
      }
    }
    if (d.version < 7) w.birthLimit = 200;
    if (
      !Number.isInteger(w.birthLimit) ||
      w.birthLimit < 0 ||
      w.birthLimit > 1000
    )
      throw new Error('Invalid birth limit');
    if (!d.rivers) {
      w.rivers = [];
    }
    if (!d.stats) {
      w.stats = createStatistics(w.time);
    }
    w.stats.deaths.oldAge ??= population();
    w.stats.births ??= population();
    if (d.version === 1) {
      for (let i = 0; i < w.cells.length; i++) {
        const c = w.cells[i];
        c.forage =
          c.kind === 'grass' && (Math.imul(i + 1, 2654435761) >>> 0) % 100 < 18;
        if (!c.forage) c.food = 0;
      }
      for (const a of w.animals)
        a.memory = a.memory?.filter((m) => m.kind !== 'grass') ?? [];
    }
    for (const a of w.animals) {
      if (d.version < 6)
        Object.assign(a, createLifecycle(a.species, w.seed, a.id));
      if (!validLifecycle(a)) throw new Error('Invalid lifecycle in save');
      if (
        a.navigation &&
        (!Number.isFinite(a.navigation.x) ||
          !Number.isFinite(a.navigation.y) ||
          !Number.isFinite(a.navigation.repathAt))
      )
        throw new Error('Invalid navigation in save');
      if (d.version >= 7 && !validFamily(a, w.time))
        throw new Error('Invalid family in save');
      if (a.alive && !w.walkable(a.x, a.y)) {
        const p = w.nearest(a, (i) => w.cells[i].kind === 'grass');
        if (!p) throw new Error('No walkable habitat');
        a.x = p.x;
        a.y = p.y;
        a.path = [];
        a.navigation = undefined;
        a.think = 0;
      }
      if (d.version < 4)
        a.carcass = a.alive
          ? CARCASS_MEAT
          : Math.min(CARCASS_MEAT, Math.max(0, a.carcass / 2));
      a.memory ??= [];
      a.combatLog ??= [];
      if (a.species === 'wolf') a.packId ??= a.id;
      else if (a.species === 'deer') a.herdId ??= a.id;
    }
    if (!d.stats) {
      for (const a of w.animals) a.trackedHunt = undefined;
      w.recordSample(true);
    }
    validateHomes(w);
    return w;
  }
}
