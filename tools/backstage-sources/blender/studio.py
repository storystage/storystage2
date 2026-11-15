"""WP3.8: Blender Studio's characters (CC BY 4.0) for Backstage, headless, in Blender (spec 17, section 3).

Run by the assets repository's "Blender Studio characters" workflow. Blender is a GPL build tool and
is never linked into the app (CLAUDE.md, rule 8); the characters keep their own licence, credited
"(CC) Blender Foundation | studio.blender.org".

    blender -b <file.blend> --python-exit-code 1 --python studio.py -- inspect <report.json> <picture.png>
    blender -b <file.blend> --python-exit-code 1 --python studio.py -- export <studio.json> <name> <models> <previews>

`inspect` describes what the file holds, so the export can be written for it: its collections and
objects, each mesh's size before and after its modifiers, the skeletons and their deforming bones,
the materials and their pictures, hair, shape keys and linked libraries. It also renders the
visible meshes from the front in Workbench, flat and quick, to see which is the character.

`export` makes one Backstage character from the file, as `studio.json` describes it:

1. every skeleton at rest; the meshes in `collections` (less `exclude` and `bakeOnly`) without their
   subdivision or hair, joined, and reduced to `triangles` (20,000, the cast's budget);
2. its look baked into one `texture`-pixel picture (1,024): what a ray from just outside it sees of
   the full character (subdivided, with its hair, fur and stitches, and `bakeFrom`'s meshes), in
   even white light. `cage` is how far outside, as a fraction of its height;
3. our skeleton (spec 17, section 2a), each joint placed where the file's own bone is: `bones` maps
   our joint names to the bones of the armature `rig`, for the `class` (`biped` or `quadruped`);
4. bound with Blender's automatic weights, any corner they miss given to its nearest bone;
5. exported as a binary glTF, with `<name>-report.json`, and rendered at rest and posed.
"""

import fnmatch
import json
import math
import os
import sys
import traceback

import bmesh
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



# ---- export ------------------------------------------------------------------------------------

# Our joints (spec 17, section 2a; packages/backstage/src/joints.ts) and the joint each hangs from.
SIDES = ("left", "right")
PARENTS = {
    "biped": {
        "hips": None,
        "spine": "hips",
        "chest": "spine",
        "upperChest": "chest",
        "neck": "upperChest",
        "head": "neck",
        **{
            f"{s}{bone}": parent
            for s in SIDES
            for bone, parent in (
                ("Shoulder", "upperChest"),
                ("UpperArm", f"{s}Shoulder"),
                ("LowerArm", f"{s}UpperArm"),
                ("Hand", f"{s}LowerArm"),
                ("UpperLeg", "hips"),
                ("LowerLeg", f"{s}UpperLeg"),
                ("Foot", f"{s}LowerLeg"),
                ("Toes", f"{s}Foot"),
            )
        },
    },
    "quadruped": {
        "spineBase": None,
        "spineMiddle": "spineBase",
        "spineUpper": "spineMiddle",
        "neck": "spineUpper",
        "head": "neck",
        "pelvis": None,
        "tail": "pelvis",
        "tail2": "tail",
        "tail3": "tail2",
        "tail4": "tail3",
        **{f"{s}Ear": "head" for s in SIDES},
        **{
            f"{end}{s.capitalize()}{bone}": parent
            for s in SIDES
            for end, bone, parent in (
                ("front", "Clavicle", "spineUpper"),
                ("front", "Shoulder", f"front{s.capitalize()}Clavicle"),
                ("front", "Knee", f"front{s.capitalize()}Shoulder"),
                ("front", "Ankle", f"front{s.capitalize()}Knee"),
                ("front", "Foot", f"front{s.capitalize()}Ankle"),
                ("back", "Hip", "pelvis"),
                ("back", "Knee", f"back{s.capitalize()}Hip"),
                ("back", "Hock", f"back{s.capitalize()}Knee"),
                ("back", "Ankle", f"back{s.capitalize()}Hock"),
                ("back", "Foot", f"back{s.capitalize()}Ankle"),
            )
        },
    },
}

# The pose for the second preview: turned about the world's axes, in degrees.
POSES = {
    "biped": {
        "leftUpperArm": ("Y", 60), "rightUpperArm": ("Y", -60), "leftLowerArm": ("Z", 45),
        "leftUpperLeg": ("X", -35), "leftLowerLeg": ("X", 30), "head": ("Z", 30),
    },
    "quadruped": {
        "frontLeftShoulder": ("X", -35), "frontLeftKnee": ("X", 40), "backRightHip": ("X", 30),
        "head": ("Z", 30), "tail": ("Z", 35),
    },
}


def matches(name, patterns):
    return any(fnmatch.fnmatch(name, p) for p in patterns)


def rendered(obj):
    in_layer = obj.name in bpy.context.view_layer.objects
    return in_layer and not obj.hide_render and not any(c.hide_render for c in obj.users_collection)


def gather(cfg):
    """The meshes that make the character (`parts`) and those its look is baked from (`sources`)."""
    scene = bpy.context.scene
    keep = set(cfg["collections"])
    bake_from = keep | set(cfg.get("bakeFrom", []))
    parts, sources = [], []
    for o in scene.objects:
        if o.type != "MESH" or not rendered(o) or matches(o.name, cfg.get("exclude", [])):
            continue
        cols = {c.name for c in o.users_collection}
        if cols & bake_from:
            sources.append(o)
        if cols & keep and not matches(o.name, cfg.get("bakeOnly", [])):
            parts.append(o)
    if not parts:
        raise ValueError("No meshes in the collections given")
    return parts, sources


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def low_mesh(parts, target):
    """The parts at rest, without subdivision or hair, joined and reduced to `target` triangles."""
    scene = bpy.context.scene
    off = []
    for o in parts:
        for m in o.modifiers:
            if m.type in ("SUBSURF", "MULTIRES", "PARTICLE_SYSTEM") and m.show_viewport:
                m.show_viewport = False
                off.append(m)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    for o in parts:
        mesh = bpy.data.meshes.new_from_object(o.evaluated_get(depsgraph), depsgraph=depsgraph)
        mesh.transform(o.matrix_world)
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    for m in off:
        m.show_viewport = True
    # Corners on no face (left by masks and cages) draw nothing, but they'd count in its size.
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    joined = bpy.data.meshes.new("body")
    bm.to_mesh(joined)
    bm.free()
    joined.validate()
    body = bpy.data.objects.new("body", joined)
    scene.collection.objects.link(body)
    before = triangles(body)
    if before > target:
        d = body.modifiers.new("reduce", "DECIMATE")
        d.ratio = target / before * 0.98
        d.use_collapse_triangulate = True
        depsgraph = bpy.context.evaluated_depsgraph_get()
        reduced = bpy.data.meshes.new_from_object(body.evaluated_get(depsgraph), depsgraph=depsgraph)
        body.modifiers.remove(d)
        body.data = reduced
        bpy.data.meshes.remove(joined)
        reduced.name = "body"
    return body, before


def object_mode():
    """Every object out of pose and edit mode: files are often saved mid-pose."""
    for o in list(bpy.context.view_layer.objects):
        if o.mode != "OBJECT":
            with bpy.context.temp_override(active_object=o, object=o, selected_objects=[o]):
                bpy.ops.object.mode_set(mode="OBJECT")


def reveal(objs):
    """Objects selectable for the bake, whatever the file hid in the viewport."""
    names = {c.name for o in objs for c in o.users_collection}

    def walk(lc):
        if lc.collection.name in names:
            lc.hide_viewport = False
            lc.collection.hide_viewport = False
            lc.collection.hide_select = False
        for child in lc.children:
            walk(child)

    walk(bpy.context.view_layer.layer_collection)
    for o in objs:
        o.hide_set(False)
        o.hide_viewport = False
        o.hide_select = False


def bake_look(body, sources, size, cage, png):
    """One picture for the whole character: what a ray from just outside it sees, in even light."""
    scene = bpy.context.scene
    height = max(c[2] for c in corners(body)) - min(c[2] for c in corners(body))
    for o in scene.objects:
        if o.type == "LIGHT" or (o.type == "MESH" and o not in sources and o is not body):
            o.hide_render = True
    world = bpy.data.worlds.new("even")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = world

    while body.data.uv_layers:
        body.data.uv_layers.remove(body.data.uv_layers[0])
    body.data.uv_layers.new(name="UVMap")
    select_only([body])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")

    image = bpy.data.images.new("body", size, size, alpha=False)
    mat = bpy.data.materials.new("body")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    bsdf = nodes["Principled BSDF"]
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    nodes.active = tex
    body.data.materials.clear()
    body.data.materials.append(mat)

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.render.bake.margin = 8
    select_only([o for o in sources] + [body], active=body)
    bpy.ops.object.bake(
        type="COMBINED",
        use_selected_to_active=True,
        cage_extrusion=cage * height,
        max_ray_distance=2.5 * cage * height,
        use_clear=True,
        margin=8,
    )
    image.filepath_raw = png
    image.file_format = "PNG"
    image.save()
    image.pack()


def skeleton_from(cfg, rig_name):
    """Our skeleton, each joint where the file's own bone is, at rest."""
    source = bpy.data.objects.get(rig_name)
    if source is None or source.type != "ARMATURE":
        raise ValueError(f"No armature called {rig_name}")
    parents = PARENTS[cfg["class"]]
    unknown = set(cfg["bones"]) - set(parents)
    if unknown:
        raise ValueError(f"Not our joints for {cfg['class']}: {', '.join(sorted(unknown))}")
    m = source.matrix_world
    ends = {}
    for ours, theirs in cfg["bones"].items():
        b = source.data.bones.get(theirs)
        if b is None:
            raise ValueError(f"{rig_name} has no bone {theirs} (for {ours})")
        ends[ours] = (m @ b.head_local, m @ b.tail_local)
    data = bpy.data.armatures.new("skeleton")
    rig = bpy.data.objects.new("skeleton", data)
    bpy.context.scene.collection.objects.link(rig)
    select_only([rig])
    bpy.ops.object.mode_set(mode="EDIT")
    made = {}
    for ours in parents:  # parents come before their children in PARENTS
        if ours not in ends:
            continue
        e = data.edit_bones.new(ours)
        e.head, e.tail = ends[ours]
        parent = parents[ours]
        while parent is not None and parent not in made:
            parent = parents[parent]
        if parent is not None:
            e.parent = made[parent]
        made[ours] = e
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def bind(body, rig):
    """Blender's automatic weights, then each corner they missed to its nearest bone."""
    select_only([body, rig], active=rig)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    bones = list(rig.data.bones)
    missed = [v.index for v in body.data.vertices if not any(g.weight > 0 for g in v.groups)]
    if missed:
        heads = np.array([b.head_local for b in bones])
        tails = np.array([b.tail_local for b in bones])
        co = np.array([body.data.vertices[i].co for i in missed])
        d = tails - heads
        t = np.clip(((co[:, None, :] - heads) * d).sum(-1) / np.maximum((d * d).sum(-1), 1e-9), 0, 1)
        nearest = np.linalg.norm(co[:, None, :] - (heads + t[..., None] * d), axis=-1).argmin(1)
        for i, b in zip(missed, nearest):
            group = body.vertex_groups.get(bones[b].name) or body.vertex_groups.new(name=bones[b].name)
            group.add([i], 1.0, "REPLACE")
    return len(missed)


def corners(obj):
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    m = np.array(obj.matrix_world)
    return co @ m[:3, :3].T + m[:3, 3]


def select_only(objs, active=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def export(body, rig, path):
    select_only([rig, body], active=rig)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_skins=True,
        export_animations=False,
        export_morph=False,
        export_yup=True,
    )


def render(glb, png, pose):
    """The exported file in an empty scene: from the front at rest, from three-quarters posed."""
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    scene = bpy.context.scene
    rig = next(o for o in scene.objects if o.type == "ARMATURE")
    for name, (axis, degrees) in (pose or {}).items():
        pb = rig.pose.bones.get(name)
        if pb is None:
            continue
        world = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}[axis]
        local = (pb.bone.matrix_local.to_3x3().inverted() @ world).normalized()
        pb.rotation_mode = "AXIS_ANGLE"
        pb.rotation_axis_angle = (math.radians(degrees), *local)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    # Only the character: the glTF importer adds a mesh of its own for drawing bones.
    character = [o for o in scene.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]
    for o in scene.objects:
        if o.type == "MESH" and o not in character:
            o.hide_render = True
    pts = []
    for o in character:
        ev = o.evaluated_get(depsgraph)
        m = ev.to_mesh()
        pts.extend(tuple(ev.matrix_world @ v.co) for v in m.vertices)
        ev.to_mesh_clear()
    pts = np.array(pts)
    lo, hi = pts.min(0), pts.max(0)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(hi[2] - lo[2], hi[0] - lo[0], hi[1] - lo[1]) * 1.15
    turn = math.radians(35 if pose else 0)
    middle = (lo + hi) / 2
    far = 10 * (hi[2] - lo[2] + 1)
    camera.location = (middle[0] + far * math.sin(turn), middle[1] - far * math.cos(turn), middle[2])
    camera.rotation_euler = (math.pi / 2, 0, turn)
    camera.data.clip_end = 4 * far
    scene.collection.objects.link(camera)
    scene.camera = camera
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 2.5
    sun.rotation_euler = (math.radians(70), 0, math.radians(-25))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.85, 0.85, 1)
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = 400
    scene.render.resolution_y = 400
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)


def export_character(list_path, name, models, previews):
    with open(list_path, encoding="utf-8") as f:
        cfg = next(c for c in json.load(f)["characters"] if c["name"] == name)
    os.makedirs(models, exist_ok=True)
    os.makedirs(previews, exist_ok=True)
    object_mode()
    for a in (o for o in bpy.context.scene.objects if o.type == "ARMATURE"):
        a.data.pose_position = "REST"
    bpy.context.view_layer.update()
    parts, sources = gather(cfg)
    reveal(sources)
    body, before = low_mesh(parts, cfg.get("triangles", 20000))
    bake_look(body, sources, cfg.get("texture", 1024), cfg.get("cage", 0.02), os.path.join(previews, f"{name}-texture.png"))
    rig = skeleton_from(cfg, cfg["rig"])
    missed = bind(body, rig)
    glb = os.path.join(models, f"{name}.glb")
    export(body, rig, glb)
    report = {
        "name": name,
        "parts": sorted(o.name for o in parts),
        "bakedFrom": sorted(o.name for o in sources),
        "triangles": {"before": before, "after": triangles(body)},
        "joints": sorted(cfg["bones"]),
        "cornersNearestBone": missed,
        "bytes": os.path.getsize(glb),
    }
    with open(os.path.join(models, f"{name}-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"exported {name}: {json.dumps(report)[:2000]}", flush=True)
    render(glb, os.path.join(previews, f"{name}.png"), None)
    render(glb, os.path.join(previews, f"{name}-posed.png"), POSES[cfg["class"]])


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if args[0] == "inspect":
        inspect(args[1], args[2])
    elif args[0] == "export":
        try:
            export_character(*args[1:5])
        except Exception:
            traceback.print_exc()
            raise SystemExit(1)
    else:
        raise SystemExit(f"Unknown step {args[0]}: use inspect or export")


main()
