import{f as x,r as k,g as $,h as y,t as p,a as g,w as f,b as R,c as b,d as S,s as F}from"./loadouts-rZwnThcV.js";const h=document.getElementById("armory"),i=e=>e.replace(/[&<>"]/g,l=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[l]),m=e=>e===0?"instant":`${e.toFixed(2).replace(/\.?0+$/,"")} s`;function T(e){if(e>=100)return{fill:"#efd07b",text:"#1c302e"};const l=Math.max(0,Math.min(1,e/100)),o=(a,t)=>Math.round(a+(t-a)*l);return{fill:`rgb(${o(52,243)},${o(73,142)},${o(71,123)})`,text:l>.55?"#1c302e":"#edf0e7"}}function C(e){const l=(o,a,t)=>{const s=T(e.damage[o]);return`<g class="zone" data-zone="${o}">${a.replace("/>",` fill="${s.fill}"/>`)}${t?`<text x="${t[0]}" y="${t[1]}" fill="${s.text}">${e.damage[o]}</text>`:""}</g>`};return`<svg class="figure" viewBox="0 0 120 250" role="img" aria-label="Damage by body part for the ${i(e.name)}">
    ${l("legs",'<rect x="37" y="146" width="21" height="98" rx="6"/>',[47.5,200])}
    ${l("legs",'<rect x="62" y="146" width="21" height="98" rx="6"/>')}
    ${l("arms",'<rect x="11" y="56" width="20" height="88" rx="8"/>',[21,104])}
    ${l("arms",'<rect x="89" y="56" width="20" height="88" rx="8"/>')}
    ${l("stomach",'<rect x="35" y="104" width="50" height="42" rx="4"/>',[60,130])}
    ${l("chest",'<rect x="33" y="54" width="54" height="50" rx="8"/>',[60,84])}
    ${l("head",'<circle cx="60" cy="28" r="21"/>',[60,34])}
  </svg>`}function M(e){const l=y.map(s=>{const n=F(e,s.id);return`<tr><th scope="row">${s.label}</th><td>${e.damage[s.id]}</td><td>${n===1?'<span class="kill">1 · kill</span>':n}</td><td>${m(p(e,s.id))}</td></tr>`}).join(""),[o,a]=e.historical.rate??[],t=e.historical.rate?"historical":"reference";return`<article class="card">
    <header><div class="eyebrow">${k[e.role].toUpperCase()}</div><h2>${i(e.name)}</h2><div class="round">${i(e.round)}</div></header>
    <div class="body">
      ${C(e)}
      <table class="zones"><thead><tr><th></th><th>Damage</th><th>Hits to kill</th><th>Time to kill</th></tr></thead><tbody>${l}</tbody></table>
    </div>
    <dl class="stats">
      <div><dt>Rounds per reload</dt><dd>${e.magazine}<small> + ${e.reserve} spare</small></dd></div>
      <div><dt>Reload</dt><dd>${m(g(e)/f)}</dd></div>
      <div><dt>Rate of fire</dt><dd>${Number($(e).toFixed(2))}<small> rounds/min in game${o===void 0?"":` · ${o===a?o:`${o}–${a}`} historical`}</small></dd></div>
      <div><dt>Muzzle velocity</dt><dd>${R(e)} m/s<small> in game · ${e.historical.muzzleVelocity} m/s ${t}</small></dd></div>
    </dl>
    <p class="summary">${i(e.summary)}</p>
    <p class="note">${i(e.historical.note)}${e.falloff?` Damage falls to ${Math.round(e.falloff.minimum*100)}% between ${e.falloff.start} and ${e.falloff.end} m.`:""}</p>
  </article>`}const d=[{label:"Weapon",value:e=>e.name},{label:"Faction",value:e=>x[e.faction].name},{label:"Role",value:e=>k[e.role]},...y.map(e=>({label:e.label,value:l=>l.damage[e.id]})),{label:"Chest time to kill",value:e=>p(e,"chest"),show:e=>m(p(e,"chest"))},{label:"Rate (rounds/min)",value:$,show:e=>$(e).toFixed(2).replace(/\.?0+$/,"")},{label:"Rounds per reload",value:e=>e.magazine},{label:"Reload",value:e=>g(e)/f,show:e=>m(g(e)/f)},{label:"Velocity in game (m/s)",value:e=>R(e)},{label:"Reference velocity (m/s)",value:e=>e.historical.muzzleVelocity}];let r={column:0,ascending:!0};function j(){const e=[...S].sort((a,t)=>{const s=d[r.column].value(a),n=d[r.column].value(t),c=typeof s=="number"&&typeof n=="number"?s-n:String(s).localeCompare(String(n));return r.ascending?c:-c}),l=d.map((a,t)=>`<th scope="col" aria-sort="${t===r.column?r.ascending?"ascending":"descending":"none"}"><button data-sort="${t}">${a.label}${t===r.column?r.ascending?" ▲":" ▼":""}</button></th>`).join(""),o=e.map(a=>`<tr>${d.map((t,s)=>{const n=t.show?t.show(a):t.value(a),c=y[s-3],z=c&&a.damage[c.id]>=100?' class="kill-cell"':"";return s===0?`<th scope="row">${i(String(n))}</th>`:`<td${z}>${i(String(n))}</td>`}).join("")}</tr>`).join("");return`<p class="lede">Every weapon in one table. Select a heading to sort; gold damage kills in one hit.</p>
    <div class="table-wrap"><table class="compare"><thead><tr>${l}</tr></thead><tbody>${o}</tbody></table></div>`}function v(e){const l=[...b.map(a=>[a,x[a].name]),["compare","Compare"]],o=e==="compare"?j():`<div class="cards">${S.filter(a=>a.faction===e).map(M).join("")}</div>`;h.innerHTML=`<header class="masthead">
      <a class="back" href="../">← Back to the game</a>
      <div class="eyebrow">SECTOR CONTROL</div><h1>Armory</h1>
      <p>Live weapon stats for Britain, Imperial Germany and France. Riflemen and marksmen carry bolt-action rifles; inside Fort Vaux, French and German riflemen carry a carbine instead. Support can carry a light machine gun or take an emplacement kit on any map. Each role has a pistol.</p>
    </header>
    <nav class="tabs" role="tablist">${l.map(([a,t])=>`<button role="tab" aria-selected="${a===e}" data-tab="${a}">${i(t)}</button>`).join("")}</nav>
    <section>${o}</section>
    <footer><p>Damage and time to kill assume full health, close range and a clear shot. Pistol damage drops over distance. Time starts with the first hit.</p></footer>`,h.querySelectorAll("[data-tab]").forEach(a=>a.onclick=()=>{const t=a.dataset.tab;history.replaceState(null,"","#"+t),v(t)}),h.querySelectorAll("[data-sort]").forEach(a=>a.onclick=()=>{const t=Number(a.dataset.sort);r={column:t,ascending:t===r.column?!r.ascending:t<3},v("compare")})}const u=location.hash.slice(1);v(u==="compare"||b.includes(u)?u:b[0]);
