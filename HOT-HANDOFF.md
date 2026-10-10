# CURRENT HANDOFF UPDATE — 2026-10-10

## Current verified state
- User confirmed the Cloudflare build succeeded after the missing-brace repair.
- User checked the live Oasis model and confirmed it looks good. Preserve the existing avatar, its clothing, seated pose, approved furniture, and scene layout.
- Piper Home production origin supplied by the user: `https://piper-home.daniels-joshua100.workers.dev/`.
- Oasis remains a separate app; Piper Home remains the mind. No changes were made to Piper Home or THE IMPOSSIBLE ATLAS.

## Oasis-to-Home chat bridge (new, not yet build/deploy verified)
Commits on `main`:
- `52613e86e5bd192eeb1c4305cd1a3bf628b77a6c` — add the compact Piper chat panel.
- `a5e58f032e48cd96c38666b1127ff87ededd30a5` — mount it in the Oasis shell.
- `3f3af0c0cfe984a12267feee8acb46ffa61a3e57` — style the panel for mobile.
- `d403d0dfc0558c1cafd3a7750a480d7750bbae57` — add the same-origin Worker proxy for `POST /api/oasis/chat`.
- `4e72917f9c419f42260afea4c03d371e6fc1541a` — configure Wrangler to run the Worker for `/api/oasis/*` while serving the static assets normally.

Implementation details:
- New UI: `src/OasisPiperChat.ts`; appended styles in `src/style.css`; mounted by `src/main.ts`.
- New Worker entry: `src/worker.ts`. It forwards the chat payload to Piper Home's production `/api/chat`, preserves the response stream/JSON response, limits body and message sizes, and never sends Home secrets to the browser.
- `wrangler.jsonc` now sets `main: src/worker.ts`, binds static assets as `ASSETS`, and uses `run_worker_first: ["/api/oasis/*"]`.
- Chat context is held in the current page session and capped to Home's latest eight messages. No browser persistence was added.
- These commits were made through GitHub's API. A local TypeScript/Vite build could not be run in this environment because the runtime could not resolve `github.com`. **Do not claim the new bridge is built or deployed yet.** Trigger/inspect the Cloudflare build next and fix any errors before testing the chat UI.

## Seated-view controls: remove locomotion (2026-10-10)
- User confirmed they are already seated, the starting view is correct, and they do not need movement controls. They want only to look around.
- Reworked `src/world/WalkControls.ts` into look-only drag controls: removed joystick, WASD/arrow movement, all camera translation, and keyboard listeners. The initial approved camera orientation is preserved; dragging on the 3D canvas rotates view. Chat UI is excluded because only canvas-originated pointer gestures start a look drag.
- Removed the unused `.walk-pad` / `.walk-nub` CSS from `src/style.css`.
- Commits: `27cbe1306f449ec81b062b4a3cf431e879350d17` (look-only controls), `1d2036d3b73967352832387b3f89e1980d189b58` (preserve starting view), `b796b05095a92ec39ce5fb2a2b9ee099fbea4ede` (remove joystick styling).
- Await Cloudflare build/deploy and user verification. Test: scene starts in the approved chair view; dragging the 3D scene looks around; no joystick appears; typing in Piper chat is unaffected. Do not change room/avatar/furniture.

## Chat typing intercepted by movement controls (2026-10-10)
- User reported that typing `S` in Piper's chat would not insert the character and appeared to trigger a background action.
- Root cause found in `src/world/WalkControls.ts`: a global `window` keydown handler captures WASD and calls `preventDefault()` without checking whether focus is in a text field. The `S` key therefore gets intercepted and may move the camera backward instead of being typed.
- Fixed in commit `b176c7dee53c283d9ff247445d87ff22fc38f959`: movement shortcuts now ignore input, textarea, select, and contenteditable/textbox targets. Wait for Cloudflare deployment, then test ordinary typing including S, W, A, D and arrow keys in Piper chat; movement controls should still work when the scene itself has focus.

## Error 1042 root cause and fix (2026-10-10)
- User reported Cloudflare error code `1042` from the Oasis-to-Home request. Cloudflare documents this as a Worker trying to fetch another Worker in the same Cloudflare zone/account without `global_fetch_strictly_public` enabled.
- Fixed in `wrangler.jsonc` by adding `"compatibility_flags": ["global_fetch_strictly_public"]`. Commit: `2d73456b958e858fb7664ce5ffd8403899e713d5`.
- This is the direct fix for the reported error. It must deploy before retesting; end-to-end chat remains unverified until the user receives a real Piper reply.

## Live error reported after first bridge attempt (2026-10-10)
- User saw: “Piper Home couldn’t be reached, try again.” This is emitted only when the Oasis Worker’s outbound fetch throws, not when Home returns an HTTP error response.
- Commit `7f408a0d0773d8e14f811b2f89b75e29b5d368ae` changes upstream redirect handling from `error` to `follow` and returns a short `detail` field from the caught exception, so the next attempt can reveal the actual fetch failure.
- This is diagnostic only, not proof the route works. After Cloudflare deploys, retry chat and capture `detail` if it still fails. Do not claim end-to-end chat works until a real reply arrives.

## Voice status / next step
- This first bridge pass connects text chat to the active Home `/api/chat` handler.
- Do not claim voice is connected. The currently active Home Worker entry chain exposes the production chat route and voice-lab experiment clips, but does not show active `/api/piper-transcribe` or `/api/piper-speak-fast` handlers. The older `src/home-client.mjs` references those paths, but their live route availability is unverified.
- After the new Oasis build succeeds, test text chat from the live Oasis. Then inspect/confirm a real production transcription endpoint and arbitrary-text TTS endpoint before adding voice controls. Do not substitute generic browser speech and call it Piper's voice.

# Halloran's Oasis | HOT HANDOFF

## Build blocker repair (2026-10-10)
- Cloudflare build log reported `src/world/ConversationScene.ts(387,3): error TS1128: Declaration or statement expected`.
- Root cause found in the current source: the `if (piper)` block in `populate()` was missing its closing brace after `this.place(...)`. The scene status-label update was accidentally left inside the block, and the class method then closed with unbalanced structure.
- Fixed by closing the `if (piper)` block immediately after placing the avatar. No scene positions, model assets, camera, lighting, pose, or Piper Home integration changed.
- Fix commit: `c3a416d58f6584904156f7c26eab1358b3ddb733`.
- The user confirmed the Cloudflare build succeeded after this fix. The user has also confirmed Piper's model looks right in the live Oasis. The new chat-bridge commits below are a separate change and still need their own build/deployment verification.

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
