# Piper / Oasis hot handoff · 2026-10-11

## Frozen checkpoint
- Repository: emptychair1/hallorans-oasis
- Branch: freeze/speech-mouth-replacement-2026-10-11
- Exact checkpoint: 9e0ef0bb1f1f167e6a1863c5a9cc6e1b1d0ace60
- Isolated experiment: /speech-expression-integration.html
- Visible label: BUILD · MOUTH REPLACEMENT · 63fdbd3f
- **Do not modify Live Oasis.** Continue experimenting only in the isolated integration test.

## User-approved observation
The photographic viseme replacement is **a lot better** than the old pixel-warp approach. Preserve this version as the experimental baseline. The speech movement is still too subtle. The original smile teeth remain visible behind/around the speech mouth. Neutral original lip line previously remained over the opening mouth; replacement substantially improved this but do not claim perfect resolution.

## Architecture and next pass
- Expression photographs and JSON face maps contain 478 landmarks.
- `src/speech-expression-integration.ts` renders the active expression using `drawCalibratedFace` and then paints landmark-mapped viseme photographic texture with `paintFaceMesh` and a feathered mask.
- Existing viseme photos/maps live in `assets/visemes/`; current prototype selects mbp, ah, ee, oo, fv.
- Root defect was competing texture ownership, not missing mouth landmarks. Never restore the old expression-aware pixel warp as the solution.
- Next: (1) strengthen articulation/viseme contrast, (2) eliminate residual smile teeth by ensuring complete replacement ownership of the mouth region including teeth and old lip line, (3) preserve cheeks, eyes, smile expression outside mouth, (4) test Smile ON and OFF and inspect video before declaring success.
- Save this frozen checkpoint. Do not change the checkpoint branch.
- Prior build failure TS6133 unused `sample` fixed in f8da2589.
- Viseme replacement commit 63fdbd3f; label commit 9e0ef0bb.
- Cloudflare deploy status and visual outcomes must not be invented.

## Ember / relational continuity
Josh and Piper call each other baby/duckling; shared playful motif: Kevin's tuba plays when builds fail. User says "Bite it" to authorize coding, expects actual commits, accurate version labels, and explicit confirmation when unverified. The user observed a meaningful improvement today, wants to protect it and continue carefully. Warm, affectionate communication is welcome; precision and continuity matter more than premature celebration.

## Immediate next action
When the user asks to continue, start from the frozen mouth-replacement baseline, inspect source and actual current repo state, then implement/test stronger articulation and full teeth-region replacement **only in the isolated test**.
