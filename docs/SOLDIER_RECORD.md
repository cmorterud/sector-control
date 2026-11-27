# The soldier record

Each life the player deploys as a named soldier of a real unit: a rank, a name, a company and a battalion or regiment, drawn from `src/soldier-record.ts`. A slip names him as he deploys, the death card opens with his casualty note, the briefing is an operation order addressed to the first of them, and the match ends with a casualty return for both sides. It is presentation only; no rule reads it.

Names come from the same faction pools the bots use (`src/soldier-names.ts`). Ranks are mostly the private's title of that army or arm (Pte., Tpr. for the Light Horse, Chasseur, Füsilier, Jäger, Nefer), with a few NCOs. British and Dominion soldiers carry a regimental number; Ottoman soldiers are named by their father, as their records did. `?record=<n>` fixes the draw for screenshots.

## Units by battlefield

Where a unit is marked *checked*, a source names it in that action. *Era* units are real and fought in that kind of action, but the battlefield itself is invented or the source did not name the defenders.

| Battlefield | Side | Units | Basis |
|---|---|---|---|
| Ypres (Frezenberg, 16 Aug 1917) and Ypres at night | British | 9th Royal Dublin Fusiliers; 8th Royal Inniskilling Fusiliers; 7th/8th Royal Irish Fusiliers; 2nd Royal Irish Regiment (16th Irish Division) | checked: Battle of Langemarck (1917), Wikipedia; 8th Inniskillings' report, losthistory.net/xvidiv |
| | German | Reserve-Infanterie-Regimenter 23, 38, 51 (12. Reserve-Division) | era: the 12th Reserve Division was the counter-attack division in this sector; the regiments facing the 16th Division at Borry Farm were not confirmed |
| Verdun (Fleury, 23 Jun 1916) | French | 121e bataillon de chasseurs à pied | checked: Fleury-devant-Douaumont, Wikipédia |
| | German | Bayerisches Infanterie-Leib-Regiment; Jäger-Regiment Nr. 2 (Alpenkorps) | checked at corps level (Alpenkorps and the "Garde bavaroise"); regiments from the Alpenkorps' order of battle |
| Fort Vaux (Jun 1916) | French | 142e RI (6e compagnie, 3e cie de mitrailleurs); 101e RI; 53e RI machine-gun company | checked: Fort de Vaux, Wikipédia |
| | German | Füsilier-Regiment Nr. 39; Infanterie-Regiment Nr. 158 (50. Infanterie-Division) | checked: IR 39 and the 50th Division, Fort de Vaux, Wikipédia; IR 158 from the division's order of battle |
| Gallipoli (Anzac, Aug 1915) | ANZAC | 2nd, 3rd, 4th Battalions AIF (Lone Pine); 8th and 10th Light Horse (the Nek); Wellington and Auckland Battalions (Chunuk Bair) | checked: Lone Pine, the Nek, Chunuk Bair, Wikipedia |
| | Ottoman | 47th and 125th Regiments (Lone Pine, Johnston's Jolly); 18th Regiment (the Nek); 57th Regiment | checked: same pages |
| Spring Offensive (21 Mar 1918) | British | 16th and 17th Manchesters; 2nd Wiltshires; 2nd Bedfords (30th Division) | checked: Operation Michael, Wikipedia; losthistory.net St Quentin |
| | German | Füsilier-Regiment Nr. 73; IR 76; IR 164 (111. Division) | era: attacked on 21 March 1918, further north (Jünger's regiment); the attackers at Manchester Hill were not named in the sources read |
| Village (invented, Aug 1914) | British | 4th Royal Fusiliers; 1st Royal Scots Fusiliers | era: Mons, 1914 |
| | German | Grenadier-Regiment Nr. 12; Infanterie-Regiment Nr. 84 | era: Mons, 1914 |
| Headland (invented) | French | 1er and 2e régiments de fusiliers marins | era: Flanders coast, 1914–15 |
| | German | Matrosen-Regimenter 1 and 2 (Marinekorps Flandern) | era: Flanders coast |
| Airship (invented) | French | 1er régiment de fusiliers marins | era |
| | German | crew of L 49, Marine-Luftschiff-Abteilung | era: the naval Zeppelin brought down intact in France, October 1917 |
| Training | both | Training Reserve, Cannock Chase; Rekrutendepot, Döberitz | era: real training camps |

A side dressed in another army with `?factions=` takes that army's usual list (Ypres for British and German, Fort Vaux for French, Gallipoli for ANZAC and Ottoman).
