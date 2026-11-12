// Opt-in CPU diagnostics. Nested phases are inclusive; render submission is not GPU time.
class Timing {
  count = 0;
  totalMs = 0;
  maxMs = 0;
  private bins = new Uint32Array(512);
  add(ms: number) {
    this.count++; this.totalMs += ms; this.maxMs = Math.max(this.maxMs, ms);
    this.bins[Math.min(511, Math.floor(ms))]++;
  }
  summary() {
    const percentile = (p: number) => {
      let n = 0;
      for (let i = 0; i < this.bins.length; i++) {
        n += this.bins[i];
        if (n >= Math.ceil(this.count * p)) return i === 511 ? this.maxMs : Math.min(this.maxMs, i + 1);
      }
      return 0;
    };
    return { count: this.count, totalMs: this.totalMs, averageMs: this.totalMs / Math.max(1,this.count), maxMs: this.maxMs, p95Ms: percentile(.95), p99Ms: percentile(.99) };
  }
}
export class BattlePerformance {
  enabled = false;
  private stages = new Map<string, Timing>();
  private frames = new Timing();
  private pending: Record<string, number> = {};
  private counts: Record<string, number> = {};
  private totals: Record<string, number> = {};
  private last?: number;
  private lastTick = 0;
  private slow: { tick: number; frameMs: number; phases: Record<string,number>; counts: Record<string,number> }[] = [];
  constructor(private clock: () => number = () => performance.now()) {}
  reset() { this.stages.clear(); this.frames = new Timing(); this.pending = {}; this.counts = {}; this.totals = {}; this.slow = []; this.last = undefined; }
  begin() { return this.enabled ? this.clock() : undefined; }
  end(name: string, start: number | undefined) {
    if (start === undefined || !this.enabled) return;
    const ms = Math.max(0, this.clock() - start);
    let stats = this.stages.get(name);
    if (!stats) { stats = new Timing(); this.stages.set(name,stats); }
    stats.add(ms); this.pending[name] = (this.pending[name] ?? 0) + ms;
  }
  count(name: string, n = 1) { if (this.enabled) {this.counts[name] = (this.counts[name] ?? 0) + n;this.totals[name] = (this.totals[name] ?? 0) + n;} }
  // The elapsed frame belongs to work since the PREVIOUS callback, including
  // PlayCanvas's separate render callback. Pause/resume discards that interval.
  frame(now: number, tick: number, paused: boolean) {
    if (!this.enabled) return;
    if (!paused && this.last !== undefined) {
      const ms = now - this.last;
      if (Number.isFinite(ms) && ms > 0) {
        this.frames.add(ms);
        if (ms > 1000/30) {
          this.slow.push({tick:this.lastTick,frameMs:ms,phases:this.pending,counts:this.counts});
          this.slow.sort((a,b)=>b.frameMs-a.frameMs);
          if (this.slow.length > 60) this.slow.pop();
        }
      }
    }
    this.pending = {}; this.counts = {}; this.last = paused ? undefined : now; this.lastTick = tick;
  }
  summary() {
    return { version:1, note:"CPU phases are nested/inclusive; renderSubmit is CPU submission, not GPU timing. Percentiles use 1ms buckets. Slow frames refer to the preceding callback interval.", frames:this.frames.summary(), counters:{...this.totals}, stages:Object.fromEntries([...this.stages].map(([name,stats])=>[name,stats.summary()])), slowFrames:structuredClone(this.slow) };
  }
}
export const battlePerformance = new BattlePerformance();
