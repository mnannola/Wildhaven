import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { World, Species, W } from './sim';
import {
  establishHome,
  homeDecision,
  homeFor,
  syncHomes,
  discoverHomes,
  rivalHome,
  residents,
} from './homes';
import { LIFE_CYCLE } from './lifecycle';
import { familyDecision } from './reproduction';
import { familyVisuals } from './familyAnimations';
import { HomeDetails, HomeInspector } from './HomeDetails';
import { drawHomeMarkers, drawHomeRange } from './homeRendering';

function habitat(species: Species = 'wolf') {
  const w = new World(82);
  w.cells = w.cells.map((c) => ({
    ...c,
    kind: 'grass',
    forage: false,
    food: 0,
    ford: false,
    river: undefined,
  }));
  w.rivers = [];
  w.cells[20 * W + 25].kind = 'water';
  Object.assign(w.cells[21 * W + 20], { forage: true, food: 100 });
  const a = w.spawn(species, 20.5, 20.5)!;
  a.hunger = a.thirst = a.fatigue = 20;
  a.age = LIFE_CYCLE[species].adult;
  a.traits.sociability = 0;
  if (species !== 'deer') {
    const food = w.spawn('deer', 22.5, 21.5)!;
    w.die(food, 'test');
  }
  w.perceive(a);
  return { w, a };
}

test('each species establishes a reachable dry home near discovered resources', () => {
  for (const species of ['deer', 'wolf', 'bear'] as const) {
    const { w, a } = habitat(species),
      seed = w.seed,
      home = establishHome(w, a);
    assert.ok(home);
    assert.equal(home.species, species);
    assert.equal(w.walkable(home.x, home.y), true);
    assert.equal(w.cell(home.x, home.y).ford, false);
    assert.equal(a.homeId, home.id);
    assert.ok(a.knownHomeIds?.includes(home.id));
    assert.equal(w.seed, seed);
    assert.equal(w.homes.length, 1);
  }
});

test('settling does not invent resources, create homes for juveniles, or override critical needs', () => {
  for (const kind of ['no knowledge', 'young', 'thirsty'] as const) {
    const { w, a } = habitat();
    if (kind === 'no knowledge') a.memory = [];
    if (kind === 'young') a.age = 0;
    if (kind === 'thirsty') a.thirst = 95;
    assert.equal(establishHome(w, a), undefined);
    assert.equal(w.homes.length, 0);
  }
  const { w, a } = habitat();
  establishHome(w, a);
  a.thirst = 95;
  assert.equal(homeDecision(w, a, 'Drink'), false);
});

test('packmates share one den and retain it after their founder is removed', () => {
  const { w, a } = habitat(),
    b = w.spawn('wolf', 21.5, 20.5)!;
  b.packId = a.packId;
  const home = establishHome(w, a)!;
  assert.equal(b.homeId, home.id);
  assert.equal(residents(w, home).length, 2);
  w.removeAnimal(a.id);
  assert.equal(home.abandonedAt, undefined);
  assert.equal(home.ownerId, b.id);
  assert.equal(b.homeId, home.id);
});

test('herd members share a gathering site and do not claim exclusive territory', () => {
  const { w, a } = habitat('deer'),
    b = w.spawn('deer', 21.5, 20.5)!;
  b.herdId = a.herdId;
  const home = establishHome(w, a)!;
  assert.equal(b.homeId, home.id);
  assert.equal(home.kind, 'deer-gathering');
  b.knownHomeIds = [home.id];
  b.herdId = b.id;
  assert.equal(rivalHome(w, b, home), undefined);
});

test('merged packs retain the den sheltering dependent pups', () => {
  const { w, a } = habitat(),
    first = establishHome(w, a)!,
    b = w.spawn('wolf', 35.5, 20.5)!;
  b.hunger = b.thirst = b.fatigue = 20;
  b.traits.exploration = 100;
  w.perceive(b);
  const second = establishHome(w, b)!;
  assert.ok(second);
  assert.notEqual(first.id, second.id);
  const pup = w.spawn('wolf', b.x, b.y)!;
  pup.age = 0;
  pup.caregiverId = b.id;
  pup.packId = b.packId;
  pup.homeId = second.id;
  b.packId = a.packId;
  pup.packId = a.packId;
  syncHomes(w, true);
  assert.equal(a.homeId, second.id);
  assert.equal(b.homeId, second.id);
  assert.equal(pup.homeId, second.id);
  assert.equal(first.abandonedAt, w.time);
});

test('bear cubs share the maternal den until adulthood then seek their own range', () => {
  const { w, a } = habitat('bear'),
    home = establishHome(w, a)!,
    cub = w.spawn('bear', a.x, a.y)!;
  cub.age = 0;
  cub.caregiverId = a.id;
  cub.homeId = home.id;
  syncHomes(w, true);
  assert.equal(cub.homeId, home.id);
  cub.age = LIFE_CYCLE.bear.adult;
  syncHomes(w, true);
  assert.equal(cub.homeId, undefined);
  assert.equal(a.homeId, home.id);
  assert.equal(home.abandonedAt, undefined);
});

test('empty homes become abandoned, can be reclaimed, and eventually fade', () => {
  const { w, a } = habitat(),
    home = establishHome(w, a)!;
  w.removeAnimal(a.id);
  assert.equal(home.abandonedAt, 0);
  const b = w.spawn('wolf', home.x, home.y)!;
  b.hunger = b.thirst = b.fatigue = 20;
  w.perceive(b);
  assert.equal(establishHome(w, b)?.id, home.id);
  assert.equal(home.abandonedAt, undefined);
  w.removeAnimal(b.id);
  w.time = 241;
  syncHomes(w, true);
  assert.equal(w.homes.length, 0);
  assert.ok(w.animals.every((a) => !a.knownHomeIds?.includes(home.id)));
});

test('returning and resting use the home without suppressing survival priorities', () => {
  const { w, a } = habitat(),
    home = establishHome(w, a)!;
  a.x = home.x - 14;
  a.y = home.y;
  w.time = 100;
  assert.equal(homeDecision(w, a, 'Explore'), true);
  assert.equal(a.action, 'Returning home');
  assert.deepEqual(a.path.at(-1), { x: home.x, y: home.y });
  a.x = home.x;
  a.y = home.y;
  a.fatigue = 70;
  a.plan = undefined;
  assert.equal(homeDecision(w, a, 'Rest'), true);
  assert.equal(a.action, 'Sleeping');
  assert.match(a.reason, /home/);
  a.hunger = 90;
  assert.equal(homeDecision(w, a, 'Eat'), false);
});

test('wolves patrol familiar ground and complete a timed marking action', () => {
  const { w, a } = habitat(),
    home = establishHome(w, a)!;
  a.x = home.x;
  a.y = home.y;
  w.time = 70;
  a.homePatrolAt = 0;
  a.homeVisitAt = 70;
  assert.equal(homeDecision(w, a, 'Explore'), true);
  assert.ok(['Patrolling territory', 'Marking territory'].includes(a.action));
  assert.ok(a.plan?.steps.some((s) => s.kind === 'mark'));
  a.plan = {
    goal: 'Home',
    steps: [{ kind: 'mark', label: 'Marking territory' }],
    index: 0,
    elapsed: 0,
  };
  for (let i = 0; i < 21; i++) w.advancePlan(a, 0.1);
  assert.equal(a.plan, undefined);
  assert.ok(a.homePatrolAt! > w.time);
  assert.equal(home.lastUsedAt, w.time);
});

test('visible territorial owners prompt healthy rivals to yield without damage', () => {
  const { w, a } = habitat(),
    home = establishHome(w, a)!,
    b = w.spawn('wolf', home.x + 1, home.y)!;
  b.packId = b.id;
  b.hunger = b.thirst = b.fatigue = 20;
  b.homeId = undefined;
  // Give the visitor a separate established base before testing the encounter.
  const visitor = {
    ...home,
    id: w.nextHomeId++,
    groupId: b.id,
    ownerId: b.id,
    x: home.x + 12,
  };
  w.homes.push(visitor);
  b.homeId = visitor.id;
  discoverHomes(w, b);
  a.x = home.x;
  a.y = home.y;
  w.time = 70;
  a.homePatrolAt = 0;
  assert.equal(homeDecision(w, a, 'Explore'), true);
  assert.equal(a.action, 'Guarding territory');
  assert.equal(rivalHome(w, b, b)?.id, home.id);
  assert.equal(homeDecision(w, b, 'Explore'), true);
  assert.equal(b.action, 'Fleeing');
  assert.match(b.reason, /Yielding/);
  assert.equal(a.health, 100);
  assert.equal(b.health, 100);
  assert.equal(b.target, undefined);
});

test('pups wait at their den and mothers return between foraging trips', () => {
  const { w, a } = habitat(),
    home = establishHome(w, a)!,
    pup = w.spawn('wolf', home.x, home.y)!;
  a.sex = 'female';
  pup.age = 0;
  pup.caregiverId = a.id;
  pup.homeId = home.id;
  pup.hunger = pup.thirst = pup.fatigue = 20;
  a.x = home.x + 4;
  a.y = home.y;
  a.homeVisitAt = 0;
  w.time = 40;
  assert.equal(familyDecision(w, pup), true);
  assert.equal(pup.action, 'Resting at den');
  assert.equal(pup.path.length, 0);
  assert.equal(familyVisuals(w, w.time).get(pup.id)?.action, 'rest');
  a.plan = undefined;
  assert.equal(homeDecision(w, a, 'Explore'), true);
  assert.equal(a.action, 'Returning home');
  assert.equal(
    familyDecision(w, a),
    false,
    'Mother should not wait for pups that intentionally remain at the den.',
  );
});

test('current homes and behavior survive deterministic save/load', () => {
  const { w, a } = habitat();
  establishHome(w, a);
  w.time = 65;
  homeDecision(w, a, 'Explore');
  const saved = World.restore(w.serialize());
  assert.equal(saved.serialize(), w.serialize());
  for (let i = 0; i < 80; i++) {
    w.step(0.1);
    saved.step(0.1);
  }
  assert.equal(saved.serialize(), w.serialize());
});

test('newborn pups inherit the maternal den and family knowledge', () => {
  const { w, a } = habitat(),
    home = establishHome(w, a)!,
    father = w.spawn('wolf', 22.5, 20.5)!;
  a.sex = 'female';
  const traits = { ...father.traits };
  w.removeAnimal(father.id);
  a.pregnancy = {
    fatherId: father.id,
    fatherName: father.name,
    fatherTraits: traits,
    conceivedAt: w.time,
    dueAt: w.time + 0.1,
    litterSize: 1,
  };
  w.step(0.1);
  const pup = w.animals.find((b) => b.parentIds?.[0] === a.id)!;
  assert.ok(pup);
  assert.equal(pup.homeId, home.id);
  assert.ok(pup.knownHomeIds?.includes(home.id));
  assert.equal(pup.packId, a.packId);
  assert.equal(
    World.restore(w.serialize()).animals.find((b) => b.id === pup.id)!.homeId,
    home.id,
  );
});

test('nearby residents share remembered resources without renewing their age', () => {
  const { w, a } = habitat('deer'),
    home = establishHome(w, a)!,
    b = w.spawn('deer', a.x + 1, a.y)!;
  b.homeId = home.id;
  b.herdId = a.herdId;
  b.memory = [];
  w.time = 10;
  const seed = w.seed;
  discoverHomes(w, b);
  assert.ok(b.memory.some((m) => m.kind === 'water'));
  assert.ok(
    b.memory.filter((m) => m.kind === 'water').every((m) => m.seen === 0),
  );
  assert.equal(w.seed, seed);
  b.memory = [];
  b.x = 60;
  w.time = 21;
  discoverHomes(w, b);
  assert.equal(b.memory.length, 0);
});

test('deer choose alternate water banks and take bounded risks when dehydration is critical', () => {
  const { w, a } = habitat('deer'),
    wolf = w.spawn('wolf', 26.5, 20.5)!;
  a.traits.caution = 100;
  a.hunger = a.thirst = a.fatigue = 0;
  a.memory = [
    { x: 22.5, y: 20.5, kind: 'water', seen: 0 },
    { x: 18.5, y: 29.5, kind: 'water', seen: 0 },
    { x: wolf.x, y: wolf.y, id: wolf.id, kind: 'wolf', seen: 0 },
  ];
  assert.equal(w.resourceDestination(a, 'water')?.y, 29.5);
  w.cells[20 * W + 17].kind = 'water';
  a.thirst = 95;
  w.decide(a);
  assert.equal(a.goal, 'Drink');
  wolf.x = a.x + 2;
  w.decide(a);
  assert.equal(a.action, 'Fleeing');
});

test('older saves load without invented homes and malformed home data is rejected', () => {
  const { w, a } = habitat();
  establishHome(w, a);
  const old = JSON.parse(w.serialize());
  old.version = 8;
  delete old.homes;
  delete old.nextHomeId;
  delete old.nextHomeUpdate;
  const saved = World.restore(JSON.stringify(old));
  assert.equal(saved.homes.length, 0);
  assert.equal(saved.animals[0].homeId, undefined);
  assert.equal(saved.animals[0].age, a.age);
  for (const mutate of [
    (d: any) => {
      d.homes[0].x = -1;
    },
    (d: any) => {
      d.homes[0].id = 0;
    },
    (d: any) => {
      d.animals[0].homeId = 999;
    },
    (d: any) => {
      d.nextHomeUpdate = -1;
    },
    (d: any) => {
      d.homes.push({ ...d.homes[0] });
    },
  ]) {
    const data = JSON.parse(w.serialize());
    mutate(data);
    assert.throws(
      () => World.restore(JSON.stringify(data)),
      /Invalid home|Invalid animal home/,
    );
  }
  w.resetAnimals();
  assert.equal(w.homes.length, 0);
  assert.equal(w.nextHomeId, 1);
});

test('home inspector and markers expose occupied and abandoned sites', () => {
  const { w, a } = habitat(),
    home = establishHome(w, a)!;
  const info = renderToStaticMarkup(
    React.createElement(HomeDetails, { world: w, animal: a, onView: () => {} }),
  );
  assert.match(info, /Wolf pack den/);
  assert.match(info, /View home/);
  const inspector = renderToStaticMarkup(
    React.createElement(HomeInspector, { world: w, home, onRange: () => {} }),
  );
  assert.match(inspector, /Occupied/);
  assert.match(inspector, /Show range/);
  const calls: string[] = [];
  let g: any;
  g = new Proxy(
    {},
    {
      get: (_t, key) => () => {
        calls.push(String(key));
        return g;
      },
    },
  );
  drawHomeMarkers(w, g);
  drawHomeRange(home, g, true);
  assert.ok(calls.includes('fillEllipse'));
  assert.ok(calls.includes('strokeCircle'));
});
