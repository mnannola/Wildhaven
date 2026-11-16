import {World,W,H} from '../src/sim.ts';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const [label='trial',stepsText='120',profileText='',layout='spread']=process.argv.slice(2);
const steps=Number(stepsText),results=[];
const reference=label!=='baseline-clean'&&existsSync('performance-results/baseline-clean.json')?JSON.parse(readFileSync('performance-results/baseline-clean.json','utf8')):undefined;
const percentile=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
for(const count of [50,100,200]){
 const w=new World(4721);
 for(let i=0;i<count;i++)w.spawn(i<count*.85?'deer':i<count*.95?'wolf':'bear',layout==='clustered'?12+w.random()*18:2+w.random()*(W-4),layout==='clustered'?14+w.random()*20:2+w.random()*(H-4));
 const profile:Record<string,{calls:number;ms:number}>={};
 if(profileText==='profile')for(const name of ['step','decide','perceive','route','clearLine','regroupHerd','grazingChoices','resolveCombat','coordinatePack','coordinateHerd'] as const){const original=w[name].bind(w) as (...args:any[])=>any;(w as any)[name]=(...args:any[])=>{const t=performance.now();try{return original(...args);}finally{const row=profile[name]??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-t;}};}
 for(let i=0;i<20;i++)w.step(.1);
 const times=[];for(let i=0;i<steps;i++){const t=performance.now();w.step(.1);times.push(performance.now()-t);}
 const state=w.serialize(),result={count,steps,layout,saveVersion:JSON.parse(state).version,seed:4721,meanMs:times.reduce((n,v)=>n+v,0)/times.length,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),maxMs:Math.max(...times),checksum:createHash('sha256').update(state).digest('hex'),survivors:w.animals.filter(a=>a.alive).length,profile};
 if(layout==='spread'&&reference?.steps===steps){const expected=reference.results.find((r:any)=>r.count===count);if((expected?.saveVersion??5)===result.saveVersion){if(expected?.checksum!==result.checksum)throw Error('Behavior changed at '+count+' animals');}else if(count===50)console.warn('Historical baseline uses a different save version; exact serialized checksum comparison skipped.');}
 results.push(result);console.log(JSON.stringify(result));
}
mkdirSync('performance-results',{recursive:true});writeFileSync(`performance-results/${label}.json`,JSON.stringify({label,node:process.version,steps,results},null,2)+'\n');
