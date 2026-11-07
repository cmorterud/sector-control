import { artillerySector, artillerySectors } from "./artillery-sectors";
import { artilleryTargetReason, artilleryUncertainty } from "./artillery";
import type { Game } from "./simulation";
import type { Vec } from "./map";

export class ArtilleryMap {
  open = false;
  private cursor = { x: 0.5, z: 0.5 };
  private panel = document.createElement("section");
  private grid = document.createElement("div");
  private status = document.createElement("p");
  private marker = document.createElement("i");
  private you = document.createElement("i");
  private buttons: HTMLButtonElement[] = [];
  private flagMarkers: { id: string; dot: Element }[] = [];
  constructor(
    private game: () => Game,
    private call: (target: Vec & { area: true }) => void,
  ) {
    this.panel.id = "tactical-map";
    this.panel.className = "hidden";
    this.panel.setAttribute("aria-label", "Artillery tactical map");
    this.panel.innerHTML = `<h2>ARTILLERY · CHOOSE A SECTOR</h2><p>Broad coordinates, imperfect fire. Battle continues.</p>`;
    this.grid.className = "tactical-grid";
    this.marker.className = "map-cursor";
    this.you.className = "map-you";
    this.you.title = "Your position";
    this.panel.append(this.grid, this.status);
    const close = document.createElement("button");
    close.textContent = "Q / RIGHT CLICK · CANCEL";
    close.onclick = () => this.close();
    this.panel.append(close);
    document.getElementById("ui")!.append(this.panel);
  }
  close() {
    this.open = false;
    if (this.panel.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
    this.panel.classList.add("hidden");
  }
  toggle() {
    if (this.open) {
      this.close();
      return;
    }
    const g = this.game(),
      p = g.players[0];
    if (p.hp <= 0) return;
    this.open = true;
    const sectors = artillerySectors(g.map);
    this.grid.replaceChildren();
    this.grid.style.gridTemplateColumns = `repeat(${Math.ceil(g.map.width / 16)}, 1fr)`;
    this.grid.style.aspectRatio = `${g.map.width} / ${g.map.depth}`;
    this.buttons = sectors.map((s) => {
      const b = document.createElement("button");
      b.textContent = s.name;
      b.setAttribute("aria-label", `Call artillery sector ${s.name}`);
      b.onclick = () => this.select(s);
      this.grid.append(b);
      return b;
    });
    // Static trench strokes and your own position only; no live enemy intelligence.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${g.map.width} ${g.map.depth}`);
    svg.setAttribute("preserveAspectRatio", "none");
    for (const line of g.map.terrain?.trenchLines ?? [])
      for (const s of line.sections) {
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute(
          "d",
          `M${s.x + g.map.width / 2},${s.z - s.length / 2 + g.map.depth / 2} v${s.length}`,
        );
        path.setAttribute(
          "stroke",
          line.team === "blue" ? "#64bdd6" : "#e38e77",
        );
        path.setAttribute("stroke-width", "2");
        svg.append(path);
      }
    for (const route of [
      ...(g.map.terrain?.communicationRoutes ?? []),
      ...(g.map.terrain?.branchRoutes ?? []),
    ]) {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute(
        "d",
        route.points
          .map(
            (p, i) =>
              `${i ? "L" : "M"}${p.x + g.map.width / 2},${p.z + g.map.depth / 2}`,
          )
          .join(" "),
      );
      path.setAttribute(
        "stroke",
        route.team === "blue" ? "#64bdd6" : "#e38e77",
      );
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("fill", "none");
      svg.append(path);
    }
    for (const bay of g.map.terrain?.shelterBays ?? []) {
      const room = document.createElementNS(svg.namespaceURI, "rect");
      room.setAttribute("x", String(bay.x + g.map.width / 2 - 2));
      room.setAttribute("y", String(bay.z + g.map.depth / 2 - 2));
      room.setAttribute("width", "4");
      room.setAttribute("height", "4");
      room.setAttribute("fill", bay.team === "blue" ? "#64bdd6" : "#e38e77");
      svg.append(room);
    }
    this.flagMarkers = [];
    if (g.scoring === "domination")
      for (const s of g.sectors) {
        const dot = document.createElementNS(svg.namespaceURI, "circle");
        dot.setAttribute("cx", String(s.x + g.map.width / 2));
        dot.setAttribute("cy", String(s.z + g.map.depth / 2));
        dot.setAttribute("r", "2.2");
        dot.setAttribute("stroke", "#172324");
        dot.setAttribute("stroke-width", "0.4");
        const label = document.createElementNS(svg.namespaceURI, "text");
        label.setAttribute("x", String(s.x + g.map.width / 2));
        label.setAttribute("y", String(s.z + g.map.depth / 2 + 1));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "3");
        label.setAttribute("fill", "#172324");
        label.textContent = s.id;
        svg.append(dot, label);
        this.flagMarkers.push({ id: s.id, dot });
      }
    this.grid.append(svg, this.you, this.marker);
    this.cursor = {
      x: Math.max(
        0,
        Math.min(0.999, (p.x + Math.sin(p.yaw) * 45) / g.map.width + 0.5),
      ),
      z: Math.max(
        0,
        Math.min(0.999, (p.z - Math.cos(p.yaw) * 45) / g.map.depth + 0.5),
      ),
    };
    this.panel.classList.remove("hidden");
    this.update();
  }
  move(e: MouseEvent, locked: boolean) {
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
    const selected = target ?? this.selected();
    const request = { x: selected.x, z: selected.z, area: true as const };
    if (artilleryTargetReason(g, g.players[0], request)) {
      this.update();
      return;
    }
    this.call(request);
    this.close();
  }
  private selected() {
    const g = this.game();
    return artillerySector(g.map, {
      x: (this.cursor.x - 0.5) * g.map.width,
      z: (this.cursor.z - 0.5) * g.map.depth,
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
    const sectors = artillerySectors(g.map),
      selected = this.selected();
    this.buttons.forEach((b, i) => {
      const reason = artilleryTargetReason(g, p, { ...sectors[i], area: true });
      // Keep unavailable cells in the mouse event path so right-click cancel
      // and cursor tracking work even over a dimmed sector.
      b.setAttribute("aria-disabled", String(!!reason));
      b.title = reason ?? "Request broad sector";
      b.classList.toggle("selected", sectors[i].name === selected.name);
    });
    const reason = artilleryTargetReason(g, p, { ...selected, area: true });
    const ready = Math.max(
      0,
      Math.ceil((g.artillery.readyAt[p.team] - g.tick) / 30),
    );
    const error = artilleryUncertainty(g, p, selected);
    this.status.textContent = `${selected.name} · ${reason ? reason + (ready ? ` · ${ready}s` : "") : "CLICK TO REQUEST"} · ${error === 10 ? "BLIND" : "OBSERVED"} ±${error}m drift + shell scatter`;
    this.marker.style.left = `${this.cursor.x * 100}%`;
    this.marker.style.top = `${this.cursor.z * 100}%`;
    this.you.style.left = `${(p.x / g.map.width + 0.5) * 100}%`;
    this.you.style.top = `${(p.z / g.map.depth + 0.5) * 100}%`;
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
  }
}
