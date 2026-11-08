// A browser can report pointer-lock loss before delivering the Escape keydown.
// Never use that same press (or its repeat events) to resume the newly paused game.
export class EscapePause {
  private held = false;
  private pausedAt = -Infinity;
  paused(at: number) {
    this.pausedAt = at;
  }
  release() {
    this.held = false;
  }
  press(
    event: { repeat: boolean; timeStamp: number },
    state: { started: boolean; playing: boolean; paused: boolean },
  ): "pause" | "resume" | null {
    if (event.repeat || this.held) return null;
    this.held = true;
    if (!state.started || !state.playing) return null;
    if (!state.paused) return "pause";
    return event.timeStamp > this.pausedAt ? "resume" : null;
  }
}
