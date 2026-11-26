// Weapon effects as quads written into one dynamic mesh per material, so a
// battle's worth of muzzle flashes, smoke and brass costs two draws, not an
// entity per shot. Each quad picks a cell of a texture atlas and carries its
// own colour and alpha, so nothing touches a material while effects play.
export class FxQuads {
  readonly positions: Float32Array;
  readonly colors: Uint8Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array;
  count = 0;
  private right = [1, 0, 0];
  private up = [0, 1, 0];
  private eye = [0, 0, 0];
  constructor(readonly capacity: number, readonly columns = 4, readonly rows = 4) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity * 4 > 65535) throw Error("Invalid effect capacity");
    this.positions = new Float32Array(capacity * 12);
    this.colors = new Uint8Array(capacity * 16);
    this.uvs = new Float32Array(capacity * 8);
    this.indices = new Uint16Array(capacity * 6);
    for (let q = 0; q < capacity; q++)
      this.indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  }
  // Start a frame with the camera's world position and right and up vectors.
  begin(eye: ArrayLike<number>, right: ArrayLike<number>, up: ArrayLike<number>) {
    this.count = 0;
    this.eye = [eye[0], eye[1], eye[2]];
    this.right = [right[0], right[1], right[2]];
    this.up = [up[0], up[1], up[2]];
  }
  private quad(corners: number[], frame: number, r: number, g: number, b: number, a: number) {
    const q = this.count++, p = this.positions, o = q * 12;
    for (let i = 0; i < 12; i++) p[o + i] = corners[i];
    const column = frame % this.columns, row = Math.floor(frame / this.columns) % this.rows;
    const u0 = column / this.columns, u1 = (column + 1) / this.columns;
    // Atlas rows count down from the top of the canvas, which uploads at
    // v = 0; a quad's lower edge (v0) takes the lower edge of its cell.
    const v0 = (row + 1) / this.rows, v1 = row / this.rows;
    this.uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
    const c = this.colors, k = q * 16;
    const R = byte(r), G = byte(g), B = byte(b), A = byte(a);
    for (let i = 0; i < 4; i++) { c[k + i * 4] = R; c[k + i * 4 + 1] = G; c[k + i * 4 + 2] = B; c[k + i * 4 + 3] = A; }
  }
  // A camera-facing quad of width w and height h, rolled about the view by
  // `roll` radians.
  sprite(x: number, y: number, z: number, w: number, h: number, roll: number, frame: number, r = 1, g = 1, b = 1, a = 1) {
    if (this.count >= this.capacity || a <= 0.002 || w <= 0 || h <= 0) return false;
    const c = Math.cos(roll), s = Math.sin(roll), R = this.right, U = this.up;
    const ax = [(R[0] * c + U[0] * s) * w / 2, (R[1] * c + U[1] * s) * w / 2, (R[2] * c + U[2] * s) * w / 2];
    const ay = [(U[0] * c - R[0] * s) * h / 2, (U[1] * c - R[1] * s) * h / 2, (U[2] * c - R[2] * s) * h / 2];
    this.quad([
      x - ax[0] - ay[0], y - ax[1] - ay[1], z - ax[2] - ay[2],
      x + ax[0] - ay[0], y + ax[1] - ay[1], z + ax[2] - ay[2],
      x + ax[0] + ay[0], y + ax[1] + ay[1], z + ax[2] + ay[2],
      x - ax[0] + ay[0], y - ax[1] + ay[1], z - ax[2] + ay[2],
    ], frame, r, g, b, a);
    return true;
  }
  // A quad that runs `length` from a point along a direction, turned about
  // that direction to face the camera: a flame jet, a tracer or a casing seen
  // side-on. Its atlas cell's u runs along the direction.
  axial(x: number, y: number, z: number, dx: number, dy: number, dz: number, length: number, width: number, frame: number, r = 1, g = 1, b = 1, a = 1) {
    if (this.count >= this.capacity || a <= 0.002 || length <= 0 || width <= 0) return false;
    const n = Math.hypot(dx, dy, dz) || 1;
    dx /= n; dy /= n; dz /= n;
    const vx = x - this.eye[0], vy = y - this.eye[1], vz = z - this.eye[2];
    // Across the jet and across the view: the quad's width direction.
    let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
    let m = Math.hypot(sx, sy, sz);
    if (m < 1e-6) { sx = this.up[0]; sy = this.up[1]; sz = this.up[2]; m = 1; }
    const hw = width / 2 / m;
    sx *= hw; sy *= hw; sz *= hw;
    const ex = x + dx * length, ey = y + dy * length, ez = z + dz * length;
    this.quad([
      x - sx, y - sy, z - sz,
      ex - sx, ey - sy, ez - sz,
      ex + sx, ey + sy, ez + sz,
      x + sx, y + sy, z + sz,
    ], frame, r, g, b, a);
    return true;
  }
  // Collapse the unused quads so they draw nothing; returns how many are live.
  end() {
    this.positions.fill(0, this.count * 12);
    return this.count;
  }
}
const byte = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
