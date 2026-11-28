import * as pc from "playcanvas";
import {dist,groundHeight,type Vec} from "./map";
import type {Renderer} from "./rendering";
import type {Game} from "./simulation";
import type {TrainingCue} from "./training-ui";

export class TrainingMarker {
  private element=document.createElement("div");
  private name=document.createElement("span");
  private arrow=document.createElement("b");

  constructor(root:HTMLElement){
    this.element.id="training-marker";
    this.element.hidden=true;
    this.element.setAttribute("aria-hidden","true");
    this.element.append(this.name,this.arrow);
    root.append(this.element);
  }

  update(renderer:Renderer,g:Game,cue?:TrainingCue){
    this.updateRing(renderer.app,g,cue);
    const pos=cue && trainingMarkerPosition(cue,g,at=>renderer.project(at),innerWidth,innerHeight);
    this.element.hidden=!pos;
    if(cue && pos){
      if(this.name.textContent!==cue.label) this.name.textContent=cue.label;
      if(this.arrow.textContent!==pos.arrow) this.arrow.textContent=pos.arrow;
      this.element.style.transform=`translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
    }
  }

  private ring?: pc.Entity;
  private updateRing(app: pc.Application, g: Game, cue?: TrainingCue) {
    if (!cue?.radius) {
      if (this.ring) this.ring.enabled = false;
      return;
    }
    if (!this.ring) {
      const positions: number[] = [], indices: number[] = [];
      const segments = 36;
      for (let i = 0; i < segments; i++) {
        const a = i * 2 * Math.PI / segments;
        for (const radius of [1, 0.86]) positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        const outer = 2 * i, next = 2 * ((i + 1) % segments);
        indices.push(outer, outer + 1, next, next, outer + 1, next + 1);
      }
      const mesh = new pc.Mesh(app.graphicsDevice);
      mesh.setPositions(positions);
      mesh.setIndices(indices);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      const material = new pc.StandardMaterial();
      material.useLighting = false;
      material.emissive = new pc.Color(1, .72, .18);
      material.cull = pc.CULLFACE_NONE;
      material.update();
      const ring = this.ring = new pc.Entity("Training checkpoint");
      ring.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, material, ring)], castShadows: false });
      app.root.addChild(ring);
    }
    const { x, z } = cue.at;
    this.ring.setPosition(x, groundHeight(x, z, g.map) + .045, z);
    this.ring.setLocalScale(cue.radius, 1, cue.radius);
    this.ring.enabled = true;
  }
}

export function trainingMarkerPosition(cue:TrainingCue,g:Game,project:(at:Vec & {y:number})=>{x:number;y:number;z:number},width:number,height:number){
  const y=(cue.at.y??groundHeight(cue.at.x,cue.at.z,g.map))+(cue.height??1.25);
  const screen=project({...cue.at,y});
  const insetX=Math.min(112,width*.22), insetY=Math.min(94,height*.20);
  if(screen.z>0 && Number.isFinite(screen.x) && Number.isFinite(screen.y) &&
      screen.x>=insetX && screen.x<=width-insetX && screen.y>=insetY && screen.y<=height-insetY){
    return {x:screen.x,y:screen.y,arrow:"▼"};
  }
  const p=g.players[0];
  if(dist(p,cue.at)<.75) return;
  if(screen.z>0 && screen.x>=insetX && screen.x<=width-insetX){
    return {x:screen.x,y:screen.y<insetY?insetY:height-insetY,arrow:screen.y<insetY?"▲":"▼"};
  }
  const relative=Math.atan2(cue.at.x-p.x,-(cue.at.z-p.z))-p.yaw;
  const right=screen.z>0 ? screen.x>width/2 : Math.sin(relative)>=0;
  return {x:right?width-insetX:insetX,y:height*.43,arrow:right?"▶":"◀"};
}
