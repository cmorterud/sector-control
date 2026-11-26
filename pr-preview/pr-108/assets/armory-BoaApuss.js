import{s as O}from"./build-version-2QhOPVvQ.js";import{f as x,r as S,g as p,h as k,t as g,a as f,w as v,b as R,c as m,d as b,e as z,s as C}from"./loadouts-DmNXj_up.js";const u=document.getElementById("armory");O();const n=t=>t.replace(/[&<>"]/g,o=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[o]),h=t=>t===0?"instant":`${t.toFixed(2).replace(/\.?0+$/,"")} s`;function H(t){if(t>=100)return{fill:"#efd07b",text:"#1c302e"};const o=Math.max(0,Math.min(1,t/100)),l=(e,a)=>Math.round(e+(a-e)*o);return{fill:`rgb(${l(52,243)},${l(73,142)},${l(71,123)})`,text:o>.55?"#1c302e":"#edf0e7"}}function M(t){const o=(l,e,a)=>{const s=H(t.damage[l]);return`<g class="zone" data-zone="${l}">${e.replace("/>",` fill="${s.fill}"/>`)}${a?`<text x="${a[0]}" y="${a[1]}" fill="${s.text}">${t.damage[l]}</text>`:""}</g>`};return`<svg class="figure" viewBox="0 0 120 250" role="img" aria-label="Damage by body part for the ${n(t.name)}">
    ${o("legs",'<rect x="37" y="146" width="21" height="98" rx="6"/>',[47.5,200])}
    ${o("legs",'<rect x="62" y="146" width="21" height="98" rx="6"/>')}
    ${o("arms",'<rect x="11" y="56" width="20" height="88" rx="8"/>',[21,104])}
    ${o("arms",'<rect x="89" y="56" width="20" height="88" rx="8"/>')}
    ${o("stomach",'<rect x="35" y="104" width="50" height="42" rx="4"/>',[60,130])}
    ${o("chest",'<rect x="33" y="54" width="54" height="50" rx="8"/>',[60,84])}
    ${o("head",'<circle cx="60" cy="28" r="21"/>',[60,34])}
  </svg>`}function T(t){const o=k.map(s=>{const i=C(t,s.id);return`<tr><th scope="row">${s.label}</th><td>${t.damage[s.id]}</td><td>${i===1?'<span class="kill">1 · kill</span>':i}</td><td>${h(g(t,s.id))}</td></tr>`}).join(""),[l,e]=t.historical.rate??[],a=t.historical.rate?"historical":"reference";return`<article class="card">
    <header><div class="eyebrow">${S[t.role].toUpperCase()}</div><h2>${n(t.name)}</h2><div class="round">${n(t.round)}</div></header>
    <div class="body">
      ${M(t)}
      <table class="zones"><thead><tr><th></th><th>Damage</th><th>Hits to kill</th><th>Time to kill</th></tr></thead><tbody>${o}</tbody></table>
    </div>
    <dl class="stats">
      <div><dt>Rounds per reload</dt><dd>${t.magazine}<small> + ${t.reserve} spare</small></dd></div>
      <div><dt>Reload</dt><dd>${h(f(t)/v)}</dd></div>
      <div><dt>Rate of fire</dt><dd>${Number(p(t).toFixed(2))}<small> rounds/min in game${l===void 0?"":` · ${l===e?l:`${l}–${e}`} historical`}</small></dd></div>
      <div><dt>Muzzle velocity</dt><dd>${R(t)} m/s<small> in game · ${t.historical.muzzleVelocity} m/s ${a}</small></dd></div>
    </dl>
    ${w(t)}
    <p class="summary">${n(t.summary)}</p>
    <p class="note">${n(t.historical.note)}${t.falloff?` Damage falls to ${Math.round(t.falloff.minimum*100)}% between ${t.falloff.start} and ${t.falloff.end} m.`:""}</p>
  </article>`}function w(t){const o=m(t),l=m(t,!0);return!t.armour||!o||!l?"":`<dl class="stats armour">
      <div><dt>Hull damage per hit</dt><dd>${t.armour.hull}<small> of 600 · ×${t.armour.slit} through the vision slits</small></dd></div>
      <div><dt>Hits to stop a tank</dt><dd>${o.immobilize}<small> to throw a track · ${l.immobilize} at the slits</small></dd></div>
      <div><dt>Hits to knock it out</dt><dd>${o.knockOut}<small> · ${l.knockOut} at the slits</small></dd></div>
      <div><dt>Crew wounded</dt><dd>${Math.round(t.armour.crew*100)}%<small> of hits · ${t.armour.crewDamage} damage · twice as often at the slits</small></dd></div>
    </dl>`}const c=[{label:"Weapon",value:t=>t.name},{label:"Faction",value:t=>x[t.faction].name},{label:"Role",value:t=>S[t.role]},...k.map(t=>({label:t.label,value:o=>o.damage[t.id]})),{label:"Chest time to kill",value:t=>g(t,"chest"),show:t=>h(g(t,"chest"))},{label:"Rate (rounds/min)",value:p,show:t=>p(t).toFixed(2).replace(/\.?0+$/,"")},{label:"Rounds per reload",value:t=>t.magazine},{label:"Reload",value:t=>f(t)/v,show:t=>h(f(t)/v)},{label:"Velocity in game (m/s)",value:t=>R(t)},{label:"Hits to knock out a tank",value:t=>m(t)?.knockOut??1/0,show:t=>String(m(t)?.knockOut??"—")},{label:"Reference velocity (m/s)",value:t=>t.historical.muzzleVelocity}];let r={column:0,ascending:!0};function j(){const t=[...z].sort((e,a)=>{const s=c[r.column].value(e),i=c[r.column].value(a),d=typeof s=="number"&&typeof i=="number"?s-i:String(s).localeCompare(String(i));return r.ascending?d:-d}),o=c.map((e,a)=>`<th scope="col" aria-sort="${a===r.column?r.ascending?"ascending":"descending":"none"}"><button data-sort="${a}">${e.label}${a===r.column?r.ascending?" ▲":" ▼":""}</button></th>`).join(""),l=t.map(e=>`<tr>${c.map((a,s)=>{const i=a.show?a.show(e):a.value(e),d=k[s-3],F=d&&e.damage[d.id]>=100?' class="kill-cell"':"";return s===0?`<th scope="row">${n(String(i))}</th>`:`<td${F}>${n(String(i))}</td>`}).join("")}</tr>`).join("");return`<p class="lede">Every weapon in one table. Select a heading to sort; gold damage kills in one hit.</p>
    <div class="table-wrap"><table class="compare"><thead><tr>${o}</tr></thead><tbody>${l}</tbody></table></div>`}function y(t){const o=[...b.map(e=>[e,x[e].name]),["compare","Compare"]],l=t==="compare"?j():`<div class="cards">${z.filter(e=>e.faction===t).map(T).join("")}</div>`;u.innerHTML=`<header class="masthead">
      <a class="back" href="../">← Back to the game</a>
      <div class="eyebrow">SECTOR CONTROL</div><h1>Armory</h1>
      <p>Live weapon stats for Britain, Imperial Germany and France. Riflemen and marksmen carry bolt-action rifles; inside Fort Vaux, French and German riflemen carry a carbine instead. Support can carry a light machine gun or take an emplacement kit on any map, and where tanks fight, an anti-tank kit whose rounds go through tank plate. Each role has a pistol.</p>
    </header>
    <nav class="tabs" role="tablist">${o.map(([e,a])=>`<button role="tab" aria-selected="${e===t}" data-tab="${e}">${n(a)}</button>`).join("")}</nav>
    <section>${l}</section>
    <footer><p>Damage and time to kill assume full health, close range and a clear shot. Pistol damage drops over distance. Time starts with the first hit. Ordinary rounds only blur a tank crew's view; tank hits assume the side plates unless the vision slits are named.</p></footer>`,u.querySelectorAll("[data-tab]").forEach(e=>e.onclick=()=>{const a=e.dataset.tab;history.replaceState(null,"","#"+a),y(a)}),u.querySelectorAll("[data-sort]").forEach(e=>e.onclick=()=>{const a=Number(e.dataset.sort);r={column:a,ascending:a===r.column?!r.ascending:a<3},y("compare")})}const $=location.hash.slice(1);y($==="compare"||b.includes($)?$:b[0]);
