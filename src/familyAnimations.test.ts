import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,Species} from './sim';
import {LIFE_CYCLE} from './lifecycle';
import {familyVisuals} from './familyAnimations';

function family(species:Species='deer'){
 const w=new World(51);w.cells=w.cells.map(c=>({...c,kind:'grass'}));
 const mother=w.spawn(species,20.5,20.5)!,father=w.spawn(species,21.5,20.5)!,child=w.spawn(species,19.5,20.5)!;
 mother.sex='female';father.sex='male';mother.age=father.age=LIFE_CYCLE[species].adult;child.age=0;child.caregiverId=mother.id;
 for(const a of w.animals){a.path=[];a.plan=undefined;a.action='Wandering';a.hunger=a.thirst=20;}
 return {w,mother,father,child};
}

test('courtship animation needs a stationary, nearby, mutual courting pair',()=>{
 const {w,mother,father}=family();mother.mateId=father.id;father.mateId=mother.id;
 for(const a of [mother,father]){a.action='Courting';a.plan={goal:'Mate',steps:[{kind:'mate',label:'Court'}],index:0,elapsed:1};}
 let visuals=familyVisuals(w,1);assert.equal(visuals.get(mother.id)?.action,'court');assert.equal(visuals.get(father.id)?.focus,mother);
 father.path=[{x:22.5,y:20.5}];assert.equal(familyVisuals(w,1).has(mother.id),false);father.path=[];
 father.mateId=undefined;assert.equal(familyVisuals(w,1).has(mother.id),false);father.mateId=mother.id;
 father.x+=5;assert.equal(familyVisuals(w,1).size,0);
});

test('nursing produces coordinated child and mother visuals for all species',()=>{
 for(const species of ['deer','wolf','bear'] as const){const {w,mother,child}=family(species);
  child.action='Nursing';child.plan={goal:'Family',steps:[{kind:'nurse',label:'Nurse'}],index:0,elapsed:0};
  const visuals=familyVisuals(w,4);assert.equal(visuals.get(child.id)?.action,'nurse');assert.equal(visuals.get(mother.id)?.action,'nurse-mother');assert.equal(visuals.get(child.id)?.frame,visuals.get(mother.id)?.frame);
  const before=w.serialize();familyVisuals(w,5);assert.equal(w.serialize(),before,'Rendering must not transfer milk, change plans, or advance simulation.');
 }
});

test('nursing animation stops when caregiver, age, terrain, or survival conditions invalidate it',()=>{
 for(const change of [
  (f:ReturnType<typeof family>)=>{f.mother.alive=false;},
  (f:ReturnType<typeof family>)=>{f.mother.action='Fleeing';},
  (f:ReturnType<typeof family>)=>{f.mother.hunger=85;},
  (f:ReturnType<typeof family>)=>{f.child.age=LIFE_CYCLE.deer.adult;},
  (f:ReturnType<typeof family>)=>{f.child.x-=5;},
  (f:ReturnType<typeof family>)=>{f.w.cells[20*72+19].kind='tree';},
 ]){const f=family();f.child.action='Nursing';f.child.plan={goal:'Family',steps:[{kind:'nurse',label:'Nurse'}],index:0,elapsed:0};change(f);assert.equal(familyVisuals(f.w,2).size,0);}
});

test('waiting and resting visuals refer to actual nearby family members',()=>{
 const {w,mother,child}=family();child.x=mother.x+4;mother.action='Waiting for young';mother.plan={goal:'Family',steps:[{kind:'care',label:'Wait'}],index:0,elapsed:0};
 assert.equal(familyVisuals(w,2).get(mother.id)?.action,'wait');
 child.x=mother.x+1;assert.equal(familyVisuals(w,2).has(mother.id),false);
 child.action='Resting near mother';child.plan={goal:'Family',steps:[{kind:'care',label:'Rest'}],index:0,elapsed:0};
 assert.equal(familyVisuals(w,2).get(child.id)?.action,'rest');
 mother.alive=false;assert.equal(familyVisuals(w,2).has(child.id),false);
});

test('family animation frames follow simulation time and survive save/load',()=>{
 const {w,mother,child}=family();child.action='Nursing';child.plan={goal:'Family',steps:[{kind:'nurse',label:'Nurse'}],index:0,elapsed:0};
 w.time=3;const first=familyVisuals(w,w.time),paused=familyVisuals(w,w.time);assert.equal(first.get(child.id)?.frame,paused.get(child.id)?.frame);
 assert.notEqual(first.get(child.id)?.frame,familyVisuals(w,w.time+.2).get(child.id)?.frame);
 const restored=World.restore(w.serialize());assert.equal(familyVisuals(restored,restored.time).get(child.id)?.frame,first.get(child.id)?.frame);assert.equal(familyVisuals(restored,restored.time).get(mother.id)?.action,'nurse-mother');
});
