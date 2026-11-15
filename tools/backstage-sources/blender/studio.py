"""WP3.8: Blender Studio's characters (CC BY 4.0) for Backstage, headless, in Blender (spec 17, section 3).

Run by the assets repository's "Blender Studio characters" workflow. Blender is a GPL build tool and
is never linked into the app (CLAUDE.md, rule 8); the characters keep their own licence, credited
"(CC) Blender Foundation | studio.blender.org".

    blender -b <file.blend> --python-exit-code 1 --python studio.py -- inspect <report.json> <picture.png>

`inspect` describes what the file holds, so the export can be written for it: its collections and
objects, each mesh's size before and after its modifiers, the skeletons and their deforming bones,
the materials and their pictures, hair, shape keys and linked libraries. It also renders the
visible meshes from the front in Workbench, flat and quick, to see which is the character.
"""

import json
import math
import sys

import bpy
import numpy as np
from mathutils import Vector


def mesh_entry(obj, depsgraph):
    entry = {
        "name": obj.name,
        "parent": obj.parent.name if obj.parent else None,
        "collections": [c.name for c in obj.users_collection],
        "hidden": obj.hide_render or obj.hide_get(),
        "vertices": len(obj.data.vertices),
        "faces": len(obj.data.polygons),
        "triangles": sum(len(p.vertices) - 2 for p in obj.data.polygons),
        "modifiers": [
            {"type": m.type, "name": m.name, "show_render": m.show_render}
            | ({"levels": m.levels, "render_levels": m.render_levels} if m.type == "SUBSURF" else {})
            | ({"object": m.object.name if m.object else None} if m.type == "ARMATURE" else {})
            for m in obj.modifiers
        ],
        "vertexGroups": len(obj.vertex_groups),
        "shapeKeys": len(obj.data.shape_keys.key_blocks) if obj.data.shape_keys else 0,
        "materials": [s.material.name if s.material else None for s in obj.material_slots],
        "hair": [p.settings.type for p in obj.particle_systems],
        "uvLayers": len(obj.data.uv_layers),
    }
    try:
        ev = obj.evaluated_get(depsgraph)
        m = ev.to_mesh()
        m.calc_loop_triangles()
        entry["evaluatedTriangles"] = len(m.loop_triangles)
        ev.to_mesh_clear()
    except Exception as e:  # a modifier the headless Blender can't evaluate is reported, not fatal
        entry["evaluatedTriangles"] = f"error: {e}"
    return entry


def armature_entry(obj):
    bones = obj.data.bones
    return {
        "name": obj.name,
        "collections": [c.name for c in obj.users_collection],
        "bones": len(bones),
        "deforming": [b.name for b in bones if b.use_deform],
        "roots": [b.name for b in bones if b.parent is None],
    }


def material_entry(mat):
    if not mat.use_nodes or not mat.node_tree:
        return {"name": mat.name, "nodes": None}
    types = {}
    for n in mat.node_tree.nodes:
        types[n.bl_idname] = types.get(n.bl_idname, 0) + 1
    images = [
        {"image": n.image.name, "size": list(n.image.size), "file": n.image.filepath}
        for n in mat.node_tree.nodes
        if n.bl_idname == "ShaderNodeTexImage" and n.image
    ]
    return {"name": mat.name, "nodes": types, "images": images}


def collection_tree(c, depth=0):
    return {
        "name": c.name,
        "objects": len(c.objects),
        "children": [collection_tree(ch, depth + 1) for ch in c.children],
    }


def render_front(png):
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH" and o.visible_get()]
    if not meshes:
        return "no visible meshes"
    pts = []
    for o in meshes:
        for corner in o.bound_box:
            pts.append(o.matrix_world @ Vector(corner))
    pts = np.array([tuple(p) for p in pts])
    lo, hi = pts.min(0), pts.max(0)
    camera = bpy.data.objects.new("inspect-camera", bpy.data.cameras.new("inspect-camera"))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(hi[2] - lo[2], hi[0] - lo[0]) * 1.1
    camera.data.clip_end = 10000
    middle = (lo + hi) / 2
    camera.location = (middle[0], lo[1] - 10 * max(1, hi[2] - lo[2]), middle[2])
    camera.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = 600
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)
    return {"low": lo.round(3).tolist(), "high": hi.round(3).tolist()}


def inspect(report_path, png):
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    report = {
        "file": bpy.data.filepath,
        "blender": bpy.app.version_string,
        "fileVersion": list(bpy.data.version),
        "scenes": [s.name for s in bpy.data.scenes],
        "scene": scene.name,
        "unit": {"system": scene.unit_settings.system, "scale": scene.unit_settings.scale_length},
        "libraries": [lib.filepath for lib in bpy.data.libraries],
        "collections": collection_tree(scene.collection),
        "meshes": [mesh_entry(o, depsgraph) for o in scene.objects if o.type == "MESH"],
        "armatures": [armature_entry(o) for o in scene.objects if o.type == "ARMATURE"],
        "others": sorted({f"{o.type}" for o in scene.objects} - {"MESH", "ARMATURE"}),
        "curves": [o.name for o in scene.objects if o.type in ("CURVES", "CURVE")],
        "materials": [material_entry(m) for m in bpy.data.materials if m.users],
        "images": [
            {"name": i.name, "size": list(i.size), "file": i.filepath, "packed": i.packed_file is not None}
            for i in bpy.data.images
            if i.users
        ],
    }
    try:
        report["picture"] = render_front(png)
    except Exception as e:  # the report matters more than the picture
        report["picture"] = f"error: {e}"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    total = sum(m["evaluatedTriangles"] for m in report["meshes"] if isinstance(m["evaluatedTriangles"], int))
    print(f"inspected {bpy.data.filepath}: {len(report['meshes'])} meshes, {total} triangles evaluated", flush=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if args[0] == "inspect":
        inspect(args[1], args[2])
    else:
        raise SystemExit(f"Unknown step {args[0]}: use inspect")


main()
