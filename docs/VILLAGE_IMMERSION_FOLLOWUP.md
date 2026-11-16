# Village Front immersion follow-up

November 15, 2026. Builds on the existing furnished buildings and outdoor yards. The five objectives, nine-building arrangement, street widths and manor stair layout are retained.

## Buildings and surfaces

Wall rows now carry explicit exterior orientation. Stone plinths sit below limewashed walls, skirting stays inside, shutters and corner dressings face the street, and cornices run at story height instead of across every wall module. Manor, school and inn use more distinct, restrained palettes. The school entrance has an aid-post plaque; unlit entrance lanterns, shutter louvres and iron hinges give the facades scale without adding lights or animation.

Gable rendering follows the roof pitch continuously instead of forming a sawtooth outline. Its sloped mesh remains inside each coarse structural collision envelope. Ridge flashing, timber fascia and gutters belong to their destructible roof panels. Furnished dining spaces gain chairs with real destruction/collision envelopes, rounded ceramic tableware and cabinet pulls. Other small detail stays attached to an existing structural object and disappears with it.

Limewash has shared diffuse, normal and gloss maps with trowel marks, fine cracks and restrained mottling. Timber and floorboards use quieter grain and normal relief, with the same sRGB color decoding as the other authored materials. Paving now has cobble relief instead of inheriting the underlying mud normal map. Shared material improvements also apply on other maps using those materials. Existing blast cuts still expose soil through the fresh-earth mask.

## Routes and cover

Seventeen additional low roadside cover groups: oak barrel clusters, supplies beside the outer crossing carts, rear approach carts and stable/cottage barrels. The manor garden benches move toward the rear crossing. All cover passes the existing road, doorway, building and deployment clearances. The barrel clusters use one wooden destruction envelope each. No per-barrel rigid bodies or per-frame updates are added.

The route audit still walks actual soldiers from both deployments to all five objectives. Central C remains 13.03 / 13.17 seconds away. The worst sampled distance without a solid within 5.5 m falls from 22.60 to 17.35 m. The far blue-to-E route changes from 22.63 to 22.77 seconds; other changes are smaller. This is a proximity diagnostic, not enemy visibility or proof that a crossing is safe. Earthen trench protection is excluded from that measure.

## Verification

Native geometry checks cover finite normals/tangents, no more than five material groups per structural object, continuous gable edges and visual cleanup when parents are destroyed. Barrel collision bounds and direct-blast removal use the existing cover tests. A paving regression checks that underlying soil wear cannot change fully paved normals. Existing tests exercise damaged stairs, mantling, actual flag routes, AI battles, building collapse and excavation.

CI now captures fixed, clean school, inn, street and manor-room views in addition to the regular overview and battle/player views. The first commit captures the existing art as a baseline; subsequent commits use the same views for comparison. Hosted rendering uses SwiftShader and is not evidence of player GPU frame rate. Final screenshot review and full CI results are recorded in the PR.
