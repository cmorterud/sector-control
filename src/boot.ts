// Entry point. Checks for a keyboard-and-mouse device before loading the game,
// so phones see a short notice instead of loading a battle they cannot play.
import "./style.css";
import { needsDesktopNotice, readInputSupport, showDeviceGate } from "./device-gate";

const params = new URLSearchParams(location.search);
const ready = needsDesktopNotice(readInputSupport(), params)
  ? showDeviceGate(document.querySelector<HTMLElement>("#ui")!, import.meta.env.BASE_URL)
  : Promise.resolve();
void ready.then(() => import("./main"));
