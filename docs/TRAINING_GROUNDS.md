# Training grounds

Open `?map=training` from the map selector or the published game URL. This is a separate field-training camp with eight numbered stations, no match time limit and no random artillery. It uses the real weapons, projectiles, AI, collision, damage, terrain deformation and building-collapse systems.

| Station | Required actions |
| --- | --- |
| Movement & cover | Walk, sprint, toggle crouch, hop, mantle the brick wall, switch camera views and fire from a real trench firing step |
| Weapon range | Rifle hit, reload, scoped hit, machine-gun hit, pistol hit close-range flame damage and an AR-01 hit |
| Grenades & smoke | Place a grenade explosion near the target group and let smoke bloom |
| Bayonet lane | Land a normal thrust and a sprinting charge |
| Fire support | Request artillery on the target house through the tactical map and observe impacts |
| Demolition yard | Breach the two-story house, fell the marked pine and cut a crater; continue destroying supports to experiment with full collapse |
| Squad exercise | Observe real suppression/cover reactions and defeat two enemies alongside friendly bots |
| Capture exercise | Clear defenders, then stand in a blue objective for three seconds after its actual capture |

The HUD shows the first unfinished action, a small progress strip and a bearing/distance to the exercise area. Controls reflect the player's remapping. Other actions can still be completed out of order. After passing an exercise, follow the camp roads to the next numbered board and press the interact key nearby. Any exercise can also be selected from the pause menu; none is locked.

Escape opens the training menu: choose exercise, service rifle/marksman/support kit, British/French/German equipment or the Industrial training kit, free practice, resupply, artillery recharge or reset. Gear/exercise changes start a fresh scenario on resume while retaining previously completed tasks. Reset deliberately clears the selected exercise's checklist and restores the authored terrain and structures. Other exercises' completed tasks remain. Course progress lasts for the current page session.

Flame kits sit beside the supply tables and use the ordinary interact/pickup mechanic. Resupply restores primary and pistol ammunition, grenades, smoke, health and the player's artillery charge. Training does not alter weapon damage, handling, projectile speed or explosive power. Active fire missions must still finish before another call is accepted.

Range opponents stay passive; one target moves using ordinary movement. The last two exercises run normal bot decision-making with friendly and enemy soldiers. Defeated targets return for repeat practice; final defenders stay defeated so the player can secure the objective. Player deaths use the ordinary death/respawn lifecycle with a shorter training delay and return to the selected checkpoint and equipment. Inactive actors remain disabled.

`TrainingSession` owns scenario setup and completion recognition outside the normal match rules. A scenario command callback supplies passive/moving targets or delegates to the real `botCommand`; ordinary matches have no override. Completion consumes real simulation events and state, including projectile impacts, reloads, stance changes, smoke, melee hits, artillery and structural changes. Idle time does not pass a lesson.

The CI render matrix includes the camp. Overview views show its layout, and the ground views start the weapon exercise with real targets. Regression tests exercise all eight stations with actual simulation commands, explosions and AI, including negative cases for missed shots, firing flame into empty space and being absent from the captured flag. The hosted browser also sends normal keyboard/mouse events to check movement, crouch, view switching, aim/fire/reload, the tactical menu, faction equipment and station selection. Software-rendered screenshots are visual evidence, not a hardware performance benchmark.
