# MJ talking-avatar source preflight

The purchased ZIP contains `Fbx/MJ-blender.fbx` (25,995,280 bytes), `Blender/MJ.blend`, and a `Texture/` directory.

The FBX has a valid Kaydara binary FBX header and includes `BlendShapeChannel` records. Facial names confirmed present in its binary data include `Mouth_Open`, `Mouth_Pucker`, `Mouth_Plosive`, `Eye_Blink`, and `Tongue_Out`.

This **does not** prove that Blender has exported a functional GLB or that Three.js has loaded morph targets. The approved live Study 10.1 character must not be replaced until that is verified.

Run `tools/convert_mj_to_glb.py` using Blender with the purchased ZIP extracted locally. Then inspect the generated `mj_talking_audition.rig-report.json` and GLB in an isolated preview before switching the character asset. Do not commit the purchased source files publicly.
