import type {World,Point,Species,Animal} from './sim';
import {W,H} from './sim';

export function coverAt(w:World,p:Point){
 const x=Math.floor(p.x),y=Math.floor(p.y);if(!w.walkable(x,y))return 0;
 let trees=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&y+dy>=0&&x+dx<W&&y+dy<H&&w.cells[(y+dy)*W+x+dx].kind==='tree')trees++;
 return Math.min(.6,trees*.15);
}

export function terrainSpeed(w:World,p:Point,species:Species='deer'){
 const c=w.cell(p.x,p.y);if(c.kind!=='grass')return 0;
 if(c.ford)return species==='bear'?.82:species==='wolf'?.76:.72;
 return 1-coverAt(w,p)*(species==='bear'?.3:species==='wolf'?.2:.1);
}

type Entry={id:number;cost:number;priority:number;order:number};
class Heap{
 entries:Entry[]=[];order=0;
 before(a:Entry,b:Entry){return a.priority<b.priority||a.priority===b.priority&&a.order<b.order;}
 push(id:number,cost:number,priority:number){const e={id,cost,priority,order:this.order++},q=this.entries;let i=q.length;q.push(e);while(i){const p=(i-1)>>1;if(!this.before(e,q[p]))break;q[i]=q[p];i=p;}q[i]=e;}
 pop(){const q=this.entries,first=q[0],last=q.pop()!;if(q.length){let i=0;while(i*2+1<q.length){let c=i*2+1;if(c+1<q.length&&this.before(q[c+1],q[c]))c++;if(!this.before(q[c],last))break;q[i]=q[c];i=c;}q[i]=last;}return first;}
}
const point=(id:number):Point=>({x:id%W+.5,y:Math.floor(id/W)+.5});
function neighbors(id:number){const x=id%W,y=Math.floor(id/W),out:number[]=[];if(x<W-1)out.push(id+1);if(x)out.push(id-1);if(y<H-1)out.push(id+W);if(y)out.push(id-W);return out;}
function reconstruct(prev:Int32Array,start:number,end:number,a:Point){
 const path:Point[]=[];for(let n=end;n!==start;n=prev[n]){if(n<0)return [];path.push(point(n));}path.reverse();
 const center=point(start);if(path.length&&Math.hypot(a.x-center.x,a.y-center.y)>.01)path.unshift(center);
 return path;
}

// A* minimizes travel time, with a stable tie-break for seeded save/replay.
export function terrainRoute(w:World,a:Point,b:Point,species:Species='deer'):Point[]{
 if(!w.walkable(a.x,a.y)||!w.walkable(b.x,b.y))return [];
 const sx=Math.floor(a.x),sy=Math.floor(a.y),tx=Math.floor(b.x),ty=Math.floor(b.y),start=sy*W+sx,end=ty*W+tx;if(start===end)return [];
 const cost=new Float64Array(W*H).fill(Infinity),prev=new Int32Array(W*H).fill(-1),queue=new Heap();cost[start]=0;queue.push(start,0,Math.abs(tx-sx)+Math.abs(ty-sy));
 while(queue.entries.length){const e=queue.pop();if(e.cost!==cost[e.id])continue;if(e.id===end)return reconstruct(prev,start,end,a);
  for(const id of neighbors(e.id)){const p=point(id);if(!w.walkable(p.x,p.y))continue;const next=e.cost+1/terrainSpeed(w,p,species);if(next>=cost[id])continue;cost[id]=next;prev[id]=e.id;queue.push(id,next,next+Math.abs(tx-id%W)+Math.abs(ty-Math.floor(id/W)));}
 }
 return [];
}

// Explore a bounded reachable neighborhood instead of choosing an unreachable
// point across water. Danger penalizes the route as well as its endpoint.
export function escapeRoute(w:World,a:Animal,threat:Point,herd?:Point){
 if(!w.walkable(a.x,a.y))return {path:[] as Point[],cover:0};
 const start=Math.floor(a.y)*W+Math.floor(a.x),cost=new Float64Array(W*H).fill(Infinity),prev=new Int32Array(W*H).fill(-1),queue=new Heap();
 cost[start]=0;queue.push(start,0,0);let best=start,bestScore=-Infinity;
 while(queue.entries.length){const e=queue.pop();if(e.cost!==cost[e.id])continue;const p=point(e.id),distance=Math.hypot(p.x-threat.x,p.y-threat.y),fromStart=Math.hypot(p.x-a.x,p.y-a.y);
  if(e.id!==start&&fromStart>=2){const cover=coverAt(w,p),hidden=!w.sightLine(threat,p),score=distance+cover*3+(hidden?2:0)-e.cost*.15-(herd?Math.hypot(p.x-herd.x,p.y-herd.y)*.1:0);if(score>bestScore){best=e.id;bestScore=score;}}
  for(const id of neighbors(e.id)){const q=point(id);if(!w.walkable(q.x,q.y))continue;const danger=Math.max(0,2-Math.hypot(q.x-threat.x,q.y-threat.y))*.8,next=e.cost+1/terrainSpeed(w,q,a.species)+danger;if(next>7||next>=cost[id])continue;cost[id]=next;prev[id]=e.id;queue.push(id,next,next);}
 }
 const path=best===start?[]:reconstruct(prev,start,best,a);return {path,cover:best===start?0:coverAt(w,point(best))};
}
