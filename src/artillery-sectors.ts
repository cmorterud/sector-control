import type { MapDefinition, Vec } from "./map";

export const sectorSize = 16;
export function artillerySectors(map: MapDefinition) {
  const columns = Math.ceil(map.width / sectorSize);
  const rows = Math.ceil(map.depth / sectorSize);
  return Array.from({ length: columns * rows }, (_, i) => {
    const col = i % columns,
      row = Math.floor(i / columns);
    return {
      x: -map.width / 2 + ((col + 0.5) * map.width) / columns,
      z: -map.depth / 2 + ((row + 0.5) * map.depth) / rows,
      name: `${String.fromCharCode(65 + col)}${row + 1}`,
      col,
      row,
    };
  });
}
export function artillerySector(map: MapDefinition, target: Vec) {
  const columns = Math.ceil(map.width / sectorSize),
    rows = Math.ceil(map.depth / sectorSize);
  const col = Math.max(
    0,
    Math.min(columns - 1, Math.floor((target.x / map.width + 0.5) * columns)),
  );
  const row = Math.max(
    0,
    Math.min(rows - 1, Math.floor((target.z / map.depth + 0.5) * rows)),
  );
  return artillerySectors(map)[row * columns + col];
}
