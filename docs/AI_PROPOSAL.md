# Bot AI proposal

Proposal, November 17, 2026. **Status: implemented.** All six phases are in `src/squads.ts`, with window posts in `src/village-tactics.ts`, scenario tests in `src/squads.test.ts` and a before/after audit in `tools/ai-audit.ts`. Callouts are HUD text, not voices, because spoken callouts were removed on November 7.

**Open issue before merging:** with squads, Village front's west side (blue) wins every audited seed by about 25 points, where legacy bots were even. A mirror test (sides swapped, factions kept by colour) gives the same edge to whichever team is on the west, so it comes from the map's layout, not the AI: the east team detours round its side and enters the manor through the kitchen. Verdun shows a similar blue lead. It needs a map fix (see Results).

The aim is bots that behave like soldiers in a squad: they use buildings, cover each other, throw grenades and react to what they hear. They must stay readable and beatable, and fit the 50-a-side, 30 Hz performance budget.

## Results

Headless 120 s, 100-soldier battles from `tools/ai-audit.ts`, the same seed with `squads` off (before) and on (after). Village front, seeds 12345, 777 and 4242; ranges across the three.

| | Before | After |
|---|---|---|
| Shots | 366–399 | 182–300 |
| Deaths | 102–121 | 39–63 |
| Melee deaths | 33–42 | 4–14 |
| Bullet deaths | 48–59 | 16–28 |
| Grenades thrown (kills) | 0 | 14–22 (3–10) |
| Share of soldier time at a window post | 0 | 2.6–4.6% |
| Squad spacing, mean distance to squad centre | 41–42 m | 26–28 m |
| Stuck replans | 10 | 4–7 |
| First capture | 20.8 s | 21.3 s |
| Bot decision time per tick | 3.1–3.3 ms | 3.4–3.8 ms |
| Score, blue–red | 65–60, 57–58, 54–68 | 91–66, 96–65, 82–75 |

On Lighthouse point the same pattern holds (melee deaths 27–30 down to 10–12, 14–26 grenades), and the score stays close to legacy. Verdun leans blue with squads (85–59 and 83–58, against 61–79 and 68–61).

What this shows:
- Battles are fought from cover and at range: melee scrums mostly disappear, and about half as many soldiers die.
- Squads stay together, and fewer bots get stuck.
- **Bot decision time rose about 15%**, over the proposal's budget of "at or below today's". Planning work dominates, not the squad logic: the commander runs every 2 s and grenade planning once in three ticks per bot.
- **Village front favours its west side.** A held stone manor is now hard to retake, so the team that reaches the hall first keeps it, and the west team gets there first. The west route is 8 m shorter and enters the hall by its north door. The east team detours round the smithy and enters through the kitchen. Swapping the teams' sides moves the advantage with them (west 84–90 against east 63–68), so it comes from the layout, not from either team's AI or faction. Counterattacks (below) did not change the outcome. The fix belongs in the map: a matching west door, or a clear east lane. Since the player is always blue, the bias currently helps the player's side.

What differs from the plan:
- Callouts are short HUD text, not voices, because spoken callouts were removed on November 7.
- Peeking from door frames reuses the existing low-cover peek; only windows have their own step-back.
- Bounding squads avoid danger through the danger map; there is no separate exposed-run cost.
- Added: when a team holds fewer flags, the commander masses half its squads on one enemy flag, and they form up about 25 m out until about ten soldiers have arrived (or 15 s pass).

`BotSettings.squads: false` restores individual bots, and `squadFeatures` in `src/squads.ts` switches single behaviours off for audits (`--without=commander,windows,...`).

## How bots worked before squads

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
