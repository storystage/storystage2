"""WP3.5: makes the everyday people, headless, in Blender with MPFB2 (MakeHuman Plugin For Blender).

Run by the assets repository's "Build MakeHuman people" workflow. Blender and MPFB2 are GPL build
tools and are never linked into the app (CLAUDE.md, rule 8); the people they make from MakeHuman's
CC0 assets are CC0. The decisions live in `src/human-info.ts`, which is tested; this stays thin.

    blender -b --python-exit-code 1 --python make_people.py -- \
        <people.json> <makehuman_system_assets_cc0.zip> [more CC0 packs, such as glasses01_cc0.zip]
        <models folder> <previews folder>

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
                paint(rgba, (width, height))
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

    def paint(rgba, size):
        light = rgba[:, :3].dot([0.2126, 0.7152, 0.0722])
        opaque = rgba[:, 3] > 0.1
        top = np.percentile(light[opaque], 95) if opaque.any() else 1.0
        rgba[:, :3] = (base + span * np.clip(light / max(top, 1e-3), 0, 1))[:, None]

    return paint


def blurred(values, mask, radius):
    """A box blur of `values` over `mask` only (both height by width), so the picture's empty
    space between its parts doesn't darken their edges."""

    def box(a):
        h, w = a.shape
        c = np.pad(a, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
        y0 = np.clip(np.arange(h) - radius, 0, h)
        y1 = np.clip(np.arange(h) + radius + 1, 0, h)
        x0 = np.clip(np.arange(w) - radius, 0, w)
        x1 = np.clip(np.arange(w) + radius + 1, 0, w)
        return (
            c[np.ix_(y1, x1)] - c[np.ix_(y0, x1)] - c[np.ix_(y1, x0)] + c[np.ix_(y0, x0)]
        )

    m = mask.astype(np.float32)
    return box(values * m) / np.maximum(box(m), 1e-6)


# The pattern's tile, in pixels, for each outfit: its picture is laid out at a different scale
# on the body, so one size made the shirt's checks twice the blouse's (trial of 17 Nov).
PATTERN_TILES = {"male_casualsuit03": 64, "female_elegantsuit01": 40}

# A flower's centre, where its petals meet.
FLOWER_CENTRE = (0.95, 0.8, 0.3)


def lighter(colour, by):
    """`colour` mixed towards white."""
    return np.array(colour, dtype=np.float32) * (1 - by) + by


def pattern_colours(pattern, colour, x, y, period):
    """Each cloth pixel's colour before its shade, for a pattern laid out in tiles of `period`
    pixels (owner, 17 Nov 2026: checks, and fewer of them, spots, flowers and flecks)."""
    base = np.array(colour, dtype=np.float32)
    out = np.tile(base, (x.size, 1))
    if pattern == "plain":
        return out
    if pattern == "checks":
        across = (x // period) % 2
        down = (y // period) % 2
        return out * (1 - 0.28 * (across + down))[:, None]
    # Spots and flowers sit at each tile's middle, every other row shifted half a tile.
    row = y // period
    u = (x + (row % 2) * (period // 2)) % period - period / 2
    v = y % period - period / 2
    if pattern == "dots":
        out[np.hypot(u, v) < 0.22 * period] = lighter(colour, 0.75)
        return out
    if pattern == "flowers":
        petal = np.zeros(x.size, dtype=bool)
        for k in range(5):
            a = 2 * math.pi * k / 5
            cu, cv = 0.17 * period * math.cos(a), 0.17 * period * math.sin(a)
            petal |= np.hypot(u - cu, v - cv) < 0.12 * period
        out[petal] = lighter(colour, 0.7)
        out[np.hypot(u, v) < 0.07 * period] = FLOWER_CENTRE
        return out
    if pattern == "flecks":
        # A knitted look: small cells, a few light and a few dark, from a fixed hash.
        cell = max(2, period // 10)
        h = ((x // cell) * 73856093 ^ (y // cell) * 19349663) % 1000 / 1000
        out[h > 0.86] = lighter(colour, 0.45)
        out[h < 0.1] = base * 0.65
        return out
    raise RuntimeError(f"Unknown pattern {pattern}")


def recoloured_outfit(colour, trousers=None, pattern=None, outfit=None):
    """Everything but denim takes `colour`, and the denim takes `trousers` (owner, 16 Nov 2026:
    not every child in jeans); each keeps its folds, and either may be None to leave it. An
    outfit's shirt and jeans share one texture, so the jeans are told apart by being blue.

    `pattern` (owner, 17 Nov 2026: not so many striped shirts) smooths the pack's stripes out of
    the picture, keeping its folds, and lays a pattern over that (`pattern_colours`).
    """

    def shaded(rgba, where, colour, shade=None):
        light = rgba[:, :3].max(axis=1) if shade is None else shade
        top = np.percentile(light[where], 90) if where.any() else 1.0
        shade = np.clip(light[where] / max(top, 1e-3), 0, 1)
        rgba[where, :3] = shade[:, None] * np.array(colour, dtype=np.float32)

    def paint(rgba, size):
        r, g, b = rgba[:, 0], rgba[:, 1], rgba[:, 2]
        denim = (b > r + 0.04) & (b >= g)
        if colour is not None and pattern is not None:
            width, height = size
            cloth = (~denim) & (rgba[:, 3] > 0.1)
            light = rgba[:, :3].max(axis=1)
            # Stripes are fine and folds are broad: a blur as wide as a few stripes, done twice,
            # keeps the folds (a narrower one, once, left faint stripes: trial of 17 Nov).
            radius = max(6, width // 48)
            mask = cloth.reshape(height, width)
            smooth = blurred(light.reshape(height, width), mask, radius)
            smooth = blurred(smooth, mask, radius).ravel()
            where = ~denim
            top = np.percentile(smooth[where], 90) if where.any() else 1.0
            shade = np.clip(smooth[where] / max(top, 1e-3), 0, 1)
            index = np.flatnonzero(where)
            y, x = np.divmod(index, width)
            period = max(8, width // PATTERN_TILES.get(outfit, 48))
            colours = pattern_colours(pattern, colour, x, y, period)
            rgba[where, :3] = shade[:, None] * colours
        elif colour is not None:
            shaded(rgba, ~denim, colour)
        if trousers is not None:
            if not denim.any():
                raise RuntimeError("No denim to recolour")
            shaded(rgba, denim, trousers)

    return paint


def skirt_piece(bm, hips):
    """The outfit's piece that reaches from above the hips down past them: the skirt and its
    blouse, not the socks, which are a piece of their own."""
    seen, pieces = set(), []
    for start in bm.verts:
        if start in seen:
            continue
        piece, todo = [], [start]
        seen.add(start)
        while todo:
            v = todo.pop()
            piece.append(v)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o not in seen:
                    seen.add(o)
                    todo.append(o)
        pieces.append(piece)
    spanning = [p for p in pieces if max(v.co.z for v in p) > hips > min(v.co.z for v in p)]
    if not spanning:
        raise RuntimeError("No skirt reaching past the hips")
    return max(spanning, key=len)


def bone_z(rig, outfit, name):
    bone = rig.data.bones.get(name)
    if bone is None:
        raise RuntimeError(f"No {name} bone")
    return (outfit.matrix_world.inverted() @ rig.matrix_world @ bone.head_local).z


def straighten_hem(outfit, rig):
    """A child's skirt hangs to a point between the legs when the pack's skirt is fitted to a
    child's body, and some adults' a little (found in the renders, 16 and 17 Nov 2026). The hem is
    brought level at the height most of it hangs to; only the skirt's own piece moves."""
    import bmesh

    hips = bone_z(rig, outfit, "pelvis")
    bm = bmesh.new()
    bm.from_mesh(outfit.data)
    skirt = skirt_piece(bm, hips)
    hem = sorted(v.co.z for v in skirt if v.is_boundary and v.co.z < hips)
    if not hem:
        raise RuntimeError("No hem found")
    level = hem[len(hem) // 2]
    moved = 0
    for v in skirt:
        if v.co.z < level:
            v.co.z = level
            moved += 1
    bm.to_mesh(outfit.data)
    bm.free()
    outfit.data.update()
    print(f"straightened the hem at {level:.3f}: {moved} vertices", flush=True)


def lengthen_skirt(outfit, rig, body):
    """An ankle-length skirt (owner, 17 Nov 2026: Margaret's): below the hips the skirt is
    stretched down to just above the ankles, and widens towards its hem so it stays clear of the
    legs, which stand apart. Its vertices keep their skin weights, so it moves with the legs."""
    import bmesh

    hips = bone_z(rig, outfit, "pelvis")
    ankle = min(bone_z(rig, outfit, "foot_l"), bone_z(rig, outfit, "foot_r"))
    bm = bmesh.new()
    bm.from_mesh(outfit.data)
    skirt = skirt_piece(bm, hips)
    below = [v for v in skirt if v.co.z < hips]
    hem = min(v.co.z for v in below)
    target = ankle + 0.03
    if target >= hem:
        raise RuntimeError("The skirt already reaches the ankles")
    cx = sum(v.co.x for v in below) / len(below)
    cy = sum(v.co.y for v in below) / len(below)
    # How wide the legs are where the hem will be, from the body itself.
    to_outfit = outfit.matrix_world.inverted() @ body.matrix_world
    legs = [
        to_outfit @ v.co
        for v in body.data.vertices
        if abs((to_outfit @ v.co).z - target) < 0.04
    ]
    if not legs:
        raise RuntimeError("No legs found at the hem's height")
    needed = max(abs(p.x - cx) for p in legs) + 0.03
    width = max(abs(v.co.x - cx) for v in below if v.co.z < hem + 0.02)
    spread = max(1.0, needed / max(width, 1e-6))
    for v in below:
        t = (hips - v.co.z) / (hips - hem)
        v.co.z = hips - t * (hips - target)
        s = 1 + (spread - 1) * t * t
        v.co.x = cx + (v.co.x - cx) * s
        v.co.y = cy + (v.co.y - cy) * s
    bm.to_mesh(outfit.data)
    bm.free()
    outfit.data.update()
    print(f"lengthened the skirt to {target:.3f}, widened {spread:.2f} times at the hem", flush=True)


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


def make_clear_lenses(obj):
    """The glasses' pictures are see-through where the lenses are. Made solid, as other clothes
    are, the lenses filled in as tinted blocks. Their alpha goes through a Round node instead,
    which Blender's glTF exporter (4.2 and later) writes as MASK with a cutoff of 0.5: solid
    frames, clear lenses, and nothing for the stage to sort as it would for BLEND."""
    for slot in obj.material_slots:
        material = slot.material
        if not material:
            continue
        tree = material.node_tree
        for node in list(tree.nodes):
            if node.type != "BSDF_PRINCIPLED":
                continue
            alpha = node.inputs["Alpha"]
            if not alpha.links:
                raise RuntimeError(f"{obj.name}'s glasses have no see-through picture")
            source = alpha.links[0].from_socket
            tree.links.remove(alpha.links[0])
            cut = tree.nodes.new("ShaderNodeMath")
            cut.operation = "ROUND"
            tree.links.new(source, cut.inputs[0])
            tree.links.new(cut.outputs[0], alpha)


def srgb_to_linear(rgb):
    """people.ts's colours are as seen; a material's base colour is linear light."""
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


def plain_material(name, rgb):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*srgb_to_linear(rgb), 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    return material


class Head:
    """Where the head is, measured from the person's own body, in the body's local space (Z up,
    facing -Y). Every piece is sized from `s`, the height from the eyes to the top of the head,
    so a child's fits a child."""

    def __init__(self, body, parts):
        ObjectService = mpfb("mpfb.services.objectservice", "ObjectService")
        group = body.vertex_groups.get("head")
        if group is None:
            raise RuntimeError("The body has no head vertex group")
        index = group.index
        points = [
            v.co.copy()
            for v in body.data.vertices
            if any(g.group == index and g.weight >= 0.5 for g in v.groups)
        ]
        if len(points) < 100:
            raise RuntimeError(f"Too few head vertices ({len(points)})")
        xs = [p.x for p in points]
        ys = [p.y for p in points]
        zs = [p.z for p in points]
        self.top = max(zs)
        self.cx = (max(xs) + min(xs)) / 2
        self.cy = (max(ys) + min(ys)) / 2
        self.front = min(ys)
        self.back = max(ys)
        eyes = next(
            (p for p in parts if ObjectService.get_object_type(p).lower() == "eyes"), None
        )
        if eyes is None:
            raise RuntimeError("No eyes to measure the head from")
        to_body = body.matrix_world.inverted() @ eyes.matrix_world
        eye_points = [to_body @ v.co for v in eyes.data.vertices]
        self.eye_z = sum(p.z for p in eye_points) / len(eye_points)
        self.s = self.top - self.eye_z
        band = [p for p in points if abs(p.z - self.eye_z) < 0.15 * self.s]
        self.half_width = max(abs(p.x - self.cx) for p in band)
        # The neck: where the head's own vertices end.
        self.neck_z = min(zs)
        self.points = points
        print(
            f"head: top {self.top:.3f}, eyes {self.eye_z:.3f}, s {self.s:.3f}, "
            f"half width {self.half_width:.3f}, neck {self.neck_z:.3f}",
            flush=True,
        )

    def frontness(self, y):
        """0 at the back of the head, 1 at its front."""
        return min(1.0, max(0.0, (self.back - y) / max(self.back - self.front, 1e-6)))


def farthest_hit(trees, origin, direction, reach):
    """How far out along `direction` the last surface of the given parts lies (hair, clothes), so a
    piece goes over them, not through them."""
    best = 0.0
    for tree, to_local, turn in trees:
        start = to_local @ origin
        d = (turn @ direction).normalized()
        travelled = 0.0
        for _ in range(8):
            hit = tree.ray_cast(start + d * (travelled + 1e-4), d, reach - travelled)
            if hit[0] is None:
                break
            travelled += hit[3] + 1e-4
            best = max(best, travelled)
    return best


def part_trees(body, parts, kinds):
    """BVH trees of the parts of the given kinds, with the turns from the body's space into each."""
    from mathutils.bvhtree import BVHTree

    ObjectService = mpfb("mpfb.services.objectservice", "ObjectService")
    depsgraph = bpy.context.evaluated_depsgraph_get()
    trees = []
    for part in parts:
        if part.type == "MESH" and ObjectService.get_object_type(part).lower() in kinds:
            to_local = part.matrix_world.inverted() @ body.matrix_world
            trees.append((BVHTree.FromObject(part, depsgraph), to_local, to_local.to_3x3()))
    return trees


def wrapped(body, rig, name, rgb, rows, top=None, open_face=None, rim=None):
    """A smooth sheet of cloth through `rows` of points, each row going once round the head (the
    columns wrap). `top`, if given, closes the first row to a point. Faces whose centre
    `open_face` says are left out, and `rim`, if given, moves the opening's edge (a whole face
    left out leaves steps). Each vertex is skinned like the body's nearest vertex, so the
    cloth moves with the head, neck and shoulders under it."""
    import bmesh
    from mathutils.kdtree import KDTree

    bm = bmesh.new()
    grid = [[bm.verts.new(p) for p in row] for row in rows]
    columns = len(rows[0])

    def face(verts):
        centre = sum((v.co for v in verts), verts[0].co * 0) / len(verts)
        if open_face is None or not open_face(centre):
            bm.faces.new(verts)

    if top is not None:
        apex = bm.verts.new(top)
        for k in range(columns):
            face((apex, grid[0][k], grid[0][(k + 1) % columns]))
    for i in range(len(grid) - 1):
        for k in range(columns):
            n = (k + 1) % columns
            face((grid[i][k], grid[i + 1][k], grid[i + 1][n], grid[i][n]))
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    if rim is not None:
        for v in [v for v in bm.verts if v.is_boundary]:
            v.co = rim(v.co)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(plain_material(name, rgb))
    for polygon in mesh.polygons:  # cloth, not facets
        polygon.use_smooth = True
    piece = bpy.data.objects.new(name, mesh)
    for collection in body.users_collection:
        collection.objects.link(piece)
    piece.parent = rig
    piece.matrix_world = body.matrix_world.copy()

    tree = KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    names = {g.index: g.name for g in body.vertex_groups}
    groups = {}
    for v in mesh.vertices:
        _, nearest, _ = tree.find(v.co)
        for g in body.data.vertices[nearest].groups:
            if g.weight > 0:
                if g.group not in groups:
                    groups[g.group] = piece.vertex_groups.new(name=names[g.group])
                groups[g.group].add([v.index], g.weight, "REPLACE")
    modifier = piece.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    print(f"made {name}: {len(mesh.polygons)} faces", flush=True)
    return piece


def smoothed_round(values, passes):
    """Averages each value with its neighbours round the head, keeping none below where it was."""
    out = list(values)
    for _ in range(passes):
        n = len(out)
        out = [(out[k - 1] + 2 * out[k] + out[(k + 1) % n]) / 4 for k in range(n)]
    return [max(a, b * 0.97) for a, b in zip(out, values)]


def rigid(body, rig, name, rgb, bm):
    """A small solid piece (a patka's knot, a hearing aid) that moves with the head bone alone."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(plain_material(name, rgb))
    piece = bpy.data.objects.new(name, mesh)
    for collection in body.users_collection:
        collection.objects.link(piece)
    piece.parent = rig
    piece.matrix_world = body.matrix_world.copy()
    group = piece.vertex_groups.new(name="head")
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
    modifier = piece.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    return piece


def blob(centre, radii, tilt=0.0):
    """An ellipsoid, turned `tilt` radians about X (top towards the front for a positive tilt)."""
    import bmesh
    from mathutils import Matrix, Vector

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    turn = Matrix.Rotation(tilt, 3, "X")
    for v in bm.verts:
        v.co = Vector(centre) + turn @ Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    return bm


def smooth_grid(r, passes):
    """Smooths distances on a rows-by-columns grid, round each row and down each column, never
    below where they were (less 3%): bumps such as ears become broad, not sharp."""
    rows, columns = len(r), len(r[0])
    out = [list(row) for row in r]
    for _ in range(passes):
        nxt = [list(row) for row in out]
        for i in range(rows):
            for k in range(columns):
                up = out[max(i - 1, 0)][k]
                down = out[min(i + 1, rows - 1)][k]
                left, right = out[i][k - 1], out[i][(k + 1) % columns]
                nxt[i][k] = (4 * out[i][k] + up + down + left + right) / 8
        out = nxt
    return [[max(a, b * 0.97) for a, b in zip(o, raw)] for o, raw in zip(out, r)]


def add_headwear(body, rig, parts, kind, rgb):
    """A hijab, turban, patka or kippah, made round the person's own head (owner, 16 Nov 2026).
    The first trial followed the body's surface, which showed the ears and left ragged edges; each
    is now a smooth sheet cast out from inside the head, with clean edges."""
    from mathutils import Vector

    head = Head(body, parts)
    s, hw = head.s, head.half_width
    skin = part_trees(body, [body], {"basemesh"})
    clothes = part_trees(body, parts, {"clothes"})
    hair = part_trees(body, parts, {"hair"})
    columns = 64
    centre = Vector((head.cx, head.cy, head.eye_z - 0.1 * s))

    def round_dir(a, e=0.0):
        """Direction `a` round from the front (-Y), `e` up from level."""
        return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))

    angles = [2 * math.pi * k / columns for k in range(columns)]

    def out_to(trees, origin, direction, reach):
        return farthest_hit(trees, origin, direction, reach)

    if kind == "kippah":
        # A smooth dome towards the back of the crown, tilted back with the head's slope there
        # (owner, 16 Nov: further back, in line with the head), lifted clear of the hair.
        from mathutils import Matrix

        radius, spread, rings = 0.85 * s, math.radians(34), 5
        tilt = Matrix.Rotation(math.radians(-38), 3, "X")  # turns up (+Z) towards the back (+Y)
        axis = tilt @ Vector((0, 0, 1))
        crown = centre + axis * farthest_hit(hair + skin, centre, axis, 3 * s)
        middle = crown - axis * radius
        rows = []
        for ring in range(1, rings + 1):
            e = math.pi / 2 - spread * ring / rings
            rows.append([middle + (tilt @ round_dir(a, e)) * radius for a in angles])
        apex = middle + axis * radius
        down = -axis

        def need(p):
            """How far out `p` must go to sit on the first surface met coming in from outside."""
            above = p + axis * s
            first = None
            for tree, to_local, turn in hair + skin:
                h = tree.ray_cast(to_local @ above, (turn @ down).normalized(), 3 * s)
                if h[0] is not None and (first is None or h[3] < first):
                    first = h[3]
            if first is None:
                raise RuntimeError("The kippah found no head under it")
            return (s - first) + 0.03 * s

        # Each ring is lifted by its own middle need, so the cap follows the hair's shape (lower
        # at the sides) without its stray strands: trial 5 lifted it all as one, a plate on top.
        lifts = []
        for row in rows:
            needs = sorted(need(p) for p in row)
            lifts.append(needs[int(len(needs) * 0.8)])  # clear of most strands (trial 7)
        rows = [[p + axis * lift for p in row] for row, lift in zip(rows, lifts)]
        apex = apex + axis * max(need(apex), lifts[0])
        wrapped(body, rig, "kippah", rgb, rows, apex)
        return

    if kind == "hijab":
        # Close to the face round its edge, looser at the sides and back (trial 3: a deep hood).
        def gap(a):
            return 0.07 * s + 0.09 * s * (1 - max(0.0, math.cos(a)) ** 2)

        chin = head.eye_z - 1.0 * s
        face_z = head.eye_z - 0.25 * s
        # Over the head, from near the top down to level with the centre...
        elevations = [math.radians(d) for d in (80, 70, 60, 50, 40, 30, 20, 10, 0)]
        dome = [[out_to(skin, centre, round_dir(a, e), 2 * s) + gap(a) for a in angles] for e in elevations]
        up = out_to(skin, centre, Vector((0, 0, 1)), 2 * s) + gap(math.pi)
        # ...down the sides to the chin, measured level from the head's axis...
        levels = [centre.z - (centre.z - chin) * f for f in (1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1.0)]
        sides = [
            [out_to(skin, Vector((head.cx, head.cy, z)), round_dir(a), 2 * s) + gap(a) for a in angles]
            for z in levels
        ]
        r = smooth_grid(dome + sides, 8)
        points = [[centre + round_dir(a, e) * r[i][k] for k, a in enumerate(angles)] for i, e in enumerate(elevations)]
        points += [
            [Vector((head.cx, head.cy, z)) + round_dir(a) * r[len(elevations) + j][k] for k, a in enumerate(angles)]
            for j, z in enumerate(levels)
        ]
        # ...then a drape over the neck and shoulders, lower at the front and back than at the
        # sides, where it rests on the shoulders; it goes over the clothes.
        at_chin = r[-1]
        steps = 6
        for j in range(1, steps + 1):
            f = j / steps
            row = []
            for k, a in enumerate(angles):
                hem = head.neck_z - s * (1.0 - 0.5 * abs(math.sin(a)))
                z = chin + (hem - chin) * f
                spread = at_chin[k] + (1.6 * hw - at_chin[k]) * f**1.3
                axis = Vector((head.cx, head.cy, z))
                # Only what's within the drape's reach: further out, sideways, are the arms.
                clear = out_to(skin + clothes, axis, round_dir(a), 2.6 * hw) + 0.06 * s
                row.append(axis + round_dir(a) * max(spread, clear))
            points.append(row)

        def open_face(c):
            if c.y > head.cy:
                return False
            return ((c.x - head.cx) / (0.68 * hw)) ** 2 + ((c.z - face_z) / (0.72 * s)) ** 2 <= 1

        hem_top = min(p.z for p in points[-1])

        def rim(co):
            """The face opening's edge onto the oval, so it is round, not stepped; the drape's
            hem is left where it is."""
            if co.z < hem_top + 0.05 * s or co.y > head.cy:
                return co
            u, w = (co.x - head.cx) / (0.68 * hw), (co.z - face_z) / (0.72 * s)
            d = math.hypot(u, w)
            if d < 1e-6 or d > 1.6:
                return co
            return Vector((head.cx + u / d * 0.68 * hw, co.y, face_z + w / d * 0.72 * s))

        wrapped(body, rig, "hijab", rgb, points, centre + Vector((0, 0, up)), open_face, rim)
        return

    if kind not in ("turban", "patka"):
        raise RuntimeError(f"Unknown headwear {kind}")
    # From the top down to an edge running from the brow at the front to the nape at the back.
    # A turban's edge sits higher above the eyebrows than a patka's (owner, 16 Nov).
    brow = head.eye_z + (0.45 if kind == "turban" else 0.3) * s
    nape = head.eye_z - (0.45 if kind == "turban" else 0.6) * s
    rows_n = 9
    raw = []
    for i in range(1, rows_n + 1):
        t = i / rows_n  # 0 at the top, 1 at the edge
        row = []
        for a in angles:
            edge = nape + (brow - nape) * (1 + math.cos(a)) / 2
            lowest = math.asin(max(-0.95, min(0.95, (edge - centre.z) / (1.2 * s))))
            e = math.radians(80) + (lowest - math.radians(80)) * t
            row.append((e, out_to(skin, centre, round_dir(a, e), 2 * s)))
        raw.append(row)
    up = out_to(skin, centre, Vector((0, 0, 1)), 2 * s)
    base = smooth_grid([[d for _, d in row] for row in raw], 3 if kind == "patka" else 4)
    points = []
    for i, row in enumerate(raw):
        t = (i + 1) / rows_n
        line = []
        for k, (e, _) in enumerate(row):
            rise = 0.0
            a = angles[k]
            if kind == "patka":
                extra = 0.09 * s
            else:
                height = 1 - t  # 1 at the top, 0 at the edge
                front = max(0.0, math.cos(a)) ** 3
                # Layers wound from the sides up to the front, where they cross in a point.
                side = abs(math.atan2(math.sin(a), math.cos(a))) / math.pi  # 0 front, 1 back
                layer = 0.5 + 0.5 * math.cos(2 * math.pi * (4.5 * t - 2.2 * side))
                folds = 0.045 * s * layer**3
                # Close round the head, tightest at the sides and back (owner, 16 Nov: it stood
                # off the head), a little fuller at the front where the layers cross.
                extra = 0.03 * s + 0.04 * s * height + 0.05 * s * front + folds
                # Height straight up, rising fast from the edge and rounding over at the top
                # (trial 5's grew with the height and came to a cone), a little more at the front.
                rise = 0.3 * s * math.sqrt(height) + 0.15 * s * front**2 * height
            line.append(centre + round_dir(a, e) * (base[i][k] + extra) + Vector((0, 0, rise)))
        points.append(line)
    top_extra = 0.09 * s if kind == "patka" else 0.5 * s
    wrapped(body, rig, kind, rgb, points, centre + Vector((0, 0, up + top_extra)))
    if kind == "patka":  # the knot on top, a little to the front
        knot = blob((head.cx, head.cy - 0.1 * s, head.top + 0.14 * s), (0.3 * s, 0.3 * s, 0.24 * s))
        rigid(body, rig, "patka-knot", rgb, knot)


def add_hearing_aids(body, rig, parts, rgb):
    """A behind-the-ear hearing aid on each ear (owner, 16 Nov 2026): a slim case tucked into
    the fold behind the top of the ear. The first was too large and stood out (owner, 16 Nov), so
    it is near life size and against the head; its colour is what makes a child's show."""
    head = Head(body, parts)
    s = head.s
    for side in (1, -1):
        band = [
            p
            for p in head.points
            if (p.x - head.cx) * side > 0
            and head.eye_z - 0.8 * s < p.z < head.eye_z + 0.1 * s
            and head.cy - 0.35 * s < p.y < head.cy + 0.45 * s
        ]
        if not band:
            raise RuntimeError("No ear found")
        ear = max(band, key=lambda p: (p.x - head.cx) * side)
        # The rim's top: the highest point near the ear's outer edge.
        rim = [p for p in band if (p.x - head.cx) * side > ((ear.x - head.cx) * side) * 0.85]
        top = max(rim, key=lambda p: p.z)
        # Between the back of the ear and the skull, a little in from the ear's outer edge.
        # Against the back of the ear (owner, 16 Nov), not out behind it.
        centre = (top.x - side * 0.07 * s, max(p.y for p in rim) + 0.015 * s, top.z - 0.16 * s)
        case = blob(centre, (0.045 * s, 0.065 * s, 0.22 * s), tilt=-0.3)
        rigid(body, rig, f"hearing-aid-{'left' if side > 0 else 'right'}", rgb, case)


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
    if extra["clothesColour"] or extra.get("trousersColour"):
        outfit = next((p for p in parts if extra["outfit"] in p.name + p.data.name), None)
        if outfit is None:
            raise RuntimeError(f"No {extra['outfit']} among {[p.name for p in parts]}")
        repaint(
            outfit,
            recoloured_outfit(
                extra["clothesColour"],
                extra.get("trousersColour"),
                extra.get("pattern"),
                extra["outfit"],
            ),
        )
    if extra.get("straightHem"):
        outfit = next((p for p in parts if extra["outfit"] in p.name + p.data.name), None)
        if outfit is None:
            raise RuntimeError(f"No {extra['outfit']} to straighten")
        if outfit.data.shape_keys:
            raise RuntimeError(f"{extra['outfit']} has shape keys; its hem can't be moved")
        straighten_hem(outfit, rig)
        if extra.get("longSkirt"):
            lengthen_skirt(outfit, rig, basemesh)

    # Pieces no community pack has, made here from the person's own head (owner, 16 Nov 2026).
    if extra.get("headwear"):
        add_headwear(basemesh, rig, parts, extra["headwear"]["kind"], extra["headwear"]["colour"])
    if extra.get("hearingAids"):
        add_hearing_aids(basemesh, rig, parts, extra["hearingAids"])
    made = [p for p in ObjectService.get_list_of_children(rig) if p not in parts]
    parts = parts + made

    glasses = extra["glasses"]
    for part in parts:
        if part in made:
            continue
        if glasses and glasses in part.name + part.data.name:
            make_clear_lenses(part)
        elif ObjectService.get_object_type(part).lower() not in SEE_THROUGH:
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


def render_preview(glb, png, close_up=None):
    """A front view of the exported file, with its own textures, in an empty scene, and, given a
    second path, a close-up of the head from behind."""
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

    if close_up:
        # The head from three quarters behind, for what the front view can't show: hearing aids
        # behind the ears, and how headwear sits at the back.
        height = max(zs)
        camera.data.ortho_scale = height * 0.22
        turn = math.radians(125)
        camera.location = (10 * math.sin(turn), -10 * math.cos(turn), height * 0.9)
        camera.rotation_euler = (math.pi / 2, 0, turn)
        scene.render.resolution_x = scene.render.resolution_y = 400
        scene.render.filepath = close_up
        bpy.ops.render.render(write_still=True)
    return triangles


def main():
    # The system pack, then any more (the community's CC0 glasses), then the two folders.
    args = sys.argv[sys.argv.index("--") + 1 :]
    people_file, packs, models, previews = args[0], args[1:-2], args[-2], args[-1]
    with open(people_file, encoding="utf-8") as f:
        people = json.load(f)
    os.makedirs(models, exist_ok=True)
    os.makedirs(previews, exist_ok=True)
    for pack in packs:
        install_assets(pack)

    report = []
    for info in people:
        person = info["name"]
        name = info["storystage"].get("displayName", person)
        try:
            bpy.ops.wm.read_homefile(use_empty=True)
            pieces = info["storystage"].get("headwear") or info["storystage"].get("hearingAids")
            glb = make_person(info, models)
            close_up = os.path.join(previews, f"{person}-head.png") if pieces else None
            triangles = render_preview(glb, os.path.join(previews, f"{person}.png"), close_up)
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
