# Village Front architectural detail pass

November 14, 2026. Requested plan; broader art work below is proposed, not yet implemented. The immediate repair adds real ground-floor surfaces (planks or paving), bare foundation soil underneath, safer damaged-stair movement, low-cover vaulting, redeploy and reduced artillery splash damage. The five-flag layout stays: school A, farmhouse B, manor C, inn D, town hall E.

## Architectural identity and silhouettes

- Manor: lime plaster over stone, stone entrance surround, deeper eaves, cornice bands, contrasting window frames, a recognizable central entrance and two chimneys. Consider a shallow central roof feature once the base building is visually reviewed. Keep upper firing windows and both stairways useful.
- School / aid post: tall classroom windows, entrance signage, a restrained medical marking and a distinct bell/roof feature; rows of damaged desks leave clear paths and usable cover.
- Orchard farmhouse: simpler stone/plaster, wooden shutters, kitchen hearth, a worn dining table and orchard-facing rear door.
- Inn: projecting sign, darker timber trim, common-room counter, grouped tables and a recognizable courtyard entrance.
- Town hall / post office: formal stone frontage, clock or civic plaque, counters, shelving and a recessed delivery entrance.
- Stable: timber stalls, trough and harness storage. Bakery: masonry oven, shelves and workbench. Smithy/storehouse: hearth, anvil and shelving. Cottage: plain domestic furnishings. These four remain simpler than the capture buildings.

## Surfaces and structural construction

Replace hut-like uniform panels with properly scaled plaster, exposed brick/stone, slate/tile roofs and timber. Use consistent real-world texture scale and restrained normal/roughness maps so wood grain does not stretch across whole walls. Add corner stones, sills, lintels, doorway reveals, skirting, roof ridge caps, eaves and visible supporting beams. Use reusable modules and shared materials, not a unique high-resolution asset for every panel.

Give rooms real finished floors and ceilings. The immediate floor repair is the baseline; the art pass adds believable plank widths, thresholds, localized wear and stone/paver courses. Keep the underlying foundation as bare soil so destroyed floors do not reveal fresh lawn. Exposed upper-floor edges should show joists and thickness.

## Interiors and circulation

Dress each important room with a small, deliberate set of recognizable furnishings: fireplaces, cupboards, bookcases, desks, tables and counters. Keep two useful entrances per building, both manor stairs, comfortable passing space and clear capture pockets. Do not place props in the path through a doorway or across a firing window. Add light stair rails/balusters where compatible with vaulting and destruction; broken rails must not leave invisible blockers.

Use warm plaster, darker timber and light from windows to make rooms readable. Interior atmosphere should come from materials, shadows and a limited number of dust effects rather than opaque fog. Props should tell a household/civic/workshop story, rather than filling every room with generic crates.

## Damage and battle evolution

Make intact, damaged and destroyed states visibly distinct: chipped plaster exposes brick; damaged roof edges show battens; broken floors expose joists; shattered furniture and local dust correspond to the part actually hit. Replace the most visible gray rubble boxes with irregular brick/stone/plaster debris meshes sharing coarse, stable collision. Keep foundation fragments and some durable low cover after a collapse.

Nearby artillery should shake and chip houses more often than erase them. The immediate patch reduces structural splash to 20% while direct contact keeps full structural force. Player blast damage, crater rules and grenade damage stay separate. Review direct-hit holes, repeated indirect hits, partial wing collapse and full support failure on the same building before tuning again.

## Implementation and acceptance order

1. Polish one intact manor room, its entrance, a stairway and an exterior window bay as the visual standard; inspect both player perspectives before multiplying detail.
2. Apply the shared kit to the other eight buildings, with the identities above. Update the Village gameplay preview after actual rendered review.
3. Add coordinated damaged edges and improved rubble, checking that visuals and collision disappear together and that all five flags remain reachable.
4. Compare intact and bombarded map performance at the same camera/resolution. Batch static details; do not simulate every brick or make every small prop a rigid body. Keep distant simplification and bounded debris/effects. No frame-rate acceptance is claimed until a rendered check is available.
