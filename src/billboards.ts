// Camera-facing quads written into one set of buffers, so a few hundred wisps
// of mist or smoke cost a single draw instead of one each. Every quad carries
// its own alpha in its vertex colour, so fading one needs no material change.
// Quads in a buffer are not depth-sorted against each other; that is invisible
// while they share a colour, since blending equal colours ignores order.
export class BillboardBuffer {
  readonly positions: Float32Array;
  readonly colors: Uint8Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array;
  count = 0;
  private right = [1, 0, 0];
  private up = [0, 1, 0];
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity * 4 > 65535) throw Error("Invalid billboard capacity");
    this.positions = new Float32Array(capacity * 12);
    this.colors = new Uint8Array(capacity * 16).fill(255);
    this.uvs = new Float32Array(capacity * 8);
    this.indices = new Uint16Array(capacity * 6);
    for (let q = 0; q < capacity; q++) {
      this.uvs.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8);
      this.indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
  }
  // Start a frame with the camera's world-space right and up vectors.
  begin(right: ArrayLike<number>, up: ArrayLike<number>) {
    this.count = 0;
    this.right = [right[0], right[1], right[2]];
    this.up = [up[0], up[1], up[2]];
  }
  // A quad of width w and height h centred on a point, rolled about the view
  // direction by `roll` degrees. Quads past the capacity are dropped.
  add(x: number, y: number, z: number, w: number, h: number, roll = 0, alpha = 1) {
    if (this.count >= this.capacity || alpha <= 0) return;
    const a = (roll * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), r = this.right, u = this.up;
    const ax = [(r[0] * c + u[0] * s) * w / 2, (r[1] * c + u[1] * s) * w / 2, (r[2] * c + u[2] * s) * w / 2];
    const ay = [(u[0] * c - r[0] * s) * h / 2, (u[1] * c - r[1] * s) * h / 2, (u[2] * c - r[2] * s) * h / 2];
    const p = this.positions, o = this.count * 12, corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [i, j] = corners[k];
      p[o + k * 3] = x + ax[0] * i + ay[0] * j;
      p[o + k * 3 + 1] = y + ax[1] * i + ay[1] * j;
      p[o + k * 3 + 2] = z + ax[2] * i + ay[2] * j;
      this.colors[this.count * 16 + k * 4 + 3] = Math.round(Math.min(1, alpha) * 255);
    }
    this.count++;
  }
  // Collapse the unused quads so they draw nothing; returns how many are live.
  end() {
    this.positions.fill(0, this.count * 12);
    return this.count;
  }
}
