import type { BatchManager } from "playcanvas";

// Independent static groups let a blast rebuild nearby scenery without copying
// every surviving duckboard and cover mesh across the battlefield.
export class SceneryBatches {
  private groups = new Map<string, number>();
  constructor(private batcher: Pick<BatchManager, "addGroup" | "removeGroup">) {}
  group(base: number, x: number, z: number) {
    const key = `${base}:${Math.floor(x / 32)},${Math.floor(z / 32)}`;
    let id = this.groups.get(key);
    if (id === undefined) {
      id = this.batcher.addGroup(`scenery ${key}`, false, 200)!.id;
      this.groups.set(key, id);
    }
    return id;
  }
  ids() { return [...this.groups.values()]; }
  clear() {
    for (const id of this.groups.values()) this.batcher.removeGroup(id);
    this.groups.clear();
  }
}
