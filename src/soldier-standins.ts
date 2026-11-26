import * as pc from "playcanvas";

// Distant soldiers are drawn as stand-ins: the soldier's own far-detail model
// baked into three rigid pieces (everything above the hips with the rifle,
// and each leg), drawn with one instanced draw per piece and kit. A jointed
// soldier is some forty entities whose transforms, bones and bounds the
// engine refreshes every frame; a stand-in is three matrices. Stand-ins cast
// no shadow, so no soldier past the switch distance does.
export const standInRules = {
  // Metres from the eye: a soldier becomes a stand-in beyond `enter` and goes
  // back to the full model inside `leave`, so one at the edge does not flicker.
  enter: 40,
  leave: 36,
  // Hip swing at a run, radians, and the stride the swing completes per cycle.
  swing: 0.5,
  stride: 1.7,
  runSpeed: 5,
};

// Whether a soldier at this distance is drawn as a stand-in. Through a scope
// every soldier keeps its full model, since a distant one fills the view.
// `enter` moves the switch (the way back keeps the same ratio); Infinity turns
// stand-ins off.
export function standInDue(distance: number, current: boolean, zoomed: boolean, enter: number = standInRules.enter) {
  if (zoomed) return false;
  return distance > (current ? enter * (standInRules.leave / standInRules.enter) : enter);
}

export type StandInGait = { phase: number; x: number; z: number; crouch: number; amplitude: number };
// Advance a stand-in's walk: the legs swing a full cycle per stride walked,
// harder the faster it moves, and settle when it stops.
export function advanceGait(gait: StandInGait, x: number, z: number, crouched: boolean, dt: number) {
  const moved = Math.hypot(x - gait.x, z - gait.z);
  gait.x = x; gait.z = z;
  // A respawn or a teleport is not a stride.
  const step = moved > 2 ? 0 : moved;
  const speed = dt > 0 ? step / dt : 0;
  const ease = 1 - Math.exp(-8 * dt);
  gait.amplitude += (Math.min(1, speed / standInRules.runSpeed) - gait.amplitude) * ease;
  gait.crouch += ((crouched ? 1 : 0) - gait.crouch) * ease;
  gait.phase = (gait.phase + (step / standInRules.stride) * Math.PI * 2) % (Math.PI * 2);
  return Math.sin(gait.phase) * standInRules.swing * gait.amplitude;
}

export type StandInPiece = "torso" | "left" | "right";
const pieces: StandInPiece[] = ["torso", "left", "right"];
type BakedPiece = {
  name: StandInPiece;
  rest: pc.Mat4; // the piece's joint relative to the soldier's root
  instance: pc.MeshInstance;
  buffer: pc.VertexBuffer;
  data: Float32Array;
  count: number;
};
type Kit = { pieces: BakedPiece[]; hipHeight: number };
// A render part of the soldier to bake: its mesh, world transform and colour.
export type BakePart = { mesh: pc.Mesh; world: pc.Mat4; tint: pc.Color; atlased: boolean; tile: (u: number, v: number) => [number, number]; piece: StandInPiece };

export class SoldierStandIns {
  readonly root = new pc.Entity("soldier stand-ins");
  private kits = new Map<string, Kit>();
  private capacity: number;
  private scratch = new pc.Mat4();
  private local = new pc.Mat4();
  private quat = new pc.Quat();
  private position = new pc.Vec3();
  private scale = new pc.Vec3();
  private turn = new pc.Mat4();
  constructor(private app: pc.AppBase, parent: pc.Entity, private material: pc.Material, capacity: number) {
    this.capacity = Math.max(1, capacity);
    parent.addChild(this.root);
  }
  has(key: string) { return this.kits.has(key); }
  // Bake one kit from a posed soldier. `joints` are the world transforms of the
  // root, the body and each hip joint at that moment.
  bake(key: string, joints: { root: pc.Mat4; body: pc.Mat4; left: pc.Mat4; right: pc.Mat4 }, parts: BakePart[], hipHeight: number) {
    const device = this.app.graphicsDevice;
    const toRoot = joints.root.clone().invert();
    const kit: Kit = { pieces: [], hipHeight };
    for (const piece of pieces) {
      const joint = piece === "torso" ? joints.body : joints[piece];
      const inverse = joint.clone().invert();
      const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
      const v = new pc.Vec3();
      for (const part of parts) {
        if (part.piece !== piece) continue;
        const matrix = new pc.Mat4().mul2(inverse, part.world), normalMatrix = matrix.clone().invert().transpose();
        const points: number[] = [], ns: number[] = [], is: number[] = [], sourceUV: number[] = [], sourceColors: number[] = [];
        part.mesh.getPositions(points); part.mesh.getNormals(ns); part.mesh.getIndices(is); part.mesh.getUvs(0, sourceUV); part.mesh.getColors(sourceColors);
        const base = positions.length / 3, r = part.tint.r ** 2.2, g = part.tint.g ** 2.2, b = part.tint.b ** 2.2;
        for (let i = 0; i < points.length; i += 3) {
          matrix.transformPoint(v.set(points[i], points[i + 1], points[i + 2]), v); positions.push(v.x, v.y, v.z);
          normalMatrix.transformVector(v.set(ns[i] ?? 0, ns[i + 1] ?? 1, ns[i + 2] ?? 0), v).normalize(); normals.push(v.x, v.y, v.z);
          const u = sourceUV[(i / 3) * 2] ?? 0.5, w = sourceUV[(i / 3) * 2 + 1] ?? 0.5;
          if (part.atlased) uvs.push(u, w); else uvs.push(...part.tile(u, w));
          const ci = (i / 3) * 4;
          colors.push(r * (sourceColors[ci] ?? 1), g * (sourceColors[ci + 1] ?? 1), b * (sourceColors[ci + 2] ?? 1), 1);
        }
        for (const index of is) indices.push(index + base);
      }
      if (!indices.length) continue;
      const mesh = new pc.Mesh(device);
      mesh.setPositions(positions); mesh.setNormals(normals); mesh.setUvs(0, uvs); mesh.setColors(colors);
      mesh.setVertexStream(pc.SEMANTIC_TANGENT, pc.calculateTangents(positions, normals, uvs, indices).map((t) => Number.isFinite(t) ? t : 0), 4);
      mesh.setIndices(indices); mesh.update(pc.PRIMITIVE_TRIANGLES);
      const entity = new pc.Entity(`stand-in ${key} ${piece}`);
      this.root.addChild(entity);
      const instance = new pc.MeshInstance(mesh, this.material, entity);
      instance.castShadow = false;
      instance.receiveShadow = true;
      const buffer = new pc.VertexBuffer(device, pc.VertexFormat.getDefaultInstancingFormat(device), this.capacity, { usage: pc.BUFFER_DYNAMIC });
      instance.setInstancing(buffer);
      instance.instancingCount = 0;
      entity.addComponent("render", { meshInstances: [instance], castShadows: false, receiveShadows: true });
      kit.pieces.push({ name: piece, rest: new pc.Mat4().mul2(toRoot, joint), instance, buffer, data: new Float32Array(this.capacity * 16), count: 0 });
    }
    this.kits.set(key, kit);
  }
  begin() { for (const kit of this.kits.values()) for (const piece of kit.pieces) piece.count = 0; }
  // Queue one stand-in this frame: root position and yaw (degrees), hip swing
  // (radians) and crouch (0 standing to 1 crouched, the hips dropping `drop`).
  add(key: string, x: number, y: number, z: number, yaw: number, swing: number, crouch: number, drop: number) {
    const kit = this.kits.get(key);
    if (!kit) return false;
    const lowered = drop * crouch, shorter = 1 - lowered / Math.max(0.3, kit.hipHeight);
    this.quat.setFromEulerAngles(0, yaw, 0);
    const root = this.scratch.setTRS(this.position.set(x, y - lowered, z), this.quat, pc.Vec3.ONE);
    for (const piece of kit.pieces) {
      if (piece.count >= this.capacity) continue;
      const m = this.local.mul2(root, piece.rest);
      if (piece.name !== "torso") {
        this.quat.setFromEulerAngles(((piece.name === "left" ? 1 : -1) * swing * 180) / Math.PI, 0, 0);
        m.mul(this.turn.setTRS(pc.Vec3.ZERO, this.quat, this.scale.set(1, shorter, 1)));
      }
      piece.data.set(m.data, piece.count * 16);
      piece.count++;
    }
    return true;
  }
  end() {
    for (const kit of this.kits.values())
      for (const piece of kit.pieces) {
        if (piece.count) piece.buffer.setData(piece.data);
        piece.instance.instancingCount = piece.count;
        const enabled = piece.count > 0;
        if (piece.instance.node && (piece.instance.node as pc.Entity).enabled !== enabled) (piece.instance.node as pc.Entity).enabled = enabled;
      }
  }
  // Soldiers counted as stand-ins in the last frame.
  drawn() { let n = 0; for (const kit of this.kits.values()) n += kit.pieces[0]?.count ?? 0; return n; }
  destroy() {
    for (const kit of this.kits.values()) for (const piece of kit.pieces) { piece.buffer.destroy(); piece.instance.mesh?.destroy(); }
    this.kits.clear();
    this.root.destroy();
  }
}
