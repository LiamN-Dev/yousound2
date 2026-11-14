# YouSound Crossy Road source bundle

The source archive in this folder contains the supplied Expo/Three.js Crossy Road project, its 3D models and textures, the original title artwork, and the original MIT license/attribution.

The build script unpacks it into a temporary directory, builds a self-hosted web export under `/games/crossy-road`, and removes the temporary project afterwards. It does not run a third-party Crossy Road host.

The game uses the existing authenticated YouSound endpoints:
- `GET /api/games/crossy-road/stats`
- `GET /api/games/crossy-road/leaderboard`
- `POST /api/games/crossy-road/start`
- `POST /api/games/crossy-road/finish`

The original project is authored by Evan Bacon. See the included MIT license and README inside the source archive. The integration is not affiliated with Hipster Whale or the official Crossy Road product.
