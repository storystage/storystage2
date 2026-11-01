"""WP3.5: makes the everyday people, headless, in Blender with MPFB2 (MakeHuman Plugin For Blender).

Run by the assets repository's "Build MakeHuman people" workflow. Blender and MPFB2 are GPL build
tools and are never linked into the app (CLAUDE.md, rule 8); the people they make from MakeHuman's
CC0 assets are CC0. The decisions live in `src/human-info.ts`, which is tested; this stays thin.

    blender -b --python-exit-code 1 --python make_people.py -- \
        <people.json> <makehuman_system_assets_cc0.zip> <models folder> <previews folder>

For each person it builds the character, bakes its shape, tints older people's hair, and exports a
rigged binary glTF. It then imports that glTF into an empty scene and renders it, so a preview
shows what actually ships, textures included. It writes `make-report.json` beside the models.
"""

import importlib
import json
import math
import os
import sys
import traceback

import bpy
import numpy as np

MAX_TEXTURE = 1024
SEE_THROUGH = {"hair", "eyebrows", "eyelashes"}


def mpfb(module, name):
    """MPFB2's own quirk: extensions land at an unknown place in the module tree."""
    for loaded in list(sys.modules):
        if loaded.endswith(module):
            return getattr(importlib.import_module(loaded), name)
    raise ImportError(f"MPFB2 is not loaded: no module ending {module}")


def install_assets(zip_path):
    AssetService = mpfb("mpfb.services.assetservice", "AssetService")
    LocationService = mpfb("mpfb.services.locationservice", "LocationService")
    error = AssetService.fix_and_extract_asset_pack_zip(zip_path, LocationService.get_user_data())
    if error:
        raise RuntimeError(f"Could not install the asset pack: {error}")
    AssetService.rescan_pack_metadata()
    print("Asset packs:", AssetService.get_pack_names())


def mhclo_uuid(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("uuid "):
                return line.split()[1]
    raise ValueError(f"No uuid in {path}")


def base_colour_images(material):
    """The image nodes feeding a material's base colour, and only those: a normal map is no colour."""
    principled = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled is None:
        return []
    found, seen, todo = [], set(), [principled.inputs["Base Color"]]
    while todo:
        for link in todo.pop().links:
            node = link.from_node
            if node.name not in seen:
                seen.add(node.name)
                if node.type == "TEX_IMAGE" and node.image:
                    found.append(node)
                todo.extend(node.inputs)
    return found


def repaint(obj, paint):
    """Changes a texture's own pixels. A shader tint would not survive the export to glTF."""
    done = {}
    for slot in obj.material_slots:
        for node in base_colour_images(slot.material) if slot.material else []:
            source = node.image
            if source.name not in done:
                width, height = source.size
                pixels = np.empty(width * height * 4, dtype=np.float32)
                source.pixels.foreach_get(pixels)
                rgba = pixels.reshape(-1, 4)
                paint(rgba)
                image = bpy.data.images.new(f"{source.name}-{obj.name}", width, height, alpha=True)
                image.pixels.foreach_set(rgba.ravel())
                image.update()
                image.pack()
                done[source.name] = image
            node.image = done[source.name]
    if not done:
        raise RuntimeError(f"No colour texture to change on {obj.name}")


def tinted_hair(colour):
    """Grey or white; each strand keeps its light and shade."""
    base, span = (0.32, 0.42) if colour == "grey" else (0.6, 0.36)

    def paint(rgba):
        light = rgba[:, :3].dot([0.2126, 0.7152, 0.0722])
        opaque = rgba[:, 3] > 0.1
        top = np.percentile(light[opaque], 95) if opaque.any() else 1.0
        rgba[:, :3] = (base + span * np.clip(light / max(top, 1e-3), 0, 1))[:, None]

    return paint


def recoloured_outfit(colour):
    """Everything but denim takes the colour and keeps its folds. An outfit's shirt and jeans share
    one texture, so the jeans are told apart by being blue."""
    target = np.array(colour, dtype=np.float32)

    def paint(rgba):
        r, g, b = rgba[:, 0], rgba[:, 1], rgba[:, 2]
        cloth = ~((b > r + 0.04) & (b >= g))
        light = rgba[:, :3].max(axis=1)
        top = np.percentile(light[cloth], 90) if cloth.any() else 1.0
        shade = np.clip(light[cloth] / max(top, 1e-3), 0, 1)
        rgba[cloth, :3] = shade[:, None] * target

    return paint


def make_solid(obj):
    """MPFB2's game material marks everything see-through. Only hair, eyebrows and eyelashes are:
    a see-through body would draw wrongly on the stage, and read as a card in the sketches."""
    for slot in obj.material_slots:
        material = slot.material
        for node in material.node_tree.nodes if material else []:
            if node.type == "BSDF_PRINCIPLED":
                alpha = node.inputs["Alpha"]
                for link in list(alpha.links):
                    material.node_tree.links.remove(link)
                alpha.default_value = 1.0
        if material:
            material.blend_method = "OPAQUE"


def shrink_textures():
    """The pack's textures run to 4096 pixels, far past any device budget, and 30 people would
    put more than half a gigabyte in the assets repository. WP3c sets the final sizes."""
    for image in bpy.data.images:
        width, height = image.size
        if max(width, height) > MAX_TEXTURE:
            scale = MAX_TEXTURE / max(width, height)
            image.scale(int(width * scale), int(height * scale))
            image.pack()


def make_person(info, models):
    HumanService = mpfb("mpfb.services.humanservice", "HumanService")
    AssetService = mpfb("mpfb.services.assetservice", "AssetService")
    ObjectService = mpfb("mpfb.services.objectservice", "ObjectService")
    TargetService = mpfb("mpfb.services.targetservice", "TargetService")
    ExportService = mpfb("mpfb.services.exportservice", "ExportService")

    extra = info.pop("storystage")
    eyes = AssetService.find_asset_absolute_path(info["eyes"], asset_subdir="eyes")
    info["alternative_materials"] = {mhclo_uuid(eyes): f"{extra['eyes']}.mhmat"}

    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    basemesh = HumanService.deserialize_from_dict(info, settings)

    rig = ObjectService.find_object_of_type_amongst_nearest_relatives(basemesh, "Skeleton")
    if rig is None:
        raise RuntimeError("MPFB2 made no skeleton")

    ObjectService.select_object(basemesh)
    TargetService.bake_targets(basemesh)
    ExportService.bake_modifiers_remove_helpers(basemesh, bake_masks=True, remove_helpers=True)

    if extra["hairTint"]:
        hair = ObjectService.find_object_of_type_amongst_nearest_relatives(basemesh, "Hair")
        if hair is None:
            raise RuntimeError("No hair to tint")
        repaint(hair, tinted_hair(extra["hairTint"]))

    parts = ObjectService.get_list_of_children(rig)
    if extra["clothesColour"]:
        outfit = next((p for p in parts if extra["outfit"] in p.name + p.data.name), None)
        if outfit is None:
            raise RuntimeError(f"No {extra['outfit']} among {[p.name for p in parts]}")
        repaint(outfit, recoloured_outfit(extra["clothesColour"]))

    for part in parts:
        if ObjectService.get_object_type(part).lower() not in SEE_THROUGH:
            make_solid(part)

    shrink_textures()

    ObjectService.deselect_and_deactivate_all()
    rig.select_set(True)
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = rig

    path = os.path.join(models, f"{info['name']}.glb")
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
    return path


def render_preview(glb, png):
    """A front view of the exported file, with its own textures, in an empty scene."""
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    scene = bpy.context.scene

    # Framed from the skeleton: the feet are on the ground, and the head's bone ends near its top.
    rig = next((o for o in scene.objects if o.type == "ARMATURE"), None)
    if rig is None:
        raise RuntimeError("The exported file has no skeleton")
    ends = [rig.matrix_world @ e for b in rig.data.bones for e in (b.head_local, b.tail_local)]
    xs = [e.x for e in ends]
    zs = [0, max(e.z for e in ends) * 1.1]
    triangles = sum(
        len(p.vertices) - 2
        for obj in scene.objects
        if obj.type == "MESH"
        for p in obj.data.polygons
    )

    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(max(zs) - min(zs), (max(xs) - min(xs)) * 1.5) * 1.08
    camera.location = ((max(xs) + min(xs)) / 2, -10, (max(zs) + min(zs)) / 2)
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
    scene.render.resolution_x = 340
    scene.render.resolution_y = 510
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)
    return triangles


def main():
    people_file, pack, models, previews = sys.argv[sys.argv.index("--") + 1 :]
    with open(people_file, encoding="utf-8") as f:
        people = json.load(f)
    os.makedirs(models, exist_ok=True)
    os.makedirs(previews, exist_ok=True)
    install_assets(pack)

    report = []
    for info in people:
        person = info["name"]
        name = info["storystage"].get("displayName", person)
        try:
            bpy.ops.wm.read_homefile(use_empty=True)
            glb = make_person(info, models)
            triangles = render_preview(glb, os.path.join(previews, f"{person}.png"))
            size = os.path.getsize(glb)
            report.append({"id": person, "name": name, "triangles": triangles, "bytes": size})
            print(f"made {person} {name}: {triangles} triangles, {size} bytes", flush=True)
        except Exception as e:  # one person's failure is reported; the rest still get made
            traceback.print_exc()
            report.append({"id": person, "name": name, "error": str(e)})

    with open(os.path.join(models, "make-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    with open(os.path.join(previews, "README.md"), "w", encoding="utf-8") as f:
        f.write("# MakeHuman people: previews\n\nRendered from the exported glTF files.\n\n")
        made = [r for r in report if "error" not in r]
        for row in range(0, len(made), 5):
            cells = made[row : row + 5]
            f.write("| " + " | ".join(r["name"] for r in cells) + " |\n")
            f.write("|" + "---|" * len(cells) + "\n")
            f.write("| " + " | ".join(f"![{r['name']}]({r['id']}.png)" for r in cells) + " |\n\n")
    failed = [r["id"] for r in report if "error" in r]
    if failed:
        raise SystemExit(f"Could not make: {', '.join(failed)}")


main()
