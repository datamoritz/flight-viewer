# Manual real-GPU Google Maps smoke test

The automated Playwright suite (`npm run test:e2e`) mocks the entire
`google.maps.maps3d` boundary, so it verifies **application behavior** but not
Google's actual rendering. The behaviors below can only be confirmed against
the real API on a machine with a working GPU — run this checklist after any
change that touches `src/components/map/` or upgrades the Maps API channel.

## Prerequisites

- A real API key in `.env.local` (`VITE_GOOGLE_MAPS_API_KEY`), with Maps
  JavaScript API enabled and 3D Maps access.
- Desktop Chrome with hardware acceleration ON
  (`chrome://settings` → System → "Use graphics acceleration when available").
- `npm run dev`, open the printed URL.
- A real IGC file (e.g. `igc files/01-2010.IGC`).

## Checklist

### Load & render
- [ ] Map renders real satellite terrain (not black); Google attribution visible bottom-left.
- [ ] Google's old "alpha channel" development banner does not appear.
- [ ] Empty-state card is visible over the map before any file is loaded.
- [ ] DevTools console: no Maps API errors.

### Flight display
- [ ] Upload the IGC (drag-drop *and* button). Camera flies to frame the whole flight (~3 s).
- [ ] The 3D track is **not** drawn all at once: at the start only a stub near the pilot is visible; it grows along the terrain as playback advances.
- [ ] Track renders at altitude (not clamped to ground) in vario colors:
      purple/blue sink → yellow level → orange/red/pink climb. Colors change
      along the track where the profile shows climbs vs sinks. Line is thin.
- [ ] Track remains visible through terrain when the camera looks from behind a ridge (`drawsOccludedSegments`).
- [ ] Pilot marker: pointed red tip at the pilot, short black bar rising above, small red cap on top.
- [ ] Pilot name reads bottom-to-top along the marker, with a subtle altitude readout glued to the marker.
- [ ] Altitude profile is translucent (terrain shows through) with horizontal gridlines every 500 m on round numbers.

### Playback
- [ ] Play: pole glides smoothly along the track and the track grows behind it; altitude readout counts up/down; no stutter at 30×.
- [ ] Altitude readout updates continuously during playback **and** while scrubbing.
- [ ] Scrub backward: the later portion of the 3D track disappears again, matching the new time.
- [ ] Pause freezes everything; resume continues from the same spot.
- [ ] Playback stops exactly at the last fix at 60×.

### Camera (always-follow — no follow/explore button)
- [ ] The pilot stays fixed on screen; only the landscape moves around it.
- [ ] Orbit (drag), tilt, and zoom with the mouse/trackpad: the view angle/distance changes stick, and the camera keeps tracking the pilot. It never "snaps back" to a default angle or fights your input.
- [ ] Pan slightly: the pilot stays at the new chosen screen position, and playback keeps following there. No snap-back to center.
- [ ] On-screen controls (top-right): **N** faces north; rotate L/R, tilt up/down, zoom +/− each step once on click and **repeat while held**. All keep the pilot at the chosen screen position.
- [ ] Scrub far across the flight: camera glides/jumps to the new pilot position while preserving the chosen screen offset.

### Touch (device or DevTools device emulation)
- [ ] One-finger drag on the profile scrubs; it does not pan the map underneath.
- [ ] Dragging the profile's top handle resizes the panel; it does not scrub or pan.
- [ ] On-screen camera-control buttons respond to taps and press-and-hold.
- [ ] Map gestures (pan/pinch/two-finger tilt) still work outside the panel.
- [ ] No pull-to-refresh / page bounce while interacting.

### Failure modes (optional, real-API)
- [ ] Turn hardware acceleration OFF and reload: friendly in-app error (not a silent black map). Turn it back on afterwards.
- [ ] Temporarily corrupt the key in `.env.local` and restart: friendly key-rejection error appears.

## Known 3D Maps API limitations (expected, not bugs)

- Older deployments using `v=alpha` show Google's development-only banner; current builds use `v=weekly`.
- Native marker labels don't reliably repaint after property updates, so the pilot readout is custom `MarkerElement` content instead.
- `flyCameraTo` reports its final `center` as a terrain ground-point, not the exact requested target.
- Camera gesture events (`gmp-centerchange` etc.) fire identically for pan, orbit, and zoom — user intent cannot be inferred from them. Because programmatic `center` writes also interrupt an in-progress user gesture, the always-follow loop suspends its writes while a pointer is down on the map (and briefly after) so gestures win, then preserves the resulting camera offset.
- 3D Maps requires hardware acceleration; software/headless rendering fails with `gmp-error`.
