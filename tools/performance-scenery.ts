// CPU-only diagnostic using real duckboard transforms and PlayCanvas's static
// batch creation with NullGraphicsDevice. This does not measure GPU or FPS.
import * as pc from 'playcanvas';
import { duckboards } from '../src/battlefield';
import { verdunMap } from '../src/verdun-map';
import { SceneryBatches } from '../src/scenery-batches';

function run(local: boolean) {
  const device = new pc.NullGraphicsDevice(), root = new pc.Entity('world'), scene = new pc.Scene(device);
  scene.layers = new pc.LayerComposition();
  scene.layers.pushOpaque(new pc.Layer({id: pc.LAYERID_WORLD}));
  const batcher = new pc.BatchManager(device, root, scene), base = batcher.addGroup('boards', false, 200)!.id;
  const groups = new SceneryBatches(batcher), mesh = pc.Mesh.fromGeometry(device, new pc.BoxGeometry());
  mesh.incRefCount();
  const materials = [new pc.StandardMaterial(), new pc.StandardMaterial()];
  const boards = duckboards(verdunMap);
  const pieces = boards.flatMap(b => Array.from({length: 9}, (_, i) => {
    const wear = Math.sin(b.x * 19 + b.z * 31 + i * 13), node = new pc.Entity('duckboard');
    root.addChild(node);
    node.setPosition(b.x + wear * .025, .025, b.z + (i - 4) * .2);
    node.setLocalScale(1.22 + wear * .06, .045, .17);
    node.setLocalEulerAngles(0, wear * 1.5, 0);
    const id = local ? groups.group(base, b.x, b.z) : base;
    const instance = new pc.MeshInstance(mesh, materials[i % 3 ? 0 : 1], node);
    Object.assign(node, {render: {batchGroupId: id, meshInstances: [instance], removeFromLayers() {}}});
    batcher.insert('render', id, node);
    return {node, instance, id, board: b, removed: false};
  }));
  batcher.generate(local ? groups.ids() : [base]);
  const initialBatches = (batcher as any)._batchList.length;
  const impacts: {removed: number; groups: number; rebuiltVertices: number; ms: number}[] = [];
  for (let i = 0; i < 12; i++) {
    const target = boards[Math.floor((i + .5) * boards.length / 12)], dirty = new Set<number>();
    let removed = 0;
    for (const piece of pieces) if (!piece.removed && Math.hypot(piece.board.x - target.x, piece.board.z - target.z) < 4) {
      piece.removed = true; removed++;
      dirty.add(piece.id); batcher.remove('render', piece.id, piece.node);
    }
    const rebuiltVertices = pieces.filter(p => !p.removed && dirty.has(p.id)).length * mesh.vertexBuffer.numVertices;
    const start = performance.now(); batcher.generate([...dirty]);
    impacts.push({removed, groups: dirty.size, rebuiltVertices, ms: performance.now() - start});
  }
  const remainingVertices = (batcher as any)._batchList.reduce((n: number, b: any) => n + b.meshInstance.mesh.vertexBuffer.numVertices, 0);
  if (remainingVertices !== pieces.filter(p => !p.removed).length * mesh.vertexBuffer.numVertices) throw new Error('Lost or duplicated geometry');
  groups.clear(); batcher.removeGroup(base);
  for (const piece of pieces) piece.instance.destroy();
  mesh.destroy(); for (const m of materials) m.destroy();
  root.destroy(); batcher.destroy(); scene.destroy(); device.destroy();
  return {mode: local ? 'local' : 'whole', planks: pieces.length, initialBatches, remainingVertices, impacts};
}
console.log(JSON.stringify([run(false), run(true)], null, 2));
