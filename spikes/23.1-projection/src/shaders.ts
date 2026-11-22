/**
 * Spike 23.1's shaders, in GLSL that Babylon.js accepts for WebGL2. Every pass draws the same
 * surface mesh (built in world coordinates, so `world` is the identity) with a different
 * material.
 */

/** Depth as a share of `far`, packed into the four bytes of an ordinary RGBA texture. */
const PACKING = `
vec4 packDepth(float v) {
  vec4 enc = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * clamp(v, 0.0, 0.999999));
  enc -= enc.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  return enc;
}
float unpackDepth(vec4 rgba) {
  return dot(rgba, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
}
`;

/**
 * Where a world point lands in a camera's picture (0–1), and whether it is in front of it.
 * Depth checks divide the bias by how squarely the surface faces the camera: a surface seen at
 * a grazing angle changes depth fast across one pixel of the depth picture (slope-scaled bias,
 * as in shadow mapping), and would otherwise come out in stripes.
 */
const PROJECT = `
vec3 toPicture(mat4 viewProjection, vec3 p) {
  vec4 clip = viewProjection * vec4(p, 1.0);
  if (clip.w <= 0.0) return vec3(-1.0);
  vec2 ndc = clip.xy / clip.w;
  return vec3(ndc * 0.5 + 0.5, 1.0);
}
bool inside(vec2 uv) {
  return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}
`;

const WORLD_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
void main() {
  vec4 w = world * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(world) * normal);
  vUV = uv;
  gl_Position = viewProjection * w;
}
`;

/** The show's own paint on the surface: a checker in world space, tinted by which way it faces. */
export const paint = {
  vertexSource: WORLD_VERTEX,
  fragmentSource: `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec3 c = floor(vWorld * 4.0 + 0.001);
  float check = mod(c.x + c.y + c.z, 2.0);
  vec3 tint = 0.55 + 0.4 * vNormal;
  gl_FragColor = vec4(tint * (0.55 + 0.45 * check), 1.0);
}
`,
};

/** Distance from a camera, as a share of `far`, packed for a depth picture. */
export const depth = {
  vertexSource: WORLD_VERTEX,
  fragmentSource: `
precision highp float;
uniform vec3 eye;
uniform float far;
varying vec3 vWorld;
${PACKING}
void main() {
  gl_FragColor = packDepth(distance(vWorld, eye) / far);
}
`,
};

/**
 * The bake: draws the surface flat in its texture layout, and colours each texel with what the
 * audience at the sweet spot sees at that point. Texels the audience can't see (facing away, or
 * hidden behind another part of the surface) stay transparent.
 */
export const bake = {
  vertexSource: `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 world;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 w = world * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(world) * normal);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`,
  fragmentSource: `
precision highp float;
uniform mat4 eyeViewProjection;
uniform vec3 eye;
uniform float far;
uniform float bias;
uniform sampler2D showPicture;
uniform sampler2D eyeDepth;
varying vec3 vWorld;
varying vec3 vNormal;
${PACKING}
${PROJECT}
void main() {
  vec3 p = toPicture(eyeViewProjection, vWorld);
  if (p.z < 0.0 || !inside(p.xy) || dot(vNormal, eye - vWorld) <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float seen = unpackDepth(texture2D(eyeDepth, p.xy));
  float facing = max(dot(normalize(vNormal), normalize(eye - vWorld)), 0.05);
  if (distance(vWorld, eye) / far > seen + bias / facing) {
    gl_FragColor = vec4(0.0);
    return;
  }
  gl_FragColor = vec4(texture2D(showPicture, p.xy).rgb, 1.0);
}
`,
};

/** The surface wearing its baked texture, unlit: what a mapped projector sends out. */
export const textured = {
  vertexSource: WORLD_VERTEX,
  fragmentSource: `
precision highp float;
uniform sampler2D baked;
varying vec2 vUV;
void main() {
  gl_FragColor = vec4(texture2D(baked, vUV).rgb, 1.0);
}
`,
};

/**
 * A plain white surface lit only by the projector: each point takes the projector's pixel that
 * lands on it, unless it faces away from the projector or another part of the surface blocks
 * the beam. Lit points are opaque; the rest stay transparent, so the check can tell them apart.
 */
export const projected = {
  vertexSource: WORLD_VERTEX,
  fragmentSource: `
precision highp float;
uniform mat4 projectorViewProjection;
uniform vec3 projector;
uniform float far;
uniform float bias;
uniform sampler2D projectorPicture;
uniform sampler2D projectorDepth;
varying vec3 vWorld;
varying vec3 vNormal;
${PACKING}
${PROJECT}
void main() {
  vec3 p = toPicture(projectorViewProjection, vWorld);
  if (p.z < 0.0 || !inside(p.xy) || dot(vNormal, projector - vWorld) <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float lit = unpackDepth(texture2D(projectorDepth, p.xy));
  float facing = max(dot(normalize(vNormal), normalize(projector - vWorld)), 0.05);
  if (distance(vWorld, projector) / far > lit + bias / facing) {
    gl_FragColor = vec4(0.0);
    return;
  }
  gl_FragColor = vec4(texture2D(projectorPicture, p.xy).rgb, 1.0);
}
`,
};
