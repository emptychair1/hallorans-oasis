# Halloran's Oasis | HOT HANDOFF

## Build blocker repair (2026-10-10)
- Cloudflare build log reported `src/world/ConversationScene.ts(387,3): error TS1128: Declaration or statement expected`.
- Root cause found in the current source: the `if (piper)` block in `populate()` was missing its closing brace after `this.place(...)`. The scene status-label update was accidentally left inside the block, and the class method then closed with unbalanced structure.
- Fixed by closing the `if (piper)` block immediately after placing the avatar. No scene positions, model assets, camera, lighting, pose, or Piper Home integration changed.
- Fix commit: `c3a416d58f6584904156f7c26eab1358b3ddb733`.
- The source-level syntax fix is committed to `main`; a fresh Cloudflare build/deployment has **not yet been verified**. Check the next build log before claiming the blocker is cleared.

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

## Current work: Piper's black dress (Study 10.5)
- Repo: `emptychair1/hallorans-oasis`, branch `main`.
- Avatar pose, chair positions/rotations, table, camera and lighting are frozen for this pass.
- `src/world/ConversationScene.ts` loads `public/assets/models/black_dress.glb` as a separate static GLB and fits it against the posed avatar's bounds.
- The prior fitting used only 43% of avatar height and 62% of avatar width, which is overly restrictive and matches the user's report that the dress looks tiny.
- Study 10.5 increases the fitting targets to 68% of avatar height and 90% of avatar width. This is a focused visual-fit adjustment only; the dress is **not skinned or attached to avatar bones**, and its appearance still needs visual confirmation in the deployed scene.
- Build label is updated to Study 10.5 / Build 10.5.0. A GitHub commit does not prove deployment; confirm the live scene before claiming the visual fix is complete.

## Current work: dress depth fit (Study 10.6)
- User reports the dress size now looks right, but it still appears to sit in Piper's lap rather than on her torso.
- Study 10.6 moves the static dress 5% of avatar width back toward Piper's body by changing the camera-facing depth offset from `-avatarSize.x * 0.035` to `+avatarSize.x * 0.015`.
- This is a placement adjustment only. The dress is still a separate static GLB and will not deform with the seated skeleton; visual verification is still required. Do not alter approved pose, chair, table, camera, or lighting.

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

## Current work: dress laid across Piper's lap (Study 10.7)
- User reports the correctly sized dress remains upright in Piper's lap and blocks her face.
- Study 10.7 rotates the already-sized static dress down onto its side and places its center at seated-lap height, shifted forward over the thighs. This addresses the upright-in-front-of-face failure rather than another small depth nudge.
- Visible status label bumped to Study 10.7 / Build 10.7.0.
- Scene placement commit: 98f252c7c81b8a72a88bc84a30f4ae59fcd568b3. Label commit: 1dfd33500eeee5b86dd0b11668069ba146f38146.
- This is still a static prop, not skinned clothing. Confirm the rendered result before claiming the fit is complete. Do not alter the approved avatar pose, chair, table, camera, or lighting.

## Study 10.8: stop overlaying the separate dress
- User clarified: use the clothes already on Piper's avatar. Do not create a T-shirt or other new outfit.
- Removed the separate static `black_dress.glb` fitting/overlay from `ConversationScene.ts`; Piper now renders with the clothing already included in her avatar model.
- Visible label: Study 10.8 / Build 10.8.0.
- Commit: afe0460e2b09266cfd1df9beac1ae60b9f43866e.
- This removes the failed dress experiment without changing the approved pose, chair, table, camera, or lighting. Deployment/render verification is still pending.
