"""WP3.6: gives a found character a humanoid skeleton, headless, in Blender (spec 17, section 3).

Run by the assets repository's "Rig found characters" workflow. Blender is a GPL build tool and is
never linked into the app (CLAUDE.md, rule 8); the models keep their own licences.

    blender -b --python-exit-code 1 --python autorig.py -- <rigs.json> <models folder> <previews folder>

`rigs.json` sits beside the original files and lists them:

    {"models": [{"name": "grandmother", "file": "Granny.glb",
                 "landmarks": {"hips": 0.4}, "still": ["arms"]}]}

For each model it:

1. imports the file (glTF or FBX), drops any skeleton, clips and flat ground plane it brought, and
   joins its meshes, standing on the ground at the middle;
2. finds the joints from the shape, as a person standing in a T-pose facing the front: the arms
   are the widest part, the legs the two columns at the bottom, and the rest is in proportion.
   `landmarks` overrides any of them as a fraction of the height (`hips`, `shoulders`, `knees`)
   or of the half-width (`shoulderWidth`, `legWidth`);
3. makes a skeleton with our joint names (spec 17, section 2a: VRM's humanoid bones), so the joint
   map reads it as it is, and the stage poses it as any humanoid resting in a T-pose;
4. binds the mesh to it with Blender's automatic weights, and gives any corner those leave out to
   its nearest bone. A part in `still` (`arms`, `legs`, `head`) keeps its bones but moves no mesh:
   a cloak that hides its arms shouldn't be pulled about by them;
5. exports a binary glTF, and renders it at rest and posed (arms down, a step, the head turned),
   so a reviewer can see how the skin bends.

It writes `rig-report.json` beside the models: the joints found and how each was found.
"""

import json
import math
import os
import sys
import traceback

import bpy
import numpy as np
from mathutils import Matrix, Vector

# Our joint names (VRM 1.0 humanoid bones) and the parts `still` may name.
PARTS = {
    "arms": [f"{s}{b}" for s in ("left", "right") for b in ("Shoulder", "UpperArm", "LowerArm", "Hand")],
    "legs": [f"{s}{b}" for s in ("left", "right") for b in ("UpperLeg", "LowerLeg", "Foot", "Toes")],
    "head": ["neck", "head"],
}


def clear_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        raise ValueError(f"Can't read {ext} files: give a glTF or an FBX")


def select_only(objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def one_mesh():
    """The model's meshes as one object, in world space, without the skeleton or clips it came with."""
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        raise ValueError("The file has no meshes")
    for m in meshes:
        for mod in list(m.modifiers):
            if mod.type == "ARMATURE":
                m.modifiers.remove(mod)
        m.animation_data_clear()
        m.vertex_groups.clear()
    select_only(meshes)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(scene.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

    # A flat plane at the feet is a ground or a shadow, not the character.
    removed = []
    zs_all = np.concatenate([corners(m)[:, 2] for m in meshes])
    height = zs_all.max() - zs_all.min()
    for m in list(meshes):
        z = corners(m)[:, 2]
        if z.max() - z.min() < 0.01 * height and z.mean() < zs_all.min() + 0.05 * height:
            removed.append(m.name)
            meshes.remove(m)
            bpy.data.objects.remove(m, do_unlink=True)

    select_only(meshes)
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = "body"

    # Standing on the ground, at the middle.
    v = corners(body)
    shift = Vector(((v[:, 0].max() + v[:, 0].min()) / -2, (v[:, 1].max() + v[:, 1].min()) / -2, -v[:, 2].min()))
    body.data.transform(Matrix.Translation(shift))
    body.data.update()
    return body, removed


def corners(obj):
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    m = np.array(obj.matrix_world)
    return co @ m[:3, :3].T + m[:3, 3]


def landmarks(v, overrides):
    """The joints of a person standing in a T-pose, facing -Y (glTF's +Z), from the shape."""
    how = {}
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    height = z.max()
    half = np.abs(x).max()

    def band(lo, hi):
        return v[(z >= lo * height) & (z <= hi * height)]

    def depth(points, fallback=0.0):
        return float(np.median(points[:, 1])) if len(points) else fallback

    # The arms: the widest part, if they reach well beyond the body.
    wide = v[np.abs(x) > 0.75 * half]
    shoulders = overrides.get("shoulders")
    if shoulders is None:
        shoulders = float(np.median(wide[:, 2]) / height) if len(wide) else 0.7
        how["shoulders"] = "the widest part"
    else:
        how["shoulders"] = "given"
    below = band(shoulders - 0.14, shoulders - 0.05)
    torso = float(np.percentile(np.abs(below[:, 0]), 90)) if len(below) else 0.3 * half
    arms_out = half > 1.6 * torso
    how["arms"] = "outstretched" if arms_out else "not outstretched: placed level with the shoulders"
    shoulder_x = overrides.get("shoulderWidth", min(torso, 0.6 * half) / half) * half
    tip = half if arms_out else max(half, 2.5 * shoulder_x)

    # The legs: two columns at the bottom, joined at the crotch.
    feet = band(0, 0.06)
    split = len(feet) and not np.any(np.abs(feet[:, 0]) < 0.12 * torso)
    hips = overrides.get("hips")
    if hips is None:
        hips = 0.45 * shoulders / 0.7
        if split:
            for step in np.arange(0.06, 0.65, 0.01):
                s = band(step, step + 0.01)
                if len(s) and np.any(np.abs(s[:, 0]) < 0.12 * torso):
                    hips = float(step) + 0.03
                    break
            how["hips"] = "where the legs meet"
        else:
            how["hips"] = "in proportion: the legs are hidden (a long skirt or cloak)"
    else:
        how["hips"] = "given"
    leg_x = overrides.get("legWidth")
    leg_x = leg_x * half if leg_x is not None else (
        float(np.median(np.abs(feet[:, 0]))) if split else 0.45 * torso
    )
    knees = overrides.get("knees", (hips + 0.05) / 2)
    toe_y = float(feet[:, 1].min()) if len(feet) else -0.1 * height

    spine = hips + 0.3 * (shoulders - hips)
    chest = hips + 0.65 * (shoulders - hips)
    neck = shoulders + 0.03
    head = neck + 0.05
    centre = {
        "hips": depth(band(hips - 0.03, hips + 0.03)),
        "spine": depth(band(spine - 0.03, spine + 0.03)),
        "chest": depth(band(chest - 0.03, chest + 0.03)),
        "neck": depth(band(neck - 0.03, neck + 0.03)),
        "head": depth(band(head, 1.0)),
    }
    p = {
        "hips": (0, centre["hips"], hips * height),
        "spine": (0, centre["spine"], spine * height),
        "chest": (0, centre["chest"], chest * height),
        "neck": (0, centre["neck"], neck * height),
        "head": (0, centre["head"], head * height),
        "top": (0, centre["head"], height),
    }
    arm_y = depth(wide, centre["chest"]) if arms_out else centre["chest"]
    for side, sign in (("left", 1), ("right", -1)):
        reach = tip - shoulder_x
        p[f"{side}Shoulder"] = (sign * 0.2 * shoulder_x, arm_y, shoulders * height)
        p[f"{side}UpperArm"] = (sign * shoulder_x, arm_y, shoulders * height)
        p[f"{side}LowerArm"] = (sign * (shoulder_x + 0.42 * reach), arm_y, shoulders * height)
        p[f"{side}Hand"] = (sign * (shoulder_x + 0.8 * reach), arm_y, shoulders * height)
        p[f"{side}Fingers"] = (sign * tip, arm_y, shoulders * height)
        p[f"{side}UpperLeg"] = (sign * leg_x, centre["hips"], hips * height)
        p[f"{side}LowerLeg"] = (sign * leg_x, centre["hips"], knees * height)
        p[f"{side}Foot"] = (sign * leg_x, centre["hips"], 0.05 * height)
        p[f"{side}Toes"] = (sign * leg_x, toe_y, 0.01 * height)
    fractions = {"shoulders": shoulders, "hips": hips, "knees": knees, "shoulderWidth": shoulder_x / half,
                 "legWidth": leg_x / half}
    return p, fractions, how


# Each bone runs from its joint to the next one along; parents first.
BONES = [
    ("hips", None, "hips", "spine"),
    ("spine", "hips", "spine", "chest"),
    ("chest", "spine", "chest", "neck"),
    ("neck", "chest", "neck", "head"),
    ("head", "neck", "head", "top"),
] + [
    bone
    for s in ("left", "right")
    for bone in (
        (f"{s}Shoulder", "chest", f"{s}Shoulder", f"{s}UpperArm"),
        (f"{s}UpperArm", f"{s}Shoulder", f"{s}UpperArm", f"{s}LowerArm"),
        (f"{s}LowerArm", f"{s}UpperArm", f"{s}LowerArm", f"{s}Hand"),
        (f"{s}Hand", f"{s}LowerArm", f"{s}Hand", f"{s}Fingers"),
        (f"{s}UpperLeg", "hips", f"{s}UpperLeg", f"{s}LowerLeg"),
        (f"{s}LowerLeg", f"{s}UpperLeg", f"{s}LowerLeg", f"{s}Foot"),
        (f"{s}Foot", f"{s}LowerLeg", f"{s}Foot", f"{s}Toes"),
    )
]


def make_skeleton(points, still):
    data = bpy.data.armatures.new("skeleton")
    rig = bpy.data.objects.new("skeleton", data)
    bpy.context.scene.collection.objects.link(rig)
    select_only([rig])
    bpy.ops.object.mode_set(mode="EDIT")
    made = {}
    for name, parent, head, tail in BONES:
        b = data.edit_bones.new(name)
        b.head = points[head]
        b.tail = points[tail]
        if parent:
            b.parent = made[parent]
            b.use_connect = name not in ("leftShoulder", "rightShoulder", "leftUpperLeg", "rightUpperLeg")
        made[name] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    quiet = {n for part in still for n in PARTS[part]}
    for b in data.bones:
        b.use_deform = b.name not in quiet
    return rig


def bind(body, rig):
    """Blender's automatic weights, then each corner they missed to its nearest moving bone."""
    select_only([body, rig], active=rig)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    groups = {g.index: g for g in body.vertex_groups}
    moving = [b for b in rig.data.bones if b.use_deform]
    missed = [v.index for v in body.data.vertices if not any(g.weight > 0 for g in v.groups if g.group in groups)]
    if missed:
        heads = np.array([b.head_local for b in moving])
        tails = np.array([b.tail_local for b in moving])
        co = np.array([body.data.vertices[i].co for i in missed])
        d = tails - heads
        t = np.clip(((co[:, None, :] - heads) * d).sum(-1) / np.maximum((d * d).sum(-1), 1e-9), 0, 1)
        nearest = np.linalg.norm(co[:, None, :] - (heads + t[..., None] * d), axis=-1).argmin(1)
        for i, b in zip(missed, nearest):
            group = body.vertex_groups.get(moving[b].name) or body.vertex_groups.new(name=moving[b].name)
            group.add([i], 1.0, "REPLACE")
    return len(missed)


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


def render(glb, png, posed):
    """A front view of the exported file in an empty scene; posed, it bends the arms, a leg and the head."""
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=glb)
    scene = bpy.context.scene
    rig = next(o for o in scene.objects if o.type == "ARMATURE")
    if posed:
        turns = {
            "leftUpperArm": ("Y", -60), "rightUpperArm": ("Y", 60),
            "leftLowerArm": ("Z", 45), "leftUpperLeg": ("X", -35),
            "leftLowerLeg": ("X", 30), "head": ("Z", 30),
        }
        for name, (axis, degrees) in turns.items():
            pb = rig.pose.bones.get(name)
            if pb is None:
                continue
            pb.rotation_mode = "XYZ"
            # Turned about the world's axes, whatever the bone's own.
            world = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}[axis]
            local = (pb.bone.matrix_local.to_3x3().inverted() @ world).normalized()
            pb.rotation_mode = "AXIS_ANGLE"
            pb.rotation_axis_angle = (math.radians(degrees), *local)
        bpy.context.view_layer.update()
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pts = np.concatenate([corners(m) for m in meshes])
    xs, zs = pts[:, 0], pts[:, 2]
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(zs.max() - zs.min(), xs.max() - xs.min()) * 1.15
    camera.location = ((xs.max() + xs.min()) / 2, -10, (zs.max() + zs.min()) / 2)
    camera.rotation_euler = (math.pi / 2, 0, 0)
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
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    rigs_file, models, previews = args
    folder = os.path.dirname(os.path.abspath(rigs_file))
    with open(rigs_file, encoding="utf-8") as f:
        rigs = json.load(f)["models"]
    os.makedirs(models, exist_ok=True)
    os.makedirs(previews, exist_ok=True)
    report = []
    for spec in rigs:
        name = spec["name"]
        try:
            unknown = set(spec.get("still", [])) - set(PARTS)
            if unknown:
                raise ValueError(f"still may name only {', '.join(PARTS)}, not {', '.join(sorted(unknown))}")
            clear_scene()
            import_model(os.path.join(folder, spec["file"]))
            body, removed = one_mesh()
            points, fractions, how = landmarks(corners(body), spec.get("landmarks", {}))
            rig = make_skeleton(points, spec.get("still", []))
            missed = bind(body, rig)
            glb = os.path.join(models, f"{name}.glb")
            export(body, rig, glb)
            render(glb, os.path.join(previews, f"{name}.png"), posed=False)
            render(glb, os.path.join(previews, f"{name}-posed.png"), posed=True)
            entry = {
                "name": name,
                "file": spec["file"],
                "removed": removed,
                "landmarks": {k: round(v, 3) for k, v in fractions.items()},
                "how": how,
                "still": spec.get("still", []),
                "cornersNearestBone": missed,
                "bytes": os.path.getsize(glb),
            }
            report.append(entry)
            print(f"rigged {name}: {json.dumps(entry)}", flush=True)
        except Exception as e:  # one model's failure is reported; the rest are still rigged
            traceback.print_exc()
            report.append({"name": name, "error": str(e)})

    with open(os.path.join(models, "rig-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    with open(os.path.join(previews, "README.md"), "w", encoding="utf-8") as f:
        f.write("# Found characters, rigged: previews\n\n")
        f.write("Rendered from the exported glTF files, at rest and posed (arms down, a step, the head turned).\n\n")
        f.write("| Model | At rest | Posed |\n|---|---|---|\n")
        for r in report:
            if "error" not in r:
                f.write(f"| {r['name']} | ![]({r['name']}.png) | ![]({r['name']}-posed.png) |\n")
    failed = [r["name"] for r in report if "error" in r]
    if failed:
        raise SystemExit(f"Could not rig: {', '.join(failed)}")


main()
