import{s as j}from"./build-version-D4EfEhNf.js";import{r as S,g as f,f as T,h as x,t as v,a as b,w as h,b as O,c as p,d as y,e as z,i as w,m as F,s as M,j as n,k as R}from"./mortar-stats-COk9-tDY.js";const $=document.getElementById("armory");j();const o=a=>a.replace(/[&<>"]/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[e]),c=a=>a===0?"instant":`${a.toFixed(2).replace(/\.?0+$/,"")} s`;function H(a){if(a>=100)return{fill:"#efd07b",text:"#1c302e"};const e=Math.max(0,Math.min(1,a/100)),l=(t,s)=>Math.round(t+(s-t)*e);return{fill:`rgb(${l(52,243)},${l(73,142)},${l(71,123)})`,text:e>.55?"#1c302e":"#edf0e7"}}function A(a){const e=(l,t,s)=>{const r=H(a.damage[l]);return`<g class="zone" data-zone="${l}">${t.replace("/>",` fill="${r.fill}"/>`)}${s?`<text x="${s[0]}" y="${s[1]}" fill="${r.text}">${a.damage[l]}</text>`:""}</g>`};return`<svg class="figure" viewBox="0 0 120 250" role="img" aria-label="Damage by body part for the ${o(a.name)}">
    ${e("legs",'<rect x="37" y="146" width="21" height="98" rx="6"/>',[47.5,200])}
    ${e("legs",'<rect x="62" y="146" width="21" height="98" rx="6"/>')}
    ${e("arms",'<rect x="11" y="56" width="20" height="88" rx="8"/>',[21,104])}
    ${e("arms",'<rect x="89" y="56" width="20" height="88" rx="8"/>')}
    ${e("stomach",'<rect x="35" y="104" width="50" height="42" rx="4"/>',[60,130])}
    ${e("chest",'<rect x="33" y="54" width="54" height="50" rx="8"/>',[60,84])}
    ${e("head",'<circle cx="60" cy="28" r="21"/>',[60,34])}
  </svg>`}function E(a){const e=x.map(r=>{const d=M(a,r.id);return`<tr><th scope="row">${r.label}</th><td>${a.damage[r.id]}</td><td>${d===1?'<span class="kill">1 · kill</span>':d}</td><td>${c(v(a,r.id))}</td></tr>`}).join(""),[l,t]=a.historical.rate??[],s=a.historical.rate?"historical":"reference";return`<article class="card">
    <header><div class="eyebrow">${S[a.role].toUpperCase()}</div><h2>${o(a.name)}</h2><div class="round">${o(a.round)}</div></header>
    <div class="body">
      ${A(a)}
      <table class="zones"><thead><tr><th></th><th>Damage</th><th>Hits to kill</th><th>Time to kill</th></tr></thead><tbody>${e}</tbody></table>
    </div>
    <dl class="stats">
      <div><dt>Rounds per reload</dt><dd>${a.magazine}<small> + ${a.reserve} spare</small></dd></div>
      <div><dt>Reload</dt><dd>${c(b(a)/h)}</dd></div>
      <div><dt>Rate of fire</dt><dd>${Number(f(a).toFixed(2))}<small> rounds/min in game${l===void 0?"":` · ${l===t?l:`${l}–${t}`} historical`}</small></dd></div>
      <div><dt>Muzzle velocity</dt><dd>${O(a)} m/s<small> in game · ${a.historical.muzzleVelocity} m/s ${s}</small></dd></div>
    </dl>
    ${D(a)}
    <p class="summary">${o(a.summary)}</p>
    ${a.approximate?`<p class="approximate"><strong>Approximate.</strong> ${o(a.approximate)}</p>`:""}
    <p class="note">${o(a.historical.note)}${a.falloff?` Damage falls to ${Math.round(a.falloff.minimum*100)}% between ${a.falloff.start} and ${a.falloff.end} m.`:""}</p>
  </article>`}function B(a){const[e,l]=n.flightTicks.map(t=>t/h);return`<article class="card mortar">
    <header><div class="eyebrow">TRENCH MORTAR</div><h2>${o(a.name)}</h2><div class="round">${o(a.bomb)}</div></header>
    <dl class="stats">
      <div><dt>Range</dt><dd>${n.minRange}–${n.maxRange} m<small> set with forward/back · ${o(a.historical.range)} historical</small></dd></div>
      <div><dt>Blast</dt><dd>${R.radius} m<small> · ${R.damage} damage at the burst, falling to nothing at the edge · hurts both sides</small></dd></div>
      <div><dt>Bombs</dt><dd>${n.bombs}<small> per life · refilled on respawn</small></dd></div>
      <div><dt>Rate of fire</dt><dd>${c(n.loadTicks/h)}<small> between bombs</small></dd></div>
      <div><dt>Flight</dt><dd>${c(e)}–${c(l)}<small> from the shortest to the longest range</small></dd></div>
      <div><dt>Landing spread</dt><dd>±${n.spread} m<small> settled · up to ±${n.spread+n.bloomMax} m just after moving or firing</small></dd></div>
    </dl>
    <p class="summary">${o(a.summary)}</p>
    ${a.approximate?`<p class="approximate"><strong>Approximate.</strong> ${o(a.approximate)}</p>`:""}
    <p class="note">${o(a.historical.calibre)}. ${o(a.historical.note)}</p>
  </article>`}function D(a){const e=p(a),l=p(a,!0);return!a.armour||!e||!l?"":`<dl class="stats armour">
      <div><dt>Hull damage per hit</dt><dd>${a.armour.hull}<small> of 600 · ×${a.armour.slit} through the vision slits</small></dd></div>
      <div><dt>Hits to stop a tank</dt><dd>${e.immobilize}<small> to throw a track · ${l.immobilize} at the slits</small></dd></div>
      <div><dt>Hits to knock it out</dt><dd>${e.knockOut}<small> · ${l.knockOut} at the slits</small></dd></div>
      <div><dt>Crew wounded</dt><dd>${Math.round(a.armour.crew*100)}%<small> of hits · ${a.armour.crewDamage} damage · twice as often at the slits</small></dd></div>
    </dl>`}const u=[{label:"Weapon",value:a=>a.name},{label:"Faction",value:a=>[a.faction,...a.alsoIssuedTo??[]].map(e=>T[e].name).join(", ")},{label:"Role",value:a=>S[a.role]},...x.map(a=>({label:a.label,value:e=>e.damage[a.id]})),{label:"Chest time to kill",value:a=>v(a,"chest"),show:a=>c(v(a,"chest"))},{label:"Rate (rounds/min)",value:f,show:a=>f(a).toFixed(2).replace(/\.?0+$/,"")},{label:"Rounds per reload",value:a=>a.magazine},{label:"Reload",value:a=>b(a)/h,show:a=>c(b(a)/h)},{label:"Velocity in game (m/s)",value:a=>O(a)},{label:"Hits to knock out a tank",value:a=>p(a)?.knockOut??1/0,show:a=>String(p(a)?.knockOut??"—")},{label:"Reference velocity (m/s)",value:a=>a.historical.muzzleVelocity}];let i={column:0,ascending:!0};function V(){const a=[...z].sort((t,s)=>{const r=u[i.column].value(t),d=u[i.column].value(s),m=typeof r=="number"&&typeof d=="number"?r-d:String(r).localeCompare(String(d));return i.ascending?m:-m}),e=u.map((t,s)=>`<th scope="col" aria-sort="${s===i.column?i.ascending?"ascending":"descending":"none"}"><button data-sort="${s}">${t.label}${s===i.column?i.ascending?" ▲":" ▼":""}</button></th>`).join(""),l=a.map(t=>`<tr>${u.map((s,r)=>{const d=s.show?s.show(t):s.value(t),m=x[r-3],C=m&&t.damage[m.id]>=100?' class="kill-cell"':"";return r===0?`<th scope="row">${o(String(d))}</th>`:`<td${C}>${o(String(d))}</td>`}).join("")}</tr>`).join("");return`<p class="lede">Every weapon in one table. Select a heading to sort; gold damage kills in one hit.</p>
    <div class="table-wrap"><table class="compare"><thead><tr>${e}</tr></thead><tbody>${l}</tbody></table></div>`}function k(a){const e=[...y.map(t=>[t,T[t].name]),["compare","Compare"]],l=a==="compare"?V():`<div class="cards">${z.filter(t=>w(t,a)).map(t=>({...t,faction:a})).map(E).join("")}${F.filter(t=>t.faction===a).map(B).join("")}</div>`;$.innerHTML=`<header class="masthead">
      <a class="back" href="../">← Back to the game</a>
      <div class="eyebrow">SECTOR CONTROL</div><h1>Armory</h1>
      <p>Live weapon stats for Britain, Imperial Germany, France, and at Gallipoli the ANZAC and Ottoman armies. Riflemen and marksmen carry bolt-action rifles; inside Fort Vaux, French and German riflemen carry a carbine instead. Support can carry a light machine gun (none reached Gallipoli in 1915) or take an emplacement kit on any map, and where tanks fight, an anti-tank kit whose rounds go through tank plate. On maps with artillery, Support can also set up a trench mortar that lobs bombs one trench line ahead. Each role has a pistol.</p>
    </header>
    <nav class="tabs" role="tablist">${e.map(([t,s])=>`<button role="tab" aria-selected="${t===a}" data-tab="${t}">${o(s)}</button>`).join("")}</nav>
    <section>${l}</section>
    <footer><p>Damage and time to kill assume full health, close range and a clear shot. Pistol damage drops over distance. Time starts with the first hit. Ordinary rounds only blur a tank crew's view; tank hits assume the side plates unless the vision slits are named.</p></footer>`,$.querySelectorAll("[data-tab]").forEach(t=>t.onclick=()=>{const s=t.dataset.tab;history.replaceState(null,"","#"+s),k(s)}),$.querySelectorAll("[data-sort]").forEach(t=>t.onclick=()=>{const s=Number(t.dataset.sort);i={column:s,ascending:s===i.column?!i.ascending:s<3},k("compare")})}const g=location.hash.slice(1);k(g==="compare"||y.includes(g)?g:y[0]);
