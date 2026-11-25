// Capture the flag in the world: a stand at each pickup point, a signboard at
// each team's drop point, and the flags themselves, on their stands, lying
// where a carrier fell, or on a short staff strapped to a carrier's back.
// Presentation only; flag state comes from Game.ctf.
import * as pc from "playcanvas";
import { flagCloth, flagColor, flagRingColor } from "./flag";
import { groundHeight } from "./map";
import { firstPersonView } from "./player-view";
import { ctfRules, type CtfFlag } from "./ctf";
import type { Game, Team } from "./simulation";
import type { Renderer } from "./rendering";

// Staff and stand sizes, in metres. The carried staff rises about 0.8 m over
// the carrier's head, so a raider is picked out above a trench parapet.
const staff = 1.75, standTop = 1.05, segments = 28;

interface FlagModel { banner: pc.Entity; ring: pc.Entity[]; state: string }

export class CtfMarkers {
  private root?: pc.Entity;
  private models = new Map<string, FlagModel>();
  constructor(private renderer: Renderer) {}

  reset(g: Game) {
    this.root?.destroy();
    this.root = undefined;
    this.models.clear();
    const ctf = g.ctf;
    if (!ctf) return;
    const r = this.renderer, map = g.map;
    this.root = new pc.Entity("capture the flag");
    r.app.root.addChild(this.root);
    for (const f of ctf.flags) {
      const stand = new pc.Entity(`flag stand ${f.id}`);
      this.root.addChild(stand);
      stand.setPosition(f.home.x, f.home.y, f.home.z);
      // An ammunition box with a post: the flag's stand in the trench bay.
      r.cube("flag stand box", 0, 0.22, 0, 0.72, 0.44, 0.5, "#4f4230", false, stand);
      r.cube("flag stand band", 0, 0.3, 0, 0.74, 0.06, 0.52, flagRingColor(f.team, map), false, stand);
      r.cube("flag stand post", 0, 0.44 + (standTop - 0.44) / 2, 0, 0.09, standTop - 0.44, 0.09, "#6d5a3e", false, stand);
      const ring = this.ring(stand, f.home, ctfRules.pickupRadius, flagRingColor(f.team, map), g);
      this.models.set(f.id, { banner: this.banner(f.team, g), ring, state: "" });
    }
    for (const team of ["blue", "red"] as const) {
      const drop = ctf.drops[team], post = new pc.Entity(`flag drop ${team}`);
      this.root.addChild(post);
      post.setPosition(drop.x, drop.y, drop.z);
      // A signboard on a tall post: plain to a carrier looking for home.
      r.cube("drop post", 0, 1.3, 0, 0.11, 2.6, 0.11, "#5d4b33", false, post);
      r.cube("drop board", 0, 2.35, 0, 1.25, 0.5, 0.06, flagColor(team, map), false, post);
      r.cube("drop board band", 0, 2.12, 0, 1.25, 0.06, 0.07, "#e8dfc4", false, post);
      r.cube("drop board", 0, 2.35, 0, 0.06, 0.5, 1.25, flagColor(team, map), false, post);
      this.ring(post, drop, ctfRules.dropRadius, flagColor(team, map), g);
    }
  }

  // A dashed painted ring on the ground around a point.
  private ring(parent: pc.Entity, at: { x: number; y: number; z: number }, radius: number, color: string, g: Game) {
    const parts: pc.Entity[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2, x = Math.sin(a) * radius, z = Math.cos(a) * radius;
      const ground = groundHeight(at.x + x, at.z + z, g.map);
      // Where the ring meets a trench wall it stops rather than climbing it.
      if (Math.abs(ground - at.y) > 0.5) continue;
      const e = this.renderer.cube("flag ring", x, ground - at.y + 0.04, z, 0.14, 0.04, radius * 0.13, color, false, parent);
      e.setLocalEulerAngles(0, (a * 180) / Math.PI, 0);
      parts.push(e);
    }
    return parts;
  }

  // The flag on its staff; the staff's foot is the entity's origin.
  private banner(team: Team, g: Game) {
    const r = this.renderer, banner = new pc.Entity("ctf flag");
    this.root!.addChild(banner);
    r.cube("ctf flag staff", 0, staff / 2, 0, 0.05, staff, 0.05, "#a39a82", false, banner);
    const cloth = flagCloth(0.85, 0.52, 30), mesh = new pc.Mesh(r.app.graphicsDevice);
    mesh.setPositions(cloth.positions);
    mesh.setNormals(cloth.normals);
    mesh.setIndices(cloth.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const e = new pc.Entity("ctf flag cloth");
    e.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, r.material(flagColor(team, g.map)), e)], castShadows: false });
    banner.addChild(e);
    // The cloth runs out along the entity's +x, a little to the rear: from
    // behind a carrier it shows its face rather than its edge.
    e.setLocalPosition(0.03, staff - 0.03, 0);
    e.setLocalEulerAngles(0, -25, 0);
    return banner;
  }

  draw(g: Game, overview = false) {
    const ctf = g.ctf;
    if (!ctf || !this.root) return;
    for (const f of ctf.flags) {
      const model = this.models.get(f.id)!;
      const state = f.state;
      if (model.state !== state) {
        model.state = state;
        const color = state === "home" ? flagRingColor(f.team, g.map) : flagRingColor("neutral", g.map);
        for (const part of model.ring) part.render!.material = this.renderer.material(color);
      }
      this.place(g, f, model.banner, overview);
    }
  }

  private place(g: Game, f: CtfFlag, banner: pc.Entity, overview: boolean) {
    if (f.state === "restocking") { banner.enabled = false; return; }
    if (f.state === "home") {
      banner.enabled = true;
      banner.setPosition(f.home.x, f.home.y + standTop, f.home.z);
      // The cloth flies back toward its own lines.
      banner.setEulerAngles(0, f.team === "blue" ? 180 : 0, 0);
      return;
    }
    if (f.state === "dropped" && f.at) {
      banner.enabled = true;
      // Fallen staff leaning on the ground.
      banner.setPosition(f.at.x, f.at.y + 0.05, f.at.z);
      banner.setEulerAngles(62, (f.id.charCodeAt(0) * 47) % 360, 0);
      return;
    }
    const p = g.players[f.carrier!], body = this.renderer.people[p.id];
    // Your own back is out of view in first person; the HUD says you carry it.
    banner.enabled = !!body && p.hp > 0 && !(p.id === 0 && firstPersonView(p) && !overview);
    if (!banner.enabled) return;
    const at = body.getPosition(), ahead = body.forward, right = body.right;
    // Strapped across the back: 0.26 m behind the spine, a little to one side,
    // leaning back.
    const back = 0.26, side = 0.12;
    banner.setPosition(at.x - ahead.x * back + right.x * side, at.y + 0.85, at.z - ahead.z * back + right.z * side);
    banner.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 0);
    banner.rotateLocal(12, 0, 0);
  }
}
