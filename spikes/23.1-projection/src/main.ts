/**
 * Spike 23.1: the surface bake renderer (workplan WP23).
 *
 * For each frame: render the show from the audience's sweet spot, then bake that picture into
 * the surface's texture layout (one UV-space frame per surface), which is what Pixera or a
 * classroom projector plays. Then check the illusion: a virtual projector, standing somewhere
 * else, sends out the surface wearing its baked texture; that light falls on a plain white
 * model of the surface; and the result, seen from the sweet spot, should match the show. Seen
 * from somewhere else it shouldn't, which is how projection mapping works.
 *
 * Proved on a box and on a building front with a porch that hides part of the wall.
 * Add `?surface=box` or `?surface=building` to run one; the page runs both by default.
 */
import {
  Color3,
  Color4,
  Constants,
  Engine,
  FreeCamera,
  Mesh,
  MeshBuilder,
  RenderTargetTexture,
  Scene,
  ShaderMaterial,
  StandardMaterial,
  Texture,
  Vector3,
  VertexData,
  type AbstractMesh,
  type Material,
} from '@babylonjs/core';
import { bake, depth, paint, projected, textured } from './shaders.ts';
import { box, buildingFront, meshArrays, packAtlas, type Quad, type Rect } from './surfaces.ts';

const PICTURE = 512; // the audience's and the projector's pictures, square
const ATLAS = 1024; // the baked texture, per surface
const FAR = 30;
const BIAS = 0.002; // as a share of FAR: 6 cm
const FPS = 30;
const FRAMES = 30; // one second of show, for the timing

interface Setup {
  name: 'box' | 'building';
  quads: Quad[];
  target: Vector3;
  eye: Vector3;
  offAxis: Vector3;
  projector: Vector3;
  fov: number;
  /** Where the moving things are at time t (seconds): they float in front of the surface. */
  ball: (t: number) => Vector3;
  ring: Vector3;
}

const SETUPS: Setup[] = [
  {
    name: 'box',
    quads: box(1),
    target: new Vector3(0, 0.5, 0),
    eye: new Vector3(0.9, 1.5, -2.6),
    offAxis: new Vector3(-1.4, 1.1, -2.4),
    projector: new Vector3(-0.5, 2.0, -2.8),
    fov: 0.7,
    ball: (t) =>
      new Vector3(
        0.6 * Math.sin(Math.PI * t),
        0.55 + 0.3 * Math.abs(Math.sin(2 * Math.PI * t)),
        -0.95,
      ),
    ring: new Vector3(0.25, 1.3, -0.2),
  },
  {
    name: 'building',
    quads: buildingFront(),
    target: new Vector3(0, 1.6, 0),
    eye: new Vector3(0.6, 1.7, -8),
    offAxis: new Vector3(-3, 1.4, -6.5),
    projector: new Vector3(-1.8, 2.6, -8.5),
    fov: 0.65,
    ball: (t) =>
      new Vector3(
        1.4 * Math.sin(Math.PI * t),
        1.2 + 0.6 * Math.abs(Math.sin(2 * Math.PI * t)),
        -1.8,
      ),
    ring: new Vector3(1.2, 2.2, -0.6),
  },
];

const out = document.getElementById('out')!;
const gallery = document.getElementById('gallery')!;
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

function camera(scene: Scene, name: string, at: Vector3, target: Vector3, fov: number) {
  const c = new FreeCamera(name, at.clone(), scene);
  c.setTarget(target);
  c.fov = fov;
  c.minZ = 0.05;
  c.maxZ = FAR;
  return c;
}

const viewProjection = (c: FreeCamera) =>
  c.getViewMatrix(true).multiply(c.getProjectionMatrix(true));

function shader(
  scene: Scene,
  name: string,
  source: { vertexSource: string; fragmentSource: string },
  samplers: string[],
) {
  const m = new ShaderMaterial(name, scene, source, {
    attributes: ['position', 'normal', 'uv'],
    uniforms: [
      'world',
      'viewProjection',
      'eyeViewProjection',
      'projectorViewProjection',
      'eye',
      'projector',
      'far',
      'bias',
    ],
    samplers,
  });
  m.backFaceCulling = false;
  m.setFloat('far', FAR);
  m.setFloat('bias', BIAS);
  return m;
}

/** A picture rendered only when asked, from one camera, of some meshes, maybe in another material. */
function picture(
  scene: Scene,
  name: string,
  size: number,
  cam: FreeCamera,
  meshes: AbstractMesh[],
  clear: Color4,
  material?: Material,
  nearest = false,
) {
  const t = new RenderTargetTexture(
    name,
    size,
    scene,
    false,
    true,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    false,
    nearest ? Texture.NEAREST_SAMPLINGMODE : Texture.BILINEAR_SAMPLINGMODE,
  );
  t.activeCamera = cam;
  t.renderList = meshes;
  t.clearColor = clear;
  t.wrapU = Texture.CLAMP_ADDRESSMODE;
  t.wrapV = Texture.CLAMP_ADDRESSMODE;
  if (material) t.setMaterialForRendering(meshes, material);
  return t;
}

/** Renders a picture, waiting first until every shader it needs has compiled. */
async function draw(t: RenderTargetTexture) {
  for (let i = 0; i < 600 && !t.isReadyForRendering(); i++) {
    t.render();
    await nextFrame();
  }
  t.render();
}

async function pixels(t: RenderTargetTexture): Promise<Uint8Array> {
  const data = await t.readPixels();
  if (!data) throw new Error(`${t.name}: no pixels`);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** An image of RGBA pixels (bottom row first, as WebGL reads them), for the page and the report. */
function image(data: Uint8Array, size: number, label: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const from = (size - 1 - y) * size * 4;
    img.data.set(data.subarray(from, from + size * 4), y * size * 4);
  }
  // Show transparent texels as dark grey, so the page shows what wasn't baked.
  for (let i = 3; i < img.data.length; i += 4)
    if (img.data[i] === 0) {
      img.data[i - 3] = img.data[i - 2] = img.data[i - 1] = 40;
      img.data[i] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  const figure = document.createElement('figure');
  figure.innerHTML = `<img src="${url}" width="256" height="256" alt=""><figcaption>${label}</figcaption>`;
  gallery.append(figure);
  return url;
}

/**
 * Compares what the audience should see (the show) with what the projector actually puts on
 * the surface, over the pixels the projector lights.
 */
function compare(show: Uint8Array, preview: Uint8Array) {
  let lit = 0;
  let total = 0;
  let bad = 0;
  for (let i = 0; i < preview.length; i += 4) {
    if (preview[i + 3]! < 128) continue;
    const e =
      (Math.abs(show[i]! - preview[i]!) +
        Math.abs(show[i + 1]! - preview[i + 1]!) +
        Math.abs(show[i + 2]! - preview[i + 2]!)) /
      3;
    lit++;
    total += e;
    if (e > 32) bad++;
  }
  return {
    litShare: Math.round((lit / (preview.length / 4)) * 1000) / 1000,
    meanError: Math.round((total / Math.max(1, lit)) * 10) / 10,
    badShare: Math.round((bad / Math.max(1, lit)) * 10000) / 10000,
  };
}

/** For each face: the share of its texels the audience can see, so got paint in the bake. */
function bakedShare(atlas: Uint8Array, quads: Quad[], rects: Rect[]) {
  return Object.fromEntries(
    quads.map((q, i) => {
      const [u0, v0, u1, v1] = rects[i]!;
      let n = 0;
      let painted = 0;
      for (let y = Math.ceil(v0 * ATLAS); y < Math.floor(v1 * ATLAS); y++)
        for (let x = Math.ceil(u0 * ATLAS); x < Math.floor(u1 * ATLAS); x++) {
          n++;
          if (atlas[(y * ATLAS + x) * 4 + 3]! > 0) painted++;
        }
      return [q.name, Math.round((painted / Math.max(1, n)) * 1000) / 1000];
    }),
  );
}

async function run(engine: Engine, setup: Setup) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  const eye = camera(scene, 'eye', setup.eye, setup.target, setup.fov);
  const off = camera(scene, 'off axis', setup.offAxis, setup.target, setup.fov);
  const projector = camera(scene, 'projector', setup.projector, setup.target, setup.fov);
  scene.activeCamera = eye;

  // The surface, in metres and world coordinates, with its texture layout.
  const { rects, scale } = packAtlas(setup.quads);
  const arrays = meshArrays(setup.quads, rects);
  const surface = new Mesh(setup.name, scene);
  Object.assign(new VertexData(), arrays).applyToMesh(surface);
  surface.material = shader(scene, 'paint', paint, []);

  // Things in the show that float in front of the surface, so only the sweet spot lines them up.
  const glow = (name: string, color: Color3) => {
    const m = new StandardMaterial(name, scene);
    m.disableLighting = true;
    m.emissiveColor = color;
    return m;
  };
  const ball = MeshBuilder.CreateSphere(
    'ball',
    { diameter: setup.name === 'box' ? 0.3 : 0.7 },
    scene,
  );
  ball.material = glow('ball', new Color3(1, 0.75, 0.1));
  const ring = MeshBuilder.CreateTorus(
    'ring',
    { diameter: setup.name === 'box' ? 0.35 : 0.9, thickness: setup.name === 'box' ? 0.06 : 0.15 },
    scene,
  );
  ring.material = glow('ring', new Color3(0.2, 0.45, 1));
  ring.position = setup.ring;

  const black = new Color4(0, 0, 0, 1);
  const clear = new Color4(0, 0, 0, 0);
  const white = new Color4(1, 1, 1, 1);

  // Depth pictures from the audience and from the projector: the surface doesn't move.
  const depthFrom = (c: FreeCamera, name: string) => {
    const m = shader(scene, `depth ${name}`, depth, []);
    m.setVector3('eye', c.position);
    return picture(scene, `depth ${name}`, PICTURE, c, [surface], white, m, true);
  };
  const eyeDepth = depthFrom(eye, 'eye');
  const projectorDepth = depthFrom(projector, 'projector');
  await draw(eyeDepth);
  await draw(projectorDepth);

  const show = picture(scene, 'show', PICTURE, eye, [surface, ball, ring], black);
  const bakeMaterial = shader(scene, 'bake', bake, ['showPicture', 'eyeDepth']);
  bakeMaterial.setMatrix('eyeViewProjection', viewProjection(eye));
  bakeMaterial.setVector3('eye', eye.position);
  bakeMaterial.setTexture('showPicture', show);
  bakeMaterial.setTexture('eyeDepth', eyeDepth);
  const baked = picture(scene, 'baked', ATLAS, eye, [surface], clear, bakeMaterial);

  // Bake one second of show, frame by frame, reading every frame back as an exporter would.
  const place = (frame: number) => {
    const t = frame / FPS;
    ball.position = setup.ball(t);
    ring.rotation = new Vector3(Math.PI / 2, 0, t * Math.PI);
  };
  place(0);
  await draw(show);
  await draw(baked);
  const times: number[] = [];
  let atlas: Uint8Array = new Uint8Array();
  for (let f = 0; f < FRAMES; f++) {
    const t0 = performance.now();
    place(f);
    show.render();
    baked.render();
    atlas = await pixels(baked);
    times.push(performance.now() - t0);
  }
  const showPixels = await pixels(show);

  // The illusion check, on the last frame: projector out, then onto a white model of the surface.
  const texturedMaterial = shader(scene, 'textured', textured, ['baked']);
  texturedMaterial.setTexture('baked', baked);
  const projectorOut = picture(
    scene,
    'projector out',
    PICTURE,
    projector,
    [surface],
    black,
    texturedMaterial,
  );
  await draw(projectorOut);

  const projectedMaterial = shader(scene, 'projected', projected, [
    'projectorPicture',
    'projectorDepth',
  ]);
  projectedMaterial.setMatrix('projectorViewProjection', viewProjection(projector));
  projectedMaterial.setVector3('projector', projector.position);
  projectedMaterial.setTexture('projectorPicture', projectorOut);
  projectedMaterial.setTexture('projectorDepth', projectorDepth);
  const previewFrom = (c: FreeCamera, name: string) =>
    picture(scene, name, PICTURE, c, [surface], clear, projectedMaterial);
  const preview = previewFrom(eye, 'preview from the sweet spot');
  const previewOff = previewFrom(off, 'preview from off to one side');
  const showOff = picture(
    scene,
    'show from off to one side',
    PICTURE,
    off,
    [surface, ball, ring],
    black,
  );
  for (const t of [preview, previewOff, showOff]) await draw(t);

  const previewPixels = await pixels(preview);
  const previewOffPixels = await pixels(previewOff);
  const showOffPixels = await pixels(showOff);
  const projectorPixels = await pixels(projectorOut);

  const label = setup.name === 'box' ? 'Box' : 'Building front';
  const images = {
    show: image(showPixels, PICTURE, `${label}: the show, from the sweet spot`),
    baked: image(atlas, ATLAS, `${label}: the baked texture (grey: not seen by the audience)`),
    projector: image(projectorPixels, PICTURE, `${label}: what the projector sends out`),
    preview: image(
      previewPixels,
      PICTURE,
      `${label}: projected on a white model, from the sweet spot`,
    ),
    showOff: image(showOffPixels, PICTURE, `${label}: the show, from off to one side`),
    previewOff: image(previewOffPixels, PICTURE, `${label}: projected, from off to one side`),
  };

  const sorted = [...times].sort((a, b) => a - b);
  const result = {
    surface: setup.name,
    faces: setup.quads.length,
    atlas: { size: ATLAS, texelsPerMetre: Math.round(scale * ATLAS) },
    bakeMs: {
      median: Math.round(sorted[Math.floor(sorted.length / 2)]! * 10) / 10,
      worst: Math.round(sorted.at(-1)! * 10) / 10,
    },
    bakedShare: bakedShare(atlas, setup.quads, rects),
    sweetSpot: compare(showPixels, previewPixels),
    offAxis: compare(showOffPixels, previewOffPixels),
    images,
  };
  scene.dispose();
  return result;
}

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = canvas.height = PICTURE;
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: false }, false);
  const only = new URLSearchParams(location.search).get('surface');
  const results = [];
  for (const setup of SETUPS.filter((s) => !only || s.name === only))
    results.push(await run(engine, setup));
  const result = {
    userAgent: navigator.userAgent,
    renderer: engine.getGlInfo().renderer,
    surfaces: results,
  };
  const forPage = { ...result, surfaces: results.map(({ images: _, ...r }) => r) };
  out.textContent = JSON.stringify(forPage, null, 2);
  (window as unknown as { spikeResult: unknown }).spikeResult = result;
  engine.dispose();
}

main().catch((e) => {
  out.textContent = `Failed: ${e instanceof Error ? e.stack : e}`;
  (window as unknown as { spikeResult: unknown }).spikeResult = { error: String(e) };
});
