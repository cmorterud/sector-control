import { groundHeight, type MapDefinition } from "./map";
import type { FortRect } from "./fort-vaux-map";

// Sample real, excavated terrain only when its revision changes. No actor data.
export function tacticalRelief(map: MapDefinition, size = 256) {
  const width = size, height = Math.round(size * map.depth / map.width);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const wx = (x / width - 0.5) * map.width, wz = (z / height - 0.5) * map.depth;
    const h = groundHeight(wx, wz, map);
    const slope = groundHeight(wx + 0.5, wz - 0.5, map) - h;
    const shade = Math.max(-40, Math.min(35, h * 8 + slope * 22));
    const i = (z * width + x) * 4;
    pixels.set([108 + shade, 105 + shade, 78 + shade, 255], i);
  }
  return { width, height, pixels };
}
export function drawTacticalTerrain(canvas: HTMLCanvasElement, map: MapDefinition) {
  if (map.fort) {
    canvas.width = 720;
    canvas.height = Math.round(canvas.width * map.depth / map.width);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#222d2b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width / map.width, canvas.height / map.depth);
    ctx.translate(map.width / 2, map.depth / 2);
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
  const raster = tacticalRelief(map);
  canvas.width = raster.width; canvas.height = raster.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(raster.pixels, raster.width, raster.height), 0, 0);
  const sx = canvas.width / map.width, sz = canvas.height / map.depth;
  for (const b of map.boxes) {
    ctx.fillStyle = ["building", "container", "masonry", "concrete", "bunker"].includes(b.kind)
      ? "#3c4142" : b.kind === "tree" || b.kind === "brush" ? "#52614a" : "#85765c";
    ctx.fillRect((b.x - b.w / 2 + map.width / 2) * sx,
      (b.z - b.d / 2 + map.depth / 2) * sz, Math.max(1, b.w * sx), Math.max(1, b.d * sz));
  }
}
