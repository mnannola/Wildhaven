import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {World,W,H} from './sim';
import {escapeRoute} from './terrain';
import {TerrainDetails} from './TerrainDetails';

function flat(){const w=new World(73);w.cells=w.cells.map(c=>({...c,kind:'grass',forage:false,food:0,ford:false,river:undefined}));w.rivers=[];return w;}
function river(ford=true){const w=flat();for(let y=0;y<H;y++)Object.assign(w.cells[y*W+25],{kind:'water',river:1});if(ford)Object.assign(w.cells[30*W+25],{kind:'grass',ford:true});return w;}

test('open water permits sight but still blocks movement and melee',()=>{
 const w=river(),wolf=w.spawn('wolf',20.5,20.5)!,deer=w.spawn('deer',30.5,20.5)!;wolf.traits.exploration=100;
 assert.equal(w.canSee(wolf,deer),true);assert.equal(w.clearLine(wolf,deer),false);assert.equal(w.sightLine(wolf,deer),true);
 w.cells[20*W+23].kind='tree';assert.equal(w.sightLine(wolf,deer),false);assert.equal(w.canSee(wolf,deer),false);
 const close=flat(),hunter=close.spawn('wolf',20.5,20.5)!,prey=close.spawn('deer',22.5,20.5)!;hunter.x=20.99;prey.x=22.01;close.cells[20*W+21].kind='water';hunter.target=prey.id;hunter.action='Hunting';close.resolveCombat(.1);assert.equal(prey.health,100);assert.equal(hunter.combatLog.length,0);
});

test('woodland cover conceals still animals while nearby and moving animals remain detectable',()=>{
 const w=flat(),wolf=w.spawn('wolf',20.5,20.5)!,deer=w.spawn('deer',31.5,20.5)!;wolf.traits.exploration=50;assert.equal(w.canSee(wolf,deer),true);
 for(const y of [19,21])for(const x of [30,31,32])w.cells[y*W+x].kind='tree';
 assert.equal(w.coverAt(deer),.6);assert.equal(w.canSee(wolf,deer),false);
 deer.path=[{x:32.5,y:20.5}];assert.equal(w.canSee(wolf,deer),true);
 deer.path=[];wolf.x=30.5;assert.equal(w.canSee(wolf,deer),true);
});

test('routes prefer faster ground over an unnecessarily slow crossing',()=>{
 const w=flat(),a=w.spawn('deer',10.5,20.5)!;for(let x=11;x<20;x++)w.cells[20*W+x].ford=true;
 const path=w.route(a,{x:20.5,y:20.5});assert.equal(path.length,12);assert.equal(path.some(p=>w.cell(p.x,p.y).ford),false);
 assert.deepEqual(path.at(-1),{x:20.5,y:20.5});
});

test('a river route uses its ford and a visible-prey pursuit takes that route too',()=>{
 const w=river(),wolf=w.spawn('wolf',20.5,20.5)!,deer=w.spawn('deer',30.5,20.5)!;wolf.traits.exploration=100;wolf.hunger=50;wolf.thirst=wolf.fatigue=0;
 const path=w.route(wolf,deer);assert.ok(path.length>10);assert.ok(path.some(p=>w.cell(p.x,p.y).ford));assert.ok(path.every(p=>w.walkable(p.x,p.y)));
 wolf.target=deer.id;w.setGoal(wolf,'Eat','Hunting','test',deer);w.pursue(wolf);assert.ok(wolf.path.some(p=>w.cell(p.x,p.y).ford));assert.match(wolf.reason,/crossing/);assert.ok(wolf.navigation);
 const saved=World.restore(w.serialize());for(let i=0;i<100;i++){w.step(.1);saved.step(.1);assert.ok(w.animals.filter(a=>a.alive).every(a=>w.walkable(a.x,a.y)));}
 assert.equal(w.serialize(),saved.serialize());
});

test('unreachable prey across a sealed river is not hunted indefinitely',()=>{
 const w=river(false),wolf=w.spawn('wolf',20.5,20.5)!,deer=w.spawn('deer',30.5,20.5)!;wolf.traits.exploration=100;wolf.hunger=80;wolf.thirst=wolf.fatigue=0;
 assert.equal(w.canSee(wolf,deer),true);assert.deepEqual(w.route(wolf,deer),[]);w.decide(wolf);assert.equal(wolf.target,undefined);assert.notEqual(wolf.action,'Hunting');
 wolf.target=deer.id;w.setGoal(wolf,'Eat','Hunting','test',deer);w.pursue(wolf);assert.equal(wolf.target,undefined);assert.match(wolf.reason,/unreachable/);
});

test('movement guard stops stale straight paths from crossing water or trees',()=>{
 for(const kind of ['water','tree'] as const){const w=flat(),a=w.spawn('deer',20.5,20.5)!;w.cells[20*W+21].kind=kind;a.x=20.9;a.think=100;a.action='Wandering';a.path=[{x:22.5,y:20.5}];a.plan=undefined;
  w.step(1);assert.equal(a.x,20.9);assert.equal(w.walkable(a.x,a.y),true);assert.equal(a.path.length,0);assert.equal(a.think,0);
 }
});

test('actual crossing speed is lower, and woodland footing affects large animals more',()=>{
 const w=flat(),a=w.spawn('deer',20.5,20.5)!;a.think=100;a.path=[{x:21.5,y:20.5}];a.hunger=a.thirst=a.fatigue=0;
 const ford=World.restore(w.serialize());ford.cells[20*W+20].ford=true;w.step(.1);ford.step(.1);assert.ok(ford.animals[0].x<w.animals[0].x);
 for(const [x,y]of [[19,19],[20,19],[21,19],[19,21]])w.cells[y*W+x].kind='tree';
 assert.ok(w.terrainSpeed(a,'bear')<w.terrainSpeed(a,'wolf'));assert.ok(w.terrainSpeed(a,'wolf')<w.terrainSpeed(a,'deer'));
});

test('escape destinations stay in the reachable bank and favor cover on otherwise similar routes',()=>{
 const w=flat();w.cells=w.cells.map(c=>({...c,kind:'water'}));
 for(let x=20;x<=23;x++)w.cells[20*W+x].kind='grass';for(let y=17;y<=23;y++)w.cells[y*W+23].kind='grass';
 for(const [x,y]of [[22,16],[23,16],[24,16],[24,17]])w.cells[y*W+x].kind='tree';
 const a=w.spawn('deer',20.5,20.5)!,seed=w.seed,escape=escapeRoute(w,a,{x:18.5,y:20.5});
 assert.ok(escape.path.length);assert.ok(escape.path.every(p=>w.walkable(p.x,p.y)));assert.ok(escape.path.at(-1)!.y<20.5);assert.ok(escape.cover>0);assert.equal(w.seed,seed);
 const first=escape.path[0];assert.equal(Math.abs(first.x-a.x)+Math.abs(first.y-a.y),1);
});

test('old saves preserve terrain and relocate animals stranded in impassable cells',()=>{
 const w=flat(),a=w.spawn('deer',20.5,20.5)!;w.cells[20*W+20].kind='water';const raw=JSON.parse(w.serialize());raw.version=7;
 const restored=World.restore(JSON.stringify(raw));assert.deepEqual(restored.cells,raw.cells);assert.equal(restored.walkable(restored.animals[0].x,restored.animals[0].y),true);assert.equal(restored.animals[0].id,a.id);assert.equal(restored.stats.added.deer,1);
});

test('the inspector explains cover and crossing costs',()=>{
 const w=flat(),a=w.spawn('deer',20.5,20.5)!;w.cells[20*W+20].ford=true;
 const html=renderToStaticMarkup(React.createElement(TerrainDetails,{world:w,animal:a}));assert.match(html,/River ford/);assert.match(html,/72% movement speed/);assert.match(html,/need a ford/);
});

test('a lone wolf chooses a drinking bank outside remembered bear danger',()=>{
 const w=flat(),wolf=w.spawn('wolf',13.5,20.5)!,bear=w.spawn('bear',20.5,20.5)!;
 wolf.memory=[{x:14.5,y:20.5,kind:'water',seen:0},{x:12.5,y:26.5,kind:'water',seen:0},{x:bear.x,y:bear.y,kind:'bear',id:bear.id,seen:0}];
 const bank=w.resourceDestination(wolf,'water');assert.equal(bank?.x,12.5);assert.equal(bank?.y,26.5);
});
