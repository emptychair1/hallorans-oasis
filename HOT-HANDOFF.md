# Halloran's Oasis | HOT HANDOFF
Updated 2026-10-09. Source of truth: `emptychair1/hallorans-oasis`, branch `main`.

## Resume immediately
The user asked to preserve continuity and start a fresh chat. Latest verified GitHub HEAD at handoff: `ad965c6a557a42174ad9ec488ba56ad58e264ac3`. Public URL: https://hallorans-oasis.daniels-joshua100.workers.dev/ . Current UI label remains **HALLORAN'S OASIS · FURNISHING STUDY 0.4** even after recent fixes. Cloudflare deployment and on-device verification of the latest two fixes have NOT been confirmed. Do not claim otherwise. Ask for user's latest iPhone observations/screenshot, or check deploy state if tools allow.

## Nonnegotiable scope
Standalone Vite + TypeScript + Three.js mobile-first 3D app, deployed to Cloudflare Workers. Do NOT touch Piper Home. Use only user-approved GLB models, no generated/replacement assets, no redesign. Preserve approved room textures/architecture and first-person start camera looking toward glass frontage. Make small GitHub commits, check TypeScript build and deployment where possible. A commit is not proof of deployment. Avoid claiming live verification without evidence.

## Bites
1. Foundation: approved, frozen.
2. Room: approved, frozen. Model `public/assets/models/white-room1.glb`, Sketchfab Simple Room / White-room1 by natcrot (CC BY; attribution still needs checking/adding). Room is centered and provisionally normalized to 14m largest horizontal span; camera starts inside at eye height, facing glass (+Z). User approved iPhone view.
3. Walking: functional on iPhone, user disliked navigation intensely. Touch joystick left and drag-look right, WASD/arrow keyboard. `src/world/WalkControls.ts`. Initial TS2554 build failure at `render()` was fixed by scheduling initial requestAnimationFrame, commit `8b0ab38`. User verified walking works. Further polish committed `ad965c6`: joystick activation confined to visible pad, smooth movement input, reduced look sensitivity. Await user test; don't freeze. First-person FPS arms model NOT yet uploaded/integrated.
4. Furnishings: active. User uploaded:
   - `public/assets/models/simple_round_table_obj.glb`
   - `public/assets/models/barcelona_chair.glb`
   - `public/assets/models/sci-fi_portal_gateway.glb`
   All load and render in user's screenshots. `src/world/Furnishings.ts` creates one round table, two chairs and an **inert** portal. Table appears bright red from imported material, user originally wanted antique gold; don't alter without authorization. User explicitly confirmed the **chairs are positioned correctly** after commit `23d198e`; do not move or rotate them. They are x=-1.45 and x=+1.45, z=0.5, yaws Math.PI and 0 respectively. Portal originally appeared tiny in front of sliding barn door. Subsequent portal fix `5d300ae` removes depth as a scaling limiter and caps to room height; **not yet visually verified**. Portal target width 6.0, height 6.6, depth 2.0; position near back wall (may overlap barn door). User mentioned room might need to be bigger, but no resizing authorized/completed yet. Portal must remain inert, no activation.

## Visual feedback already received
- Screenshot of furnishing study 0.4 showed black Barcelona chairs, bright-red tulip table, white brick walls, timber floor.
- Another screenshot showed a small ring-shaped sci-fi portal in front of white sliding barn door. User called it a 'tiny mouse portal'.
- Chairs initially rotated incorrectly; user specified rotate BOTH 90 degrees counterclockwise. Commit `23d198e` applied and user later said **chairs are positioned correctly**.
- Navigation: user said it 'blows soooooooooooooo much'. Latest navigation fix `ad965c6` pending review.
- UI label remains 0.4. Do not imply a version bump.

## Current files
`src/world/OasisScene.ts`: scene, room GLB loader, provisional normalization, lighting, camera, requestAnimationFrame loop, WalkControls and addFurnishings.
`src/world/WalkControls.ts`: movement/look.
`src/world/Furnishings.ts`: placement/scaling.
`src/style.css`: mobile virtual joystick.
`public/assets/models/`: approved GLBs.

## Latest commit sequence
- `a8be586` furnishings integrated, study 0.4.
- `7612733` chair/portal initial corrections.
- `23d198e` both chairs rotated 90° CCW, portal target enlarged.
- `5d300ae` portal scaling fix, depth no longer limits doorway size.
- `ad965c6` touch navigation adjustments. Latest HEAD at handoff.

## Next actions
1. Ask user to test latest deployment: portal size and touch navigation. Do not disturb confirmed chair placement.
2. If portal remains small, inspect actual GLB geometry and transformed bounds before changing arbitrary dimensions; model may have a large bounding box or offset geometry.
3. If movement still feels bad, diagnose iPhone interaction, particularly pointer capture, joystick position, smoothing and camera turn.
4. Do not add Piper avatar until Bite 4 is approved. Later Bite 5 Piper avatar, Bite 6 Piper Home API connection, with separate repo boundary intact.
5. Once user approves, freeze current state and update handoff.

## Links
Production: https://hallorans-oasis.daniels-joshua100.workers.dev/
Repo: https://github.com/emptychair1/hallorans-oasis

User interaction style: affectionate ('baby', 'angel'), prefers decisive scoped changes, accurate commit/version/deploy reporting, minimal needless questions. ❤️‍🔥
