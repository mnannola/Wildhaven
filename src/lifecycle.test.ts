import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {World,movementSpeed,CARCASS_MEAT} from './sim';
import {DAY_SECONDS,LIFE_CYCLE,lifeStage,createLifecycle,ageSpeedFactor,ageFatigueFactor} from './lifecycle';
import {LifecycleDetails} from './LifecycleDetails';
import {EcosystemStatistics} from './EcosystemStatistics';

const species=['deer','wolf','bear'] as const;

test('life stages change at the species-specific boundaries',()=>{
 assert.equal(DAY_SECONDS,240);
 for(const kind of species){const ages=LIFE_CYCLE[kind];
  for(const [age,expected] of [[0,'juvenile'],[ages.adult-.001,'juvenile'],[ages.adult,'adult'],[ages.elder-.001,'adult'],[ages.elder,'elder']] as const)
   assert.equal(lifeStage({species:kind,age}),expected);
 }
});

test('added animals are varied adults with reproducible sex, age, and lifespan',()=>{
 const w=new World(44),same=new World(44);
 for(let i=0;i<30;i++)for(const kind of species){const a=w.spawn(kind,20,20)!,b=same.spawn(kind,20,20)!,ages=LIFE_CYCLE[kind];
  assert.equal(lifeStage(a),'adult');assert.ok(a.age>=ages.adult&&a.age<ages.elder);
  assert.ok(a.naturalDeathAge>=ages.elder&&a.naturalDeathAge<=ages.maximum);
  assert.equal(a.age,b.age);assert.equal(a.sex,b.sex);assert.equal(a.naturalDeathAge,b.naturalDeathAge);
 }
 assert.equal(new Set(w.animals.map(a=>a.sex)).size,2);
 assert.ok(new Set(w.animals.map(a=>a.age)).size>80);
 assert.equal(w.serialize(),same.serialize());
 const seed=w.seed;assert.deepEqual(createLifecycle('deer',seed,1),createLifecycle('deer',seed,1));assert.equal(w.seed,seed);
});

test('the simulation advances living age and crosses both stage boundaries',()=>{
 for(const kind of species){const w=new World(1),a=w.spawn(kind,20,20)!,ages=LIFE_CYCLE[kind];
  a.age=ages.adult-.05;w.step(.1);assert.equal(lifeStage(a),'adult');assert.ok(Math.abs(a.age-(ages.adult+.05))<1e-8);
  a.age=ages.elder-.05;w.step(.1);assert.equal(lifeStage(a),'elder');assert.equal(a.alive,true);
 }
});

test('adult movement is unchanged and elder movement and fatigue decline gradually',()=>{
 const w=new World(2),a=w.spawn('wolf',20,20)!,ages=LIFE_CYCLE.wolf;
 a.fatigue=0;a.health=100;a.action='Wandering';a.age=ages.adult;const speed=movementSpeed(a);
 assert.equal(speed,.95);assert.equal(ageFatigueFactor(a),1);
 a.age=ages.elder;assert.equal(movementSpeed(a),speed);
 a.age=(ages.elder+ages.maximum)/2;assert.equal(ageSpeedFactor(a),.9);assert.equal(ageFatigueFactor(a),1.25);assert.equal(movementSpeed(a),speed*.9);
 a.age=ages.maximum;assert.equal(ageSpeedFactor(a),.8);assert.equal(ageFatigueFactor(a),1.5);
 a.age=ages.elder+10;a.think=Infinity;a.path=[];a.plan=undefined;a.fatigue=50;a.hunger=a.thirst=0;
 w.step(.1);assert.ok(Math.abs(a.fatigue-(50+.1*(.06+a.traits.sleepNeed*.0012)*ageFatigueFactor(a)))<1e-8);
});

test('old-age death produces one carcass and event and freezes age at death',()=>{
 const w=new World(3),a=w.spawn('deer',20,20)!;a.age=a.naturalDeathAge-.05;
 w.step(.1);assert.equal(a.alive,false);assert.equal(a.age,a.naturalDeathAge);assert.equal(a.deathCause,'oldAge');assert.equal(a.diedAt,.1);
 assert.equal(a.carcass,CARCASS_MEAT);assert.equal(a.health,0);assert.deepEqual(a.path,[]);assert.equal(a.plan,undefined);
 assert.equal(w.stats.deaths.oldAge.deer,1);assert.equal(w.stats.deaths.other.deer,0);assert.equal(w.stats.deaths.predation.deer,0);assert.equal(w.snapshot().population.deer,0);
 assert.ok(w.events[0].includes('died of old age'));const age=a.age;
 for(let i=0;i<20;i++)w.step(.1);
 assert.equal(a.age,age);assert.equal(w.stats.deaths.oldAge.deer,1);assert.equal(w.events.length,1);assert.ok(a.carcass<CARCASS_MEAT);
});

test('save/load preserves the future through an imminent natural death',()=>{
 const w=new World(4),a=w.spawn('bear',20,20)!;a.age=a.naturalDeathAge-.25;
 const saved=World.restore(w.serialize());assert.equal(saved.serialize(),w.serialize());
 for(let i=0;i<10;i++){w.step(.1);saved.step(.1);}
 assert.equal(w.serialize(),saved.serialize());assert.equal(saved.animals[0].deathCause,'oldAge');
});

test('versions 1 through 5 receive adult lifecycle data without rewriting existing animals',()=>{
 const w=new World(5),a=w.spawn('wolf',20,20)!,dead=w.spawn('deer',21,20)!;w.die(dead,'test','hunger');w.time=10000;
 for(let version=1;version<=5;version++){
  const raw=JSON.parse(w.serialize());raw.version=version;delete raw.stats.deaths.oldAge;
  for(const animal of raw.animals){delete animal.age;delete animal.sex;delete animal.naturalDeathAge;delete animal.deathCause;}
  const restored=World.restore(JSON.stringify(raw)),adult=restored.animals[0],corpse=restored.animals[1];
  assert.equal(lifeStage(adult),'adult');assert.equal(lifeStage(corpse),'adult');assert.equal(corpse.alive,false);assert.equal(corpse.deathCause,undefined);
  assert.deepEqual(adult.traits,a.traits);assert.equal(adult.health,a.health);assert.equal(adult.packId,a.packId);assert.equal(adult.id,a.id);assert.equal(restored.seed,w.seed);
  assert.equal(restored.stats.deaths.oldAge.wolf,0);assert.equal(restored.stats.deaths.hunger.deer,1);
  const again=World.restore(restored.serialize());assert.equal(again.serialize(),restored.serialize());
  assert.equal(World.restore(JSON.stringify(raw)).serialize(),restored.serialize());
 }
});

test('version 6 rejects invalid lifecycle values instead of creating immortal animals',()=>{
 const w=new World(6);w.spawn('deer',20,20);
 for(const patch of [{sex:'unknown'},{age:-1},{age:null},{age:undefined},{naturalDeathAge:null},{naturalDeathAge:LIFE_CYCLE.deer.elder-1},{naturalDeathAge:LIFE_CYCLE.deer.maximum+1}]){
  const raw=JSON.parse(w.serialize());Object.assign(raw.animals[0],patch);assert.throws(()=>World.restore(JSON.stringify(raw)),/Invalid lifecycle/);
 }
});

test('predation also freezes age and preserves the recorded cause across saves',()=>{
 const w=new World(7),a=w.spawn('deer',20,20)!,age=a.age;w.die(a,'was hunted','predation');w.step(.1);
 assert.equal(a.age,age);assert.equal(a.deathCause,'predation');assert.equal(World.restore(w.serialize()).animals[0].deathCause,'predation');
 w.resetAnimals();assert.equal(w.stats.deaths.oldAge.deer,0);
});

test('inspector and world statistics render life stages and old-age deaths',()=>{
 const w=new World(8),a=w.spawn('bear',20,20)!;a.sex='female';
 let markup=renderToStaticMarkup(React.createElement(LifecycleDetails,{animal:a}));
 assert.match(markup,/Female/);assert.match(markup,/Adult/);assert.match(markup,/simulated days/);
 a.age=a.naturalDeathAge;w.step(.1);
 markup=renderToStaticMarkup(React.createElement(LifecycleDetails,{animal:a}));
 assert.match(markup,/Age at death/);assert.match(markup,/Old age/);assert.match(markup,/Elder/);
 const statistics=renderToStaticMarkup(React.createElement(EcosystemStatistics,{world:w}));assert.match(statistics,/Old age/);assert.equal(w.stats.deaths.oldAge.bear,1);
});
