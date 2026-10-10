"""Convert Challento's MJ FBX into a facial-rig-preserving GLB with Blender 4.x.

Usage (after extracting the purchased ZIP):
  blender --background --python tools/convert_mj_to_glb.py -- \
    "/path/to/extracted/Fbx/MJ-blender.fbx" \
    "/path/to/extracted/Texture" \
    "public/assets/models/mj_talking_audition.glb"

This is an OFFLINE conversion only. It never replaces the approved live character.
"""
import bpy
import json
import os
import sys
from pathlib import Path

args = sys.argv[sys.argv.index("--") + 1:]
if len(args) != 3:
    raise SystemExit("Expected: FBX_PATH TEXTURE_DIRECTORY OUTPUT_GLB")
fbx, textures, output = map(Path, args)
if not fbx.is_file() or not textures.is_dir():
    raise SystemExit("FBX or Texture directory missing")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(fbx.resolve()), use_anim=True)

# Preserve the original rig and shape keys. Search external textures by basename,
# but do not invent a replacement when a texture is missing.
texture_index = {}
for file in textures.rglob("*"):
    if file.is_file():
        texture_index.setdefault(file.name.lower(), file)
for image in bpy.data.images:
    if image.source != "FILE":
        continue
    existing = Path(bpy.path.abspath(image.filepath))
    if existing.is_file():
        continue
    match = texture_index.get(existing.name.lower())
    if match:
        image.filepath = str(match.resolve())
        image.reload()

morphs = {}
for obj in bpy.data.objects:
    if obj.type == "MESH" and obj.data.shape_keys:
        morphs[obj.name] = [key.name for key in obj.data.shape_keys.key_blocks if key.name != "Basis"]
bones = {
    obj.name: [bone.name for bone in obj.data.bones]
    for obj in bpy.data.objects if obj.type == "ARMATURE"
}
report = {"morphs": morphs, "armatures": bones, "animations": list(bpy.data.actions.keys())}
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(output.resolve()), export_format="GLB",
    export_apply=False, export_skins=True, export_morph=True,
    export_morph_normal=True, export_animations=True,
    export_image_format="AUTO",
)
report_path = output.with_suffix(".rig-report.json")
report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
print("GLB:", output, "bytes:", output.stat().st_size)
print("Rig report:", report_path)
if not morphs:
    raise SystemExit("ERROR: no shape keys in imported FBX; inspect the source before using this GLB.")
