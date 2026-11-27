import{s as C}from"./build-version-CrTCu6fa.js";import{f as S,r as w,g as f,h as x,t as v,a as b,w as h,b as T,c as $,d as y,e as z,m as F,s as M,i as n,j as R}from"./mortar-stats-D7L15yz_.js";const p=document.getElementById("armory");C();const r=t=>t.replace(/[&<>"]/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[e]),c=t=>t===0?"instant":`${t.toFixed(2).replace(/\.?0+$/,"")} s`;function j(t){if(t>=100)return{fill:"#efd07b",text:"#1c302e"};const e=Math.max(0,Math.min(1,t/100)),l=(a,s)=>Math.round(a+(s-a)*e);return{fill:`rgb(${l(52,243)},${l(73,142)},${l(71,123)})`,text:e>.55?"#1c302e":"#edf0e7"}}function H(t){const e=(l,a,s)=>{const o=j(t.damage[l]);return`<g class="zone" data-zone="${l}">${a.replace("/>",` fill="${o.fill}"/>`)}${s?`<text x="${s[0]}" y="${s[1]}" fill="${o.text}">${t.damage[l]}</text>`:""}</g>`};return`<svg class="figure" viewBox="0 0 120 250" role="img" aria-label="Damage by body part for the ${r(t.name)}">
    ${e("legs",'<rect x="37" y="146" width="21" height="98" rx="6"/>',[47.5,200])}
    ${e("legs",'<rect x="62" y="146" width="21" height="98" rx="6"/>')}
    ${e("arms",'<rect x="11" y="56" width="20" height="88" rx="8"/>',[21,104])}
    ${e("arms",'<rect x="89" y="56" width="20" height="88" rx="8"/>')}
    ${e("stomach",'<rect x="35" y="104" width="50" height="42" rx="4"/>',[60,130])}
    ${e("chest",'<rect x="33" y="54" width="54" height="50" rx="8"/>',[60,84])}
    ${e("head",'<circle cx="60" cy="28" r="21"/>',[60,34])}
  </svg>`}function E(t){const e=x.map(o=>{const d=M(t,o.id);return`<tr><th scope="row">${o.label}</th><td>${t.damage[o.id]}</td><td>${d===1?'<span class="kill">1 · kill</span>':d}</td><td>${c(v(t,o.id))}</td></tr>`}).join(""),[l,a]=t.historical.rate??[],s=t.historical.rate?"historical":"reference";return`<article class="card">
    <header><div class="eyebrow">${w[t.role].toUpperCase()}</div><h2>${r(t.name)}</h2><div class="round">${r(t.round)}</div></header>
    <div class="body">
      ${H(t)}
      <table class="zones"><thead><tr><th></th><th>Damage</th><th>Hits to kill</th><th>Time to kill</th></tr></thead><tbody>${e}</tbody></table>
    </div>
    <dl class="stats">
      <div><dt>Rounds per reload</dt><dd>${t.magazine}<small> + ${t.reserve} spare</small></dd></div>
      <div><dt>Reload</dt><dd>${c(b(t)/h)}</dd></div>
      <div><dt>Rate of fire</dt><dd>${Number(f(t).toFixed(2))}<small> rounds/min in game${l===void 0?"":` · ${l===a?l:`${l}–${a}`} historical`}</small></dd></div>
      <div><dt>Muzzle velocity</dt><dd>${T(t)} m/s<small> in game · ${t.historical.muzzleVelocity} m/s ${s}</small></dd></div>
    </dl>
    ${D(t)}
    <p class="summary">${r(t.summary)}</p>
    <p class="note">${r(t.historical.note)}${t.falloff?` Damage falls to ${Math.round(t.falloff.minimum*100)}% between ${t.falloff.start} and ${t.falloff.end} m.`:""}</p>
  </article>`}function B(t){const[e,l]=n.flightTicks.map(a=>a/h);return`<article class="card mortar">
    <header><div class="eyebrow">TRENCH MORTAR</div><h2>${r(t.name)}</h2><div class="round">${r(t.bomb)}</div></header>
    <dl class="stats">
      <div><dt>Range</dt><dd>${n.minRange}–${n.maxRange} m<small> set with forward/back · ${r(t.historical.range)} historical</small></dd></div>
      <div><dt>Blast</dt><dd>${R.radius} m<small> · ${R.damage} damage at the burst, falling to nothing at the edge · hurts both sides</small></dd></div>
      <div><dt>Bombs</dt><dd>${n.bombs}<small> per life · refilled on respawn</small></dd></div>
      <div><dt>Rate of fire</dt><dd>${c(n.loadTicks/h)}<small> between bombs</small></dd></div>
      <div><dt>Flight</dt><dd>${c(e)}–${c(l)}<small> from the shortest to the longest range</small></dd></div>
      <div><dt>Landing spread</dt><dd>±${n.spread} m<small> settled · up to ±${n.spread+n.bloomMax} m just after moving or firing</small></dd></div>
    </dl>
    <p class="summary">${r(t.summary)}</p>
    <p class="note">${r(t.historical.calibre)}. ${r(t.historical.note)}</p>
  </article>`}function D(t){const e=$(t),l=$(t,!0);return!t.armour||!e||!l?"":`<dl class="stats armour">
      <div><dt>Hull damage per hit</dt><dd>${t.armour.hull}<small> of 600 · ×${t.armour.slit} through the vision slits</small></dd></div>
      <div><dt>Hits to stop a tank</dt><dd>${e.immobilize}<small> to throw a track · ${l.immobilize} at the slits</small></dd></div>
      <div><dt>Hits to knock it out</dt><dd>${e.knockOut}<small> · ${l.knockOut} at the slits</small></dd></div>
      <div><dt>Crew wounded</dt><dd>${Math.round(t.armour.crew*100)}%<small> of hits · ${t.armour.crewDamage} damage · twice as often at the slits</small></dd></div>
    </dl>`}const u=[{label:"Weapon",value:t=>t.name},{label:"Faction",value:t=>S[t.faction].name},{label:"Role",value:t=>w[t.role]},...x.map(t=>({label:t.label,value:e=>e.damage[t.id]})),{label:"Chest time to kill",value:t=>v(t,"chest"),show:t=>c(v(t,"chest"))},{label:"Rate (rounds/min)",value:f,show:t=>f(t).toFixed(2).replace(/\.?0+$/,"")},{label:"Rounds per reload",value:t=>t.magazine},{label:"Reload",value:t=>b(t)/h,show:t=>c(b(t)/h)},{label:"Velocity in game (m/s)",value:t=>T(t)},{label:"Hits to knock out a tank",value:t=>$(t)?.knockOut??1/0,show:t=>String($(t)?.knockOut??"—")},{label:"Reference velocity (m/s)",value:t=>t.historical.muzzleVelocity}];let i={column:0,ascending:!0};function V(){const t=[...z].sort((a,s)=>{const o=u[i.column].value(a),d=u[i.column].value(s),m=typeof o=="number"&&typeof d=="number"?o-d:String(o).localeCompare(String(d));return i.ascending?m:-m}),e=u.map((a,s)=>`<th scope="col" aria-sort="${s===i.column?i.ascending?"ascending":"descending":"none"}"><button data-sort="${s}">${a.label}${s===i.column?i.ascending?" ▲":" ▼":""}</button></th>`).join(""),l=t.map(a=>`<tr>${u.map((s,o)=>{const d=s.show?s.show(a):s.value(a),m=x[o-3],O=m&&a.damage[m.id]>=100?' class="kill-cell"':"";return o===0?`<th scope="row">${r(String(d))}</th>`:`<td${O}>${r(String(d))}</td>`}).join("")}</tr>`).join("");return`<p class="lede">Every weapon in one table. Select a heading to sort; gold damage kills in one hit.</p>
    <div class="table-wrap"><table class="compare"><thead><tr>${e}</tr></thead><tbody>${l}</tbody></table></div>`}function k(t){const e=[...y.map(a=>[a,S[a].name]),["compare","Compare"]],l=t==="compare"?V():`<div class="cards">${z.filter(a=>a.faction===t).map(E).join("")}${F.filter(a=>a.faction===t).map(B).join("")}</div>`;p.innerHTML=`<header class="masthead">
      <a class="back" href="../">← Back to the game</a>
      <div class="eyebrow">SECTOR CONTROL</div><h1>Armory</h1>
      <p>Live weapon stats for Britain, Imperial Germany and France. Riflemen and marksmen carry bolt-action rifles; inside Fort Vaux, French and German riflemen carry a carbine instead. Support can carry a light machine gun or take an emplacement kit on any map, and where tanks fight, an anti-tank kit whose rounds go through tank plate. On maps with artillery, Support can also set up a trench mortar that lobs bombs one trench line ahead. Each role has a pistol.</p>
    </header>
    <nav class="tabs" role="tablist">${e.map(([a,s])=>`<button role="tab" aria-selected="${a===t}" data-tab="${a}">${r(s)}</button>`).join("")}</nav>
    <section>${l}</section>
    <footer><p>Damage and time to kill assume full health, close range and a clear shot. Pistol damage drops over distance. Time starts with the first hit. Ordinary rounds only blur a tank crew's view; tank hits assume the side plates unless the vision slits are named.</p></footer>`,p.querySelectorAll("[data-tab]").forEach(a=>a.onclick=()=>{const s=a.dataset.tab;history.replaceState(null,"","#"+s),k(s)}),p.querySelectorAll("[data-sort]").forEach(a=>a.onclick=()=>{const s=Number(a.dataset.sort);i={column:s,ascending:s===i.column?!i.ascending:s<3},k("compare")})}const g=location.hash.slice(1);k(g==="compare"||y.includes(g)?g:y[0]);
