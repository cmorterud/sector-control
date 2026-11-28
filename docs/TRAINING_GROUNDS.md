# Training grounds

Open `?map=training` from the map selector or the published game URL. This is a separate field-training camp with nine numbered stations, no match time limit and no random artillery. It uses the real weapons, projectiles, AI, collision, damage, terrain deformation and building-collapse systems.

| Station | Required actions |
| --- | --- |
| Movement & cover | Walk and sprint into marked checkpoints, crouch and stand, hop in the jump lane, mantle the brick wall, switch camera views and fire from a real trench firing step |
| Weapon range | Rifle hit, reload, scoped hit, machine-gun hit, pistol hit, close-range flame damage, AR-01 hit, and emplacement setup, firing, reload and packing |
| Grenades & smoke | Place a grenade explosion near the target group and let smoke bloom |
| Bayonet lane | Land a normal thrust and a sprinting charge (press melee when the HUD shows **V · BAYONET CHARGE**); the lesson also points to the whistle that takes a squad over the top |
| Fire support | Request artillery on the target house through the tactical map and observe impacts |
| Demolition yard | Breach the two-story house, fell the marked pine and cut a crater; continue destroying supports to experiment with full collapse |
| Gas drill | Select Gas Shells on the tactical map, fire on the highlighted sector, seal your gas mask and watch the cloud form |
| Squad exercise | Observe real suppression/cover reactions and defeat two enemies alongside friendly bots |
| Capture exercise | Clear defenders, then stand in a blue objective for three seconds after its actual capture |

Guided training starts at Movement & cover. A gold circle marks the current ground checkpoint, and a label points out the target, equipment or obstacle. The top-left panel shows the station, its progress and the direction and distance to the marker. The lower-center prompt names the current action and uses the player's bindings. The tactical map highlights the appropriate fire-support mode and target sector. The weapon range issues each kit when its drill comes up.

When a station is complete, press the interact key to deploy directly to the next. Escape opens station selection, service rifle/marksman/support kits, faction equipment, Free practice, resupply and replay. Free practice lets players bring a chosen kit and use any numbered board to move between stations. Replay clears the selected station's progress and restores the authored terrain and structures. Course progress lasts for the current page session. Restarting a partially finished Gas drill begins with a fresh strike.

Flame kits sit beside the supply tables and use the ordinary interact/pickup mechanic. Resupply restores primary and pistol ammunition, grenades, smoke, health and the player's artillery charge. Training does not alter weapon damage, handling, projectile speed or explosive power. Guided fire support and demolition recharge once the barrage ends. Guided grenade and smoke practice restocks exhausted throws once they land.

Range opponents stay passive; one target moves using ordinary movement. The last two exercises run normal bot decision-making with friendly and enemy soldiers. Defeated targets return for repeat practice; final defenders stay defeated so the player can secure the objective. Player deaths use the ordinary death/respawn lifecycle with a shorter training delay and return to the selected checkpoint and equipment. Inactive actors remain disabled.

`TrainingSession` owns scenario setup and completion recognition outside the normal match rules. A scenario command callback supplies passive/moving targets or delegates to the real `botCommand`; ordinary matches have no override. Completion consumes real simulation events and state, including projectile impacts, reloads, stance changes, smoke, melee hits, artillery and structural changes. Idle time does not pass a lesson.

The CI render matrix includes the camp. Overview views show its layout, and the ground views start the weapon exercise with real targets. Regression tests exercise all nine stations with actual simulation commands, explosions and AI, including negative cases for missed shots, firing flame into empty space and being absent from the captured flag. The hosted browser also sends normal keyboard/mouse events to check movement, crouch, view switching, aim/fire/reload, the tactical map, gas call and mask sequence, faction equipment and station selection. Software-rendered screenshots are visual evidence, not a hardware performance benchmark.
