// A small, always-visible label with the build's commit (and PR number on
// previews), so any screenshot says which version it came from.
import "./build-version.css";

export const buildVersionLabel = (): string =>
  typeof __BUILD_VERSION__ === "string" && __BUILD_VERSION__ ? __BUILD_VERSION__ : "dev";

/** Adds the label to the page once; it lives outside #ui so HUD rebuilds keep it. */
export function showBuildVersion(doc: Document = document): HTMLElement {
  const existing = doc.querySelector<HTMLElement>(".build-version");
  if (existing) return existing;
  const label = doc.createElement("div");
  label.className = "build-version";
  label.setAttribute("aria-hidden", "true");
  label.textContent = buildVersionLabel();
  doc.body.append(label);
  return label;
}
