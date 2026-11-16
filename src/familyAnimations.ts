import type Phaser from 'phaser';
import type {World,Point} from './sim';
import {lifeStage} from './lifecycle';
import {isDependent} from './reproduction';

export type FamilyAction='court'|'nurse'|'nurse-mother'|'wait'|'rest';
export type FamilyVisual={action:FamilyAction;frame:number;focus:Point};
const actions:FamilyAction[]=['court','nurse','nurse-mother','wait','rest'];
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);

// Read existing actions without advancing plans, changing nutrition, or using wall time.
export function familyVisuals(w:World,time:number):Map<number,FamilyVisual>{
 const visuals=new Map<number,FamilyVisual>(),byId=new Map(w.animals.map(a=>[a.id,a]));
 for(const a of w.animals){
  if(!a.alive||a.path.length)continue;
  const step=a.plan?.steps[a.plan.index]?.kind;
  if(a.action==='Courting'&&step==='mate'){
   const mate=byId.get(a.mateId??0);
   if(mate?.alive&&mate.mateId===a.id&&mate.action==='Courting'&&!mate.path.length&&distance(a,mate)<=1.2&&w.clearLine(a,mate)){
    const beat=time*3+Math.min(a.id,mate.id)*.17;
    visuals.set(a.id,{action:'court',frame:Math.floor(beat+(a.id<mate.id?0:2))%8,focus:mate});
   }
  }
  if(a.action==='Nursing'&&step==='nurse'&&isDependent(a)){
   const mother=byId.get(a.caregiverId??0);
   if(mother?.alive&&distance(a,mother)<=1.4&&w.clearLine(a,mother)&&mother.hunger<80&&mother.thirst<85&&!['Fleeing','Fighting','Hunting'].includes(mother.action)){
    const frame=Math.floor(time*5+mother.id*.17)%8;
    visuals.set(a.id,{action:'nurse',frame,focus:mother});
    if(!mother.path.length&&!visuals.has(mother.id))visuals.set(mother.id,{action:'nurse-mother',frame,focus:a});
   }
  }
  if(a.action==='Resting near mother'&&step==='care'&&lifeStage(a)==='juvenile'){
   const mother=byId.get(a.caregiverId??0);
   if(mother?.alive&&distance(a,mother)<=1.4&&w.clearLine(a,mother))visuals.set(a.id,{action:'rest',frame:Math.floor(time*2+a.id*.17)%8,focus:mother});
  }
  if(a.action==='Resting at den'&&step==='care'&&lifeStage(a)==='juvenile'){
   const den=w.homes.find(h=>h.id===a.homeId&&h.abandonedAt===undefined);if(den&&distance(a,den)<=1.5)visuals.set(a.id,{action:'rest',frame:Math.floor(time*2+a.id*.17)%8,focus:den});
  }
 }
 for(const a of w.animals){
  if(!a.alive||a.path.length||a.action!=='Waiting for young'||a.plan?.steps[a.plan.index]?.kind!=='care'||visuals.has(a.id))continue;
  const child=w.animals.find(b=>b.alive&&b.caregiverId===a.id&&isDependent(b)&&distance(a,b)>2.5&&w.canSee(a,b));
  if(child)visuals.set(a.id,{action:'wait',frame:Math.floor(time*2+a.id*.17)%8,focus:child});
 }
 return visuals;
}

export function makeFamilyTextures(scene:{make:{graphics:(config:{x:number;y:number})=>Phaser.GameObjects.Graphics}}){
 for(const species of ['deer','wolf','bear'] as const)for(const action of actions)for(const antlers of species==='deer'?[true,false]:[true])for(let frame=0;frame<8;frame++){
  const g=scene.make.graphics({x:0,y:0}),bear=species==='bear',deer=species==='deer',phase=frame/8*Math.PI*2;
  const fur=bear?0x846244:deer?0xba8752:0x89999b,dark=bear?0x493529:deer?0x66472d:0x323e42,ear=bear?0x5b4230:deer?0x8d633c:0x596b70,light=bear?0xa1835e:deer?0xe6c998:0xc6d1c5;
  const resting=action==='rest',nursing=action==='nurse',mother=action==='nurse-mother',court=action==='court',wait=action==='wait';
  const bodyY=resting?(bear?17:17):(bear?10:12),breath=resting&&frame>=2&&frame<=5?1:0;
  g.fillStyle(0x182b21,.22).fillEllipse(bear?20:17,bear?31:28,bear?36:28,8);
  if(resting){
   // Tucked paws and a relaxed tail, with open eyes rather than a sleeping face.
   g.fillStyle(dark).fillRoundedRect(7,bear?28:25,bear?26:21,4,2);
   if(!deer)g.fillStyle(ear).fillRoundedRect(2,bodyY+2,bear?12:10,bear?12:9,4);
  }else{
   const shift=court&&frame>=3&&frame<=4?2:wait&&frame===5?1:0;
   g.fillStyle(dark).fillRect(bear?8:9,bear?23:20,bear?6:3,bear?10:9).fillRect((bear?27:22)+shift,bear?23:20,bear?6:3,bear?10:9);
   if(!deer){const tailLift=court?Math.round(Math.sin(phase)*3):wait?Math.round(Math.sin(phase)*1):0;g.fillStyle(ear).fillRoundedRect(1,bodyY+4+tailLift,bear?7:9,bear?6:4,2);}
  }
  g.fillStyle(fur).fillRoundedRect(bear?3:5,bodyY-breath,bear?31:23,resting?(bear?15:11):(bear?17:11),resting?5:3);
  if(bear&&!resting)g.fillRect(9,7,13,8);
  g.fillStyle(light).fillRect(9,resting?(bear?28:25):(bear?25:20),bear?17:14,2);
  const nod=court?Math.round((Math.sin(phase)+1)*2):nursing?frame%2:mother?Math.round(Math.sin(phase)):wait?Math.round(Math.sin(phase)*2):frame>=4?0:2;
  const headX=(bear?32:26)+(court?Math.round(Math.sin(phase)*2):mother?-2:0),headY=resting?21+nod:nursing?25+nod:mother?17+nod:wait?10+nod:(bear?11:9)+nod;
  g.lineStyle(bear?9:6,fur).lineBetween(bear?28:24,resting?22:17,headX,headY+2);
  g.fillStyle(fur).fillRoundedRect(headX-3,headY-2,bear?11:9,bear?10:8,2);
  const earFlick=(wait||resting)&&frame===3?2:0;
  g.fillStyle(ear);if(bear)g.fillCircle(headX-1,headY-3,3).fillCircle(headX+5,headY-2+earFlick,3);else g.fillRect(headX-3+earFlick,headY-7,3,6).fillRect(headX+4-earFlick,headY-6,3,5);
  if(deer&&antlers)g.fillStyle(0xe7d6ac).fillRect(headX-1,headY-11,2,6).fillRect(headX-4,headY-10,4,2);
  g.fillStyle(light).fillRect(headX+3,headY+3,bear?8:6,3+(nursing?frame%2:0));
  g.fillStyle(0x17251e).fillRect(headX+4,headY,2,resting&&frame===7?1:2).fillRect(headX+(bear?10:8),headY+3,2,2);
  g.generateTexture(species+'-family-'+action+'-'+frame+(antlers?'':'-antlerless'),bear?46:36,bear?38:34);g.destroy();
 }
}
