// Runs in the real briefing before the existing battle scenarios start.
export function checkBriefing(map, maps) {
  const armory = document.querySelector('#menu a.armory-link');
  const picker = document.querySelector('#menu .map-choice');
  if (!armory || armory.textContent.trim() !== 'Armory' || armory.href !== new URL('armory/', location.href).href ||
      !picker || !(armory.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING))
    throw Error('The briefing needs an Armory link above the map picker');
  const select = document.getElementById(map === 'training' ? 'training-loadout' : 'loadout');
  if (!select || select.disabled) throw Error(`${map} loadout selector is missing or disabled`);
  const choices = [...select.options];
  const expected = ['rifleman', 'marksman', 'support', 'emplacement'];
  for (const value of expected) {
    const option = choices.find(choice => choice.value === value);
    if (!option || option.disabled || !option.textContent.trim()) throw Error(`${map} briefing is missing ${value}`);
  }
  const prior = select.value;
  select.value = 'emplacement';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  if (select.value !== 'emplacement') throw Error(`${map} briefing did not select the emplacement kit`);
  select.value = prior;
  select.dispatchEvent(new Event('change', { bubbles: true }));

  const cards = [...document.querySelectorAll('.map-choice > *')];
  const order = cards.map(card => card.dataset.battlefield);
  if (cards.length !== maps.length || order.some((id, index) => id !== maps[index]))
    throw Error('Battlefield menu is missing a map or displays maps out of order');
  const active = cards.filter(card => card.getAttribute('aria-current') === 'page');
  if (active.length !== 1 || active[0].dataset.battlefield !== map)
    throw Error(`Battlefield menu did not select ${map}`);
  for (const card of cards.filter(card => card !== active[0])) {
    if (!card.href || new URL(card.href).searchParams.get('map') !== card.dataset.battlefield)
      throw Error(`Battlefield menu links ${card.dataset.battlefield} to the wrong destination`);
  }
  return { map, loadouts: expected, order };
}

// Compares visible DOM text to the independently bundled game profiles.
export function checkArmory({ factions, weapons }) {
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const firstNumber = element => Number(element?.textContent.trim().match(/^\d+(?:\.\d+)?/)?.[0]);
  const seconds = value => value === 0 ? 'instant' : `${Number(value.toFixed(2))} s`;
  const tab = name => {
    const button = document.querySelector(`[data-tab="${name}"]`);
    check(button, `Missing Armory tab ${name}`);
    button.click();
    check(document.querySelector(`[data-tab="${name}"]`)?.getAttribute('aria-selected') === 'true', `Armory did not open ${name}`);
  };
  for (const faction of factions) {
    tab(faction);
    const cards = [...document.querySelectorAll('#armory .card')];
    const roster = weapons.filter(weapon => weapon.faction === faction);
    check(cards.length === roster.length, `Unexpected weapon count for ${faction}`);
    for (const weapon of roster) {
      const card = cards.find(candidate => candidate.querySelector('h2')?.textContent === weapon.name);
      check(card, `Armory card missing for ${weapon.name}`);
      const stats = new Map([...card.querySelectorAll('.stats dt')].map(label => [label.textContent, label.nextElementSibling]));
      const rounds = stats.get('Rounds per reload');
      check(firstNumber(rounds) === weapon.magazine && Number(rounds.querySelector('small')?.textContent.match(/\d+/)?.[0]) === weapon.reserve,
        `${weapon.name} magazine or reserve differs from the game`);
      check(stats.get('Reload')?.textContent === seconds(weapon.reload), `${weapon.name} reload differs from the game`);
      check(firstNumber(stats.get('Rate of fire')) === Number(weapon.rate.toFixed(2)), `${weapon.name} rate of fire differs from the game`);
      check(firstNumber(stats.get('Muzzle velocity')) === weapon.velocity, `${weapon.name} velocity differs from the game`);
      const rows = [...card.querySelectorAll('.zones tbody tr')];
      check(rows.length === weapon.zones.length, `${weapon.name} has missing hit zones`);
      for (const [index, zone] of weapon.zones.entries()) {
        const [label, damage, shots, time] = rows[index].cells;
        check(label?.textContent === zone.label && firstNumber(damage) === zone.damage && firstNumber(shots) === zone.shots && time?.textContent === seconds(zone.seconds),
          `${weapon.name} ${zone.label} values differ from the game`);
      }
    }
  }
  tab('compare');
  const rows = [...document.querySelectorAll('.compare tbody tr')];
  check(rows.length === weapons.length, 'Armory comparison is missing weapons');
  const names = new Set(rows.map(row => row.cells[0].textContent));
  check(weapons.every(weapon => names.has(weapon.name)), 'Armory comparison has an incorrect weapon roster');
  const columns = [...document.querySelectorAll('.compare thead th')].map(th => th.textContent.replace(/ [▲▼]$/, ''));
  const velocity = columns.indexOf('Velocity in game (m/s)');
  for (const row of rows) {
    const weapon = weapons.find(candidate => candidate.name === row.cells[0].textContent);
    const fields = [
      ['Rounds per reload', weapon.magazine],
      ['Rate (rounds/min)', Number(weapon.rate.toFixed(2))],
      ['Velocity in game (m/s)', weapon.velocity],
      ...weapon.zones.map(zone => [zone.label, zone.damage]),
    ];
    for (const [label, value] of fields) {
      check(firstNumber(row.cells[columns.indexOf(label)]) === value, `${weapon.name} comparison value for ${label} differs from the game`);
    }
    check(row.cells[columns.indexOf('Reload')]?.textContent === seconds(weapon.reload), `${weapon.name} comparison reload differs from the game`);
    check(row.cells[columns.indexOf('Chest time to kill')]?.textContent === seconds(weapon.zones.find(zone => zone.label === 'Chest').seconds),
      `${weapon.name} comparison chest time to kill differs from the game`);
  }
  document.querySelector(`.compare [data-sort="${velocity}"]`).click();
  const ordered = [...document.querySelectorAll('.compare tbody tr')].map(row => firstNumber(row.cells[velocity]));
  check(ordered.every((value, index) => index === 0 || ordered[index - 1] >= value), 'Armory comparison did not sort by velocity');
  return { factions, weapons: weapons.length, comparison: true };
}
