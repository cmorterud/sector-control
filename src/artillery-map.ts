import { artillerySector, artillerySectors } from "./artillery-sectors";
import { artilleryTargetReason, artilleryUncertainty } from "./artillery";
import { flareRules, flareTargetReason } from "./flares";
import { gasAgent, gasMap, gasStrikeReason, gasStrikeRules } from "./gas";

// What a click on the map asks for. Flares exist only on night maps; gas
// shells are an alternate artillery strike wherever artillery is offered.
export type MapCall = "shell" | "flare" | "gas";
export const mapCallKey = "KeyF";
import type { Game } from "./simulation";
import { playArea, type Vec } from "./map";
import { createTacticalRoutes, drawTacticalTerrain } from "./tactical-terrain";

export class ArtilleryMap {
  open = false;
  private cursor = { x: 0.5, z: 0.5 };
  private panel = document.createElement("section");
  private heading = document.createElement("h2");
  private intro = document.createElement("p");
  private closeButton = document.createElement("button");
  private grid = document.createElement("div");
  private status = document.createElement("p");
  private marker = document.createElement("i");
  private you = document.createElement("i");
  private death = document.createElement("i");
  private terrain = document.createElement("canvas");
  private terrainRevision = -1;
  private shortcut = "Q";
  private targeting = true;
  private mode: MapCall = "shell";
  private modeButton = document.createElement("button");
  private buttons: HTMLButtonElement[] = [];
  private exerciseMarker?: SVGGElement;
  private exerciseIntro = false;
  private flagMarkers: { id: string; dot: Element }[] = [];
  // Drawn over the map after each update, such as the gas front.
  decorate?: (grid: HTMLElement) => void;
  constructor(
    private game: () => Game,
    private call: (target: Vec & { area: true }, kind: MapCall) => void,
    private exerciseTarget?: () => { at: Vec; mode?: "shell" | "gas" } | undefined,
    private deathLocation?: () => Vec | undefined,
  ) {
    this.panel.id = "tactical-map";
    this.panel.className = "hidden";
    this.panel.setAttribute("aria-label", "Artillery tactical map");
    this.grid.className = "tactical-grid";
    this.marker.className = "map-cursor";
    this.you.className = "map-you";
    this.you.title = "Your position";
    this.death.className="map-death";this.death.textContent="×";
    this.death.title="Last death location";this.death.setAttribute("aria-label","Last death location");
    this.closeButton.onclick = () => this.close();
    this.modeButton.className = "map-mode";
    this.modeButton.onclick = () => this.toggleMode();
    this.panel.append(this.heading, this.intro, this.modeButton, this.grid, this.status, this.closeButton);
    document.getElementById("ui")!.append(this.panel);
  }
  setShortcut(key: string) {
    this.shortcut = key;
    this.closeButton.textContent = `${key} / RIGHT CLICK · ${this.targeting ? "CANCEL" : "CLOSE"}`;
  }
  close() {
    this.open = false;
    if (this.panel.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
    this.panel.classList.add("hidden");
  }
  private modes(): MapCall[] {
    const g = this.game();
    return ["shell", ...(g.map.night ? ["flare" as const] : []), ...(gasMap(g.map) ? ["gas" as const] : [])];
  }
  // Step the map through what it can call: shells, gas shells, and flares at night.
  toggleMode() {
    const modes = this.modes();
    if (!this.open || modes.length < 2) return;
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this.describe();
    this.update();
  }
  private describe() {
    const g = this.game(), artillery = g.map.artillery !== false, flare = this.mode === "flare", gas = this.mode === "gas";
    this.heading.textContent = !artillery ? "FORT VAUX · FLOOR PLAN" : flare ? "FLARE · CHOOSE A SECTOR" : gas ? `${gasAgent(g.map).shells} · CHOOSE A SECTOR` : "ARTILLERY · CHOOSE A SECTOR";
    this.exerciseIntro = false;
    this.intro.textContent = !artillery ? "Barracks, cistern and east casemate. Battle continues."
      : flare ? `Lights about ${flareRules.radius} m of ground for ${flareRules.burnTicks / 30} seconds. Its own cooldown. Battle continues.`
      : gas ? `A low cloud about ${gasStrikeRules.radius * 2} m across for ${gasStrikeRules.lifetime / 30} seconds, drifting slowly along the front. It harms anyone unmasked, your own side too. Uses the artillery cooldown. Battle continues.`
      : "Broad coordinates, imperfect fire. Battle continues.";
    const modes = this.modes(), next = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this.modeButton.hidden = modes.length < 2;
    this.modeButton.textContent = `F · SWITCH TO ${next === "flare" ? "FLARE" : next === "gas" ? gasAgent(g.map).shells : "ARTILLERY"}`;
    this.modeButton.setAttribute("aria-pressed", String(this.mode !== "shell"));
  }
  toggle() {
    if (this.open) {
      this.close();
      return;
    }
    const g = this.game(),
      p = g.players[0];
    if (p.hp <= 0) return;
    const artillery = this.targeting = g.map.artillery !== false;
    this.panel.setAttribute("aria-label", artillery ? "Artillery tactical map" : "Fort floor plan");
    if (!this.modes().includes(this.mode)) this.mode = "shell";
    this.describe();
    this.status.hidden = !artillery;
    this.setShortcut(this.shortcut);
    this.open = true;
    this.panel.style.setProperty("--tactical-aspect",String(playArea(g.map).width/playArea(g.map).depth));
    const sectors = artillery ? artillerySectors(g.map) : [];
    this.grid.replaceChildren();
    this.grid.style.gridTemplateColumns = `repeat(${Math.ceil(playArea(g.map).width / 16)}, 1fr)`;
    this.grid.style.aspectRatio = `${playArea(g.map).width} / ${playArea(g.map).depth}`;
    this.terrain.className = "tactical-terrain";
    this.terrainRevision = -1;
    this.grid.append(this.terrain);
    this.buttons = sectors.map((s) => {
      const b = document.createElement("button");
      b.textContent = s.name;
      b.setAttribute("aria-label", `Call artillery sector ${s.name}`);
      b.onclick = () => this.select(s);
      this.grid.append(b);
      return b;
    });
    const svg = createTacticalRoutes(g.map);
    this.flagMarkers = [];
    if (g.scoring === "domination")
      for (const s of g.sectors) {
        const dot = document.createElementNS(svg.namespaceURI, "circle");
        dot.setAttribute("cx", String(s.x + playArea(g.map).width / 2));
        dot.setAttribute("cy", String(s.z + playArea(g.map).depth / 2));
        dot.setAttribute("r", "2.2");
        dot.setAttribute("stroke", "#172324");
        dot.setAttribute("stroke-width", "0.4");
        const label = document.createElementNS(svg.namespaceURI, "text");
        label.setAttribute("x", String(s.x + playArea(g.map).width / 2));
        label.setAttribute("y", String(s.z + playArea(g.map).depth / 2 + 1));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "3");
        label.setAttribute("fill", "#172324");
        label.textContent = s.id;
        svg.append(dot, label);
        if (s.name) {
          const name = document.createElementNS(svg.namespaceURI, "text");
          name.setAttribute("x", String(s.x + playArea(g.map).width / 2));
          name.setAttribute("y", String(s.z + playArea(g.map).depth / 2 + 4.3));
          name.setAttribute("text-anchor", "middle");
          name.setAttribute("font-size", "1.65");
          name.setAttribute("fill", "#172324");
          name.textContent = s.name;
          svg.append(name);
        }
        this.flagMarkers.push({ id: s.id, dot });
      }
    if(g.map.id==="training"){
      const mark=this.exerciseMarker=document.createElementNS("http://www.w3.org/2000/svg","g");
      const ring=document.createElementNS(svg.namespaceURI,"circle");
      ring.setAttribute("r","7");ring.setAttribute("fill","none");ring.setAttribute("stroke","#f3d16a");ring.setAttribute("stroke-width",".8");
      const label=document.createElementNS(svg.namespaceURI,"text");
      label.setAttribute("y","-9");label.setAttribute("text-anchor","middle");label.setAttribute("font-size","2.3");
      label.setAttribute("fill","#f8e9b2");label.textContent="EXERCISE AREA";
      mark.append(ring,label);svg.append(mark);
    }
    this.grid.append(svg, this.you);
    if (artillery) this.grid.append(this.marker);
    this.grid.append(this.death);
    const exercise = this.exerciseTarget?.();
    const focus = exercise?.mode ? exercise.at : { x: p.x + Math.sin(p.yaw) * 45, z: p.z - Math.cos(p.yaw) * 45 };
    const area = playArea(g.map);
    const normalized = (v: number, span: number) => Math.max(0, Math.min(0.999, v / span + 0.5));
    this.cursor = { x: normalized(focus.x, area.width), z: normalized(focus.z, area.depth) };
    this.panel.classList.remove("hidden");
    this.update();
  }
  move(e: MouseEvent, locked: boolean) {
    if (this.game().map.artillery === false) return;
    const bounds = this.grid.getBoundingClientRect();
    if (locked) {
      this.cursor.x += e.movementX / bounds.width;
      this.cursor.z += e.movementY / bounds.height;
    } else {
      this.cursor.x = (e.clientX - bounds.left) / bounds.width;
      this.cursor.z = (e.clientY - bounds.top) / bounds.height;
    }
    this.cursor.x = Math.max(0, Math.min(0.999, this.cursor.x));
    this.cursor.z = Math.max(0, Math.min(0.999, this.cursor.z));
    this.update();
  }
  select(target?: Vec) {
    if (!this.open) return;
    const g = this.game();
    if (g.map.artillery === false) return;
    const selected = target ?? this.selected();
    const request = { x: selected.x, z: selected.z, area: true as const };
    if (this.reason(request)) {
      this.update();
      return;
    }
    this.call(request, this.mode);
    this.close();
  }
  private reason(target: Vec & { area: true }) {
    const g = this.game();
    return this.mode === "flare" ? flareTargetReason(g, g.players[0], target)
      : this.mode === "gas" ? gasStrikeReason(g, g.players[0], target) : artilleryTargetReason(g, g.players[0], target);
  }
  private selected() {
    const g = this.game();
    return artillerySector(g.map, {
      x: (this.cursor.x - 0.5) * playArea(g.map).width,
      z: (this.cursor.z - 0.5) * playArea(g.map).depth,
    });
  }
  update() {
    if (!this.open) return;
    const g = this.game(),
      p = g.players[0];
    if (p.hp <= 0 || g.phase !== "playing") {
      this.close();
      return;
    }
    const revision = g.map.destruction?.revision ?? 0;
    if (revision !== this.terrainRevision) {
      drawTacticalTerrain(this.terrain, g.map);
      this.terrainRevision = revision;
    }
    if (g.map.artillery !== false) {
      const sectors = artillerySectors(g.map), selected = this.selected();
      const exercise = this.exerciseTarget?.();
      const exerciseSector = exercise ? artillerySector(g.map, exercise.at).name : undefined;
      const exerciseMode = !!exercise && exercise.mode === this.mode;
      if(this.exerciseMarker){
        const area=playArea(g.map);
        this.exerciseMarker.style.display=exercise?"":"none";
        if(exercise) this.exerciseMarker.setAttribute("transform",`translate(${exercise.at.x+area.width/2} ${exercise.at.z+area.depth/2})`);
      }
      this.modeButton.classList.toggle("exercise-mode", !!exercise?.mode && !exerciseMode);
      if (exercise?.mode) {
        const shells = exercise.mode === "gas" ? "Gas Shells" : "Artillery";
        const intro = exerciseMode ? `Click highlighted sector ${exerciseSector} to fire.` : `Switch to ${shells} with F or the button below.`;
        if (this.intro.textContent !== intro) this.intro.textContent = intro;
        this.exerciseIntro = true;
      } else if(this.exerciseIntro) this.describe();
      this.buttons.forEach((b, i) => {
        const reason = this.reason({ ...sectors[i], area: true });
        // Keep unavailable cells in the mouse event path so right-click cancel
        // and cursor tracking work even over a dimmed sector.
        b.setAttribute("aria-disabled", String(!!reason));
        b.title = reason ?? (this.mode === "flare" ? "Send a flare over this sector" : this.mode === "gas" ? "Fire gas shells into this sector" : "Request broad sector");
        b.classList.toggle("selected", sectors[i].name === selected.name);
        b.classList.toggle("exercise-sector", exerciseMode && sectors[i].name === exerciseSector);
      });
      const flare = this.mode === "flare", gas = this.mode === "gas", reason = this.reason({ ...selected, area: true });
      const ready = Math.max(
        0,
        Math.ceil(((flare ? g.flares.readyAt[p.team] : g.artillery.readyAt[p.team]) - g.tick) / 30),
      );
      const error = artilleryUncertainty(g, p, selected);
      this.status.textContent = flare
        ? `${selected.name} · ${reason ? reason + (ready ? ` · ${ready}s` : "") : "CLICK TO SEND A FLARE"} · light in ${flareRules.flightTicks / 30}s`
        : gas ? `${selected.name} · ${reason ? reason + (ready ? ` · ${ready}s` : "") : `CLICK TO FIRE ${gasAgent(g.map).shells}`} · cloud in ${gasStrikeRules.flightTicks / 30}s`
        : `${selected.name} · ${reason ? reason + (ready ? ` · ${ready}s` : "") : "CLICK TO REQUEST"} · ${error === 10 ? "BLIND" : "OBSERVED"} ±${error}m drift + shell scatter`;
      this.marker.style.left = `${this.cursor.x * 100}%`;
      this.marker.style.top = `${this.cursor.z * 100}%`;
    }
    // Positions in the dead zone stay pinned to the panel's edge.
    const edge = (v: number) => Math.max(0, Math.min(100, (v + 0.5) * 100));
    this.you.style.left = `${edge(p.x / playArea(g.map).width)}%`;
    this.you.style.top = `${edge(p.z / playArea(g.map).depth)}%`;
    const death=this.deathLocation?.();this.death.hidden=!death;
    if(death){this.death.style.left=`${edge(death.x/playArea(g.map).width)}%`;this.death.style.top=`${edge(death.z/playArea(g.map).depth)}%`;}
    for (const marker of this.flagMarkers) {
      const s = g.sectors.find((s) => s.id === marker.id)!;
      marker.dot.setAttribute(
        "fill",
        s.contested
          ? "#efd07b"
          : s.owner === "blue"
            ? "#64bdd6"
            : s.owner === "red"
              ? "#e38e77"
              : "#d0c7a3",
      );
    }
    this.decorate?.(this.grid);
  }
}
