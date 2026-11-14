# Playtest feedback and Village Front proposal

Recorded November 14, 2026. These are design notes, not implemented changes. The user requested a Village Front proposal first; implementation awaits approval.

## Friend's feedback to preserve

- Verdun and Trench Front are the stronger maps; previews, tactical map, scoreboard, scoped rifle, weapon variety and familiar controls were positively received. Village feels cramped and dominated by exposed ruined shells; Industrial also needs work.
- Asked whether sound is spatial and buildings destructible. Current positional audio uses equal-power panning, distance attenuation and cover filtering; Village masonry/support pieces are destructible, while Industrial building blocks remain static.
- Wants a higher jump; clearer friend/enemy identification; death direction or a killer camera; a brief death-location marker; assists and concise damage/kill feedback.
- Wants softer, more natural map boundaries and historically coherent artillery/wrecked vehicle landmarks that matter as cover.
- Wants more distinct equipment roles. Rifleman, Marksman and Support already exist; clarify their jobs before adding more classes.
- Questions constant damaging ambient artillery, its purpose and performance cost. Explore deliberate fire missions linked to battlefield positions, including physically visiting a gun or fire-control station. Avoid repetitive long travel for every shot and ensure bots can participate.
- Asked about larger maps, a controlled 20v20 comparison, current source availability, and linear levels from which battle maps could be derived. No documented controlled 20v20 comparison established. Public trial is currently independent single-player matches against bots; repository remains private.
- Suggested preferences from established shooters; controls are remappable, sprint supports hold/toggle, first person is available/default on a fresh profile, and pause supports map selection.

## User's Village Front requirements

- Exactly nine principal buildings arranged as three rows by three columns.
- Four corner buildings retain the four capture points.
- Four middle-edge buildings are less elaborate, usable supporting buildings.
- Center building is a large two-story mansion.
- Buildings offer substantial cover and usable windows/sightlines.
- Artillery removes localized chunks of walls, roofs and floors. Sufficient structural damage ultimately causes full collapse.
- Propose the building identities and spaces between them before implementation.

## Proposed layout (awaiting approval)

Top means the top of the tactical map. French and German approaches remain left/right respectively; corner flag lettering is proposed, not final.

| | Left | Center | Right |
| --- | --- | --- | --- |
| Top | A: Schoolhouse / aid post | Stable and carriage house | C: Village inn |
| Middle | Bakery and workshop | Two-story manor | Smithy and storehouse |
| Bottom | B: Farmhouse / orchard | Groundskeeper's cottage | D: Town hall / post office |

- Use a readable grid of plots, varied building footprints/orientations, and staggered door/window positions. Three-by-three does not mean nine identical boxes or perfectly straight shooting lanes.
- Start with a roughly 180 by 160 m envelope; validate distances/density before finalizing. Retain four flags, with the manor serving as an optional strong route and observation position rather than a fifth objective.
- Provide short cobbled street crossings, walled gardens, back lanes, hedges/fences, modest grade changes and sparse orchard trees. Garden walls and other substantial cover can be destroyed. Include sheltered connections and outer bypass routes; avoid both bare intersections and clutter mazes.
- Start most buildings standing with limited prior damage. Corner buildings have useful rooms, multiple entrances and capture pockets near their ground floors/courtyards. Flags remain accessible after collapse.
- Mansion: vestibule/hall, substantial internal partitions, side rooms, rear access, two routes upstairs, selective upper windows, and no required rooftop play. Break cross-map sightlines through the interior; surrounding buildings screen distant flags from a single dominant window.
- Structural modules have local damage and support relationships: holes and breaches, then unsupported room/wing failures, then a connected progressive total collapse when load-bearing support is sufficiently lost. A clipped chimney or one cosmetic roof panel must not destroy the whole building.
- Collapsed masonry becomes durable low rubble cover and new paths, with limited cosmetic moving debris. Bound debris/physics and spread visual work to preserve the existing artillery performance improvements.
- Real upper floors require vertical support, stair movement, bot navigation, fall handling, projectile/explosion occlusion and ragdoll support beyond the current ground-oriented movement model. Build and verify one representative two-story structure before scaling to all nine buildings.
- Validate cover/window openings against actual collision, local blast damage and support loss; verify bots use both stories and reroute after breaches/collapse. Compare intact and heavily bombarded map states.

Suggested sequence: validate one two-story destructible building; establish nine-building blockout and routes; implement detailed architecture/materials; verify bots, destruction and performance before publishing. This does not authorize implementation by itself.
