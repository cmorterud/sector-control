import { dist, type Vec } from "./map";
export type NavigationBounds = {minX:number;maxX:number;minZ:number;maxZ:number};
type Check = NavigationBounds & {pass:boolean};
type Row = {point:Vec;targets?:string[];checks:Map<string,Check>};
// Retain directed walk checks AND completed adjacency rows. A local blast only
// invalidates intersecting checks; adding/removing a node invalidates nearby
// neighbor lists. Input and bucket iteration order stay identical to a rebuild.
export class NavigationEdges {
  private points = new Map<string,Vec>();
  private rows = new Map<string,Row>();
  invalidate(bounds?:NavigationBounds) {
    for(const row of this.rows.values()) {
      if(!bounds){row.checks.clear();row.targets=undefined;continue;}
      for(const [key,check] of row.checks)if(check.minX<=bounds.maxX && check.maxX>=bounds.minX && check.minZ<=bounds.maxZ && check.maxZ>=bounds.minZ){
        row.checks.delete(key);row.targets=undefined;
      }
    }
  }
  build(nodes:Vec[],keys:string[],step:number,walk:(a:Vec,b:Vec)=>boolean) {
    const work = this.slices(nodes, keys, step, walk);
    let result = work.next();
    while (!result.done) result = work.next();
    return result.value;
  }
  // Yield after each new physical walk check. Scheduling order can prioritize
  // occupied regions without changing adjacency order or route tie-breaking.
  *slices(nodes:Vec[],keys:string[],step:number,walk:(a:Vec,b:Vec)=>boolean,near:Vec[]=[]): Generator<void,number[][]> {
    const current=new Map(nodes.map((p,i)=>[keys[i],p]));
    const oldOrder=new Map([...this.points.keys()].map((key,i)=>[key,i]));
    let lastIndex=-1,reordered=false;
    for(const key of keys){const index=oldOrder.get(key);if(index===undefined)continue;if(index<lastIndex)reordered=true;lastIndex=index;}
    if(reordered)for(const row of this.rows.values())row.targets=undefined;
    const changed:Vec[]=[];
    for(const [key,p] of current)if(!this.points.has(key))changed.push(p);
    for(const [key,p] of this.points)if(!current.has(key)){changed.push(p);this.rows.delete(key);}
    for(const p of changed)for(const row of this.rows.values())if(dist(p,row.point)<=step*1.45)row.targets=undefined;
    this.points=current;
    const indices=new Map(keys.map((key,i)=>[key,i]));
    // Construct buckets only if at least one row needs computing.
    let buckets:Map<string,number[]>|undefined;
    const getBuckets=()=>{
      if(!buckets){
        buckets=new Map();nodes.forEach((p,i)=>{const key=`${Math.floor(p.x/step)},${Math.floor(p.z/step)}`;const list=buckets!.get(key);if(list)list.push(i);else buckets!.set(key,[i]);});
      }
      return buckets;
    };
    const occupied = new Set(near.map(p => `${Math.floor(p.x / step)},${Math.floor(p.z / step)}`));
    const priority: number[] = [], rest: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const cx = Math.floor(nodes[i].x / step), cz = Math.floor(nodes[i].z / step);
      if (!occupied.size) { rest.push(i); continue; }
      let close = false;
      for (let x = cx - 2; x <= cx + 2 && !close; x++)
        for (let z = cz - 2; z <= cz + 2 && !close; z++) close = occupied.has(`${x},${z}`);
      (close ? priority : rest).push(i);
    }
    const edges: number[][] = new Array(nodes.length);
    for (const i of [...priority, ...rest]) {
      const a = nodes[i];
      let row=this.rows.get(keys[i]);
      if(!row){row={point:a,checks:new Map()};this.rows.set(keys[i],row);}
      if(row.targets){edges[i]=row.targets.map(key=>indices.get(key)!);continue;}
      const result:number[]=[],cx=Math.floor(a.x/step),cz=Math.floor(a.z/step);
      for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const j of getBuckets().get(`${x},${z}`)??[]){
        const b=nodes[j];if(j===i || dist(a,b)>step*1.45)continue;
        let check=row.checks.get(keys[j]);
        if(!check){
          check={pass:walk(a,b),minX:Math.min(a.x,b.x)-.61,maxX:Math.max(a.x,b.x)+.61,minZ:Math.min(a.z,b.z)-.61,maxZ:Math.max(a.z,b.z)+.61};
          row.checks.set(keys[j],check);
          yield;
        }
        if(check.pass)result.push(j);
      }
      row.targets=result.map(j=>keys[j]);edges[i]=result;
    }
    return edges;
  }
}
