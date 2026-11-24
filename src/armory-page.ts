// The Armory page: every number comes from weapon-stats.ts and the game's
// faction list, so the page can't drift from the game's data.
import "./armory.css";
import { factions, type FactionId } from "./loadouts";
import {
  armoryFactions, gameRateOfFire, gameMuzzleVelocity, reloadDuration, weaponTicksPerSecond, hitZones, roleLabels, shotsToKill, timeToKill,
  weaponStats, type HitZone, type WeaponStats,
} from "./weapon-stats";

type Tab = FactionId | "compare";
const root = document.getElementById("armory")!;
const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const seconds = (s: number) => s === 0 ? "instant" : `${s.toFixed(2).replace(/\.?0+$/, "")} s`;

// Zone shading: the stronger the hit, the warmer; a one-shot kill is gold.
function zoneColor(damage: number) {
  if (damage >= 100) return { fill: "#efd07b", text: "#1c302e" };
  const t = Math.max(0, Math.min(1, damage / 100));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return { fill: `rgb(${mix(0x34, 0xf3)},${mix(0x49, 0x8e)},${mix(0x47, 0x7b)})`, text: t > .55 ? "#1c302e" : "#edf0e7" };
}

function silhouette(w: WeaponStats) {
  const part = (zone: HitZone, shape: string, label?: [number, number]) => {
    const c = zoneColor(w.damage[zone]);
    return `<g class="zone" data-zone="${zone}">${shape.replace("/>", ` fill="${c.fill}"/>`)}${label ? `<text x="${label[0]}" y="${label[1]}" fill="${c.text}">${w.damage[zone]}</text>` : ""}</g>`;
  };
  return `<svg class="figure" viewBox="0 0 120 250" role="img" aria-label="Damage by body part for the ${escape(w.name)}">
    ${part("legs", `<rect x="37" y="146" width="21" height="98" rx="6"/>`, [47.5, 200])}
    ${part("legs", `<rect x="62" y="146" width="21" height="98" rx="6"/>`)}
    ${part("arms", `<rect x="11" y="56" width="20" height="88" rx="8"/>`, [21, 104])}
    ${part("arms", `<rect x="89" y="56" width="20" height="88" rx="8"/>`)}
    ${part("stomach", `<rect x="35" y="104" width="50" height="42" rx="4"/>`, [60, 130])}
    ${part("chest", `<rect x="33" y="54" width="54" height="50" rx="8"/>`, [60, 84])}
    ${part("head", `<circle cx="60" cy="28" r="21"/>`, [60, 34])}
  </svg>`;
}

function card(w: WeaponStats) {
  const rows = hitZones.map(z => {
    const shots = shotsToKill(w, z.id);
    return `<tr><th scope="row">${z.label}</th><td>${w.damage[z.id]}</td><td>${shots === 1 ? `<span class="kill">1 · kill</span>` : shots}</td><td>${seconds(timeToKill(w, z.id))}</td></tr>`;
  }).join("");
  const [low, high] = w.historical.rate ?? [];
  const reference = w.historical.rate ? "historical" : "reference";
  return `<article class="card">
    <header><div class="eyebrow">${roleLabels[w.role].toUpperCase()}</div><h2>${escape(w.name)}</h2><div class="round">${escape(w.round)}</div></header>
    <div class="body">
      ${silhouette(w)}
      <table class="zones"><thead><tr><th></th><th>Damage</th><th>Hits to kill</th><th>Time to kill</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <dl class="stats">
      <div><dt>Rounds per reload</dt><dd>${w.magazine}<small> + ${w.reserve} spare</small></dd></div>
      <div><dt>Reload</dt><dd>${seconds(reloadDuration(w) / weaponTicksPerSecond)}</dd></div>
      <div><dt>Rate of fire</dt><dd>${Number(gameRateOfFire(w).toFixed(2))}<small> rounds/min in game${low === undefined ? "" : ` · ${low === high ? low : `${low}–${high}`} historical`}</small></dd></div>
      <div><dt>Muzzle velocity</dt><dd>${gameMuzzleVelocity(w)} m/s<small> in game · ${w.historical.muzzleVelocity} m/s ${reference}</small></dd></div>
    </dl>
    <p class="summary">${escape(w.summary)}</p>
    <p class="note">${escape(w.historical.note)}${w.falloff ? ` Damage falls to ${Math.round(w.falloff.minimum * 100)}% between ${w.falloff.start} and ${w.falloff.end} m.` : ""}</p>
  </article>`;
}

type Column = { label: string; value: (w: WeaponStats) => number | string; show?: (w: WeaponStats) => string };
const columns: Column[] = [
  { label: "Weapon", value: w => w.name },
  { label: "Faction", value: w => factions[w.faction].name },
  { label: "Role", value: w => roleLabels[w.role] },
  ...hitZones.map(z => ({ label: z.label, value: (w: WeaponStats) => w.damage[z.id] })),
  { label: "Chest time to kill", value: w => timeToKill(w, "chest"), show: w => seconds(timeToKill(w, "chest")) },
  { label: "Rate (rounds/min)", value: gameRateOfFire, show: w => gameRateOfFire(w).toFixed(2).replace(/\.?0+$/, "") },
  { label: "Rounds per reload", value: w => w.magazine },
  { label: "Reload", value: w => reloadDuration(w) / weaponTicksPerSecond, show: w => seconds(reloadDuration(w) / weaponTicksPerSecond) },
  { label: "Velocity in game (m/s)", value: w => gameMuzzleVelocity(w) },
  { label: "Reference velocity (m/s)", value: w => w.historical.muzzleVelocity },
];
let sort = { column: 0, ascending: true };
function compare() {
  const list = [...weaponStats].sort((a, b) => {
    const x = columns[sort.column].value(a), y = columns[sort.column].value(b);
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return sort.ascending ? order : -order;
  });
  const head = columns.map((c, i) => `<th scope="col" aria-sort="${i === sort.column ? (sort.ascending ? "ascending" : "descending") : "none"}"><button data-sort="${i}">${c.label}${i === sort.column ? (sort.ascending ? " ▲" : " ▼") : ""}</button></th>`).join("");
  const body = list.map(w => `<tr>${columns.map((c, i) => {
    const v = c.show ? c.show(w) : c.value(w);
    const zone = hitZones[i - 3];
    const kill = zone && w.damage[zone.id] >= 100 ? ` class="kill-cell"` : "";
    return i === 0 ? `<th scope="row">${escape(String(v))}</th>` : `<td${kill}>${escape(String(v))}</td>`;
  }).join("")}</tr>`).join("");
  return `<p class="lede">Every weapon in one table. Select a heading to sort; gold damage kills in one hit.</p>
    <div class="table-wrap"><table class="compare"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function render(tab: Tab) {
  const tabs: [Tab, string][] = [...armoryFactions.map(f => [f, factions[f].name] as [Tab, string]), ["compare", "Compare"]];
  const content = tab === "compare" ? compare()
    : `<div class="cards">${weaponStats.filter(w => w.faction === tab).map(card).join("")}</div>`;
  root.innerHTML = `<header class="masthead">
      <a class="back" href="../">← Back to the game</a>
      <div class="eyebrow">SECTOR CONTROL</div><h1>Armory</h1>
      <p>Live weapon stats for Britain, Imperial Germany and France. Riflemen and marksmen carry bolt-action rifles. Support can carry a light machine gun or take an emplacement kit on any map. Each role has a pistol.</p>
    </header>
    <nav class="tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" aria-selected="${id === tab}" data-tab="${id}">${escape(label)}</button>`).join("")}</nav>
    <section>${content}</section>
    <footer><p>Damage and time to kill assume full health, close range and a clear shot. Pistol damage drops over distance. Time starts with the first hit.</p></footer>`;
  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(b => b.onclick = () => {
    const next = b.dataset.tab as Tab;
    history.replaceState(null, "", "#" + next);
    render(next);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach(b => b.onclick = () => {
    const column = Number(b.dataset.sort);
    sort = { column, ascending: column === sort.column ? !sort.ascending : column < 3 };
    render("compare");
  });
}
const fromHash = location.hash.slice(1) as Tab;
render(fromHash === "compare" || armoryFactions.includes(fromHash as FactionId) ? fromHash : armoryFactions[0]);
