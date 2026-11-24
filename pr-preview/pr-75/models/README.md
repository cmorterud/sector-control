# Landmark models

Exterior models for the Lighthouse point map, contributed by a friend of the project and published with his agreement under the repository's GPL-3.0 license.

| File | Subject | Size (m) | Triangles |
| --- | --- | --- | --- |
| `lighthouse.glb` | White French lighthouse, circa 1920 | 6.2 × 7.2 × 21.6 high | 3,696 |
| `church.glb` | Basic French church, circa 1920 | 19.2 × 8.6 × 15.1 high | 858 |
| `tenement.glb` | Parisian multifamily residence, circa 1920 | 19.2 × 11.5 × 17.2 high | 11,160 |

Units are meters, Y up, with the base centered on the origin. Textures are procedural and embedded. The models are sealed exteriors: no interiors, no collision and no levels of detail. The game gives each one simple box collision in `src/headland-map.ts`.
