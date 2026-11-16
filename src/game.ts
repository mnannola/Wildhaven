import Phaser from 'phaser';
import {juvenileSize} from './lifecycle';
import {animalTexture,sexBuild,coatTint} from './appearance';
import {makeFamilyTextures,familyVisuals} from './familyAnimations';
import {homeFor} from './homes';
import {drawHomeMarkers,drawHomeRange} from './homeRendering';
import {World,W,H,TILE,Animal,Species,isSprinting,CARCASS_MEAT,Cell} from './sim';
export const bridge={metrics:{fps:0,stepMs:0,renderMs:0},spriteUrls:{} as Partial<Record<Species,string>>,world:new World(),selected:0,selectedRiver:0,selectedHome:0,onInspect:()=>{},tool:'select',speed:1,follow:false,overlay:false,zoom:1,onChange:()=>{}};
export class Habitat extends Phaser.Scene {
 homeGraphics!:Phaser.GameObjects.Graphics;lastHomeWorld?:World;lastHomeSignature='';terrain!:Phaser.GameObjects.Graphics; actors=new Map<number,Phaser.GameObjects.Image>(); effectGraphics!:Phaser.GameObjects.Graphics;activityGraphics!:Phaser.GameObjects.Graphics;fishGraphics!:Phaser.GameObjects.Graphics;marks!:Phaser.GameObjects.Graphics;acc=0;lastPaint=0;drag=false;start={x:0,y:0};cameraStart={x:0,y:0};
 terrainCodes=new Uint16Array(W*H);terrainWorld?:World;lastFishWorld?:World;lastFishTime=-1;lastFishCaught=-1;
 constructor(){super('habitat');}
 addAnimal(species:Species){const c=this.cameras.main,p=c.getWorldPoint(c.width/2,c.height/2);const spot=bridge.world.nearest({x:p.x/TILE,y:p.y/TILE},i=>bridge.world.cells[i].kind==='grass'&&!bridge.world.animals.some(a=>Math.hypot(a.x-(i%W+.5),a.y-(Math.floor(i/W)+.5))<1));if(!spot)return undefined;const a=bridge.world.spawn(species,spot.x,spot.y);if(a){bridge.selected=a.id;bridge.selectedHome=0;bridge.selectedRiver=0;bridge.tool='select';bridge.follow=false;bridge.onChange();}return a;}
 create(){this.cameras.main.setBackgroundColor('#6c8951');this.cameras.main.setBounds(0,0,W*TILE,H*TILE);this.terrain=this.add.graphics();this.homeGraphics=this.add.graphics().setDepth(.5);this.makeTextures();this.makeMovementTextures();this.makeSurvivalTextures();this.makeAwarenessTextures();this.makeFishingCombatTextures();this.makeDeathTextures();this.makeSleepingDeerTexture();this.makeSleepingPredatorTextures();this.makeAntlerlessTextures();this.makeFamilyTextures();for(const species of ['deer','wolf','bear'] as const)bridge.spriteUrls[species]=this.textures.getBase64(species==='deer'?'deer-antlerless':species);bridge.onChange();this.fishGraphics=this.add.graphics().setDepth(1);this.activityGraphics=this.add.graphics().setDepth(2);this.effectGraphics=this.add.graphics().setDepth(9999);this.marks=this.add.graphics().setDepth(10000);this.paint();this.fit();
 this.input.mouse?.disableContextMenu();this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{this.drag=false;this.start={x:p.x,y:p.y};this.cameraStart={x:this.cameras.main.scrollX,y:this.cameras.main.scrollY};});
 this.input.on('pointermove',(p:Phaser.Input.Pointer)=>{if(!p.isDown)return;if(Math.hypot(p.x-this.start.x,p.y-this.start.y)>5)this.drag=true;if(this.drag){bridge.follow=false;this.cameras.main.setScroll(this.cameraStart.x-(p.x-this.start.x)/this.cameras.main.zoom,this.cameraStart.y-(p.y-this.start.y)/this.cameras.main.zoom);}});
 this.input.on('pointerup',(p:Phaser.Input.Pointer)=>{
  if(this.drag)return;const q=this.cameras.main.getWorldPoint(p.x,p.y),x=q.x/TILE,y=q.y/TILE;
  if(bridge.tool==='deer'||bridge.tool==='wolf'||bridge.tool==='bear'){
   const a=bridge.world.spawn(bridge.tool,x,y);if(a){bridge.selected=a.id;bridge.selectedHome=0;bridge.selectedRiver=0;bridge.tool='select';}
  }else{
   const a=bridge.world.animals.filter(a=>(a.alive||a.carcass>0||a.depletedAt!==undefined&&bridge.world.time-a.depletedAt<60)&&Math.hypot(a.x-x,a.y-y)<1.1).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
   if(a){bridge.selected=a.id;bridge.selectedHome=0;bridge.selectedRiver=0;bridge.onInspect();}
   else{
    const home=bridge.world.homes.find(h=>Math.hypot(h.x-x,h.y-y)<1.1);
    if(home){bridge.selectedHome=home.id;bridge.selected=0;bridge.selectedRiver=0;bridge.follow=false;bridge.onInspect();}
    else{const c=bridge.world.cell(x,y);if(c.river!==undefined){bridge.selectedHome=0;bridge.selectedRiver=c.river;bridge.selected=0;bridge.follow=false;bridge.onInspect();}}
   }
  }
  bridge.onChange();
 });
 this.input.on('wheel',(_p:unknown,_o:unknown,_x:number,dy:number)=>this.zoomBy(dy>0?.9:1.1));this.scale.on('resize',()=>{});
 }
 viewHome(id:number){const h=bridge.world.homes.find(h=>h.id===id);if(!h)return;this.cameras.main.centerOn(h.x*TILE,h.y*TILE);bridge.follow=false;bridge.selectedHome=id;bridge.selected=0;bridge.selectedRiver=0;bridge.onInspect();bridge.onChange();}
 drawHomes(){if(!this.homeGraphics)return;const w=bridge.world,key=w.homes.map(h=>[h.id,h.x,h.y,h.abandonedAt!==undefined].join(':')).join('|');if(this.lastHomeWorld===w&&this.lastHomeSignature===key)return;this.lastHomeWorld=w;this.lastHomeSignature=key;drawHomeMarkers(w,this.homeGraphics);}
 fit(){const c=this.cameras.main;c.setZoom(Math.min(c.width/(W*TILE),c.height/(H*TILE))*1.23);c.centerOn(W*TILE/2,H*TILE/2);bridge.zoom=c.zoom;}
 zoomBy(f:number){const c=this.cameras.main;c.setZoom(Phaser.Math.Clamp(c.zoom*f,.3,3));bridge.zoom=c.zoom;bridge.onChange();}
 makeTextures(antlers=true){for(const species of (antlers?['deer','wolf','bear']:['deer'])){const g=this.make.graphics({x:0,y:0});const deer=species==='deer';if(species==='bear'){g.fillStyle(0x182b21,.25).fillEllipse(20,30,35,10);g.fillStyle(0x493529).fillRect(6,22,7,10).fillRect(26,22,7,10);g.fillStyle(0x846244).fillRoundedRect(3,10,31,17,5).fillRect(9,7,13,7).fillRoundedRect(27,9,12,14,4);g.fillStyle(0x5b4230).fillCircle(30,8,3).fillCircle(36,8,3);g.fillStyle(0xa1835e).fillRect(33,17,9,6);g.fillStyle(0x25251d).fillRect(35,13,2,2).fillRect(40,18,3,3);g.generateTexture(species,46,38);g.destroy();continue;}g.fillStyle(0x182b21,.22).fillEllipse(17,27,25,8);g.fillStyle(deer?0x66472d:0x323e42).fillRect(9,20,3,8).fillRect(21,20,3,8);g.fillStyle(deer?0xba8752:0x89999b).fillRect(6,12,20,11).fillRect(23,7,8,11).fillRect(28,12,5,5);g.fillStyle(deer?0xe6c998:0xc6d1c5).fillRect(8,19,17,3).fillRect(26,15,5,3);g.fillStyle(deer?0x8d633c:0x596b70).fillRect(23,3,3,7).fillRect(29,4,3,6).fillRect(2,12,6,4);g.fillStyle(0x17251e).fillRect(29,10,2,2);if(deer&&antlers){g.fillStyle(0xe7d6ac).fillRect(24,0,2,6).fillRect(21,1,4,2);}g.generateTexture(species+(antlers?'':'-antlerless'),36,34);g.destroy();}}
 makeMovementTextures(antlers=true){for(const species of (antlers?['deer','wolf','bear']:['deer']) as Species[])for(const gait of ['walk','run','sniff','search'] as const)for(let frame=0;frame<8;frame++){
 const g=this.make.graphics({x:0,y:0}),bear=species==='bear',deer=species==='deer',run=gait==='run',aware=gait==='sniff'||gait==='search',phase=frame/8*Math.PI*2;
 const bodyY=Math.round(Math.sin(phase*2)*(run?1:.4)),stride=run?(bear?5:6):3,ground=bear?32:28;
 const leg=(front:boolean,near:boolean)=>{const hip=front?(bear?28:22):(bear?10:10),offset=front?0:Math.PI,angle=phase+offset+(near?0:run?.55:Math.PI),swing=Math.sin(angle)*stride,lift=Math.max(0,Math.cos(angle))*(run?5:2),kneeX=hip+swing*.5,kneeY=ground-5-lift*.3,footX=hip+swing,footY=ground-lift;
 g.lineStyle(bear?5:3,bear?(near?0x60432e:0x493529):deer?(near?0x8d633c:0x66472d):(near?0x596b70:0x323e42));g.beginPath();g.moveTo(hip,(bear?22:20)+bodyY);g.lineTo(Math.round(kneeX),Math.round(kneeY));g.lineTo(Math.round(footX),Math.round(footY));g.strokePath();g.fillStyle(bear?0x493529:deer?0x66472d:0x323e42).fillRect(Math.round(footX)-1,Math.round(footY)-1,bear?6:4,2);};
 g.fillStyle(0x182b21,.22).fillEllipse(bear?20:17,ground,bear?35:27,8);leg(false,false);leg(true,false);
 if(aware){g.fillStyle(bear?0x846244:deer?0xba8752:0x89999b);if(bear)g.fillRoundedRect(3,10+bodyY,31,17,5).fillRect(9,7+bodyY,13,7);else g.fillRect(6,12+bodyY,20,11);g.fillStyle(bear?0xa1835e:deer?0xe6c998:0xc6d1c5).fillRect(9,20+bodyY,bear?18:14,3);this.drawAwarenessHead(g,species,gait,phase,antlers);}
 else if(bear){g.fillStyle(0x846244).fillRoundedRect(3,10+bodyY,31,17,5).fillRect(9,7+bodyY,13,7).fillRoundedRect(27,9+bodyY,12,14,4);g.fillStyle(0x5b4230).fillCircle(30,8+bodyY,3).fillCircle(36,8+bodyY,3);g.fillStyle(0xa1835e).fillRect(33,17+bodyY,9,6);g.fillStyle(0x25251d).fillRect(35,13+bodyY,2,2).fillRect(40,18+bodyY,3,3);}
 else{g.fillStyle(deer?0xba8752:0x89999b).fillRect(6,12+bodyY,20,11).fillRect(23,7+bodyY,8,11).fillRect(28,12+bodyY,5,5);g.fillStyle(deer?0xe6c998:0xc6d1c5).fillRect(8,19+bodyY,17,3).fillRect(26,15+bodyY,5,3);g.fillStyle(deer?0x8d633c:0x596b70).fillRect(23,3+bodyY+(run?2:0),3,run?5:7).fillRect(29,4+bodyY+(run?1:0),3,run?5:6).fillRect(2,12+bodyY+Math.round(Math.sin(phase)),6,4);g.fillStyle(0x17251e).fillRect(29,10+bodyY,2,2);if(deer&&antlers)g.fillStyle(0xe7d6ac).fillRect(24,bodyY,2,6).fillRect(21,1+bodyY,4,2);}
 leg(false,true);leg(true,true);g.generateTexture(species+'-'+gait+'-'+frame+(antlers?'':'-antlerless'),bear?46:36,bear?38:34);g.destroy();}}
 makeSurvivalTextures(antlers=true){for(const species of (antlers?['deer','wolf','bear']:['deer']) as Species[])for(const activity of ['graze','drink','feed'] as const){if(activity==='graze'&&species!=='deer'||activity==='feed'&&species==='deer')continue;for(let frame=0;frame<6;frame++){
 const g=this.make.graphics({x:0,y:0}),bear=species==='bear',deer=species==='deer',chew=frame%2,raised=activity==='graze'&&frame>=4?5:0,tug=activity==='feed'&&frame>=3?-2:0,headX=(bear?32:26)+tug,headY=(bear?24:23)-raised+(activity==='drink'?chew:0);
 g.fillStyle(0x182b21,.22).fillEllipse(bear?20:17,bear?31:28,bear?36:28,8);
 g.fillStyle(bear?0x493529:deer?0x66472d:0x323e42).fillRect(bear?8:9,bear?23:20,bear?6:3,bear?10:9).fillRect(bear?27:22,bear?23:20,bear?6:3,bear?10:9);
 g.fillStyle(bear?0x846244:deer?0xba8752:0x89999b);if(bear)g.fillRoundedRect(3,11,31,17,5).fillRect(8,8,14,9);else g.fillRect(6,12,20,11);
 g.fillStyle(bear?0xa1835e:deer?0xe6c998:0xc6d1c5).fillRect(9,bear?25:20,bear?17:14,3);
 g.lineStyle(bear?10:6,bear?0x846244:deer?0xba8752:0x89999b).lineBetween(bear?30:25,bear?18:14,headX,headY);
 g.fillStyle(bear?0x846244:deer?0xba8752:0x89999b).fillRoundedRect(headX-2,headY-2,bear?10:8,bear?9:7,2);
 g.fillStyle(bear?0x5b4230:deer?0x8d633c:0x596b70);if(bear)g.fillCircle(headX-1,headY-3,3).fillCircle(headX+5,headY-2,3);else g.fillRect(headX-2,headY-7,3,6).fillRect(headX+4,headY-6,3,5).fillRect(2,13,5,4);
 if(deer&&antlers)g.fillStyle(0xe7d6ac).fillRect(headX-1,headY-11,2,6).fillRect(headX-4,headY-10,4,2);
 g.fillStyle(bear?0xa1835e:deer?0xe6c998:0xc6d1c5).fillRect(headX+3,headY+3,bear?8:6,3+chew);
 g.fillStyle(0x17251e).fillRect(headX+4,headY,2,1).fillRect(headX+(bear?10:8),headY+3,2,2);
 if(activity==='drink'&&chew)g.fillStyle(0x8bb7b8).fillRect(headX+5,headY+6,2,2);
 if(activity==='graze'&&frame<4)g.fillStyle(0x91ab65).fillRect(headX+6,headY+6,2,3);
 g.generateTexture(species+'-'+activity+'-'+frame+(antlers?'':'-antlerless'),bear?46:36,bear?38:34);g.destroy();}}
 }
 drinkingWater(a:Animal){return [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:Math.floor(a.x)+dx+.5,y:Math.floor(a.y)+dy+.5})).find(p=>bridge.world.cell(p.x,p.y).kind==='water');}
 drawSurvivalEffects(a:Animal,activity:string,time:number,facing:number){const g=this.activityGraphics,phase=(time*.8+a.id*.17)%1;
 if(activity==='drink'){const water=this.drinkingWater(a);if(water){const x=(a.x+(water.x-a.x)*.75)*TILE,y=(a.y+(water.y-a.y)*.75)*TILE;g.lineStyle(1,0xaed9d1,(1-phase)*.6).strokeEllipse(x,y,5+phase*16,2+phase*7);}}
 else if(phase<.45){const x=a.x*TILE+facing*(a.species==='bear'?15:13),y=a.y*TILE+11;g.fillStyle(activity==='graze'?0x9cb772:0xb89b78,.7).fillRect(x+facing*phase*5,y+phase*4,2,2).fillRect(x-facing*3,y+2,1,2);}
 }
 drawAwarenessHead(g:Phaser.GameObjects.Graphics,species:Species,activity:'alert'|'sniff'|'search',phase:number,antlers=true){
 const bear=species==='bear',deer=species==='deer',turn=Math.sin(phase),lift=activity==='alert'?1:activity==='search'?(Math.sin(phase)+1)/2:0;
 const x=(bear?32:26)+Math.round(turn*(activity==='sniff'?1:2)),y=Math.round((bear?22:21)-lift*(bear?13:deer?9:12)),fur=bear?0x846244:deer?0xba8752:0x89999b,ear=bear?0x5b4230:deer?0x8d633c:0x596b70;
 g.lineStyle(bear?10:6,fur).lineBetween(bear?28:24,bear?17:14,x,y+2);
 g.fillStyle(fur).fillRoundedRect(x-3,y-3,bear?11:9,bear?10:8,2);
 const earTilt=Math.round(Math.sin(phase*2)*2);g.fillStyle(ear);if(bear)g.fillCircle(x-1,y-4+earTilt*.5,3).fillCircle(x+5,y-3-earTilt*.5,3);else{g.fillRect(x-3+earTilt,y-8,3,6).fillRect(x+4-earTilt,y-7,3,5);if(deer&&antlers)g.fillStyle(0xe7d6ac).fillRect(x-1,y-12,2,6).fillRect(x-4,y-11,4,2);}
 const muzzle=activity==='alert'&&turn<-.3?3:activity==='search'&&turn>.5?4:7;
 g.fillStyle(bear?0xa1835e:deer?0xe6c998:0xc6d1c5).fillRect(x+3,y+3,muzzle,3);
 g.fillStyle(0x17251e).fillRect(x+(turn<-.3?1:4),y,2,2).fillRect(x+3+muzzle,y+3,2,2);
 }
 makeAwarenessTextures(antlers=true){for(const species of (antlers?['deer','wolf','bear']:['deer']) as Species[])for(const activity of ['alert','sniff','search'] as const)for(let frame=0;frame<8;frame++){
 const g=this.make.graphics({x:0,y:0}),bear=species==='bear',deer=species==='deer';g.fillStyle(0x182b21,.22).fillEllipse(bear?20:17,bear?31:28,bear?35:27,8);
 g.fillStyle(bear?0x493529:deer?0x66472d:0x323e42).fillRect(bear?8:9,bear?22:20,bear?6:3,bear?10:8).fillRect(bear?27:22,bear?22:20,bear?6:3,bear?10:8);
 g.fillStyle(bear?0x846244:deer?0xba8752:0x89999b);if(bear)g.fillRoundedRect(3,10,31,17,5).fillRect(9,7,13,7);else g.fillRect(6,12,20,11);
 g.fillStyle(bear?0xa1835e:deer?0xe6c998:0xc6d1c5).fillRect(9,20,bear?18:14,3);this.drawAwarenessHead(g,species,activity,frame/8*Math.PI*2,antlers);
 g.generateTexture(species+'-'+activity+'-idle-'+frame+(antlers?'':'-antlerless'),bear?46:36,bear?38:34);g.destroy();}}
 makeFishingCombatTextures(){
 for(const species of ['wolf','bear'] as const)for(const action of ['attack','fish','catch'] as const){if(species==='wolf'&&action!=='attack')continue;for(let frame=0;frame<8;frame++){
 const g=this.make.graphics({x:0,y:0}),bear=species==='bear',attack=action==='attack',caught=action==='catch',strike=frame>=3&&frame<=5,lean=attack?(strike?2:frame<3?-1:0):0;
 g.fillStyle(0x182b21,.23).fillEllipse(bear?20:17,bear?31:28,bear?36:27,8);
 g.fillStyle(bear?0x493529:0x323e42).fillRect(bear?8:9,bear?23:20,bear?6:3,bear?10:8).fillRect(bear?26:21,bear?23:20,bear?6:3,bear?10:8);
 g.fillStyle(bear?0x846244:0x89999b);if(bear)g.fillRoundedRect(3+lean,10,30,17,5).fillRect(9+lean,7,13,7);else g.fillRect(6+lean,12,20,11);
 const headX=(bear?29:24)+lean+(attack&&strike?1:0),headY=attack?(strike?10:8):caught?17:19;
 g.fillStyle(bear?0x846244:0x89999b).fillRoundedRect(headX,headY,bear?10:8,9,3);
 g.fillStyle(bear?0x5b4230:0x596b70);if(bear)g.fillCircle(headX+1,headY-1,3).fillCircle(headX+7,headY,3);else g.fillTriangle(headX,headY+1,headX+1,headY-4,headX+4,headY+1).fillTriangle(headX+5,headY+2,headX+7,headY-3,headX+8,headY+3);
 g.fillStyle(bear?0xa1835e:0xc6d1c5).fillRect(headX+5,headY+6,bear?7:6,3);
 g.fillStyle(0x17251e).fillRect(headX+6,headY+3,2,2).fillRect(headX+(bear?11:10),headY+6,2,2);
 if(attack&&!bear){const jaw=strike?4:frame<3?2:0;g.fillStyle(0x27362e).fillRect(headX+6,headY+8,7,jaw);g.fillStyle(0xc6d1c5).fillRect(headX+5,headY+8+jaw,7,2);if(jaw)g.fillStyle(0xe4e4cf).fillRect(headX+7,headY+8,2,2).fillRect(headX+10,headY+8,1,2);}
 if(bear){const pawX=attack?(strike?39:frame<3?27:30):caught?32:frame>=4&&frame<=6?38:27,pawY=attack?(strike?18:frame<3?9:25):caught?25:frame>=4&&frame<=6?29:frame>=2?16:27;
 g.lineStyle(7,0x60432e).lineBetween(27+lean,19,pawX,pawY);g.fillStyle(0x493529).fillRoundedRect(pawX-2,pawY-2,7,5,2);if(attack&&strike)g.fillStyle(0xd9c8a0).fillRect(pawX+3,pawY-1,2,1).fillRect(pawX+3,pawY+1,2,1).fillRect(pawX+3,pawY+3,2,1);
 if(caught&&frame<6){g.fillStyle(0xb6d1be).fillEllipse(36,27+(frame%2),9,3);g.fillStyle(0x8bb7b8).fillTriangle(31,27,28,24,28,30);}}
 g.generateTexture(species+'-'+action+'-'+frame,bear?46:40,bear?38:34);g.destroy();}}
 }
 drawFishingCombatEffects(a:Animal,time:number,facing:number){const g=this.effectGraphics;
 if(a.alive&&a.action==='Fishing'){const water=this.drinkingWater(a),progress=(a.plan?.elapsed??0)/3;if(water){const x=(a.x+(water.x-a.x)*.8)*TILE,y=(a.y+(water.y-a.y)*.8)*TILE;g.lineStyle(1,0xb2d8d3,.35).strokeEllipse(x,y,8+Math.sin(time*3)*2,4);if(progress>.55&&progress<.85){const t=(progress-.55)/.3;for(let i=0;i<5;i++)g.fillStyle(0xb8e3de,(1-t)*.8).fillRect(x+(i-2)*4*t,y-Math.sin(t*Math.PI)*7+(i%2)*3,2,2);}}}
 const catchAge=a.lastCatch===undefined?Infinity:time-a.lastCatch.time;if(catchAge>=0&&catchAge<.85){const water=this.drinkingWater(a);if(water){const x=(a.x+(water.x-a.x)*.8)*TILE,y=(a.y+(water.y-a.y)*.8)*TILE,t=catchAge/.85;g.lineStyle(1,0xc1e5d9,(1-t)*.8).strokeEllipse(x,y,8+t*23,4+t*9);if(t<.55){const fx=x+(a.x*TILE-x)*t,fy=y-Math.sin(t/.55*Math.PI)*12;g.fillStyle(0xc7ddbe).fillEllipse(fx,fy,8,3);g.fillStyle(0x8bb7b8).fillTriangle(fx-4,fy,fx-7,fy-2,fx-7,fy+2);}}}
 const hitAge=a.lastStrike===undefined?Infinity:time-a.lastStrike.time;if(a.lastStrike&&hitAge>=0&&hitAge<.18){const cycle=(time*1.7+a.id*.11)%1;if(cycle>.35&&cycle<.6){const target=bridge.world.animals.find(b=>b.id===a.lastStrike!.targetId),p=target??a.lastStrike,x=(a.x+p.x)/2*TILE,y=(a.y+p.y)/2*TILE;g.lineStyle(1,a.species==='bear'?0xecd8b2:0xcbd7cf,.6);if(a.species==='bear')for(let i=0;i<3;i++)g.lineBetween(x-4+i*3,y-4,x+i*3,y+4);else g.strokeCircle(x,y,3).lineBetween(x-6,y,x-3,y).lineBetween(x+3,y,x+6,y);}}
 }
 makeDeathTextures(antlers=true){for(const species of (antlers?['deer','wolf','bear']:['deer']) as Species[]){const bear=species==='bear',deer=species==='deer',width=bear?46:40,height=bear?38:34;
 for(let frame=0;frame<6;frame++){const g=this.make.graphics({x:0,y:0}),p=frame/5,bodyY=12+Math.round(p*7),headX=bear?32:27,headY=8+Math.round(p*16),fur=bear?0x846244:deer?0xba8752:0x89999b;
 g.fillStyle(0x182b21,.22).fillEllipse(bear?21:18,bear?31:29,bear?37:32,7);
 g.lineStyle(bear?5:3,bear?0x493529:deer?0x66472d:0x323e42);g.lineBetween(11,bodyY+5,Math.round(9-p*6),Math.round(28+p*3)).lineBetween(bear?27:23,bodyY+5,Math.round((bear?29:25)+p*5),Math.round(28+p*3));
 g.fillStyle(fur).fillRoundedRect(5,bodyY,bear?29:23,Math.round(12-p*4),3);g.lineStyle(bear?9:6,fur).lineBetween(bear?29:25,bodyY+3,headX,headY+3);g.fillStyle(fur).fillRoundedRect(headX-2,headY,bear?10:8,7,2);
 g.fillStyle(bear?0xa1835e:deer?0xe6c998:0xc6d1c5).fillRect(headX+3,headY+4,7,3);
 g.fillStyle(bear?0x5b4230:deer?0x8d633c:0x596b70).fillRect(headX-3,headY-3,3,5).fillRect(headX+3,headY-2,3,4);
 if(deer&&antlers)g.lineStyle(2,0xd5c59b).lineBetween(headX-1,headY-2,headX-7,headY-6).lineBetween(headX-5,headY-5,headX-5,headY-9);
 g.fillStyle(0x263128).fillRect(headX+4,headY+2,3,1).fillRect(headX+5,headY+1,1,3).fillRect(headX+9,headY+5,2,2);
 g.generateTexture(species+'-collapse-'+frame+(antlers?'':'-antlerless'),width,height);g.destroy();}
 for(let stage=0;stage<4;stage++){const g=this.make.graphics({x:0,y:0}),bodyWidth=bear?29:23,headX=bear?32:27,fur=bear?0x785b43:deer?0xa18055:0x778482;
 g.fillStyle(0x263128,.2).fillEllipse(bear?21:18,bear?31:29,bear?37:32,6);
 if(stage<3){g.lineStyle(bear?5:3,stage<2?0x66533b:0x918268).lineBetween(11,24,3,31).lineBetween(bear?28:23,24,bear?37:32,31);g.fillStyle(fur,stage===2?.55:1).fillRoundedRect(5,19,bodyWidth,8,3);g.fillStyle(fur).fillRoundedRect(headX-2,24,8,7,2).fillRect(headX+3,28,7,3);g.fillStyle(0x263128).fillRect(headX+3,26,3,1).fillRect(headX+4,25,1,3);}
 if(stage>=1){g.lineStyle(stage===1?1:2,0xc8bda0,stage===1?.55:.9).lineBetween(9,22,bear?30:26,22);for(let x=12;x<(bear?29:25);x+=4)g.lineBetween(x,20,x+1,26);}
 if(stage===3){g.lineStyle(2,0xb8ad91).lineBetween(11,24,4,30).lineBetween(bear?27:23,24,bear?35:31,31);g.fillStyle(0xc8bda0).fillRoundedRect(headX-2,25,8,6,2);g.fillStyle(0x5e6550).fillRect(headX+2,26,2,2).fillRect(headX+5,28,2,1);}
 if(deer&&antlers)g.lineStyle(2,0xc8bda0).lineBetween(headX-1,24,headX-7,20).lineBetween(headX-5,21,headX-5,17);
 g.generateTexture(species+'-carcass-'+stage+(antlers?'':'-antlerless'),width,height);g.destroy();}
 }}
 makeFamilyTextures(){makeFamilyTextures(this);}
 makeAntlerlessTextures(){this.makeTextures(false);this.makeMovementTextures(false);this.makeSurvivalTextures(false);this.makeAwarenessTextures(false);this.makeDeathTextures(false);this.makeSleepingDeerTexture(false);}
 makeSleepingDeerTexture(antlers=true){const g=this.make.graphics({x:0,y:0});
 // Folded legs, a lowered head, and closed eyes distinguish rest from a carcass.
 g.fillStyle(0x182b21,.22).fillEllipse(17,27,27,7);
 g.fillStyle(0x66472d).fillRect(7,25,10,3).fillRect(20,25,9,3);
 g.fillStyle(0xba8752).fillRoundedRect(5,16,23,11,5);
 g.fillStyle(0xe6c998).fillRect(9,24,14,2);
 g.fillStyle(0x8d633c).fillRect(3,18,5,3).fillRect(23,15,5,5);
 g.fillStyle(0xba8752).fillRoundedRect(24,18,8,7,2).fillRect(29,22,5,3);
 g.fillStyle(0x8d633c).fillRect(23,13,3,6).fillRect(29,15,3,4);
 if(antlers)g.fillStyle(0xe7d6ac).fillRect(24,9,2,6).fillRect(21,10,4,2);
 g.fillStyle(0x17251e).fillRect(28,21,3,1).fillRect(33,23,2,2);
 g.generateTexture('deer-sleep'+(antlers?'':'-antlerless'),36,34);g.destroy();}
 makeSleepingPredatorTextures(){
 const wolf=this.make.graphics({x:0,y:0});
 wolf.fillStyle(0x182b21,.22).fillEllipse(17,27,28,7);
 // A curled tail and folded paws frame the wolf's lowered muzzle.
 wolf.fillStyle(0x596b70).fillRoundedRect(2,17,10,10,4);
 wolf.fillStyle(0x89999b).fillRoundedRect(6,15,22,12,5);
 wolf.fillStyle(0xc6d1c5).fillRect(10,24,18,3).fillRect(27,22,7,3);
 wolf.fillStyle(0x89999b).fillRoundedRect(23,18,9,7,2);
 wolf.fillStyle(0x596b70).fillTriangle(23,19,24,12,28,18).fillTriangle(28,19,31,14,32,20);
 wolf.fillStyle(0x17251e).fillRect(28,21,3,1).fillRect(33,22,2,2);
 wolf.generateTexture('wolf-sleep',36,34);wolf.destroy();
 const bear=this.make.graphics({x:0,y:0});
 bear.fillStyle(0x182b21,.25).fillEllipse(21,30,36,8);
 bear.fillStyle(0x493529).fillRoundedRect(7,26,27,6,3);
 bear.fillStyle(0x846244).fillRoundedRect(3,15,31,16,7).fillRoundedRect(27,21,12,10,4);
 bear.fillStyle(0x5b4230).fillCircle(29,20,3).fillCircle(36,21,3).fillRect(8,28,10,3);
 bear.fillStyle(0xa1835e).fillRect(33,26,10,5);
 bear.fillStyle(0x25251d).fillRect(34,25,3,1).fillRect(41,27,3,3);
 bear.generateTexture('bear-sleep',46,38);bear.destroy();
 }
 terrainCode(c:Cell){return (c.kind==='water'?1:c.kind==='tree'?2:0)+(c.variant<<2)+(c.forage?(c.food>40?3:c.food>12?2:1)<<5:0)+(c.river!==undefined?128:0)+(c.ford?256:0);}
 terrainChanged(){if(this.terrainWorld!==bridge.world)return true;return bridge.world.cells.some((c,i)=>this.terrainCodes[i]!==this.terrainCode(c));}
 paint(){this.terrainWorld=bridge.world;for(let i=0;i<bridge.world.cells.length;i++)this.terrainCodes[i]=this.terrainCode(bridge.world.cells[i]);const g=this.terrain;g.clear();for(let y=0;y<H;y++)for(let x=0;x<W;x++){const c=bridge.world.cell(x,y);const colors=[0x789357,0x759054,0x7a9559,0x718b50,0x7d975b];if(c.kind==='water'){g.fillStyle(c.river!==undefined?0x386875:0x426f75).fillRect(x*TILE,y*TILE,TILE,TILE);g.fillStyle(0x67969a,.6).fillRect(x*TILE+4,y*TILE+10,11,2);if(bridge.world.walkable(x,y-1))g.fillStyle(0xc0b57e).fillRect(x*TILE,y*TILE,TILE,4);}else{g.fillStyle(colors[c.variant]).fillRect(x*TILE,y*TILE,TILE,TILE);if(c.kind==='grass'){const cover=bridge.world.coverAt({x,y});if(cover)g.fillStyle(0x294b34,cover*.24).fillRect(x*TILE,y*TILE,TILE,TILE);}if(c.ford){g.fillStyle(0xb8b296,.9).fillRect(x*TILE+2,y*TILE+4,8,6).fillRect(x*TILE+13,y*TILE+14,9,6);g.fillStyle(0x6d9a99,.7).fillRect(x*TILE+1,y*TILE+12,9,2);}if(c.kind==='grass'&&c.forage){const lush=c.food>12;g.fillStyle(lush?0x63834d:0x897b55,.45).fillEllipse(x*TILE+12,y*TILE+13,19,16);for(const [dx,dy]of [[6,8],[13,6],[10,15],[17,14]]){g.fillStyle(lush?0x9caf72:0x99865f,.8).fillRect(x*TILE+dx,y*TILE+dy,3,lush?6:2);if(lush&&c.food>40)g.fillStyle(0xbdc58c,.65).fillRect(x*TILE+dx-1,y*TILE+dy-1,4,2);}}else{g.fillStyle(0x8ca361,.4).fillRect(x*TILE+4,y*TILE+9,2,3);}if(c.kind==='tree'){g.fillStyle(0x384c30,.35).fillEllipse(x*TILE+14,y*TILE+20,26,12);g.fillStyle(0x665039).fillRect(x*TILE+10,y*TILE+11,5,12);g.fillStyle(0x365b3f).fillRect(x*TILE+2,y*TILE+4,21,13).fillRect(x*TILE+6,y*TILE-3,14,10);g.fillStyle(0x467249).fillRect(x*TILE+5,y*TILE,12,10);g.fillStyle(0x608450).fillRect(x*TILE+7,y*TILE,7,4);}}}}
 drawFish(){const w=bridge.world;if(this.lastFishWorld===w&&this.lastFishTime===w.time&&this.lastFishCaught===w.stats.fishCaught)return;this.lastFishWorld=w;this.lastFishTime=w.time;this.lastFishCaught=w.stats.fishCaught;const g=this.fishGraphics;g.clear();for(const r of bridge.world.rivers){const fullness=r.fish/r.capacity;if(r.fish<1)continue;const count=Math.ceil(fullness*5);for(let k=0;k<count;k++){const tile=r.tiles[(k*7+r.id*3)%r.tiles.length],x=tile%W*TILE+12+Math.sin(bridge.world.time*.7+k)*4,y=Math.floor(tile/W)*TILE+12+Math.cos(bridge.world.time*.5+k)*3;g.fillStyle(0xb6d1be,.8).fillEllipse(x,y,8,3);g.fillStyle(0x8bb7b8,.8).fillTriangle(x-4,y,x-7,y-3,x-7,y+3);g.lineStyle(1,0xa1d0cb,.3).strokeEllipse(x+1,y+2,15,7);}}}
 update(_t:number,delta:number){const frameStart=performance.now();let steps=0;this.acc+=Math.min(delta/1000,.1)*bridge.speed;while(this.acc>=.1){bridge.world.step(.1);steps++;this.acc-=.1;}const afterSteps=performance.now(),families=familyVisuals(bridge.world,bridge.world.time+this.acc);const selected=bridge.world.animals.find(a=>a.id===bridge.selected);const ids=new Set(bridge.world.animals.map(a=>a.id));for(const[id,s]of this.actors)if(!ids.has(id)){s.destroy();this.actors.delete(id);}this.activityGraphics.clear();this.effectGraphics.clear();for(const a of bridge.world.animals){let s=this.actors.get(a.id);if(!s){s=this.add.image(a.x*TILE,a.y*TILE,a.species);this.actors.set(a.id,s);}const lastX=s.getData('lastX')??a.x,lastY=s.getData('lastY')??a.y,travel=Math.hypot(a.x-lastX,a.y-lastY);s.setData('lastX',a.x);s.setData('lastY',a.y);const stride=a.species==='bear'?1.5:1.2,phase=((s.getData('gaitPhase')??a.id*.7)+travel*Math.PI*2/(isSprinting(a)?stride:stride*.6))%(Math.PI*2);s.setData('gaitPhase',phase);const sleeping=a.alive&&a.action==='Sleeping'&&!a.path.length,breath=Math.sin((bridge.world.time+this.acc)*(a.species==='bear'?1.1:a.species==='wolf'?1.5:1.8)+a.id*.7),sprinting=isSprinting(a),moving=a.alive&&a.path.length>0&&a.action!=='Sleeping',bob=moving?Math.sin(phase*2)*(sprinting?1.5:.4):0;const gaitFrame=Math.floor(phase/(Math.PI*2)*8)%8,activity=a.alive&&!moving?(a.action==='Grazing'&&a.species==='deer'?'graze':a.action==='Drinking'?'drink':a.action==='Feeding'&&a.species!=='deer'?'feed':undefined):undefined,visualTime=bridge.world.time+this.acc,activityFrame=Math.floor((visualTime*(activity==='feed'?7:9)+a.id)%6);const deathAge=a.diedAt===undefined?Infinity:Math.max(0,visualTime-a.diedAt),collapsing=!a.alive&&deathAge<.65,meatFraction=Math.max(0,Math.min(1,a.carcass/(a.carcassCapacity??CARCASS_MEAT))),carcassStage=a.carcass<=0?3:meatFraction>.66?0:meatFraction>.33?1:2,remainsAge=a.depletedAt===undefined?Infinity:Math.max(0,visualTime-a.depletedAt);const catchAge=a.lastCatch===undefined?Infinity:visualTime-a.lastCatch.time,catching=a.alive&&a.species==='bear'&&!moving&&catchAge>=0&&catchAge<.85,fishing=a.alive&&a.species==='bear'&&a.action==='Fishing',attacking=a.alive&&a.species!=='deer'&&a.lastStrike!==undefined&&visualTime-a.lastStrike.time<.2,attackPhase=(visualTime*1.7+a.id*.11)%1,attackFrame=Math.floor(attackPhase*8),fishFrame=Math.min(7,Math.floor((a.plan?.elapsed??0)/3*8));const awareness=a.alive&&!sleeping&&!sprinting&&!activity?(['Checking surroundings','Guarding territory'].includes(a.action)?'alert':a.action==='Marking territory'?'sniff':a.action==='Searching for prey'?'search':['Seeking carcass','Seeking grass','Seeking fish','Seeking water','Returning home','Patrolling territory','Returning to den'].includes(a.action)||(a.action==='Wandering'&&/Searching/.test(a.reason))?'sniff':undefined):undefined,awarenessFrame=Math.floor((visualTime*(awareness==='alert'?7:4)+a.id)%8);const family=!sleeping&&!moving&&!activity&&!attacking&&!catching&&!fishing?families.get(a.id):undefined;const focus=attacking?bridge.world.animals.find(b=>b.id===a.lastStrike?.targetId)??a.lastStrike:fishing||catching||activity==='drink'?this.drinkingWater(a):activity==='feed'?bridge.world.animals.find(b=>b.id===a.foodTarget):family?.focus,facing=focus&&Math.abs(focus.x-a.x)>.05?(focus.x<a.x?-1:1):a.facing;if(activity)this.drawSurvivalEffects(a,activity,visualTime,facing);this.drawFishingCombatEffects(a,visualTime,facing);const poseKey=!a.alive?(collapsing?a.species+'-collapse-'+Math.min(5,Math.floor(deathAge/.65*6)):a.species+'-carcass-'+carcassStage):attacking?a.species+'-attack-'+attackFrame:catching?'bear-catch-'+Math.min(7,Math.floor(catchAge/.85*8)):fishing?'bear-fish-'+fishFrame:sleeping?a.species+'-sleep':moving?a.species+'-'+(sprinting?'run':awareness==='sniff'?'sniff':awareness==='search'?'search':'walk')+'-'+gaitFrame:activity?a.species+'-'+activity+'-'+activityFrame:family?a.species+'-family-'+family.action+'-'+family.frame:awareness?a.species+'-'+awareness+'-idle-'+awarenessFrame:a.species;const textureKey=animalTexture(a,poseKey),build=sexBuild(a),size=juvenileSize(a),restingFamily=family?.action==='rest',sx=(sleeping||restingFamily?1+breath*.012:sprinting?1.06:1)*size*build.x,sy=(sleeping||restingFamily?1+breath*.025:sprinting?.92:1)*size*build.y,lunge=attacking?Math.sin(attackPhase*Math.PI*2)*2:0,recoil=a.alive&&a.lastHit!==undefined&&visualTime-a.lastHit<.2?Math.sin(visualTime*25)*1.2:0,x=a.x*TILE+facing*(lunge-recoil),y=a.y*TILE+bob-(sleeping||restingFamily?breath*.25:0),alpha=a.alive||collapsing?1:a.carcass>0?.65+meatFraction*.3:Math.max(0,.3*(1-remainsAge/60)),flip=facing<0,tint=a.alive&&a.lastHit!==undefined&&bridge.world.time-a.lastHit<.2?0xffb7a0:coatTint(a);
 const pose=s.getData('pose')??{};if(pose.texture!==textureKey){s.setTexture(textureKey);pose.texture=textureKey;}if(pose.sx!==sx||pose.sy!==sy){s.setScale(sx,sy);pose.sx=sx;pose.sy=sy;}if(pose.x!==x||pose.y!==y){s.setPosition(x,y);pose.x=x;pose.y=y;}if(pose.depth!==a.y*TILE){s.setDepth(a.y*TILE);pose.depth=a.y*TILE;}if(pose.flip!==flip){s.setFlipX(flip);pose.flip=flip;}if(pose.alpha!==alpha){s.setAlpha(alpha);pose.alpha=alpha;}if(pose.tint!==tint){if(tint!==0xffffff)s.setTint(tint);else s.clearTint();pose.tint=tint;}s.setData('pose',pose);}
 this.drawFish();this.drawHomes();this.marks.clear();const selectedHome=bridge.world.homes.find(h=>h.id===bridge.selectedHome)??(bridge.overlay&&selected?homeFor(bridge.world,selected):undefined);if(selectedHome)drawHomeRange(selectedHome,this.marks,bridge.overlay);if(!selected&&bridge.selectedRiver){const section=bridge.world.rivers.find(r=>r.id===bridge.selectedRiver);if(section)for(const tile of section.tiles)this.marks.lineStyle(1,0xc2e1d1,.65).strokeRect(tile%W*TILE,Math.floor(tile/W)*TILE,TILE,TILE);}if(selected){this.marks.lineStyle(2,0xf1d58a).strokeEllipse(selected.x*TILE,selected.y*TILE+7,42,20);if(bridge.follow)this.cameras.main.centerOn(selected.x*TILE,selected.y*TILE);if(bridge.overlay){if(selected.species==='deer')for(const mate of bridge.world.nearbyHerd(selected)){this.marks.lineStyle(1,0xc8b986,.45).lineBetween(selected.x*TILE,selected.y*TILE,mate.x*TILE,mate.y*TILE);}if(selected.species==='wolf')for(const mate of bridge.world.nearbyPack(selected)){this.marks.lineStyle(1,0x9cb9d0,.45).lineBetween(selected.x*TILE,selected.y*TILE,mate.x*TILE,mate.y*TILE);}this.marks.lineStyle(1,0xf1d58a,.5).strokeCircle(selected.x*TILE,selected.y*TILE,bridge.world.perceptionRadius(selected)*TILE);this.marks.lineStyle(2,0xf1d58a,.8);this.marks.beginPath();this.marks.moveTo(selected.x*TILE,selected.y*TILE);for(const p of selected.path)this.marks.lineTo(p.x*TILE,p.y*TILE);this.marks.strokePath();}}
 if(bridge.world.time-this.lastPaint>1||bridge.world.time<this.lastPaint){if(this.terrainChanged())this.paint();this.lastPaint=bridge.world.time;}bridge.metrics.fps=this.game.loop.actualFps;if(steps)bridge.metrics.stepMs=bridge.metrics.stepMs*.9+(afterSteps-frameStart)/steps*.1;bridge.metrics.renderMs=bridge.metrics.renderMs*.9+(performance.now()-afterSteps)*.1;}
}
export function createGame(parent:HTMLElement){return new Phaser.Game({type:Phaser.AUTO,parent,pixelArt:true,antialias:false,backgroundColor:'#718b50',scale:{mode:Phaser.Scale.RESIZE,width:parent.clientWidth,height:parent.clientHeight},scene:Habitat,banner:false});}
