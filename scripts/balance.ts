import {BALANCE} from '../src/balance.ts';
import {World} from '../src/sim.ts';
import {isDependent} from '../src/reproduction.ts';
import {mkdirSync,writeFileSync} from 'node:fs';

const [scenario='mixed',seedText='4721',durationText='1200',label='trial']=process.argv.slice(2);
const seed=Number(seedText),duration=Number(durationText),w=new World(seed);
const counts=scenario==='herbivores'?{deer:20,wolf:0,bear:0}:scenario==='crowded'?{deer:12,wolf:6,bear:2}:{deer:24,wolf:3,bear:2};
for(let i=0;i<counts.deer;i++)w.spawn('deer',10+w.random()*30,8+w.random()*34);
for(let i=0;i<counts.wolf;i++)w.spawn('wolf',38+w.random()*12,12+w.random()*18);
for(let i=0;i<counts.bear;i++)w.spawn('bear',i?51:45,i?36:18);
const start=performance.now();
for(let i=0;i<Math.round(duration/.1);i++)w.step(.1);
const snapshot=w.snapshot();
const result={scenario,seed,duration,balance:BALANCE,initial:counts,remaining:snapshot.population,births:w.stats.births,pregnancies:w.animals.filter(a=>a.alive&&a.pregnancy).length,offspring:{living:w.animals.filter(a=>a.alive&&a.parentIds).length,dependent:w.animals.filter(a=>a.alive&&isDependent(a)).length,orphaned:w.animals.filter(a=>a.alive&&isDependent(a)&&!w.animals.some(b=>b.id===a.caregiverId&&b.alive)).length},deaths:w.stats.deaths,hunts:w.stats.hunts,fishCaught:w.stats.fishCaught,meatEaten:Math.round(w.stats.meatEaten),grassPercent:Math.round(snapshot.grass/Math.max(1,snapshot.grassCapacity)*100),fishPercent:Math.round(snapshot.fish/Math.max(1,snapshot.fishCapacity)*100),strain:{hungry:snapshot.hungry,thirsty:snapshot.thirsty,exhausted:snapshot.exhausted},deathDetails:w.animals.filter(a=>!a.alive).map(a=>({id:a.id,species:a.species,time:Math.round(a.diedAt??0),reason:a.reason,x:Math.round(a.x),y:Math.round(a.y),thirst:Math.round(a.thirst),hunger:Math.round(a.hunger),memories:a.memory.filter(m=>m.kind==='water').length})),survivors:w.animals.filter(a=>a.alive).map(a=>({id:a.id,species:a.species,hunger:Math.round(a.hunger),thirst:Math.round(a.thirst),fatigue:Math.round(a.fatigue),health:Math.round(a.health),action:a.action,reason:a.reason,x:Math.round(a.x),y:Math.round(a.y)})),checkpoints:w.stats.samples.filter((s,i)=>i===0||i===w.stats.samples.length-1||Math.abs(s.time/120-Math.round(s.time/120))<.001).map(s=>({time:Math.round(s.time),population:s.population,hungry:s.hungry,thirsty:s.thirsty})),elapsedSeconds:Math.round((performance.now()-start)/1000)};
mkdirSync('balance-results',{recursive:true});
writeFileSync(`balance-results/${label}-${scenario}-${seed}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
