import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, W, H, distance } from './sim.ts';
import { isSprinting } from './sim.ts';

test('optimized visibility matches the original sampled terrain rules', () => {
  const w = new World(23);
  const reference = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    const steps = Math.max(1, Math.ceil(distance(a, b) * 10));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!w.walkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))
        return false;
    }
    return true;
  };
  for (let i = 0; i < 1000; i++) {
    const a = { x: w.random() * (W + 4) - 2, y: w.random() * (H + 4) - 2 },
      b = { x: w.random() * (W + 4) - 2, y: w.random() * (H + 4) - 2 };
    assert.equal(w.clearLine(a, b), reference(a, b));
  }
});

test('deer can use known water away from an unreachable shoreline', () => {
  const w = new World(1);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const a = w.spawn('deer', 20.5, 20.5)!;
  const trapped = { x: 22.5, y: 20.5 };
  for (const [x, y] of [
    [21, 20],
    [23, 20],
    [22, 19],
    [22, 21],
  ])
    w.cells[y * W + x].kind = 'tree';
  a.memory = [
    { ...trapped, kind: 'water', seen: 0 },
    { x: 20.5, y: 24.5, kind: 'water', seen: 0 },
  ];
  const p = w.resourceDestination(a, 'water');
  assert.equal(p?.y, 24.5);
});
test('critical thirst interrupts social travel before dehydration', () => {
  const {
    w,
    deer: [a],
  } = herdWorld();
  w.cells[20 * W + 19].kind = 'water';
  w.setGoal(a, 'Socialize', 'Joining group', 'test', { x: 25.5, y: 20.5 });
  a.thirst = 75;
  a.hunger = a.fatigue = 0;
  w.decide(a);
  assert.equal(a.goal, 'Drink');
});
test('a competing need cannot repeatedly restart the more urgent drinking plan', () => {
  const w = new World(1);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const a = w.spawn('deer', 20.5, 20.5)!;
  w.cells[20 * W + 21].kind = 'water';
  a.thirst = 100;
  a.hunger = 90;
  a.fatigue = 0;
  for (let i = 0; i < 25; i++) {
    a.think = 0;
    w.step(0.1);
  }
  assert.ok(
    a.thirst < 95,
    'A thirsty animal must finish checking and actually drink despite also being hungry.',
  );
});
test('searches turn into the reserve rather than sliding along the map edge', () => {
  const w = new World(1);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const a = w.spawn('deer', 10.5, H - 1.5)!;
  a.hunger = a.fatigue = 0;
  a.thirst = 80;
  a.searchHeading = Math.PI / 2;
  w.decide(a);
  assert.equal(a.goal, 'Explore');
  assert.ok(a.path.length);
  assert.ok(a.path.at(-1)!.y < H - 3);
});
test('a passive fishing bear does not prevent deer drinking at a safe distance', () => {
  const w = new World(1);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const a = w.spawn('deer', 20.5, 20.5)!,
    bear = w.spawn('bear', 26.5, 20.5)!;
  bear.action = 'Fishing';
  a.traits.caution = 100;
  a.thirst = 80;
  a.hunger = a.fatigue = 0;
  w.cells[20 * W + 19].kind = 'water';
  w.decide(a);
  assert.equal(a.goal, 'Drink');
  bear.target = a.id;
  bear.action = 'Hunting';
  w.decide(a);
  assert.equal(a.goal, 'Safety');
});

test('ecosystem counts distinguish player removals and deaths and normalize food patches', () => {
  const w = new World(1),
    a = w.spawn('deer', 20, 20)!,
    b = w.spawn('wolf', 21, 20)!;
  assert.equal(w.stats.added.deer, 1);
  assert.equal(w.stats.added.wolf, 1);
  w.removeAnimal(b.id);
  assert.equal(w.stats.removed.wolf, 1);
  assert.equal(w.stats.deaths.other.wolf, 0);
  w.die(a, 'test', 'hunger');
  w.die(a, 'test again', 'hunger');
  assert.equal(w.stats.deaths.hunger.deer, 1);
  const sample = w.snapshot();
  assert.equal(sample.population.deer, 0);
  assert.equal(sample.meat, 50);
  assert.equal(
    sample.grassCapacity,
    w.cells.filter((c) => c.kind === 'grass' && c.forage).length * 100,
  );
  assert.ok(sample.grass <= sample.grassCapacity);
});
test('hunt attempts are not counted twice and kills credit pursuing packmates once', () => {
  const {
    w,
    wolves: [a, b],
  } = packWorld();
  const prey = w.spawn('deer', 23.5, 20.5)!;
  w.decide(a);
  w.decide(b);
  assert.equal(w.stats.hunts.wolf.started, 2);
  w.setGoal(a, 'Eat', 'Hunting', 'continue', prey);
  assert.equal(w.stats.hunts.wolf.started, 2);
  a.x = b.x = prey.x;
  a.y = b.y = prey.y;
  prey.health = 1;
  w.resolveCombat(0.1);
  assert.equal(w.stats.deaths.predation.deer, 1);
  assert.equal(w.stats.hunts.wolf.successful, 2);
  assert.equal(w.stats.hunts.wolf.failed, 0);
  w.resolveCombat(0.1);
  assert.equal(w.stats.hunts.wolf.successful, 2);
});
test('abandoned hunts fail once and defensive fights are excluded', () => {
  const {
    w,
    wolves: [a],
  } = packWorld();
  const prey = w.spawn('deer', 26.5, 20.5)!;
  w.decide(a);
  w.cancelPlan(a, 'lost prey');
  w.cancelPlan(a, 'still lost');
  assert.equal(w.stats.hunts.wolf.failed, 1);
  a.target = prey.id;
  w.setGoal(a, 'Defend', 'Hunting', 'test', prey);
  assert.equal(w.stats.hunts.wolf.started, 1);
});
test('resource counters measure consumption rather than natural decay', () => {
  const { w, bear } = fishingWorld(5);
  for (let i = 0; i < 55; i++) w.step(0.1);
  assert.equal(w.stats.fishCaught, 1);
  assert.ok(bear.hunger < 80);
  const food = w.spawn('deer', 20.5, 20.5)!;
  w.die(food, 'test');
  const eaten = w.stats.meatEaten;
  w.step(0.1);
  assert.equal(w.stats.meatEaten, eaten);
});
test('history is bounded and statistics round trip or reset without changing terrain', () => {
  const w = new World(1);
  w.spawn('deer', 20, 20);
  for (let i = 0; i < 800; i++) {
    w.time = i * 5;
    w.recordSample();
  }
  assert.equal(w.stats.samples.length, 720);
  assert.equal(w.stats.samples.at(-1)?.time, w.time);
  const restored = World.restore(w.serialize());
  assert.deepEqual(restored.stats, w.stats);
  const cells = w.cells;
  w.resetAnimals();
  assert.equal(w.stats.samples.length, 1);
  assert.equal(w.stats.startedAt, w.time);
  assert.equal(w.stats.added.deer, 0);
  assert.equal(w.cells, cells);
  assert.equal(w.stats.samples[0].population.deer, 0);
});
test('legacy saves start statistics at load time without inventing historical deaths', () => {
  const w = new World(1);
  w.spawn('deer', 20, 20);
  w.time = 80;
  const data = JSON.parse(w.serialize());
  data.version = 4;
  delete data.stats;
  const restored = World.restore(JSON.stringify(data));
  assert.equal(restored.stats.startedAt, 80);
  assert.equal(restored.stats.added.deer, 0);
  assert.equal(restored.stats.samples[0].population.deer, 1);
  assert.equal(restored.stats.deaths.predation.deer, 0);
});
test('survival deaths record their real cause and predator deaths can be predation', () => {
  for (const cause of ['hunger', 'thirst'] as const) {
    const w = new World(1),
      a = w.spawn('deer', 20, 20)!;
    a.health = 0.01;
    a.hunger = cause === 'hunger' ? 100 : 0;
    a.thirst = cause === 'thirst' ? 100 : 0;
    w.step(0.1);
    assert.equal(w.stats.deaths[cause].deer, 1);
  }
  const {
    w,
    bear,
    wolves: [wolf],
  } = battle(1);
  bear.target = wolf.id;
  w.setGoal(bear, 'Eat', 'Hunting', 'hunting wolf', wolf);
  wolf.health = 1;
  w.resolveCombat(0.1);
  assert.equal(w.stats.deaths.predation.wolf, 1);
  assert.equal(w.stats.hunts.bear.successful, 1);
});

test('death timing persists and repeated death does not refill a carcass', () => {
  const w = new World(1),
    a = w.spawn('wolf', 20, 20)!;
  w.time = 12;
  w.die(a, 'test');
  assert.equal(a.diedAt, 12);
  a.carcass = 20;
  w.time = 15;
  w.die(a, 'test again');
  assert.equal(a.carcass, 20);
  assert.equal(a.diedAt, 12);
  assert.equal(w.events.length, 1);
  assert.equal(World.restore(w.serialize()).animals[0].diedAt, 12);
});
test('natural decay records depletion once and preserves the remains fade timer', () => {
  const w = new World(1),
    a = w.spawn('deer', 20, 20)!;
  w.die(a, 'test');
  a.carcass = 0.1;
  w.step(2);
  assert.equal(a.carcass, 0);
  assert.equal(a.depletedAt, 2);
  w.step(5);
  assert.equal(a.depletedAt, 2);
  assert.equal(World.restore(w.serialize()).animals[0].depletedAt, 2);
});
test('scavenging the final meat starts the remains fade timer', () => {
  const { w, bear } = fishingWorld(0);
  const food = w.spawn('deer', 20.5, 20.5)!;
  w.die(food, 'test');
  food.carcass = 1;
  w.decide(bear);
  for (let i = 0; i < 30; i++) w.step(0.1);
  assert.equal(food.carcass, 0);
  assert.ok(food.depletedAt !== undefined);
  assert.ok(food.depletedAt! < 3);
});

test('fresh carcasses have half the meat and decay at twice the old rate', () => {
  const w = new World(1);
  const a = w.spawn('deer', 20, 20)!;
  w.die(a, 'test');
  assert.equal(a.carcass, 50);
  w.step(10);
  assert.ok(Math.abs(a.carcass - 49.1) < 1e-8);
  w.step(1000);
  assert.equal(a.carcass, 0);
});
test('older carcasses lose half their remaining meat exactly once on upgrade', () => {
  const w = new World(1);
  const a = w.spawn('deer', 20, 20)!;
  w.die(a, 'test');
  const raw = JSON.parse(w.serialize());
  raw.version = 3;
  raw.animals[0].carcass = 60;
  const restored = World.restore(JSON.stringify(raw));
  assert.equal(restored.animals[0].carcass, 30);
  assert.equal(World.restore(restored.serialize()).animals[0].carcass, 30);
});

test('fishing animation events are emitted only for real catches and persist in saves', () => {
  const { w, bear } = fishingWorld();
  for (let i = 0; i < 20; i++) w.step(0.1);
  assert.equal(Boolean(bear.lastCatch), false);
  for (let i = 0; i < 35; i++) w.step(0.1);
  assert.equal(bear.lastCatch?.riverId, 1);
  assert.ok(bear.lastCatch!.time <= w.time);
  const restored = World.restore(w.serialize());
  assert.deepEqual(restored.animals[0].lastCatch, bear.lastCatch);
  const empty = fishingWorld(0);
  for (let i = 0; i < 60; i++) empty.w.step(0.1);
  assert.equal(empty.bear.lastCatch, undefined);
});
test('combat animation events require damage and record the struck opponent', () => {
  const {
    w,
    bear,
    wolves: [wolf],
  } = battle(1);
  bear.target = wolf.id;
  bear.action = 'Fighting';
  w.time = 2;
  w.resolveCombat(0.1);
  assert.deepEqual(bear.lastStrike, {
    time: 2,
    targetId: wolf.id,
    x: wolf.x,
    y: wolf.y,
  });
  const previous = bear.lastStrike;
  wolf.x = 60;
  w.time = 3;
  w.resolveCombat(0.1);
  assert.equal(bear.lastStrike, previous);
  assert.deepEqual(
    World.restore(w.serialize()).animals[0].lastStrike,
    previous,
  );
});

test('combat logs mirror actual damage and combine hits in one second', () => {
  const {
    w,
    bear,
    wolves: [wolf],
  } = battle(1);
  bear.target = wolf.id;
  bear.action = 'Fighting';
  w.time = 1;
  w.resolveCombat(0.1);
  const hp = wolf.health;
  w.resolveCombat(0.1);
  const dealt = bear.combatLog.find((e) => e.direction === 'dealt')!,
    received = wolf.combatLog.find((e) => e.direction === 'received')!;
  assert.equal(bear.combatLog.filter((e) => e.direction === 'dealt').length, 1);
  assert.ok(wolf.health < hp);
  assert.ok(Math.abs(dealt.damage - (100 - wolf.health)) < 1e-8);
  assert.equal(dealt.damage, received.damage);
  assert.equal(dealt.opponentName, wolf.name);
  w.time = 2;
  w.resolveCombat(0.1);
  assert.equal(bear.combatLog.filter((e) => e.direction === 'dealt').length, 2);
});
test('lethal hits log remaining health without overcounting and preserve the victim log', () => {
  const {
    w,
    bear,
    wolves: [wolf],
  } = battle(1);
  wolf.health = 1;
  bear.target = wolf.id;
  bear.action = 'Fighting';
  w.resolveCombat(0.1);
  assert.equal(wolf.alive, false);
  assert.equal(
    wolf.combatLog.find((e) => e.direction === 'received')?.damage,
    1,
  );
  assert.equal(bear.combatLog.find((e) => e.direction === 'dealt')?.damage, 1);
  const restored = World.restore(w.serialize());
  assert.deepEqual(restored.animals[1].combatLog, wolf.combatLog);
});
test('combat logs are bounded and initialize in older saves', () => {
  const {
    w,
    bear,
    wolves: [wolf],
  } = battle(1);
  for (let i = 0; i < 100; i++) {
    w.time = i;
    w.logDamage(bear, wolf, 'dealt', 1);
  }
  assert.equal(bear.combatLog.length, 60);
  assert.equal(bear.combatLog[0].time, 99);
  const d = JSON.parse(w.serialize());
  for (const a of d.animals) delete a.combatLog;
  assert.deepEqual(World.restore(JSON.stringify(d)).animals[0].combatLog, []);
});

function battle(count: number) {
  const w = new World(13);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass', river: undefined }));
  w.rivers = [];
  const bear = w.spawn('bear', 25.5, 25.5)!;
  const wolves = Array.from({ length: count }, (_, i) => {
    const a = w.spawn(
      'wolf',
      25.5 + Math.cos((i * 2 * Math.PI) / count) * 0.7,
      25.5 + Math.sin((i * 2 * Math.PI) / count) * 0.7,
    )!;
    a.x = 25.5 + Math.cos((i * 2 * Math.PI) / count) * 0.7;
    a.y = 25.5 + Math.sin((i * 2 * Math.PI) / count) * 0.7;
    a.packId = 1;
    a.traits.sociability = 90;
    return a;
  });
  for (const a of [bear, ...wolves]) {
    a.health = 100;
    a.hunger = 60;
    a.thirst = a.fatigue = 0;
  }
  return { w, bear, wolves };
}
test('one bear defeats one wolf in a close fight', () => {
  const {
    w,
    bear,
    wolves: [wolf],
  } = battle(1);
  bear.target = wolf.id;
  wolf.target = bear.id;
  bear.action = wolf.action = 'Fighting';
  for (let i = 0; i < 150 && bear.alive && wolf.alive; i++)
    w.resolveCombat(0.1);
  assert.equal(wolf.alive, false);
  assert.equal(bear.alive, true);
  assert.ok(bear.health > 0);
});
test('four participating wolves can defeat a healthy bear', () => {
  const { w, bear, wolves } = battle(4);
  for (const wolf of wolves) {
    wolf.target = bear.id;
    wolf.action = 'Fighting';
  }
  for (let i = 0; i < 150 && bear.alive; i++) w.resolveCombat(0.1);
  assert.equal(bear.alive, false);
  assert.ok(wolves.filter((a) => a.alive).length >= 3);
});
test('a coordinated pack can win through normal movement and decisions', () => {
  const { w, bear, wolves } = battle(4);
  for (let i = 0; i < 400 && bear.alive; i++) w.step(0.1);
  assert.equal(bear.alive, false);
  assert.ok(wolves.some((a) => a.alive));
  assert.ok(w.events.some((e) => e.includes(bear.name)));
});
test('pack defense needs nearby fit allies; lone wolves retreat', () => {
  const { w, bear, wolves } = battle(4);
  for (const a of wolves) w.decide(a);
  assert.ok(wolves.every((a) => a.target === bear.id));
  wolves[3].x = 60;
  w.decide(wolves[0]);
  assert.equal(wolves[0].action, 'Fleeing');
  assert.equal(wolves[0].target, undefined);
  const solo = battle(1);
  solo.w.decide(solo.wolves[0]);
  assert.equal(solo.wolves[0].action, 'Fleeing');
});
test('combat cannot deal damage through trees and exhausted fighters hit less hard', () => {
  const {
    w,
    bear,
    wolves: [wolf],
  } = battle(1);
  bear.x = 20.5;
  wolf.x = 22.5;
  bear.y = wolf.y = 20.5;
  w.cells[20 * W + 21].kind = 'tree';
  bear.target = wolf.id;
  bear.action = 'Fighting';
  w.resolveCombat(0.1);
  assert.equal(wolf.health, 100);
  w.cells[20 * W + 21].kind = 'grass';
  wolf.x = 21.1;
  w.resolveCombat(0.1);
  const fresh = 100 - wolf.health;
  wolf.health = 100;
  bear.fatigue = 90;
  w.resolveCombat(0.1);
  assert.ok(100 - wolf.health < fresh);
});
test('ongoing combat survives saves and target deletion clears the fight', () => {
  const { w, bear, wolves } = battle(4);
  for (const a of wolves) w.decide(a);
  w.step(0.1);
  const saved = World.restore(w.serialize());
  for (let i = 0; i < 20; i++) {
    w.step(0.1);
    saved.step(0.1);
  }
  assert.equal(w.serialize(), saved.serialize());
  w.removeAnimal(bear.id);
  assert.ok(
    wolves.every((a) => a.target !== bear.id && a.combatTarget !== bear.id),
  );
});

function fishingWorld(fish = 5) {
  const w = new World(5);
  w.cells = w.cells.map((c) => ({
    ...c,
    kind: 'grass',
    river: undefined,
    ford: false,
  }));
  const tile = 20 * W + 21;
  w.cells[tile].kind = 'water';
  w.cells[tile].river = 1;
  w.rivers = [{ id: 1, name: 'Test river', tiles: [tile], fish, capacity: 10 }];
  const bear = w.spawn('bear', 20.5, 20.5)!;
  bear.hunger = 80;
  bear.thirst = bear.fatigue = 0;
  return { w, bear };
}
test('bears prefer discovered fish over carrion and consume finite fish stocks', () => {
  const { w, bear } = fishingWorld();
  const deer = w.spawn('deer', 20.5, 21.5)!;
  w.die(deer, 'test');
  w.decide(bear);
  assert.equal(bear.action, 'Seeking fish');
  assert.equal(bear.fishingRiver, 1);
  assert.equal(bear.herdId, undefined);
  const meat = deer.carcass;
  for (let i = 0; i < 55; i++) w.step(0.1);
  assert.ok(bear.hunger < 75);
  assert.ok(w.rivers[0].fish < 5);
  assert.ok(deer.carcass > meat - 1);
  assert.equal(bear.action, 'Fishing');
});
test('bears scavenge deer and wolf carcasses when fish are depleted', () => {
  for (const species of ['deer', 'wolf'] as const) {
    const { w, bear } = fishingWorld(0);
    const food = w.spawn(species, 20.5, 21.5)!;
    w.die(food, 'test');
    const initialMeat = food.carcass;
    w.decide(bear);
    assert.equal(bear.foodTarget, food.id);
    assert.equal(bear.action, 'Seeking carcass');
    for (let i = 0; i < 50; i++) w.step(0.1);
    assert.ok(bear.hunger < 70);
    assert.ok(food.carcass < initialMeat - 5);
  }
});
test('empty fishing plans fail and undiscovered fish are not selected', () => {
  const { w, bear } = fishingWorld();
  w.decide(bear);
  w.rivers[0].fish = 0;
  for (let i = 0; i < 20; i++) w.step(0.1);
  assert.notEqual(bear.action, 'Fishing');
  assert.equal(bear.fishingRiver, undefined);
  assert.equal(
    w.known(bear, 'fish').some((m) => (m.stock ?? 0) >= 1),
    false,
  );
  bear.x = 60.5;
  bear.y = 40.5;
  bear.memory = [];
  w.rivers[0].fish = 10;
  w.cancelPlan(bear, 'test');
  w.decide(bear);
  assert.equal(w.known(bear, 'fish').length, 0);
  assert.notEqual(bear.action, 'Seeking fish');
});
test('bears hunt known deer when fish and carrion are unavailable', () => {
  const { w, bear } = fishingWorld(0);
  const deer = w.spawn('deer', 20.5, 23.5)!;
  w.decide(bear);
  assert.equal(bear.target, deer.id);
  assert.equal(bear.action, 'Hunting');
  assert.equal(bear.packId, undefined);
});
test('saving while a bear fishes preserves catches and plan progress', () => {
  const { w, bear } = fishingWorld();
  for (let i = 0; i < 20; i++) w.step(0.1);
  assert.equal(bear.action, 'Fishing');
  const restored = World.restore(w.serialize());
  for (let i = 0; i < 50; i++) {
    w.step(0.1);
    restored.step(0.1);
  }
  assert.equal(w.serialize(), restored.serialize());
});

test('rivers span the world and have usable crossings and fishing banks', () => {
  const w = new World(4721);
  assert.ok(w.rivers.length > 1);
  for (let y = 0; y < H; y++)
    assert.ok(
      w.cells.slice(y * W, (y + 1) * W).some((c) => c.river !== undefined),
    );
  const ford = w.cells.findIndex((c, i) => c.ford && Math.floor(i / W) === 12);
  assert.ok(ford >= 0);
  const p = { x: (ford % W) + 0.5, y: 12.5 },
    left = { x: p.x - 2, y: p.y },
    right = { x: p.x + 4, y: p.y };
  assert.ok(w.route(left, right).length);
  assert.ok(
    w.rivers.every((r) =>
      r.tiles.every(
        (i) => w.cells[i].kind === 'water' && w.cells[i].river === r.id,
      ),
    ),
  );
  assert.ok(
    w.cells.some(
      (c, i) =>
        c.kind === 'grass' &&
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(
          ([dx, dy]) =>
            w.cell((i % W) + dx, Math.floor(i / W) + dy).river !== undefined,
        ),
    ),
  );
});
test('river fish can be depleted, replenish slowly, and survive save/load', () => {
  const w = new World(4721),
    r = w.rivers[0],
    initial = r.fish;
  assert.ok(initial > 0 && initial <= r.capacity);
  assert.equal(w.catchFish(r.id, initial + 100), initial);
  assert.equal(r.fish, 0);
  assert.equal(w.catchFish(r.id, -1), 0);
  assert.equal(w.catchFish(r.id, Infinity), 0);
  assert.equal(w.catchFish(-1), 0);
  w.step(10);
  assert.ok(r.fish > 0 && r.fish < 1);
  const restored = World.restore(w.serialize());
  assert.deepEqual(restored.rivers, w.rivers);
  w.step(10000);
  assert.equal(r.fish, r.capacity);
});
test('older saves preserve their terrain without adding rivers across animals', () => {
  const w = new World(1),
    data = JSON.parse(w.serialize());
  data.version = 2;
  delete data.rivers;
  for (const c of data.cells) {
    delete c.river;
    delete c.ford;
  }
  const restored = World.restore(JSON.stringify(data));
  assert.deepEqual(restored.rivers, []);
  assert.deepEqual(restored.cells, data.cells);
});

function herdWorld() {
  const w = new World(9);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const deer = [w.spawn('deer', 20.5, 20.5)!, w.spawn('deer', 24.5, 20.5)!];
  for (const a of deer) {
    a.traits.sociability = 80;
    a.hunger = a.thirst = a.fatigue = 0;
  }
  return { w, deer };
}
test('social deer form herds, regroup, and leave urgent needs in control', () => {
  const {
    w,
    deer: [a, b],
  } = herdWorld();
  b.x = 25.5;
  w.decide(a);
  assert.equal(a.herdId, b.herdId);
  assert.equal(a.action, 'Rejoining herd');
  const independent = w.spawn('deer', 21.5, 21.5)!;
  independent.traits.sociability = 0;
  w.coordinateHerd(a);
  assert.notEqual(independent.herdId, a.herdId);
  w.cancelPlan(a, 'test');
  a.fatigue = 95;
  w.decide(a);
  assert.equal(a.goal, 'Rest');
});
test('herd alarms warn deer beyond their own sight and keep the original timestamp', () => {
  const {
    w,
    deer: [a, b],
  } = herdWorld();
  w.coordinateHerd(a);
  a.traits.caution = 0;
  b.traits.caution = 100;
  const wolf = w.spawn('wolf', 30.5, 20.5)!;
  w.perceive(b);
  assert.equal(w.canSee(a, wolf), false);
  w.decide(a);
  assert.equal(a.goal, 'Safety');
  assert.equal(a.memory.find((m) => m.id === wolf.id)?.seen, 0);
  w.time = 4;
  a.memory = [];
  w.coordinateHerd(a);
  assert.equal(
    a.memory.some((m) => m.id === wolf.id),
    false,
  );
});
test('grazing deer prefer an unoccupied patch and herds persist in saves', () => {
  const {
    w,
    deer: [a, b],
  } = herdWorld();
  w.coordinateHerd(a);
  const occupied = { x: 22.5, y: 20.5 },
    free = { x: 20.5, y: 23.5 };
  b.x = occupied.x;
  b.y = occupied.y;
  a.memory = [
    { ...occupied, kind: 'grass', seen: 0 },
    { ...free, kind: 'grass', seen: 0 },
  ];
  assert.deepEqual(w.grazingChoices(a)[0], { ...free, kind: 'grass', seen: 0 });
  const restored = World.restore(w.serialize());
  assert.equal(restored.animals[0].herdId, restored.animals[1].herdId);
  w.removeAnimal(b.id);
  assert.equal(w.herdMembers(a).length, 1);
});

function packWorld() {
  const w = new World(7);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const wolves = [w.spawn('wolf', 20.5, 20.5)!, w.spawn('wolf', 22.5, 20.5)!];
  for (const a of wolves) {
    a.traits.sociability = 80;
    a.hunger = 65;
    a.thirst = a.fatigue = 0;
  }
  return { w, wolves };
}
test('social wolves form stable packs while solitary wolves stay independent', () => {
  const {
    w,
    wolves: [a, b],
  } = packWorld();
  const lone = w.spawn('wolf', 21.5, 21.5)!;
  lone.traits.sociability = 0;
  w.coordinatePack(a);
  assert.equal(a.packId, b.packId);
  assert.notEqual(lone.packId, a.packId);
  b.x = 60.5;
  w.coordinatePack(a);
  assert.equal(w.packMembers(a).length, 2);
  assert.equal(w.nearbyPack(a).length, 0);
  w.removeAnimal(b.id);
  assert.equal(w.packMembers(a).length, 1);
});
test('pack communication shares remembered sightings without refreshing their age or crossing distance', () => {
  const {
    w,
    wolves: [a, b],
  } = packWorld();
  w.coordinatePack(a);
  b.memory = [{ kind: 'deer', id: 999, x: 25.5, y: 20.5, seen: 0 }];
  w.time = 4;
  w.coordinatePack(a);
  assert.equal(a.memory.find((m) => m.id === 999)?.seen, 0);
  a.memory = [];
  b.x = 60.5;
  w.coordinatePack(a);
  assert.equal(a.memory.length, 0);
  b.x = 22.5;
  w.time = 100;
  w.coordinatePack(a);
  assert.equal(a.memory.length, 0);
});
test('packmates join a hunt with different pursuit roles and share a kill', () => {
  const {
    w,
    wolves: [a, b],
  } = packWorld();
  const prey = w.spawn('deer', 26.5, 20.5)!;
  w.decide(a);
  w.decide(b);
  assert.equal(a.target, prey.id);
  assert.equal(b.target, prey.id);
  w.pursue(a);
  w.pursue(b);
  assert.notEqual(a.packRole, b.packRole);
  assert.notDeepEqual(a.path.at(-1), b.path.at(-1));
  w.die(prey, 'was hunted');
  w.pursue(b);
  assert.equal(b.foodTarget, prey.id);
  assert.equal(b.plan?.steps.at(-1)?.kind, 'feed');
  assert.equal(b.action, 'Seeking carcass');
});
test('exhausted packmates prioritize rest and saved packs keep their future', () => {
  const {
    w,
    wolves: [a, b],
  } = packWorld();
  w.spawn('deer', 26.5, 20.5);
  w.decide(a);
  b.fatigue = 95;
  w.decide(b);
  assert.equal(b.target, undefined);
  assert.equal(b.goal, 'Rest');
  const restored = World.restore(w.serialize());
  assert.equal(restored.animals[0].packId, restored.animals[1].packId);
  for (let i = 0; i < 30; i++) {
    w.step(0.1);
    restored.step(0.1);
  }
  assert.equal(w.serialize(), restored.serialize());
});

test('drinking plans check surroundings before consuming and finish when satisfied', () => {
  const w = new World(1);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  w.cells[20 * W + 21].kind = 'water';
  const a = w.spawn('deer', 20.5, 20.5)!;
  a.thirst = 80;
  a.hunger = a.fatigue = 0;
  w.decide(a);
  assert.deepEqual(
    a.plan?.steps.map((s) => s.kind),
    ['travel', 'check', 'drink'],
  );
  const plan = a.plan;
  w.decide(a);
  assert.equal(a.plan, plan);
  for (let i = 0; i < 4; i++) w.step(0.1);
  assert.ok(a.thirst >= 80);
  assert.equal(a.action, 'Checking surroundings');
  for (let i = 0; i < 110; i++) w.step(0.1);
  assert.ok(a.thirst < 20);
  assert.notEqual(a.plan?.goal, 'Drink');
});
test('threats interrupt a resource plan and unreachable destinations are abandoned', () => {
  const w = new World(1);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const a = w.spawn('deer', 20.5, 20.5)!;
  w.setGoal(a, 'Drink', 'Seeking water', 'test', { x: 25.5, y: 20.5 });
  w.spawn('wolf', 22.5, 20.5);
  w.decide(a);
  assert.equal(a.plan?.goal, 'Safety');
  w.removeAnimal(w.animals[1].id);
  a.memory = [];
  w.cells[20 * W + 25].kind = 'tree';
  w.setGoal(a, 'Drink', 'Seeking water', 'test', { x: 25.5, y: 20.5 });
  w.advancePlan(a, 0.1);
  assert.equal(a.plan, undefined);
  assert.match(a.planNote!, /unreachable/);
});
test('saving during an action plan preserves its progress and future', () => {
  const w = new World(1);
  const a = w.spawn('deer', 20.5, 20.5)!;
  a.fatigue = 80;
  a.hunger = a.thirst = 0;
  w.decide(a);
  w.step(0.1);
  const restored = World.restore(w.serialize());
  assert.deepEqual(restored.animals[0].plan, a.plan);
  for (let i = 0; i < 40; i++) {
    w.step(0.1);
    restored.step(0.1);
  }
  assert.equal(w.serialize(), restored.serialize());
});

test('food is sparse and regrows only on designated patches', () => {
  const w = new World(4721);
  const grass = w.cells.filter((c) => c.kind === 'grass'),
    patches = grass.filter((c) => c.forage);
  assert.ok(
    patches.length / grass.length > 0.12 &&
      patches.length / grass.length < 0.24,
  );
  const bare = grass.find((c) => !c.forage)!;
  assert.equal(bare.food, 0);
  const patch = patches[0];
  patch.food = 0;
  w.step(10);
  assert.equal(bare.food, 0);
  assert.ok(patch.food > 0);
  assert.deepEqual(World.restore(w.serialize()).cells, w.cells);
});
test('legacy saves receive sparse food patches and discard old food memories', () => {
  const w = new World(1);
  const a = w.spawn('deer', 20, 20)!;
  a.memory = [{ kind: 'grass', x: 20.5, y: 20.5, seen: 0 }];
  const d = JSON.parse(w.serialize());
  d.version = 1;
  for (const c of d.cells) {
    delete c.forage;
    c.food = 100;
  }
  const restored = World.restore(JSON.stringify(d));
  assert.ok(restored.cells.some((c) => c.forage));
  assert.ok(
    restored.cells.some((c) => c.kind === 'grass' && !c.forage && c.food === 0),
  );
  assert.equal(restored.animals[0].memory.length, 0);
});

test('animals discover local resources and return to remembered water', () => {
  const w = new World(1);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  w.cells[20 * W + 21].kind = 'water';
  const a = w.spawn('deer', 20, 20)!;
  a.thirst = 90;
  a.hunger = a.fatigue = 0;
  w.decide(a);
  assert.equal(a.goal, 'Drink');
  assert.ok(w.known(a, 'water').length);
  a.x = 40.5;
  a.y = 40.5;
  w.decide(a);
  assert.equal(a.goal, 'Drink');
  assert.ok(a.path.length);
  w.time = 901;
  w.perceive(a);
  assert.equal(w.known(a, 'water').length, 0);
});
test('hidden prey is unknown and wolves search a last seen position', () => {
  const w = new World(1);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const wolf = w.spawn('wolf', 20, 20)!,
    deer = w.spawn('deer', 24, 20)!;
  wolf.x = 20.5;
  wolf.y = 20.5;
  deer.x = 24.5;
  deer.y = 20.5;
  w.cells[20 * W + 22].kind = 'tree';
  w.perceive(wolf);
  assert.equal(w.known(wolf, 'deer').length, 0);
  w.cells[20 * W + 22].kind = 'grass';
  w.perceive(wolf);
  wolf.target = deer.id;
  const last = { x: deer.x, y: deer.y };
  deer.x = 60.5;
  w.pursue(wolf);
  assert.equal(wolf.action, 'Searching for prey');
  assert.deepEqual(wolf.path.at(-1), last);
  w.time = 100;
  w.pursue(wolf);
  assert.equal(wolf.target, undefined);
});
test('old saves initialize memory and new saves preserve discoveries', () => {
  const w = new World(1);
  const a = w.spawn('deer', 20, 20)!;
  w.perceive(a);
  assert.deepEqual(World.restore(w.serialize()).animals[0].memory, a.memory);
  const old = JSON.parse(w.serialize());
  delete old.animals[0].memory;
  assert.deepEqual(World.restore(JSON.stringify(old)).animals[0].memory, []);
});

function chase(seed: number, deerFatigue: number, wolfFatigue: number) {
  const w = new World(seed);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const deer = w.spawn('deer', 25, 25)!,
    wolf = w.spawn('wolf', 22, 25)!;
  deer.hunger = deer.thirst = 0;
  deer.fatigue = deerFatigue;
  wolf.hunger = 80;
  wolf.thirst = 0;
  wolf.fatigue = wolfFatigue;
  wolf.traits.persistence = 80;
  return { w, deer, wolf };
}
test('a fresh wolf can catch and feed on a tired deer', () => {
  const { w, deer, wolf } = chase(17, 65, 0);
  for (let i = 0; i < 400 && deer.alive; i++) w.step(0.1);
  assert.equal(deer.alive, false);
  assert.ok(w.events.some((e) => e.includes('was hunted')));
  const hunger = wolf.hunger;
  for (let i = 0; i < 30; i++) w.step(0.1);
  assert.ok(wolf.hunger < hunger);
});
test('a fresh deer can escape an exhausted wolf', () => {
  const { w, deer, wolf } = chase(17, 0, 85);
  for (let i = 0; i < 100; i++) w.step(0.1);
  assert.equal(deer.alive, true);
  assert.equal(deer.health, 100);
  assert.ok(distance(deer, wolf) > w.perceptionRadius(deer));
});
test('pursuit tracks a moving target and routes around obstacles', () => {
  const { w, deer, wolf } = chase(17, 0, 0);
  wolf.target = deer.id;
  w.pursue(wolf);
  assert.deepEqual(wolf.path.at(-1), { x: deer.x, y: deer.y });
  deer.y += 1;
  w.pursue(wolf);
  assert.deepEqual(wolf.path.at(-1), { x: deer.x, y: deer.y });
  w.cells[25 * W + 23].kind = 'tree';
  assert.equal(w.clearLine(wolf, deer), false);
  wolf.path = [];
  w.pursue(wolf);
  assert.ok(wolf.path.length > 1);
  assert.ok(wolf.path.every((p) => w.walkable(p.x, p.y)));
});

test('new reserves are empty and placement adds one animal', () => {
  const w = new World();
  assert.equal(w.animals.length, 0);
  w.spawn('deer', 20, 20);
  assert.equal(w.animals.length, 1);
});
test('deleting prey clears pursuit and reset preserves the habitat', () => {
  const w = new World();
  const deer = w.spawn('deer', 20, 20)!,
    wolf = w.spawn('wolf', 21, 20)!;
  wolf.target = deer.id;
  wolf.foodTarget = deer.id;
  wolf.path = [{ x: 20.5, y: 20.5 }];
  wolf.action = 'Hunting';
  assert.equal(w.removeAnimal(deer.id), true);
  assert.equal(wolf.target, undefined);
  assert.equal(wolf.foodTarget, undefined);
  assert.equal(wolf.path.length, 0);
  assert.equal(w.animals.length, 1);
  assert.equal(w.removeAnimal(deer.id), false);
  const cells = w.cells;
  w.time = 20;
  w.events = ['old event'];
  w.resetAnimals();
  assert.equal(w.animals.length, 0);
  assert.deepEqual(w.events, []);
  assert.equal(w.cells, cells);
  assert.equal(w.time, 20);
  const next = w.spawn('deer', 20, 20)!;
  assert.ok(next.id > wolf.id);
});
test('sprinting moves faster and consumes more energy than roaming', () => {
  function run(action: string) {
    const w = new World(1);
    w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
    const a = w.spawn('deer', 20, 20)!;
    a.hunger = a.thirst = a.fatigue = 0;
    a.think = 10;
    a.action = action;
    a.path = [{ x: 21.5, y: 20.5 }];
    const start = { x: a.x, y: a.y };
    w.step(0.1);
    return { a, moved: distance(start, a) };
  }
  const walk = run('Wandering'),
    sprint = run('Fleeing');
  assert.ok(sprint.moved > walk.moved * 2);
  assert.ok(sprint.a.fatigue > walk.a.fatigue * 3);
  assert.equal(isSprinting(sprint.a), true);
  assert.equal(isSprinting(walk.a), false);
  sprint.a.path = [];
  assert.equal(isSprinting(sprint.a), false);
});
test('paths avoid water and trees and reach the destination', () => {
  const w = new World(10, false);
  const a = w.spawn('deer', 20, 24)!;
  const b = w.spawn('deer', 38, 24)!;
  const path = w.route(a, b);
  assert.ok(path.length);
  assert.ok(path.every((p) => w.walkable(p.x, p.y)));
  assert.ok(distance(path.at(-1)!, b) < 1);
});
test('seeded simulation and saves reproduce the same future', () => {
  const a = new World(44, true);
  for (let i = 0; i < 100; i++) a.step(0.1);
  const b = World.restore(a.serialize());
  for (let i = 0; i < 200; i++) {
    a.step(0.1);
    b.step(0.1);
  }
  assert.equal(a.serialize(), b.serialize());
});
test('cautious deer flee at a greater distance', () => {
  const w = new World(1, false);
  w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
  const a = w.spawn('deer', 20, 20)!,
    b = w.spawn('wolf', 26, 20)!;
  a.traits.caution = 100;
  w.decide(a);
  assert.equal(a.goal, 'Safety');
  a.traits.caution = 0;
  a.goal = 'Explore';
  w.decide(a);
  assert.notEqual(a.goal, 'Safety');
  assert.ok(b.alive);
});
test('deer can sustain themselves in a resource-rich reserve', () => {
  const w = new World(22, false);
  w.spawn('deer', 20, 20);
  for (let i = 0; i < 12000; i++) w.step(0.1);
  const a = w.animals[0];
  assert.ok(a.alive);
  assert.ok(a.health > 50);
  assert.ok(w.walkable(a.x, a.y));
});
test('long mixed simulation stays finite and inside the world', () => {
  const w = new World(4721, true);
  for (let i = 0; i < 3000; i++) w.step(0.1);
  for (const a of w.animals) {
    assert.ok(Number.isFinite(a.x + a.y + a.health));
    assert.ok(a.x >= 0 && a.x < W && a.y >= 0 && a.y < H);
    assert.ok(a.hunger >= 0 && a.hunger <= 100);
  }
});
