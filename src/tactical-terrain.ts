import { groundHeight, type MapDefinition } from "./map";

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
