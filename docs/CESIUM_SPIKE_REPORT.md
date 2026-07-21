# Cesium Spike Report

Date: 2026-07-19
Branch: `cesium-spike`
Comparison IGC: `igc files/01-2010.IGC`

## Scope

- Added a Cesium-only map path without deleting the Google map implementation.
- Kept the existing IGC parser, playback store, upload UI, altitude profile, and tests.
- Added a temporary map provider toggle for direct Cesium/Google comparison.
- Added live Cesium visual controls for imagery grading, fog, HDR, terrain lighting, terrain detail, camera FOV, and follow pitch.
- Used `VITE_CESIUM_ION_TOKEN` from `.env.local`; no token is committed.
- Used Cesium World Terrain with selectable Bing/Cesium ion, ArcGIS World Imagery, and optional MapTiler satellite imagery.
- Rendered the full-resolution IGC track initially: Douglas-Peucker simplification is not used in the Cesium path.
- Left terrain-compatible annotations for later.

## Visual Quality

Cesium World Terrain with aerial imagery gives a convincing mountain/valley context and looks good for paragliding playback, especially with terrain shading visible under the altitude profile. The full-resolution 11,205-point track is usable and the vario-coloured segment approach works.

The marker is intentionally closer to the Burnair-style reference: shorter black pole, smaller red cap, pointed red tip, vertical bottom-to-top name, and less prominent altitude text. The HTML marker overlay remained glued to the projected pilot position during desktop and mobile smoke checks.

Compared with Google Photorealistic 3D, this is less cinematic because the spike uses terrain plus aerial imagery rather than 3D buildings/mesh. For flight analysis that may be acceptable or even preferable; for visual wow-factor, Google still likely has the edge.

Burnair looks nicer in the reference screenshots for several practical reasons:

- The camera is much closer to terrain, with a shallower pitch and a narrower flight-analysis framing.
- Its imagery appears sharper and more locally detailed at that zoom level.
- Contrast and saturation are stronger, making scrubby hills, roads, and shadowed valleys read more clearly.
- The terrain/imagery blend has less atmospheric haze and less washed-out midtone compression.

The new Cesium starter look is:

- Brightness: 0.88
- Contrast: 1.25
- Saturation: 1.35
- Gamma: 1.0
- Fog: off
- HDR: off for performance by default
- Terrain lighting: off for performance by default
- Terrain maximum screen-space error: 5.0
- Resolution scale: 0.8
- Camera FOV: 45 degrees
- Follow pitch: -22 degrees

This is a better starting point than the original default Cesium scene, but it can look over-graded with Bing in some regions. The controls are intentionally live so the best values can be tuned per provider before hard-coding a default.

## Startup Performance Tuning

The performance-default test changed Cesium startup to optimize the map before playback or track rendering matters:

- Create the Cesium viewer immediately with ellipsoid/flat terrain.
- Load Cesium World Terrain asynchronously after the first usable scene.
- Disable terrain vertex normals during terrain creation.
- Default HDR and terrain lighting off.
- Default terrain maximum screen-space error to 5.0 instead of 1.4.
- Default render resolution scale to 0.8.
- Start the camera closer to the pilot/route instead of a broad whole-flight horizon view.

Measured in a headless Chromium smoke on 2026-07-19 with `igc files/01-2010.IGC`:

- DOM content loaded: 237 ms.
- Cesium viewer ready: 2,333 ms.
- Cesium canvas present: 2,732 ms.
- Pilot marker visible after upload: 5,202 ms.
- Async terrain provider ready: 5,375 ms.
- No non-WebGL-stall console errors.

Important caveat: the scene is usable earlier, but detailed Bing/Cesium imagery still keeps refining after that. An early 4-second screenshot showed a flat/unfinished-looking map; a later tile-quiet screenshot reached `tilesLoaded=true` and looked normal. This suggests the simple tuning helps perceived startup and GPU load, but the remaining lag is mostly imagery/terrain tile delivery and refinement, not the IGC track.

Verdict on simple tuning: worth keeping. It improves first usability with low implementation risk. It does not make Cesium/Bing feel like Burnair by itself.

## Camera Behaviour

Cesium has explicit modes:

- `Follow pilot`: follows the interpolated pilot position.
- `Explore freely`: leaves Cesium camera controls alone.

In follow mode, orbit, tilt, and zoom remain usable. During pointer and wheel gestures the camera is not overridden; after the short grace period it settles back onto the pilot while preserving heading, pitch, and range. This matches the requested behaviour: pan can temporarily move the view, then follow recenters on the pilot rather than leaving the marker stranded.

## Performance And Point Count

- IGC B-record count: 11,205 points.
- Cesium path uses full-resolution fixes, not `simplifiedFixes`.
- Unit tests: 45 passed.
- Playwright suite: 26 passed.
- Real-browser smoke: desktop and mobile Cesium loads passed after fixing local Cesium asset serving.
- Build output:
  - Main app JS: 218.69 kB minified, 70.39 kB gzip.
  - Cesium lazy chunk: 4,080.95 kB minified, 1,094.09 kB gzip.
  - Cesium static assets copied: 389 items.

The lazy import prevents Cesium from bloating the initial Google/default shell, but the Cesium route is still a large download. Startup is noticeably heavier than the Google-mocked test path, and mobile tile startup can be slow.

## Mobile Compatibility

Mobile smoke passed at 390 x 844:

- Cesium canvas loaded.
- Pilot marker rendered and stayed visible.
- Follow/explore controls rendered.
- Provider toggle rendered.
- Altitude header overlap was fixed for narrow viewports.
- No console errors in the final mobile diagnostic smoke.

The remaining mobile risk is load/performance rather than basic layout. Cesium should be tested on actual iOS Safari and Android Chrome before any production migration decision.

## Provider And Expected Cost

Current provider choices are:

- Cesium World Terrain.
- Bing Aerial through Cesium ion default global imagery.
- ArcGIS World Imagery through Esri's public World Imagery MapServer.
- MapTiler satellite through `VITE_MAPTILER_API_KEY`, when supplied.

Current Cesium pricing docs list Community as free for individual/personal/non-commercial/evaluation use, with 15 GB streaming/month and 1,000 global imagery sessions/month. Commercial is listed at $149/month individual or $524/month team, with 150 GB streaming/month and 5,000 global imagery sessions/month. Premium is listed at $499/month individual or $874/month team, with 500 GB streaming/month and 10,000 global imagery sessions/month. Cesium says integration into solutions used outside the organization should contact sales.

ArcGIS Location Platform pricing currently lists basemap tiles as 2 million free, then $0.15 per 1,000 tiles, or basemap sessions as 1,000 free, then $4 per 1,000 sessions. Esri requires attribution for ArcGIS basemap/data usage.

MapTiler Cloud currently lists Free as non-commercial with 5,000 sessions/month and 100,000 requests/month; Flex at $25/month with commercial use, 25,000 sessions/month, 500,000 requests/month, extra sessions at $2 per 1,000, and extra requests at $0.10 per 1,000; Unlimited at $295/month with 300,000 sessions/month and 5 million requests/month, with lower overage rates. MapTiler Cloud terms limit the Free plan to non-commercial use and R&D for commercial products.

Sources checked on 2026-07-19:

- https://cesium.com/platform/cesium-ion/pricing/
- https://cesium.com/platform/cesium-ion/content/
- https://location.arcgis.com/pricing/
- https://developers.arcgis.com/rest/static-basemap-tiles/
- https://www.maptiler.com/cloud/pricing/
- https://www.maptiler.com/terms/cloud/

## Imagery Provider Comparison

Comparison setup:

- Same IGC: `igc files/01-2010.IGC`.
- Same Cesium camera position, heading, pitch, and range for each provider.
- Same visual settings for the provider comparison at the time of capture: brightness 0.88, contrast 1.25, saturation 1.35, gamma 1.0, fog off, HDR on, terrain lighting on, terrain SSE 1.4, FOV 45.
- Waited for Cesium detailed tiles before capture when possible.

Results:

- Bing/Cesium ion reached `tilesLoaded=true` and produced a complete scene. The grading adds contrast, but Bing still looks flatter and less locally crisp than Burnair, with a noticeable green/yellow cast at the requested saturation.
- ArcGIS World Imagery loaded without console errors, but did not reach `tilesLoaded=true` within the wait cap in the fixed-camera smoke and showed missing tile regions at this Cesium pose. It is not currently the closest match in this implementation because reliability/detail loading was weaker than Bing.
- MapTiler satellite could not be visually tested locally because `VITE_MAPTILER_API_KEY` is not present. It remains implemented as an optional provider in the control panel and should be tested once a key is added.

Closest tested provider: Bing/Cesium ion, because it produced a complete detailed scene under the same pose. Visually, it still does not fully match Burnair. The provider most likely to challenge it is MapTiler satellite, but that requires a key and a license-compatible plan before we can judge it honestly.

## Google Comparison

The temporary toggle is present and switches the app between Cesium and Google. In this local environment, switching to real Google showed the existing Google 3D map load failure message, likely due to local provider/API access rather than the toggle itself:

`The 3D map failed to load... this API key doesn't have 3D Maps access...`

The existing Playwright suite still tests the Google implementation through the mocked Google route.

## Recommendation

Cesium is worth continuing as a serious candidate, but I would not recommend a full migration yet.

Reasons to continue:

- Terrain-native model is a better foundation for future terrain-compatible annotations.
- Camera control is more explicit and predictable than the current Google follow workaround.
- Full-resolution IGC rendering is feasible for the tested 11,205-point file.
- The provider toggle makes side-by-side evaluation straightforward once Google real-provider access works locally.

Reasons not to migrate immediately:

- Cesium adds a very large lazy-loaded chunk and many static assets.
- Mobile startup/performance needs real-device testing.
- Visual quality is good for terrain analysis but less premium than Google Photorealistic 3D.
- Cesium ion usage/cost needs product-level sizing before production.

Recommended next step: keep this branch as a focused spike, test Cesium and Google side-by-side with valid production provider access on desktop plus real mobile devices, then decide based on visual quality and startup latency.
