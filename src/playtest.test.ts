import { it, expect } from "vitest";
import { Game, TestCollision, idle, botCommand } from "./simulation";
import { CaptureCadence, PlaytestLog } from "./playtest";

it("records isolated commands, timestamped snapshots and correct frame statistics", () => {
  const game = new Game(new TestCollision(), false);
  const log = new PlaytestLog();
  const command = idle();
  game.step(command);
  log.recordTick(game, command, 0.04);
  command.fire = true;
  game.players[0].hp = 0;
  log.frames.push(10, 20, 40);
  expect(log.commands[0].command.fire).toBe(false);
  expect(log.samples[0].state.players[0].hp).toBe(100);
  expect(log.samples[0].seconds).toBe(0.04);
  expect(log.summary().averageFps).toBeCloseTo(1000 / (70 / 3));
  expect(log.summary().slowFramesOver33ms).toBe(1);
  expect(log.summary().p95FrameMs).toBe(40);
  expect(JSON.parse(JSON.stringify(log)).commands.length).toBe(1);
});

it("allows an unattended driver to move the player using the shared command interface", () => {
  const game = new Game(new TestCollision());
  const start = { x: game.players[0].x, z: game.players[0].z };
  for (let i = 0; i < 300; i++) game.step(botCommand(game, game.players[0]));
  expect(
    Math.hypot(game.players[0].x - start.x, game.players[0].z - start.z),
  ).toBeGreaterThan(5);
});

it("maintains thirty captures per second across jittery render rates", () => {
  for (const renderFps of [30, 60, 120, 144]) {
    const cadence = new CaptureCadence();
    let frames = 0;
    for (let i = 0; i < renderFps * 60; i++) {
      const jitter = [0, 0.2, -0.1, 0.1][i % 4];
      if (cadence.shouldCapture((i * 1000) / renderFps + jitter)) frames++;
    }
    expect(frames).toBeGreaterThanOrEqual(1799);
    expect(frames).toBeLessThanOrEqual(1801);
  }
});

it("resumes capture after a stall without a catch-up burst", () => {
  const cadence = new CaptureCadence();
  expect(cadence.shouldCapture(0)).toBe(true);
  expect(cadence.shouldCapture(16)).toBe(false);
  expect(cadence.shouldCapture(34)).toBe(true);
  expect(cadence.shouldCapture(5000)).toBe(true);
  expect(cadence.shouldCapture(5001)).toBe(false);
  expect(cadence.shouldCapture(5016)).toBe(false);
  expect(cadence.shouldCapture(5034)).toBe(true);
});
