export type Vec = { x: number; z: number };
export type Box = Vec & {
  w: number;
  d: number;
  h: number;
  kind: "building" | "container" | "barrier";
};
export const sectors = [
  { id: "A", x: -28, z: -16 },
  { id: "B", x: 0, z: 8 },
  { id: "C", x: 28, z: 16 },
];
export const spawn = { blue: { x: -42, z: 40 }, red: { x: 42, z: -40 } };
export const boxes: Box[] = [
  { x: -23, z: 21, w: 16, d: 10, h: 9, kind: "building" },
  { x: 23, z: -21, w: 16, d: 10, h: 11, kind: "building" },
  { x: -25, z: -37, w: 19, d: 10, h: 12, kind: "building" },
  { x: 25, z: 37, w: 19, d: 10, h: 8, kind: "building" },
  { x: 0, z: -23, w: 11, d: 12, h: 8, kind: "building" },
  { x: -43, z: 0, w: 9, d: 17, h: 10, kind: "building" },
  { x: 43, z: 0, w: 9, d: 17, h: 10, kind: "building" },
  { x: 0, z: 36, w: 10, d: 8, h: 7, kind: "building" },
  { x: -14, z: -7, w: 3, d: 10, h: 3, kind: "container" },
  { x: 15, z: 16, w: 3, d: 10, h: 3, kind: "container" },
  { x: -30, z: 2, w: 9, d: 2, h: 1.4, kind: "barrier" },
  { x: 30, z: -2, w: 9, d: 2, h: 1.4, kind: "barrier" },
  { x: -7, z: 15, w: 5, d: 2, h: 1.4, kind: "barrier" },
  { x: 7, z: 0, w: 5, d: 2, h: 1.4, kind: "barrier" },
  { x: -38, z: -23, w: 4, d: 3, h: 2, kind: "container" },
  { x: 38, z: 23, w: 4, d: 3, h: 2, kind: "container" },
];
export function blocked(x: number, z: number, r = 0.5): boolean {
  return (
    Math.abs(x) > 49 - r ||
    Math.abs(z) > 49 - r ||
    boxes.some(
      (b) => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r,
    )
  );
}
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
