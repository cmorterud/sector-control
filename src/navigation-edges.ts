import { dist, type Vec } from "./map";
type Bounds = {minX:number;maxX:number;minZ:number;maxZ:number};
type Check = Bounds & {pass:boolean};
type Row = {point:Vec;targets?:string[];checks:Map<string,Check>};
// Retain directed walk checks AND completed adjacency rows. A local blast only
// invalidates intersecting checks; adding/removing a node invalidates nearby
// neighbor lists. Input and bucket iteration order stay identical to a rebuild.
export class NavigationEdges {
  private points = new Map<string,Vec>();
  private rows = new Map<string,Row>();
  invalidate(bounds?:Bounds) {
    for(const row of this.rows.values()) {
      if(!bounds){row.checks.clear();row.targets=undefined;continue;}
      for(const [key,check] of row.checks)if(check.minX<=bounds.maxX && check.maxX>=bounds.minX && check.minZ<=bounds.maxZ && check.maxZ>=bounds.minZ){
        row.checks.delete(key);row.targets=undefined;
      }
    }
  }
  build(nodes:Vec[],keys:string[],step:number,walk:(a:Vec,b:Vec)=>boolean) {
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
    return nodes.map((a,i)=>{
      let row=this.rows.get(keys[i]);
      if(!row){row={point:a,checks:new Map()};this.rows.set(keys[i],row);}
      if(row.targets)return row.targets.map(key=>indices.get(key)!);
      const result:number[]=[],cx=Math.floor(a.x/step),cz=Math.floor(a.z/step);
      for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const j of getBuckets().get(`${x},${z}`)??[]){
        const b=nodes[j];if(j===i || dist(a,b)>step*1.45)continue;
        let check=row.checks.get(keys[j]);
        if(!check){
          check={pass:walk(a,b),minX:Math.min(a.x,b.x)-.61,maxX:Math.max(a.x,b.x)+.61,minZ:Math.min(a.z,b.z)-.61,maxZ:Math.max(a.z,b.z)+.61};
          row.checks.set(keys[j],check);
        }
        if(check.pass)result.push(j);
      }
      row.targets=result.map(j=>keys[j]);return result;
    });
  }
}
