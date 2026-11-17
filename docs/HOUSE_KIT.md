# House kit

Approved design, November 16, 2026.

**Status.** The generator, both plans, the design-rule audits and staged collapse are implemented, but no map uses them yet:
- `src/house-kit.ts`: builds a house from a room plan.
- `src/house-kit-plans.ts`: the townhouse, tenement, manor, cottage and barn.
- `src/house-kit-audit.ts`: room, open-run and budget checks.
- `src/kit-collapse.ts`: supports, wings, the never-strand rule and rubble.
- `src/house-kit.test.ts`: regression tests.

The damage changes below are also live on every map: smooth artillery falloff, the splash floor on building masonry and the stray-shell radius. Rounds pass through one timber kit partition at half damage, and kit furniture loses 10 HP per round (`src/building-damage.test.ts`).

Village front's manor is now the kit manor (`manor` in `src/house-kit-plans.ts`). It is 15 × 12.5 m instead of 30 × 26, so the centre plot gains side yards with low cover. The other eight village buildings still use the older generator.

Reusable one-, two- and three-story buildings, assembled from shared pieces, replace custom per-map buildings. The goals: destruction that follows clear, predictable rules, no dead space, and no sprinting across large empty rooms. The current Village manor is not a constraint; it will be replaced by a kit building.

## Why the current buildings feel cobbled together

`buildVillageBuilding` places walls at fixed offsets and picks interiors by building id. The manor's 30 × 26 m footprint gets a 9.6 m × 26 m central hall from two full-depth walls at x = ±4.8. Two short walls at z = −10 and z = 8 cut each wing into a 3 m strip, an 18 m-deep room and a 5 m back room. The same layout repeats upstairs, with about four pieces of furniture per room. Supports are found by distance (floors look for walls within 9 m), and anything two-story assumes the manor's width (stairs at x = ±10.5).

## Decisions

| Topic | Decision |
|---|---|
| Layout | Rooms first. Each asset is a room plan; walls, doors, windows and furniture are derived from it. |
| Grid | 2.5 m bays for walls, floors and roofs. Story height stays 3.4 m. |
| Openings | Ordinary doors and windows are 1.25 m (half a bay). Each building has at least one full-bay entrance on its main approach. |
| Bullets | "Stone stops bullets, wood doesn't." Rifle rounds pass through one thin timber layer at reduced damage; a second stops them. Doors, shutters and furniture can be destroyed by bullets. Masonry is explosion-only. |
| Third story | Mansard by default: full standing height, dormer windows only, roof-material walls. The mill uses a full timber-post story. |
| Hit points | By role, not material (table below). Building pieces only. |
| Artillery | Smooth falloff instead of the 20 cm cliff. Splash can't take masonry below 25% HP. Stray shells no longer double their structural radius. |
| Collapse | Explicit support per bay, collapse per wing, a 0.6–1.5 s warning before pieces fall, about 50 damage to anyone still underneath. |

## Grid and openings

- **Bay:** 2.5 m. Wall bays keep the existing three rows: 1.0 m (sill height, crouch cover), 1.25 m and 1.15 m.
- **Stair flight:** 16 steps of 0.3125 m (5.0 m, exactly two bays) by 0.2125 m rise. A landing is one bay.
- **Rotation:** 90° steps only. Box pieces have no rotation, so a rotated asset swaps its width and depth.
- **Door bay:** a half-bay opening with side piers and a lintel. It costs about two pieces more than today's full-bay gap. Soldiers are 45 cm wide, so one passes a 1.25 m door comfortably and two squeeze.

## Rooms and the open-run rule

Sprint is 7 m/s. Inside any building, the longest straight walkable line that never passes within 1 m of crouch-height cover (0.8 m or taller) is at most **5 m**, about 0.7 s of sprinting. Walls count as cover. Big rooms whose structure supplies cover (shop, workroom, and later barn, mill floor, inn common room, classroom) may reach **7.5 m**, and only these may run beyond three bays.

An audit checks every asset in its intact, damaged and collapsed states, and a test fails any asset that breaks the rule.

Layout rules:

1. Rooms are 1–3 bays on a side, mostly 2×2 or 2×3. Larger rooms are hall or barn types only.
2. Every room of 2×2 bays or more gets a central piece (table, counter, stove, workbench) plus pieces along the walls. Furniture sets carry keep-clear areas in front of doors, windows and stairs.
3. Big rooms get cover from their structure: timber posts every two bays (holding up the floor above, so wrecking them drops it), stalls, stacked goods, machinery or a mezzanine.
4. A room's doors are never in line unless a central piece blocks the line. Moving through a room is a dogleg, which also breaks long sightlines through a house.
5. Corridors run at most two bays straight before a turn or a side opening.
6. Every room has at least two exits: doors, ground-floor windows you can vault, or breachable partitions. Soldiers dive through window openings tucked low. Each ground-floor window keeps a clear landing on both sides, and a test vaults through every one. One deliberate single-entry room per floor is allowed as a strongpoint; its timber partition can be breached to open a second way in.
7. Each house has one stone spine wall that blocks a straight shot from end to end. Other partitions are timber.
8. Damage must not empty a room. Fallen floor bays land as slabs or rubble in the room below, and furniture is tougher than the partitions around it.

## Materials and hit points

Today every non-masonry piece without a listed kind gets 40 HP, including floors, stairs, roofs, ceilings and partitions. A grenade does `100 × (1 − d / 4 m)`, so one grenade destroys every timber piece within 2.4 m that it can see: roughly a 5 m hole in a floor, or most of a stair flight.

These values apply only to building pieces. Trench timber, sandbags, trees and other cover keep their current values.

| Piece | HP | Grenades (100 at contact) | Direct artillery hit (260) | Artillery splash |
|---|---|---|---|---|
| Exterior stone wall | 180 | 2 at contact | Breaches it | Chips; can't go below 25% |
| Stone spine / stair-core wall | 240 | 3 at contact | Breaches it | Chips; can't go below 25% |
| Corner pier, chimney stack | 450 | Can't break it | Needs 2 | Chips; can't go below 25% |
| Timber partition | 60 | 1 within about 1.6 m | Breaches it | Can destroy close by |
| Timber floor bay | 140 | 2 at contact | Breaches it | Chips |
| Stair tread or landing | 200 | Can't break it alone | Breaches it | Chips |
| Roof panel, mansard slope | 40–60 | 1 nearby | Breaches it | Can destroy close by |
| Door, shutter, furniture | 30–80 | 1 | Breaches it | Can destroy close by; bullets too |

The result: roofs fail first, so shelling strips a house from the top down, and the mansard floor is the most exposed. Floors take deliberate effort to break, stairs are durable because they are routes, and corners and chimneys stand in the ruin. Damage already accumulates, so the two-grenade breach on stone walls needs no new mechanism.

## Damage changes

1. **Smooth artillery falloff on building pieces.** Today a shell within 0.20 m does 253 structural damage and one at 0.21 m does 51. Replace this with full damage within 1 m, falling to 20% at 3 m, then the existing taper to 7 m.
2. **Splash floor.** Artillery splash can't take a masonry piece below 25% HP. Barrages leave walls cracked and weakened; a direct hit or grenades finish them. Timber is exempt, so shelling still strips roofs.
3. **Stray shells.** Ambient shells keep their doubled craters, but their structural radius returns to 7 m for building pieces. A 14 m radius currently wears down whole facades evenly.
4. **Staged collapse.** A piece that loses its support enters a failing state for 0.6–1.5 s, shown by dust, creaking and a visible sag, then falls in support order, a few pieces per tick. This warns players upstairs and spreads the work across ticks; the slowest sampled destruction call is already 32–36 ms, longer than a 33 ms tick.
5. **Falling damage.** A falling floor or roof bay does about 50 damage to soldiers underneath when the warning ends. A collapse is never a surprise one-hit kill.

## Collapse rules

- **Stages:** chip → breach → bay drop → wing failure → total collapse → ruin.
- **Explicit supports.** Each piece lists what holds it up. Joists span the short way, between bearing walls. A floor bay rests on the walls under its ends or on the next bay along its span. Nothing floats, and a lost bay only takes what sits on it.
- **Bearing walls on every story,** not only the ground floor's bottom row.
- **Wings.** The existing "under about a third of bearing walls left" rule applies per wing, not per building. A terraced house is its own wing. A party wall falls only when hit directly or when neither neighbour still uses it.
- **Never strand an upper floor.** If every route up is lost, the floor drops or a rubble ramp is spawned.
- **Rubble scales with what fell:** one story leaves 0.5 m (knee cover), two stories 1.05 m, and three stories 1.5 m, with corner stubs above. 1.5 m is the cap: cover vaults reach 1.6 m, so every mound stays crossable.
- **Clear pockets.** Keep the 3.2 m no-rubble radius around flags, and no rubble within 1.6 m of a doorway.
- **Navigation.** Bots keep 0.6 m of clearance, so a 1.25 m door is passable along its centre line, where the generator puts its navigation points. In each bay the generator also adds the clear points nearest the bay's centre and each edge, so routes thread past furniture.

## Asset catalogue

Footprints are in bays (width × depth).

| Asset | Bays | Layout | Destruction character |
|---|---|---|---|
| Cottage | 4×4 | Four rooms in a ring around a stone spine; front and back doors; kitchen hearth | Quick to wreck; chimney stands afterwards |
| Barn / workshop | 6×4 | Plank walls; seven staggered timber posts, stalls and benches; offset cart doors at both ends | Timber walls breach easily and rounds pass through them |
| Lean-to | 2×3 | Attaches to any wall | Falls without harming the host house |
| Narrow townhouse | 3×5 | Shop below, rooms above; stair along the party wall | Designed for terraces; collapses one house at a time |
| Farmhouse | 5×4 | Central stair hall, kitchen and parlour, bedrooms above | Bay drops make ramps into the hall |
| Corner shop / café | 4×4 | Corner entrance, flat above, outside stair | Two facades, two routes up |
| Manor | 6×5 | Entrance hall holding flag C; salon, dining room, library, kitchen and a rear hall around a stone stair core; a ring of rooms upstairs | Three wings; corner piers and the chimney outlast them |
| Tenement | 4×5 | Shop, flat, mansard garrets; stone stair core | Strips top down; the core stands last |
| Mill / warehouse | 6×4 | Open timber-post floors, stacked hoist doors | Floors drop one on another |
| Civic building | 6×5 + 2×2 tower | Mairie or hotel with clock tower | The tower is its own wing |

**Shared pieces:**
- **Wall bays:** solid, window, door, cart door, shop front, party wall, timber partition, and pre-damaged versions of each.
- **Floor bays:** timber, paving, stairwell, hatch.
- **Posts:** timber posts at bay corners, carrying the floor or roof above.
- **Stairs:** a straight two-bay flight, or a stone stair core with half-flights for three stories.
- **Roof:** gable panel, eave, ridge, gable end, mansard slope, dormer, chimney pier.
- **Attachments:** porch, balcony, outside stair, lean-to, yard wall with gate, awning.
- **Furniture sets** for kitchen, parlour, bedroom, shop, classroom, workshop, store and office.

**Part budgets:** one-story ≤ 150, two-story ≤ 420, three-story ≤ 600. Two-story was 400 before finished ceilings were added to the kit. The manor is about 880. Estimates: townhouse about 230, tenement about 400–450.

## Plans

North is the street. Each cell is one 2.5 m bay; columns are lettered and rows numbered from the street.

Legend: `#` stone, `:` timber partition, `~` mansard slope, `w` half-bay window or dormer, `d` half-bay door, `DDDDDDD` full-bay double door, `░` closed in, `^`/`v` stair climbing north or south.

### Narrow townhouse (3 × 5 bays, 7.5 × 12.5 m, two stories)

Party walls on both sides; build in terraces. The stair climbs north along the west party wall and arrives at a landing in the front room.

Ground floor:

```
           A       B       C
       +###w###+DDDDDDD+###w###+   street
     1 #                       #
       #         SHOP          #
     2 #      [ counter ]      #
       #                       #
       +#######+#######+###d###+   stone spine
     3 #   ^   :               #
       #   ^   :    KITCHEN    #
     4 # STAIR :    [table] (h)#
       #   ^   :               #
     5 #       d               #
       # HALL  :               #
       +#######+#######+###d###+   yard: rear door under the outside stair's landing
```

Upper floor:

```
           A       B       C
       +###w###+###w###+###w###+   street
     1 #                       #
       #      FRONT ROOM       #
     2 #LANDING     [bed]      #
       #                       #
       +       +#######+###d###+   stone spine, open over the stair head
     3 #  open :               #
       #  stair:               #
     4 #  well :   BACK ROOM   #
       #       :    [desk]     #
       +.......+               +
     5 #                       #
       #                       #
       +###w###+###w###+###d###+   door to an outside stair down to the yard
```

- **Routes:** street → shop → kitchen (via the spine door at C) → hall → stair; the kitchen also has the rear door to the yard. Upstairs: landing → front room → back room → outside stair, a second route up. Every room has two exits. The spine door lines up with the rear door below and the outside-stair door above, so the hearth and desk sit across both lines.
- **Open runs:** the shop (7.5 × 5 m) is broken by the counter and shelves along the walls; the kitchen (5 × 7.5 m) by its table.
- **Structure:** joists span between the party walls, with the stone spine carrying mid-span. The hearth (h) stands against the east party wall, beside a ground-standing chimney pier. The stair treads stand on the ground. In a terrace, neighbouring houses share one party wall, which stays up while either house still rests on it.
- **Damage:** the roof fails first; an upper bay that drops lands in the kitchen or shop as a ramp. Grenades open the timber partition beside the stair, and the outside stair is a timber attachment one grenade removes.

### Tenement (4 × 5 bays, 10 × 12.5 m, two stone stories plus a mansard)

Corner variant: the west facade is exterior and the east wall is a party wall.

The stone stair core (A3–B4) is a stairwell open through every story. Each story has two eight-step half-flights, each one bay long: A4 climbs north to a mid landing (A3–B3) at +1.7 m, then B4 climbs south to the landing at A5–B5. The flights stack directly, so they need thin treads, not solid boxes, to leave about 3.15 m of headroom. On the ground floor, the space under the mid landing and the second flight is closed in. No floor covers the stairwell, so each mid landing keeps a full story of headroom.

Ground floor:

```
           A       B       C       D
       +###w###+###w###+DDDDDDD+###w###+   street
     1 w                               #
       #             SHOP              #
     2 #    [table]        [counter]   #
       w                               #
       +#######+#######+#######+###d###+   stone spine
     3 #░░░░░░░░░░░░░░░#               #
       #░░░░░░░░░░░░░░░#               #
     4 #   ^   #░░░░░░░#   WORKROOM    #
       # STAIR #░░░░░░░#  [workbench]  #
       +       +#######+               +
     5 #               d               #
       #     HALL      #               #
       +###d###+#######+#######+###w###+   yard
```

First floor:

```
           A       B       C       D
       +###w###+###w###+###w###+###w###+   street
     1 w               :               #
       #    BEDROOM    d    PARLOUR    #
     2 #     [bed]     :   [table]     #
       w               :               #
       +#######+#######+#######+###d###+   stone spine
     3 #  mid landing  #               #
       #  (+1.7 m)     #               #
     4 #   ^   #   v   #    KITCHEN    #
       #  up   #  up   #    [table]    #
     5 #               d               #
       #    LANDING    #               #
       +###w###+#######+###w###+###w###+   yard
```

Mansard floor:

```
           A       B       C       D
       +~~~~~~~+~~~w~~~+~~~~~~~+~~~w~~~+   street
     1 ~               :               #
       ~  FRONT WEST   d  FRONT EAST   #
     2 w    [beds]     :   [chests]    #
       ~               :               #
       +#######+#######+#######+###d###+   stone spine
     3 ~   open well   #               #
       ~ (no floor)    #               #
     4 ~       #   v   #  REAR GARRET  #
       ~       #  up   #   [table]     #
     5 ~               d               #
       ~    LANDING    #               #
       +~~~~~~~+~~~~~~~+~~~w~~~+~~~~~~~+   yard
```

- **Routes:** street → shop → workroom (via the spine door at D) → hall → stair core or rear door. On each upper floor: landing → back room → front east room → front west room.
- **Strongpoints:** the front west rooms on the first floor and the mansard are the single-entry rooms, one per floor. Each has windows on two facades and a timber partition that grenades can open.
- **Third floor:** eye height is 8.45 m, just above a two-story ridge (about 8.35 m). Dormers give narrow arcs, and no third-floor window may have a clear line to a flag across the map.
- **Wings:** the stone stair core, the front wing (rows 1–2) and the rear wing (C–D, rows 3–5).
- **Intended collapse:** shells strip the mansard (40–60 HP). Mansard floor bays drop into the first floor, then the first-floor wings fail into the ground floor. The core, corner piers and chimney stand last over a 1.5–2.0 m rubble ridge. Core flights stay climbable while the core stands; if every route up is lost, the never-strand rule applies.

## Implementation order

1. Building description and generator (rooms, openings, stair core, furniture sets, explicit supports), plus audits for the open-run rule, the exit rule and the support graph.
2. Damage model changes, with regression tests: hit points by role, smooth falloff, splash floor, stray-shell radius, staged collapse and falling damage.
3. A terrace of three townhouses on a test layout.
4. The tenement.
5. The one-story set and the attachments.
6. Village front rebuilt from the kit, with the manor replaced.

## Still to verify

- The open-run numbers against the real crouch cover height and actual furniture sizes, through the audit.
- Bot navigation through 1.25 m doors at 50 soldiers a side.
- The mansard lower slope: a vertical wall piece with a slanted slate skin, or a new pitched collision shape.
- Part counts and rendered performance of a full kit village.
