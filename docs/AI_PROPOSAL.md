# Bot AI proposal

Proposal, November 17, 2026. **Status: implemented on this branch, not yet merged.** All six phases are in `src/squads.ts`, with window posts in `src/village-tactics.ts`, scenario tests in `src/squads.test.ts` and a before/after audit in `tools/ai-audit.ts`. Callouts are HUD text, not voices, because spoken callouts were removed on November 7.

**Open issue before merging:** with squads, Village front's west side (blue) wins every audited seed by about 25 points, where legacy bots were even. A mirror test (sides swapped, factions kept by colour) gives the same edge to whichever team is on the west, so it comes from the map's layout, not the AI: the east team detours round its side and enters the manor through the kitchen. Verdun shows a similar blue lead. It needs a map fix or a deliberate decision.

The aim is bots that behave like soldiers in a squad: they use buildings, cover each other, throw grenades and react to what they hear. They must stay readable and beatable, and fit the 50-a-side, 30 Hz performance budget.

## How bots work today

Each bot decides on its own, on a fixed cycle (`chooseBotCommand` in `src/simulation.ts`). In priority order, it:

1. dodges incoming artillery (`evadeArtillery`);
2. reacts to being hit by taking cover against the threat (`reactionCoverCommand`);
3. ducks when suppressed (`suppressionCommand`);
4. picks a flag every second: the nearest one, penalised if it's already owned or if other teammates have it as their objective;
5. walks an A* route to a cover post near that flag (`planVillageMove` on village-style maps, firing steps on trench maps);
6. fires at the nearest visible enemy, with a reaction delay, aim error and recoil bloom.

Perception (`src/awareness.ts`) is:
- a 1.1-radian forward view;
- anything within 7 m;
- gunshots within 40 m in the last two-thirds of a second;
- a sighted enemy's position, remembered for 3 s.

Trench maps add smoke-screened squad assaults (`src/assault.ts`).

## Gaps

- **No frag grenades.** Bots throw only smoke. Only the player's input can set the grenade command.
- **No teamwork outside trench assaults.**
  - Every bot chooses its objective and post independently.
  - Nobody covers a teammate while they move.
  - Nobody shares where an enemy was seen.
- **Buildings are obstacles, not terrain.**
  - About 1 bot in 11 ever goes upstairs (`manorPost` in `src/village-tactics.ts`).
  - Bots don't treat windows as firing positions or doorways as danger.
  - They don't react to the house kit's collapse warning.
  - They vault windows only when a vault happens to shorten their route.
- **Shallow perception.**
  - Out of sight means forgotten after 3 s.
  - Bots don't fire at where an enemy was last seen, check corners, or hear footsteps or reloads.
  - They target whoever is nearest, not whoever is most dangerous.
- **Movement ignores danger.** Route cost is distance only, so bots path down a lane where teammates just died.

## Proposed phases

### 1. Squads and a team commander

This is the largest gain in realism and readability.

- **Squads of 4–5.** The leader picks the objective and the approach lane. Members take cover posts around the leader rather than around the flag.
- **Bounding overwatch.** Half the squad moves while the other half holds cover and fires at known threats, then they swap.
- **Shared threat memory.** An enemy one member sees is known to the whole squad for about 5 s. Members turn toward it, and machine gunners fire at its last known position.
- **A team commander every 2 s** spreads squads across flags by value:
  1. defend owned flags under threat;
  2. contest flags being captured;
  3. take the nearest neutral flag;
  4. hold one squad in reserve.

  This replaces the per-bot nearest-flag choice.

### 2. Buildings as tactical terrain

The house kit already knows every room, door, window, floor and wing (`KitRuntime` and the plans in `src/house-kit-plans.ts`), so the AI can read buildings rather than guess at them.

- **Tactical spots for each kit building:**
  - window firing posts on every floor, each facing a known direction;
  - corner positions beside each doorway;
  - a defence point in the capture room.
- **Defending.** A squad holding a flag building puts one bot at each window facing the threat, plus one inside on the capture spot. Upper floors are used, but each window is reserved for one bot, so no room fills with snipers.
- **Clearing.** Attackers stack at a door, throw a grenade in if an enemy has been heard or seen inside, then enter and check corners.
- **Collapse awareness.** A bot standing on or under a failing piece leaves at once. Bots avoid posts on floors with weakened supports, and pick a new post when their cover is breached.

### 3. Grenades

- Throw a frag at an enemy whose last known position is behind cover or inside a room, within about 25 m, with no teammates near the target.
- Limit throws per squad. The thrower calls "Grenade!" through the existing soldier chatter, so the player can react.

### 4. Perception and judgement

- **Last known position.** After losing sight, investigate it or fire suppressing shots at it, rather than forgetting after 3 s.
- **Hearing.** Sprinting footsteps and reloads within about 15 m draw attention.
- **Threat-based targeting:**
  1. someone aiming at me;
  2. a machine gunner;
  3. an enemy standing on our flag;
  4. the nearest enemy.
- **Peeking from windows and door frames.** Step out, fire, step back, the same way bots already peek from low cover.

### 5. Danger-aware routes

- A coarse 4 m danger map, raised by deaths, enemy sightings and incoming fire, fading over about 30 s.
- A* costs distance plus danger, so bots flow round killing zones and flank naturally.
- Squads in a bounding move avoid long exposed runs.

### 6. Difficulty and readability

- **Profiles** (recruit, regular, veteran) scale reaction time, aim, grenade frequency and how tightly squads coordinate.
- **Callouts** through the existing chatter ("Moving!", "Reloading", "Enemy in the house!") telegraph intent, so bots read as smart rather than unfair.

## How each phase is proven

Whole matches already run headlessly in tests, so each phase comes with three kinds of evidence.

- **Scenario tests:**
  - a squad leapfrogs to a flag;
  - attackers clear a room that has an enemy inside;
  - bots leave a failing floor before it falls;
  - a bot fires at a remembered position;
  - routes avoid a lane after deaths there.
- **Battle audit numbers.** The tools in `tools/` already produce these; each phase compares them before and after:
  - share of deaths in the open versus in cover;
  - how often bots stand at windows and on upper floors;
  - grenade kills;
  - squad spacing;
  - stuck rate;
  - time to the first capture.
- **A performance budget.** Bot decision time per tick for 100 soldiers stays at or below today's. Recent pathfinding fixes, the connected-component early exit and the nearest-node memo, give headroom. Squad and commander decisions run staggered, about once a second.

## Open decisions

1. **Where to start.** Recommended order: phase 1 (squads), then phase 2 (buildings). Squads change the feel the most, and building AI pays off the house kit. Grenades are a small, quick win if something sooner is wanted.
2. **Bot grenades.** Frags make buildings dangerous for the player too. Recommended: bots always call out the throw, and the throw rate is tied to difficulty.
3. **Default difficulty.** Recommended: Regular, with the profile selectable in the briefing menu.
4. **Squad size.** Recommended: 4–5, about ten squads a side at 50 v 50.
