// A queued RAF timestamp can predate a costly start/resume handler that reset
// the clock. Never let that callback create a negative simulation backlog.
export function frameSeconds(now:number,last:number) {
  return Math.max(0,Math.min(.1,(now-last)/1000));
}
