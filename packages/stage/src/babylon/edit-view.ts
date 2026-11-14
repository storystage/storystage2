/**
 * What the scene view draws over the scene while editing (07-ux section 7.2): the chosen object's
 * amber outline (the edges of its box), its turn ring and resize knob, and the markers. They are
 * in a utility layer of their own: drawn over the scene on the live canvas, never in `picture`,
 * and `renderFrame` turns the layer off while it draws. Lines keep the same width on the view
 * however near or far they are.
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Quat, Transform, Vec3 } from '@storystage/story-api';
import { MARKER_BOX, boxPoints } from '../editing.ts';
import { ringPoints, type HandlePlaces, type Viewing } from '../handles.ts';
import type { Box } from '../hull.ts';
import { dot, rotate, sub, v } from '../math.ts';

/** The studio's amber (`@storystage/ui`'s `amber`), for what's chosen. */
const AMBER = Color3.FromHexString('#F4B740');
/** Markers that aren't chosen: a quiet blue, so they don't look chosen. */
const MARKER = Color3.FromHexString('#5B8DEF');
/** Widths on the view, in CSS pixels. */
const LINE = 2.5;
const RING = 3.5;
const KNOB = 14;
/** A marker's nose: which way it faces. */
const NOSE = 0.12;

/** What to draw. */
export interface EditDrawing {
  readonly view: Viewing;
  readonly chosen: {
    readonly box: Box;
    readonly transform: Transform;
    readonly places: HandlePlaces;
  } | null;
  readonly markers: readonly {
    readonly id: string;
    readonly position: Vec3;
    readonly rotation: Quat;
    readonly chosen: boolean;
  }[];
}

const toVector = (p: Vec3) => new Vector3(p.x, p.y, p.z);
const toQuaternion = (q: Quat) => new Quaternion(q.x, q.y, q.z, q.w);

export class EditView {
  private readonly layer: UtilityLayerRenderer;
  private readonly scene: Scene;
  private readonly amber: StandardMaterial;
  private readonly blue: StandardMaterial;
  private readonly edges: Mesh[] = [];
  private ring: Mesh | null = null;
  private readonly knob: Mesh;
  private markers: Mesh[] = [];
  private on = true;

  constructor(scene: Scene) {
    this.layer = new UtilityLayerRenderer(scene, false);
    this.scene = this.layer.utilityLayerScene;
    this.scene.useRightHandedSystem = true;
    this.amber = glow('chosen', AMBER, this.scene);
    this.blue = glow('marker', MARKER, this.scene);
    for (let i = 0; i < 12; i++) {
      const edge = CreateCylinder(
        'outline',
        { height: 1, diameter: 1, tessellation: 8 },
        this.scene,
      );
      edge.material = this.amber;
      edge.rotationQuaternion = Quaternion.Identity();
      this.edges.push(edge);
    }
    this.knob = CreateSphere('resize', { diameter: 1, segments: 12 }, this.scene);
    this.knob.material = this.amber;
    this.draw(null);
  }

  /** The meshes it draws, for a test. */
  meshes(): readonly Mesh[] {
    return this.scene.meshes.filter((m) => m.isEnabled()) as Mesh[];
  }

  /** Off while `renderFrame` draws, so a frame never shows what's being edited. */
  set showing(on: boolean) {
    this.on = on;
    this.layer.shouldRender = on;
  }

  get showing(): boolean {
    return this.on;
  }

  /** Draws `drawing`, or nothing. */
  draw(drawing: EditDrawing | null): void {
    const chosen = drawing?.chosen ?? null;
    for (const edge of this.edges) edge.setEnabled(!!chosen);
    this.knob.setEnabled(!!chosen?.places.knob);
    this.ring?.setEnabled(!!chosen);
    this.drawMarkers(drawing);
    if (!drawing || !chosen) return;
    const { view } = drawing;
    const pixel = (p: Vec3) => metresPerPixel(view, p);
    const corners = boxPoints(chosen.box, chosen.transform).slice(0, 8);
    let e = 0;
    for (let i = 0; i < 8; i++)
      for (const bit of [4, 2, 1])
        if (!(i & bit)) {
          const a = corners[i]!;
          const b = corners[i | bit]!;
          const middle = v((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
          placeBar(this.edges[e++]!, a, b, LINE * pixel(middle));
        }
    const { ring, knob } = chosen.places;
    const path = ringPoints(ring).map(toVector);
    const radius = (RING / 2) * pixel(ring.centre);
    this.ring = CreateTube(
      'turn',
      {
        path,
        radius,
        tessellation: 8,
        updatable: true,
        ...(this.ring ? { instance: this.ring } : {}),
      },
      this.scene,
    );
    this.ring.material = this.amber;
    this.ring.setEnabled(true);
    if (knob) {
      this.knob.position.copyFrom(toVector(knob));
      this.knob.scaling.setAll(KNOB * pixel(knob));
    }
  }

  dispose(): void {
    this.layer.dispose();
  }

  private drawMarkers(drawing: EditDrawing | null): void {
    const wanted = drawing?.markers ?? [];
    while (this.markers.length < wanted.length) {
      const body = CreateBox('marker', { size: MARKER_BOX.max.x - MARKER_BOX.min.x }, this.scene);
      const nose = CreateBox('marker nose', { size: NOSE }, this.scene);
      nose.parent = body;
      nose.position.z = MARKER_BOX.max.z + NOSE / 2;
      body.rotationQuaternion = Quaternion.Identity();
      this.markers.push(body);
    }
    this.markers.forEach((body, i) => {
      const m = wanted[i];
      body.setEnabled(!!m);
      if (!m) return;
      body.position.copyFrom(toVector(m.position));
      body.rotationQuaternion!.copyFrom(toQuaternion(m.rotation));
      const material = m.chosen ? this.amber : this.blue;
      body.material = material;
      for (const child of body.getChildMeshes()) child.material = material;
    });
  }
}

function glow(name: string, colour: Color3, scene: Scene): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.emissiveColor = colour;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.fogEnabled = false;
  return m;
}

/** How many metres one CSS pixel of the view is, at a point's distance. */
function metresPerPixel(view: Viewing, p: Vec3): number {
  const forward = rotate(view.pose.rotation, v(0, 0, 1));
  const depth = Math.max(dot(sub(p, view.pose.position), forward), 0.125);
  return (2 * depth * Math.tan(view.lens * Math.PI)) / view.height;
}

/** Stretches a cylinder of height 1 standing on +Y from `a` to `b`, `width` across. */
function placeBar(bar: Mesh, a: Vec3, b: Vec3, width: number): void {
  const from = toVector(a);
  const to = toVector(b);
  const way = to.subtract(from);
  const length = way.length();
  bar.position.copyFrom(from.add(to).scale(0.5));
  if (length > 1e-9)
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), way.scale(1 / length), bar.rotationQuaternion!);
  bar.scaling.set(width, Math.max(length, 1e-6), width);
}
