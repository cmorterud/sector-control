// `ready`, when given, holds a job back until it returns true (a death fall
// still playing before its ragdoll is built).
type VisualJob = { kind: "terrain" | "casualty"; run: () => void; ready?: () => boolean };

// Only presentation belongs here. Simulation damage must finish before
// enqueueing; terrain colliders are queued separately (Renderer.terrainWork). A job cannot be interrupted, so the time budget
// is checked between jobs; one expensive upload may exceed it on a slow device.
export class VisualWorkQueue {
  private jobs = new Map<string, VisualJob>();
  get size() { return this.jobs.size; }
  has(key: string) { return this.jobs.has(key); }
  set(key: string, job: VisualJob) { this.jobs.set(key, job); }
  delete(key: string) { this.jobs.delete(key); }
  clear() { this.jobs.clear(); }
  flush(budgetMs = 4, maxJobs = 2, now = () => performance.now()) {
    const start = now();
    let completed = 0, casualties = 0;
    for (const [key, job] of this.jobs) {
      if (job.kind === "casualty" && casualties) continue;
      if (job.ready && !job.ready()) continue;
      if (completed >= maxJobs || (completed && now() - start >= budgetMs)) break;
      this.jobs.delete(key);
      job.run();
      completed++;
      if (job.kind === "casualty") casualties++;
    }
    return completed;
  }
}
