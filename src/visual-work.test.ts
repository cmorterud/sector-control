import { expect, test } from "vitest";
import { VisualWorkQueue } from "./visual-work";

test("coalesces latest terrain upload, bounds frame work and lets terrain pass a casualty backlog", () => {
  const q = new VisualWorkQueue(), calls: string[] = [];
  let time = 0;
  const job = (name: string, cost = 0) => () => { calls.push(name); time += cost; };
  q.set("a", {kind:"casualty", run:job("a")});
  q.set("b", {kind:"casualty", run:job("b")});
  q.set("patch", {kind:"terrain", run:job("old")});
  q.set("patch", {kind:"terrain", run:job("latest", 5)});
  q.set("other", {kind:"terrain", run:job("other")});
  expect(q.flush(4, 2, () => time)).toBe(2);
  expect(calls).toEqual(["a", "latest"]);
  expect(q.size).toBe(2);
  q.flush(4, 2, () => time);
  expect(calls).toEqual(["a", "latest", "b", "other"]);
  q.set("costly", {kind:"terrain", run:job("costly", 6)});
  q.set("wait", {kind:"terrain", run:job("wait")});
  expect(q.flush(4, 2, () => time)).toBe(1);
  expect(q.has("wait")).toBe(true);
  q.clear(); expect(q.size).toBe(0);
});
