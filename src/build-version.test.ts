import { describe, expect, it } from "vitest";
import { buildVersion } from "../tools/build-version";
import { buildVersionLabel } from "./build-version";

const sha = "0123456789abcdef0123456789abcdef01234567";

describe("build version label", () => {
  it("names the PR head commit and PR number on previews", () => {
    expect(buildVersion({ CI: "true", BUILD_SHA: sha, BUILD_PR: "84" })).toBe("0123456 · PR 84");
  });

  it("names only the commit on main", () => {
    expect(buildVersion({ CI: "true", BUILD_SHA: sha, BUILD_PR: "" })).toBe("0123456");
  });

  it("marks local builds", () => {
    expect(buildVersion({ BUILD_SHA: sha })).toMatch(/^0123456\+? · local$/);
  });

  it("falls back to dev when the build defined nothing", () => {
    expect(buildVersionLabel()).toBe("dev");
  });
});
