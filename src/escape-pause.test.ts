import { expect, it } from "vitest";
import { EscapePause } from "./escape-pause";
const playing = { started: true, playing: true, paused: false };
it("pauses on one Escape and resumes on a separate press, ignoring held repeats", () => {
  const keys = new EscapePause();
  expect(keys.press({ repeat: false, timeStamp: 10 }, playing)).toBe("pause");
  keys.paused(11);
  expect(
    keys.press({ repeat: true, timeStamp: 30 }, { ...playing, paused: true }),
  ).toBeNull();
  expect(
    keys.press({ repeat: false, timeStamp: 40 }, { ...playing, paused: true }),
  ).toBeNull();
  keys.release();
  expect(
    keys.press({ repeat: false, timeStamp: 50 }, { ...playing, paused: true }),
  ).toBe("resume");
});
it("does not resume from the same Escape if the browser reports mouse unlock before keydown", () => {
  const keys = new EscapePause();
  keys.paused(101);
  expect(
    keys.press({ repeat: false, timeStamp: 100 }, { ...playing, paused: true }),
  ).toBeNull();
  keys.release();
  expect(
    keys.press({ repeat: false, timeStamp: 200 }, { ...playing, paused: true }),
  ).toBe("resume");
});
it("can resume a focus-loss pause, but does not start or restart a match", () => {
  const keys = new EscapePause();
  keys.paused(10);
  keys.release();
  expect(
    keys.press({ repeat: false, timeStamp: 20 }, { ...playing, paused: true }),
  ).toBe("resume");
  keys.release();
  expect(
    keys.press(
      { repeat: false, timeStamp: 30 },
      { started: false, playing: false, paused: true },
    ),
  ).toBeNull();
  keys.release();
  expect(
    keys.press(
      { repeat: false, timeStamp: 40 },
      { ...playing, playing: false, paused: true },
    ),
  ).toBeNull();
});
