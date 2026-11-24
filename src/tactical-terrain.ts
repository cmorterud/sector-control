import { groundHeight, playArea, type MapDefinition } from "./map";
import type { FortRect } from "./fort-vaux-map";
import { hullRadius } from "./zeppelin-map";

// Sample real, excavated terrain only when its revision changes. No actor data.
export function tacticalRelief(map: MapDefinition, size = 256) {
  const width = size, height = Math.round(size * playArea(map).depth / playArea(map).width);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const wx = (x / width - 0.5) * playArea(map).width, wz = (z / height - 0.5) * playArea(map).depth;
    const h = groundHeight(wx, wz, map);
    const slope = groundHeight(wx + 0.5, wz - 0.5, map) - h;
    const shade = Math.max(-40, Math.min(35, h * 8 + slope * 22));
    const i = (z * width + x) * 4;
    pixels.set([108 + shade, 105 + shade, 78 + shade, 255], i);
  }
  return { width, height, pixels };
}
export function drawTacticalTerrain(canvas: HTMLCanvasElement, map: MapDefinition, size = map.fort || map.zeppelin ? 720 : 256) {
  // Zeppelin floor plan: the hull from above, the keel's rooms and corridor
  // filled in, the top walk over them in a lighter wash, the gallery as the
  // line along the middle and each stair tower dark.
  if (map.zeppelin) {
    const z = map.zeppelin, area = playArea(map);
    canvas.width = size;
    canvas.height = Math.round(size * area.depth / area.width);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#2c3149";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width / area.width, canvas.height / area.depth);
    ctx.translate(area.width / 2, area.depth / 2);
    ctx.beginPath();
    for (let x = -z.hull.half; x <= z.hull.half; x += 1) ctx.lineTo(x, -hullRadius(x));
    for (let x = z.hull.half; x >= -z.hull.half; x -= 1) ctx.lineTo(x, hullRadius(x));
    ctx.fillStyle = "#8f8b7d";
    ctx.fill();
    const fill = (rects: FortRect[], color: string) => { ctx.fillStyle = color; for (const r of rects) ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); };
    fill(z.plan.keel, "#d8c79f");
    ctx.globalAlpha = 0.35;
    fill(z.plan.top, "#f4ead0");
    ctx.globalAlpha = 1;
    fill(z.plan.gallery.map((r) => ({ ...r, z0: -0.35, z1: 0.35 })), "#f6eccb");
    fill(z.towers.map((t) => t.interior), "#5e5b52");
    fill(z.bombDoors, "#2c3149");
    ctx.fillStyle = "#f0dfb4";
    ctx.font = "1.7px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("STAIRS", -55, -4.5);
    ctx.fillText("STAIRS", 55, 6.5);
    ctx.fillText("GALLERY ALONG THE MIDDLE · TOP WALK ABOVE", 0, -12);
    return;
  }
  if (map.fort) {
    canvas.width = size;
    canvas.height = Math.round(canvas.width * playArea(map).depth / playArea(map).width);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#222d2b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width / playArea(map).width, canvas.height / playArea(map).depth);
    ctx.translate(playArea(map).width / 2, playArea(map).depth / 2);
    const rect = ({ x0, x1, z0, z1 }: FortRect, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    };
    for (const room of [...map.fort.passages, ...map.fort.rooms]) rect(room, "#b7ad90");
    rect(map.fort.yard, "#c0a174");
    rect(map.fort.water, "#82a8a5");
    ctx.fillStyle = "#f0dfb4";
    ctx.font = "1.85px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SUNKEN YARD", 0, map.fort.yard.z1 + 2.5);
    ctx.fillText("SERVICE PASSAGE", 0, -19.5);
    return;
  }
  const raster = tacticalRelief(map, size);
  canvas.width = raster.width; canvas.height = raster.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(raster.pixels, raster.width, raster.height), 0, 0);
  const sx = canvas.width / playArea(map).width, sz = canvas.height / playArea(map).depth;
  for (const b of map.boxes) {
    ctx.fillStyle = ["building", "container", "masonry", "concrete", "bunker"].includes(b.kind)
      ? "#3c4142" : b.kind === "tree" || b.kind === "brush" ? "#52614a" : "#85765c";
    ctx.fillRect((b.x - b.w / 2 + playArea(map).width / 2) * sx,
      (b.z - b.d / 2 + playArea(map).depth / 2) * sz, Math.max(1, b.w * sx), Math.max(1, b.d * sz));
  }
}

// Roads and trench markings are shared by the full tactical map and minimap.
export function createTacticalRoutes(map: MapDefinition) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${playArea(map).width} ${playArea(map).depth}`);
  svg.setAttribute("preserveAspectRatio", "none");
  for (const street of map.streets ?? []) {
    const d=street.points.map((p,i)=>(i ? "L" : "M")+(p.x+playArea(map).width/2)+","+(p.z+playArea(map).depth/2)).join(" ");
    const road = document.createElementNS(svg.namespaceURI, "path");
    road.setAttribute("d", d);
    road.setAttribute("stroke", "#b1a587");
    road.setAttribute("stroke-width", String(street.width));
    road.setAttribute("fill", "none");
    svg.append(road);
  }
  for (const line of map.terrain?.trenchLines ?? [])
    for (const s of line.sections) {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute(
        "d",
        `M${s.x + playArea(map).width / 2},${s.z - s.length / 2 + playArea(map).depth / 2} v${s.length}`,
      );
      path.setAttribute(
        "stroke",
        line.team === "blue" ? "#64bdd6" : "#e38e77",
      );
      path.setAttribute("stroke-width", "2");
      svg.append(path);
    }
  for (const route of [
    ...(map.terrain?.communicationRoutes ?? []),
    ...(map.terrain?.branchRoutes ?? []),
  ]) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute(
      "d",
      route.points
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${p.x + playArea(map).width / 2},${p.z + playArea(map).depth / 2}`,
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
  for (const bay of map.terrain?.shelterBays ?? []) {
    const room = document.createElementNS(svg.namespaceURI, "rect");
    room.setAttribute("x", String(bay.x + playArea(map).width / 2 - 2));
    room.setAttribute("y", String(bay.z + playArea(map).depth / 2 - 2));
    room.setAttribute("width", "4");
    room.setAttribute("height", "4");
    room.setAttribute("fill", bay.team === "blue" ? "#64bdd6" : "#e38e77");
    svg.append(room);
  }
  return svg;
}
