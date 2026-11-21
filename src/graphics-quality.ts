// Graphics quality: Low, Medium and High gate every costly rendering effect.
// "auto" starts at High and steps down while play stays slow, then remembers
// the level it settled on.
export type Quality = "low" | "medium" | "high";
export type QualityChoice = Quality | "auto";
export const qualities: Quality[] = ["low", "medium", "high"];
export const qualityChoices: QualityChoice[] = ["auto", ...qualities];

export interface QualityProfile {
  // Post-processing through PlayCanvas's CameraFrame: grading, vignette, AO.
  postProcessing: boolean;
  // Screen-space ambient occlusion and its resolution scale.
  ssao: false | { scale: number; samples: number };
  // Multisampling of the scene render target when post-processing is on.
  samples: number;
  cascades: number;
  shadowDistance: number;
  shadowResolution: number;
}
export const qualityProfiles: Record<Quality, QualityProfile> = {
  low: { postProcessing: false, ssao: false, samples: 1, cascades: 1, shadowDistance: 55, shadowResolution: 1024 },
  medium: { postProcessing: true, ssao: { scale: 0.5, samples: 8 }, samples: 2, cascades: 2, shadowDistance: 90, shadowResolution: 2048 },
  high: { postProcessing: true, ssao: { scale: 1, samples: 12 }, samples: 4, cascades: 3, shadowDistance: 120, shadowResolution: 2048 },
};

export const qualityStorageKey = "sector-control-quality";
export function parseQuality(value: string | null | undefined): QualityChoice | undefined {
  return (qualityChoices as string[]).includes(value ?? "") ? value as QualityChoice : undefined;
}

// Watches real frame times during play. After a settling period it checks a
// window of frames and steps down one level at a time while play is slow:
// the median frame misses the budget, or too many frames hitch.
export class AutoQuality {
  static readonly settleMs = 2500;
  static readonly windowMs = 4000;
  // Below 50 fps on the median frame is too slow to keep.
  static readonly budgetMs = 20;
  // At High, more than 8% of frames over 25 ms reads as stutter even when the
  // median frame is fine (a laptop GPU throttling under sustained load).
  // Below High the hitches are mostly the simulation's own, which no
  // graphics level removes, so only the median counts there.
  static readonly hitchMs = 25;
  static readonly hitchShare = 0.08;
  // Throttling builds up, so a level must pass this many windows in a row.
  static readonly passes = 6;
  quality: Quality = "high";
  done = false;
  private frames: number[] = [];
  private elapsed = 0;
  private passed = 0;
  // Returns the new quality when it changes; null otherwise.
  frame(ms: number): Quality | null {
    if (this.done || !(ms > 0) || ms > 250) return null;
    this.elapsed += ms;
    if (this.elapsed < AutoQuality.settleMs) return null;
    this.frames.push(ms);
    if (this.elapsed < AutoQuality.settleMs + AutoQuality.windowMs) return null;
    const sorted = [...this.frames].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
    const hitches = sorted.filter((f) => f > AutoQuality.hitchMs).length / sorted.length;
    this.frames = [];
    this.elapsed = 0;
    if (this.quality === "low") { this.done = true; return null; }
    if (median <= AutoQuality.budgetMs && (this.quality !== "high" || hitches <= AutoQuality.hitchShare)) {
      this.done = ++this.passed >= AutoQuality.passes;
      return null;
    }
    this.passed = 0;
    this.quality = this.quality === "high" ? "medium" : "low";
    return this.quality;
  }
}
