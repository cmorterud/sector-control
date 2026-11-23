import { playArea, type MapDefinition, type Vec } from "./map";

export const sectorSize = 16;
export function artillerySectors(map: MapDefinition) {
  const { width, depth } = playArea(map);
  const columns = Math.ceil(width / sectorSize);
  const rows = Math.ceil(depth / sectorSize);
  return Array.from({ length: columns * rows }, (_, i) => {
    const col = i % columns,
      row = Math.floor(i / columns);
    return {
      x: -width / 2 + ((col + 0.5) * width) / columns,
      z: -depth / 2 + ((row + 0.5) * depth) / rows,
      name: `${String.fromCharCode(65 + col)}${row + 1}`,
      col,
      row,
    };
  });
}
export function artillerySector(map: MapDefinition, target: Vec) {
  const { width, depth } = playArea(map);
  const columns = Math.ceil(width / sectorSize),
    rows = Math.ceil(depth / sectorSize);
  const col = Math.max(
    0,
    Math.min(columns - 1, Math.floor((target.x / width + 0.5) * columns)),
  );
  const row = Math.max(
    0,
    Math.min(rows - 1, Math.floor((target.z / depth + 0.5) * rows)),
  );
  return artillerySectors(map)[row * columns + col];
}
