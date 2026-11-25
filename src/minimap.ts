import { playArea, type MapDefinition, type Vec } from "./map";
import type { Game } from "./simulation";
import { flagPosition } from "./ctf";
import { createTacticalRoutes, drawTacticalTerrain } from "./tactical-terrain";

export class Minimap {
  private canvas = document.createElement("canvas");
  private flags: HTMLElement[] = [];
  // Capture the flag: each side's drop point, and each flag away from its stand.
  private drops: HTMLElement[] = [];
  private loose: HTMLElement[] = [];
  private player = document.createElement("i");
  private map?: MapDefinition;
  private terrainRevision = -1;
  private nextDraw = 0;

  constructor(private frame: HTMLElement) {
    this.player.className = "minimap-player";
    this.player.setAttribute("aria-hidden", "true");
  }

  update(g: Game, showFlags: boolean) {
    const { map, tick } = g;
    if (this.map !== map) {
      this.map = map;
      this.terrainRevision = -1;
      this.nextDraw = 0;
      this.frame.style.setProperty("--map-aspect", String(playArea(map).width / playArea(map).depth));
      const compass = document.createElement("small");
      compass.textContent = "N";
      const routes = createTacticalRoutes(map);
      routes.classList.add("minimap-routes");
      this.flags = g.sectors.map((sector) => {
        const flag = document.createElement("b");
        flag.className = "minimap-flag";
        flag.textContent = sector.id;
        return flag;
      });
      const marker = (cls: string, text: string) => {
        const e = document.createElement("b");
        e.className = cls;
        e.textContent = text;
        return e;
      };
      this.drops = g.ctf ? (["blue", "red"] as const).map((team) => marker(`minimap-drop ${team}`, "◆")) : [];
      this.loose = g.ctf?.flags.map((f) => marker(`minimap-loose ${f.team}`, "⚑")) ?? [];
      this.frame.replaceChildren(this.canvas, routes, compass, ...this.flags, ...this.drops, ...this.loose, this.player);
    }
    const revision = map.destruction?.revision ?? 0;
    // Consecutive impacts can change terrain each tick. Redraw at most once a second.
    if (revision !== this.terrainRevision && tick >= this.nextDraw) {
      drawTacticalTerrain(this.canvas, map, 208);
      this.terrainRevision = revision;
      this.nextDraw = tick + 30;
    }
    const position = (marker: HTMLElement, point: Vec) => {
      // A soldier in the dead zone stays pinned to the minimap's edge.
      const edge = (v: number) => Math.max(0, Math.min(100, (v + 0.5) * 100));
      marker.style.left = `${edge(point.x / playArea(map).width)}%`;
      marker.style.top = `${edge(point.z / playArea(map).depth)}%`;
    };
    this.flags.forEach((flag, i) => {
      const sector = g.sectors[i];
      flag.hidden = !showFlags;
      if (showFlags) {
        position(flag, sector);
        const f = g.ctf?.flags[i];
        // A pickup point shows its team while its flag is on the stand.
        flag.dataset.state = f ? (f.state === "home" ? f.team : "empty") : sector.contested ? "contested" : sector.owner ?? "neutral";
      }
    });
    this.drops.forEach((drop, i) => {
      drop.hidden = !showFlags;
      if (showFlags) position(drop, g.ctf!.drops[i ? "red" : "blue"]);
    });
    this.loose.forEach((marker, i) => {
      const f = g.ctf!.flags[i], at = f.state === "carried" || f.state === "dropped" ? flagPosition(g, f) : null;
      marker.hidden = !showFlags || !at;
      if (at && showFlags) {
        position(marker, at);
        marker.dataset.state = f.state;
      }
    });
    const p = g.players[0];
    this.player.hidden = p.hp <= 0;
    if (p.hp > 0) {
      position(this.player, p);
      this.player.style.transform = `translate(-50%, -50%) rotate(${p.yaw}rad)`;
    }
  }
}
