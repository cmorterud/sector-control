# Combat feedback

Incoming health damage now carries its cause, applied damage, impact position and attack origin. Fired projectiles retain their original weapon and muzzle position even if their owner moves, changes weapons, dies or respawns before impact. Grenade/artillery damage uses the explosion location; it does not expose the remote artillery caller's position. Melee identifies the bayonet, charge or butt strike. Delayed burns retain the ignition location and flame cause. Zero damage and postmortem damage produce no new hit/death credit.

## Hit direction and death view

Up to eight small red arcs appear around the reticle for 1.5 seconds. Nearby directions merge during bursts; the arcs rotate with the player's view while retaining the original attack bearing. Unknown or directly vertical origins retain the existing damage flash without inventing a horizontal direction. They clear at death/respawn and are hidden behind pause/scoreboard overlays.

A death report shows the attacker, weapon/cause, distance, and actual recent damage/hits from that attacker, plus the respawn countdown. Explosions label their distance as blast distance. Voluntary redeploy has its own heading and awards no enemy kill or assist. Names and weapon labels are escaped for HTML.

For the first 2.5 seconds after death, the camera eases toward the frozen attack location. It uses the existing collision-constrained third-person camera and a modest zoom when the initial line of sight is clear. It never reads the killer's changing position. It then returns to a wide field of view until respawn, including after a scoped death. Player aim, commands, respawn timing and preferred camera mode are preserved. The tactical map shows only the player's last death position, for six seconds after respawn; new deaths replace it and new matches clear it.

## Kill confirmation and feed

A credited kill shows the victim's name below the reticle for three seconds. Kills that land together share a confirmation with the additional count. The kill feed shows the four most recent deaths for up to six seconds. The defeated soldier's team colors each row, with both names colored by team. Voluntary redeploys stay out of the feed.

The north-up HUD minimap reuses the tactical map artwork, including the Fort Vaux floor plan. It shows your position, facing and flag ownership. Terrain redraws at most once per second after destruction. Opening the full tactical map or scoreboard hides the minimap and kill feed.

## Assists

An enemy's finishing kill awards one assist to each other teammate who dealt at least 20 actual health damage within the preceding ten seconds (300 simulation ticks, inclusive). Individual hits age out independently, so a fresh small hit cannot refresh old damage. Contributions from dead teammates still count. Killer, victim, friendly contributors, suicides/redeploys and environmental deaths receive no assist credit. Overkill is limited to the health actually removed. Victim history clears on respawn and training resupply; match statistics persist through respawn.

The scoreboard shows K / A / D and CAP where appropriate, for both small and full rosters. A short notification confirms the player's assist and contributed damage. Assists do not add objective points or duplicate the finishing kill's team point in elimination mode.

## Verification

Simulation regressions exercise credit thresholds, the exact timing boundary, multiple contributors, stale/friendly/self/environmental damage, contributor death, respawn, overkill, in-flight weapon changes, blasts, real melee and flame/burn deaths. Presentation regressions cover frozen bearings, bounded/fading indicators, the death-view lifetime, blocked-view zoom, marker expiry/reset and scoreboard variants.

The Industrial browser check uses ordinary projectiles and collision to verify the hit indicator, death report, kill confirmation, both team colors in the feed, minimap tracking, respawn, death-marker expiry and assist credit. It saves hit, death, map, notification and scoreboard screenshots. Fort Vaux's render check verifies the minimap uses its floor plan. The production publisher repeats the Industrial check on the deployed site alongside Village and Training Grounds.
