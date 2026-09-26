#include <metal_stdlib>
#include "../../AtlasShaderTypes/include/AtlasShaderTypes.h"
using namespace metal;

// Ports of the RawShaderMaterial GLSL in src/explorer.ts. No tone mapping or colour conversion anywhere:
// values land in the bgra8Unorm drawable exactly as written, like the web's drawing buffer.

struct PointOut {
  float4 position [[position]];
  float size [[point_size]];
  float visibility;
  float detail;
  float uncertainLocal;
  float fade [[flat]];
  uint code [[flat]];
};

/// Catalog point vertex: chunk-relative float32 offsets plus a per-draw float64-derived origin; a slotted point snaps to its
/// resident model's exact centre and fades with the model's crossfade.
vertex PointOut atlas_point_vertex(uint vid [[vertex_id]],
                                   const device packed_float3 *positions [[buffer(0)]],
                                   const device uchar *detailSlots [[buffer(1)]],
                                   constant AtlasFrameUniforms &frame [[buffer(2)]],
                                   constant AtlasChunkUniforms &chunk [[buffer(3)]]) {
  float3 position = float3(positions[vid]);
  float3 relative = position + chunk.origin;
  PointOut out;
  out.detail = 0.0;
  uint slot = detailSlots[vid];
  if (slot > 0) { relative = frame.detailOrigins[slot - 1]; out.detail = frame.detailMix[slot - 1]; }
  out.position = frame.projection * float4(frame.viewRotation * relative, 1.0);
  out.size = frame.pointSizePx;
  out.visibility = 1.0;
  out.uncertainLocal = 0.0;
  if (frame.depthCues || frame.enlargePoints) {
    float distanceToCamera = length(relative);
    if (frame.depthCues) out.visibility = mix(1.0, frame.minOpacity, smoothstep(frame.fadeRange.x, frame.fadeRange.y, distanceToCamera));
    // Screen markers grow by at most 65%, only within 150 Mpc of the camera.
    if (frame.enlargePoints) out.size *= 1.0 + 0.65 * (1.0 - smoothstep(0.0, 150.0, distanceToCamera));
  }
  if (chunk.localChunk) {
    float3 world = position + chunk.worldOrigin;
    if (dot(world, world) < 1.0) { // LOCAL_REDSHIFT_GUARD_MPC²
      out.uncertainLocal = 1.0;
      if (frame.hideUncertainLocal) out.visibility = 0.0;
    }
  }
  out.fade = 1.0 - chunk.fadeOut;
  out.code = (chunk.nodeCode << 16) | vid;
  return out;
}

fragment float4 atlas_point_fragment(PointOut in [[stage_in]], float2 coord [[point_coord]], constant AtlasFrameUniforms &frame [[buffer(2)]]) {
  float r = length(coord - float2(0.5));
  if (r > 0.5 || in.visibility <= 0.0) discard_fragment();
  float alpha = (frame.depthCues ? in.visibility : 0.88) * (1.0 - smoothstep(0.25, 0.5, r));
  alpha *= (1.0 - in.detail) * in.fade;
  if (alpha <= 0.0) discard_fragment();
  return float4(mix(float3(0.73, 0.82, 0.9), float3(1.0, 0.61, 0.23), in.uncertainLocal), alpha);
}

/// GPU ID pass: the 32-bit code as little-endian RGBA8, no blending.
fragment float4 atlas_pick_fragment(PointOut in [[stage_in]], float2 coord [[point_coord]]) {
  if (length(coord - float2(0.5)) > 0.5 || in.visibility <= 0.0) discard_fragment();
  uint c = in.code;
  return float4(float(c & 255u), float((c >> 8) & 255u), float((c >> 16) & 255u), float((c >> 24) & 255u)) / 255.0;
}

struct MarkerOut { float4 position [[position]]; float size [[point_size]]; };

vertex MarkerOut atlas_marker_vertex(constant AtlasFrameUniforms &frame [[buffer(2)]], constant AtlasChunkUniforms &chunk [[buffer(3)]]) {
  MarkerOut out;
  out.position = frame.projection * float4(frame.viewRotation * chunk.origin, 1.0);
  out.size = frame.pointSizePx;
  return out;
}

fragment float4 atlas_marker_fragment(float2 coord [[point_coord]], constant float3 &color [[buffer(0)]]) {
  float r = length(coord - float2(0.5));
  if (r > 0.49 || r < 0.34) discard_fragment();
  return float4(color, 0.9);
}

struct LineOut { float4 position [[position]]; };

vertex LineOut atlas_line_vertex(uint vid [[vertex_id]], const device packed_float3 *positions [[buffer(0)]],
                                 constant AtlasFrameUniforms &frame [[buffer(2)]], constant AtlasChunkUniforms &chunk [[buffer(3)]]) {
  LineOut out;
  out.position = frame.projection * float4(frame.viewRotation * (float3(positions[vid]) + chunk.origin), 1.0);
  return out;
}

fragment float4 atlas_line_fragment() { return float4(0.4, 0.76, 0.85, 0.7); }

// Observer-centred reference overlays (src/screen-overlay.ts and users): a full-screen triangle whose fragment shader
// reconstructs each ray from NDC, the camera rotation and the lens; transparent, depth-free, one draw each.

struct OverlayOut { float4 position [[position]]; float2 ndc; };

vertex OverlayOut atlas_overlay_vertex(uint vid [[vertex_id]]) {
  const float2 corners[3] = { float2(-1.0, -1.0), float2(3.0, -1.0), float2(-1.0, 3.0) };
  OverlayOut out;
  out.position = float4(corners[vid], 0.0, 1.0);
  out.ndc = corners[vid];
  return out;
}

static inline float3 overlayRay(float2 ndc, constant AtlasOverlayUniforms &o) { return normalize(o.rotation * float3(ndc * o.lens, -1.0)); }

static inline float cmbGrid(float3 n) {
  const float PI = 3.141592653589793;
  float2 coord = float2(atan2(n.y, n.x) * 6.0 / PI, asin(clamp(n.z, -1.0, 1.0)) * 6.0 / PI);
  float2 width = max(fwidth(coord), float2(0.00001));
  float2 line = 1.0 - smoothstep(width * 0.4, width * 1.4, abs(fract(coord + 0.5) - 0.5));
  // Fade converging meridians and undersampled lines instead of aliasing.
  line *= 1.0 - smoothstep(float2(0.12), float2(0.4), width);
  line.x *= smoothstep(0.02, 0.12, 1.0 - abs(n.z));
  return max(line.x, line.y);
}

/// Fixed world-space sphere at the CMB radius, ray traced per pixel; the camera is normalised by the sourced radius.
fragment float4 atlas_cmb_fragment(OverlayOut in [[stage_in]], constant AtlasOverlayUniforms &o [[buffer(0)]]) {
  float3 ray = overlayRay(in.ndc, o);
  float b = dot(o.observer, ray), c = dot(o.observer, o.observer) - 1.0;
  float discriminant = b * b - c;
  float edgeWidth = max(fwidth(discriminant), 0.000001);
  if (discriminant < 0.0) discard_fragment();
  float root = sqrt(discriminant), nearT = -b - root, farT = -b + root;
  if (farT <= 0.0) discard_fragment(); // Never draw intersections behind the camera.
  float3 back = normalize(o.observer + ray * farT);
  float3 front = normalize(o.observer + ray * nearT);
  float rim = pow(1.0 - abs(dot(back, ray)), 4.0);
  // The far surface stays continuous inside. Fade the near surface before crossing it.
  float nearWeight = smoothstep(0.002, 0.04, max(0.0, nearT));
  float alpha = 0.007 + 0.021 * cmbGrid(back) + 0.08 * rim;
  alpha += nearWeight * (0.011 + 0.055 * cmbGrid(front) + 0.14 * rim + 0.10 * exp(-discriminant / (edgeWidth * 1.5)));
  alpha *= smoothstep(0.0, edgeWidth, discriminant);
  float tint = mix(back.z, front.z, nearWeight * 0.75) * 0.5 + 0.5;
  float3 color = mix(float3(0.31, 0.61, 0.72), float3(0.50, 0.43, 0.64), tint);
  return float4(color, alpha);
}

/// Each ring is the silhouette of an observer-centred sphere: a cone of half-angle asin(r/d) around the direction to the origin.
fragment float4 atlas_rings_fragment(OverlayOut in [[stage_in]], constant AtlasOverlayUniforms &o [[buffer(0)]]) {
  float3 ray = overlayRay(in.ndc, o);
  float ang = atan2(length(cross(ray, o.toOrigin)), dot(ray, o.toOrigin));
  float w = max(fwidth(ang), 1e-5);
  float alpha = 0.0;
  for (uint i = 0; i < 8; i++) { if (i >= o.ringCount) break; alpha += 1.0 - smoothstep(w * 0.5, w * 1.5, abs(ang - o.ringAngle[i])); }
  if (alpha <= 0.0) discard_fragment();
  return float4(float3(0.31, 0.61, 0.72), min(alpha, 1.0) * 0.35);
}

/// Sky occupancy of the accepted rows painted on an observer-centred shell at the catalog's maximum distance.
fragment float4 atlas_footprint_fragment(OverlayOut in [[stage_in]], constant AtlasOverlayUniforms &o [[buffer(0)]],
                                         texture2d<float> mask [[texture(0)]], sampler maskSampler [[sampler(0)]]) {
  const float PI = 3.141592653589793;
  float3 ray = overlayRay(in.ndc, o);
  float b = dot(o.observer, ray), c = dot(o.observer, o.observer) - 1.0;
  float discriminant = b * b - c;
  if (discriminant < 0.0) discard_fragment();
  float root = sqrt(discriminant), nearT = -b - root, farT = -b + root;
  if (farT <= 0.0) discard_fragment();
  float nearWeight = smoothstep(0.002, 0.04, max(0.0, nearT));
  float3 nb = normalize(o.observer + ray * farT), nf = normalize(o.observer + ray * nearT);
  float occupancyBack = mask.sample(maskSampler, float2(atan2(nb.y, nb.x) / (2.0 * PI), asin(clamp(nb.z, -1.0, 1.0)) / PI + 0.5)).r;
  float occupancyFront = mask.sample(maskSampler, float2(atan2(nf.y, nf.x) / (2.0 * PI), asin(clamp(nf.z, -1.0, 1.0)) / PI + 0.5)).r;
  float alpha = 0.3 * occupancyBack + nearWeight * 0.3 * occupancyFront;
  alpha *= smoothstep(0.0, max(fwidth(discriminant), 0.000001), discriminant);
  if (alpha <= 0.0) discard_fragment(); // Unsurveyed sky stays dark rather than tinted.
  return float4(float3(0.35, 0.80, 0.90), alpha);
}

// Galaxy volumes (src/galaxy-detail.ts, src/disk-volume.ts, src/magellanic-clouds.ts, src/milky-way-light.ts,
// src/galaxy-looks.ts). Each is a screen-space quad clipped to a conservative NDC rectangle.

constant int DISK_SIZE [[function_constant(0)]];
constant int DISK_STEPS [[function_constant(1)]];
constant bool LOOK_HOME [[function_constant(2)]]; // the Milky Way: the home march takes over inside the disc

struct VolumeOut { float4 position [[position]]; float2 ndc; };

vertex VolumeOut atlas_volume_vertex(uint vid [[vertex_id]], constant AtlasVolumeUniforms &u [[buffer(0)]]) {
  const float2 corners[4] = { float2(-1.0, -1.0), float2(1.0, -1.0), float2(-1.0, 1.0), float2(1.0, 1.0) };
  float2 ndc = mix(u.bounds.xy, u.bounds.zw, corners[vid] * 0.5 + 0.5);
  VolumeOut out;
  out.position = float4(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}

static inline float3 volumeRay(float2 ndc, constant AtlasVolumeUniforms &u) {
  return u.toModel * normalize(u.forward + ndc.x * u.projection.x * u.right + ndc.y * u.projection.y * u.up);
}

// Analytic half-ray integral of an oblate Gaussian. Integrating only in front of the camera also allows flying through
// the volume without a billboard flip.
static inline float erfcApprox(float x) {
  float z = abs(x), t = 1.0 / (1.0 + 0.3275911 * z);
  float p = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  float value = p * exp(-z * z);
  return x < 0.0 ? 2.0 - value : value;
}

fragment float4 atlas_volume_gaussian(VolumeOut in [[stage_in]], constant AtlasVolumeUniforms &u [[buffer(0)]]) {
  float3 ray = volumeRay(in.ndc, u);
  float a = dot(ray, ray), b = dot(u.origin, ray);
  float3 perpendicular = cross(u.origin, ray);
  float r2 = dot(perpendicular, perpendicular) / a;
  if (r2 > 64.0) { discard_fragment(); return float4(0.0); }
  float brightness = 0.0;
  for (int i = 0; i < 20; i++) {
    float2 g = u.gaussians[i];
    brightness += g.y * exp(-0.5 * r2 / (g.x * g.x)) * 0.5 * erfcApprox(b / (sqrt(2.0 * a) * g.x));
  }
  brightness *= u.normalization / sqrt(a);
  float light = (1.0 - exp(-u.exposure * brightness)) * (1.0 - smoothstep(36.0, 64.0, r2));
  if (light < 0.0001) { discard_fragment(); return float4(0.0); }
  // Color is illustrative and independent of the source light profile.
  float3 color = mix(u.diskColor, u.coreColor, smoothstep(u.palette == 1.0 ? 0.03 : 0.04, u.palette == 1.0 ? 1.5 : 1.6, brightness));
  return float4(color * light, u.mix);
}

// Integrate each thin vertical layer exactly across a ray cell. Midpoint-only sampling aliases into bands as an
// inclined camera crosses the dust plane.
static inline float column(float z0, float z1, float height, float rayZ, float stepSize) {
  if (abs(rayZ) < 1e-5) return exp(-abs((z0 + z1) * 0.5) / height) * stepSize / (2.0 * height);
  float integral = z0 * z1 < 0.0 ? 2.0 - exp(-abs(z0) / height) - exp(-abs(z1) / height)
                                 : exp(-min(abs(z0), abs(z1)) / height) * (1.0 - exp(-abs(z1 - z0) / height));
  return integral / (2.0 * abs(rayZ));
}

/// The home galaxy's continuous stellar/dust march (src/disk-volume.ts, src/milky-way-light.ts): forward rays, finite
/// extent, exact vertical integration and filtered detail at grazing angles. Premultiplied light and opacity, or a
/// negative opacity outside the volume.
static inline float4 diskMarch(float3 origin, float3 ray, constant AtlasVolumeUniforms &u, texture2d<float> density, sampler densitySampler) {
  const float EXTENT = 4.5;
  // Finite slab plus radial cylinder, including parallel rays and inside views.
  float3 inv = float3(ray.x < 0.0 ? -1.0 : 1.0, ray.y < 0.0 ? -1.0 : 1.0, ray.z < 0.0 ? -1.0 : 1.0) / max(abs(ray), float3(1e-7));
  float3 a = (-float3(EXTENT, EXTENT, 0.8) - origin) * inv, b = (float3(EXTENT, EXTENT, 0.8) - origin) * inv;
  float3 lo = min(a, b), hi = max(a, b);
  float entry = max(0.0, max(lo.x, max(lo.y, lo.z))), exit = min(hi.x, min(hi.y, hi.z));
  float qa = dot(ray.xy, ray.xy), qb = dot(origin.xy, ray.xy), qc = dot(origin.xy, origin.xy) - EXTENT * EXTENT;
  bool dead = false;
  if (qa > 1e-8) { float disc = qb * qb - qa * qc; if (disc < 0.0) dead = true; else { float root = sqrt(disc); entry = max(entry, (-qb - root) / qa); exit = min(exit, (-qb + root) / qa); } }
  else if (qc > 0.0) dead = true;
  if (dead || exit <= entry) return float4(0.0, 0.0, 0.0, -1.0); // ponytail: neighbours lose this lane's derivatives at the silhouette
  float stepSize = (exit - entry) / float(DISK_STEPS);
  float3 light = float3(0.0), transmission = float3(1.0);
  for (int i = 0; i < DISK_STEPS; i++) {
    float3 p = origin + ray * (entry + (float(i) + 0.5) * stepSize);
    float r = length(p.xy);
    float z0 = p.z - ray.z * stepSize * 0.5, z1 = p.z + ray.z * stepSize * 0.5;
    // Filter both the screen footprint and the distance traversed in this cell.
    float footprint = max(length(ray.xy) * stepSize, max(length(dfdx(p.xy)), length(dfdy(p.xy))));
    float lod = log2(max(1.0, footprint * float(DISK_SIZE) / (EXTENT * 2.0)));
    float4 field = density.sample(densitySampler, p.xy / (EXTENT * 2.0) + 0.5, level(lod));
    float2 disk = field.rg * field.rg;
    float old = disk.r * column(z0, z1, 0.065, ray.z, stepSize);
    float young = disk.g * column(z0, z1, 0.028, ray.z, stepSize);
    float2 barPos = float2(dot(p.xy, u.barDirection), dot(p.xy, float2(-u.barDirection.y, u.barDirection.x)));
    float barEnd = 1.0 - smoothstep(0.75, 1.0, abs(barPos.x) / u.barRadius);
    float barLight = 0.15 * exp(-2.0 * pow(barPos.x / u.barRadius, 2.0) - 2.0 * pow(barPos.y / 0.23, 2.0)) * barEnd * column(z0, z1, 0.055, ray.z, stepSize);
    // Smooth box/peanut center blends into the long bar, with no bright knots.
    float bulgeHeight = 0.13 + 0.055 * exp(-pow((abs(barPos.x) - 0.35) / 0.2, 2.0));
    float bulgeRadius = length(float3(barPos.x / 0.55, barPos.y / 0.27, p.z / bulgeHeight));
    float bulge = 3.8 * exp(-2.3 * bulgeRadius) * stepSize;
    float3 diskColor = mix(float3(0.83, 0.76, 0.65), float3(0.63, 0.70, 0.81), smoothstep(0.5, 2.8, r));
    float3 emission = old * 1.25 * diskColor + young * 0.85 * float3(0.62, 0.70, 0.82) + (barLight + bulge) * float3(1.0, 0.86, 0.66);
    emission += field.a * column(z0, z1, 0.025, ray.z, stepSize) * float3(0.6, 0.24, 0.3);
    float dust = field.b * column(z0, z1, 0.019, ray.z, stepSize) * u.dustStrength;
    // Greater blue extinction gives warm dust edges without orange glow.
    float3 opticalDepth = dust * float3(0.72, 0.95, 1.3);
    float3 through = exp(-opticalDepth);
    light += transmission * emission * (1.0 - through + 1e-5) / (opticalDepth + 1e-5);
    transmission *= through;
  }
  // Fixed exposure with a shoulder: the core retains color at every angle.
  return float4(0.94 * (1.0 - exp(-light * 1.65)), 1.0 - dot(transmission, float3(0.2126, 0.7152, 0.0722)));
}

/// Deliberate illustrations at two sourced galaxy positions, never new objects.
fragment float4 atlas_volume_cloud(VolumeOut in [[stage_in]], constant AtlasVolumeUniforms &u [[buffer(0)]],
                                   texture3d<float> cloud [[texture(0)]], sampler cloudSampler [[sampler(0)]]) {
  const float EXTENT2 = 4.5 * 4.5;
  float3 direction = volumeRay(in.ndc, u);
  float rate = length(direction);
  float3 ray = direction / rate;
  float b = dot(u.origin, ray), c = dot(u.origin, u.origin) - EXTENT2, disc = b * b - c;
  if (disc <= 0.0) { discard_fragment(); return float4(0.0); }
  float root = sqrt(disc), entry = max(0.0, -b - root), exit = -b + root;
  if (exit <= entry) { discard_fragment(); return float4(0.0); }
  float stepSize = (exit - entry) / 64.0;
  float columnStep = stepSize / (rate * u.thickness);
  float3 light = float3(0.0);
  float transmission = 1.0;
  for (int i = 0; i < 64; i++) {
    float3 p = u.origin + ray * (entry + (float(i) + 0.5) * stepSize);
    float2 field = cloud.sample(cloudSampler, p / 9.0 + 0.5).rg;
    float density = field.r * field.r;
    float dust = field.g * u.dustStrength;
    float optical = (density * 0.7 + dust) * columnStep;
    // Qualitative SMASH image features; these coordinates are illustrative and never alter the sourced global ellipse.
    float bar = exp(-0.5 * (pow((p.x - 0.12) / 1.2, 2.0) + pow((p.y + 0.23) / 0.3, 2.0)));
    float2 d1 = p.xy - float2(1.05, 0.65), d2 = p.xy - float2(-0.9, 0.7), d3 = p.xy - float2(0.2, -0.85), d4 = p.xy - float2(1.1, 0.7), d5 = p.xy - float2(0.5, 0.3);
    float brightPatch = exp(-dot(d1, d1) / 0.075);
    float smallPatches = exp(-dot(d2, d2) / 0.09) + 0.7 * exp(-dot(d3, d3) / 0.08);
    float wingPatches = exp(-dot(d4, d4) / 0.12) + 0.6 * exp(-dot(d5, d5) / 0.06);
    float nebula = mix(brightPatch + 0.25 * smallPatches, 0.65 * wingPatches + 0.3 * smallPatches, u.cloudKind);
    float3 color = mix(float3(0.57, 0.69, 0.84), u.diskColor, 0.16);
    color = mix(color, float3(0.84, 0.79, 0.73), bar * (1.0 - u.cloudKind) * 0.75);
    color = mix(color, float3(1.0, 0.34, 0.49), clamp(nebula * (0.65 + field.g), 0.0, 0.85));
    float emitted = 1.0 - exp(-density * 0.85 * columnStep);
    light += transmission * color * emitted;
    transmission *= exp(-optical);
  }
  if (max(light.r, max(light.g, light.b)) < 0.0001) { discard_fragment(); return float4(0.0); }
  return float4(1.0 - exp(-light * 1.3), u.mix);
}

struct ArmOut { float4 position [[position]]; float size [[point_size]]; float3 color; float weight; };

vertex ArmOut atlas_arms_vertex(uint vid [[vertex_id]], const device packed_float3 *positions [[buffer(0)]], const device packed_float3 *colors [[buffer(1)]],
                                const device float *sizes [[buffer(2)]], constant AtlasArmUniforms &u [[buffer(3)]]) {
  float3 view = u.viewRotation * (float3(positions[vid]) + u.origin);
  ArmOut out;
  out.position = u.projection * float4(view, 1.0);
  float diameter = u.scale * sizes[vid] / max(0.000001, -view.z);
  out.size = clamp(diameter, 1.0, 64.0);
  out.weight = min(1.0, pow(diameter / out.size, 2.0));
  out.color = float3(colors[vid]);
  return out;
}

fragment float4 atlas_arms_fragment(ArmOut in [[stage_in]], float2 coord [[point_coord]], constant AtlasArmUniforms &u [[buffer(3)]]) {
  float r = length(coord - 0.5);
  if (r > 0.5) discard_fragment();
  float glow = exp(-18.0 * r * r) * (1.0 - smoothstep(0.38, 0.5, r));
  return float4(in.color, 0.055 * glow * in.weight * u.mix);
}

// Procedural spiral looks (src/galaxy-looks.ts, after the Atrium Galaxy screensaver): thin disc, bulge and dust
// evaluated once where each ray crosses the midplane, keeping per-pixel detail at any zoom. Grazing and in-plane rays
// fall back to a march through the azimuthally averaged disc, or with LOOK_HOME to the home march, which also takes
// over whenever the camera is within the disc layer. Constants mirror lookDisc in GalaxyLooks.swift.
namespace look {
constant float SCALE = 0.4, FADE_START = 0.85, FADE_END = 1.4, SLAB = 0.3, QB = 0.6;
constant int STEPS = 48;
static inline float2 turn(float2 v, float a) { float c = cos(a), s = sin(a); return float2(c * v.x - s * v.y, s * v.x + c * v.y); }
static inline float wrapMod(float x, float y) { return x - y * floor(x / y); }
static inline float2x2 m2(float a, float b, float c, float d) { return float2x2(float2(a, b), float2(c, d)); }
// Integer hashes (Jarzynski & Olano 2020) give identical lattices on every GPU.
static inline float lattice(float2 i) {
  uint2 v = uint2(int2(i)) * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u;
  return float(v.x) / 4294967296.0;
}
static inline float4 hash4(float2 cell, int salt) {
  uint4 v = uint4(uint2(int2(cell)), uint(salt), 7u) * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z; v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return float4(v) / 4294967296.0;
}
static inline float noise(float2 p) {
  float2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lattice(i), lattice(i + float2(1, 0)), u.x), mix(lattice(i + float2(0, 1)), lattice(i + float2(1, 1)), u.x), u.y);
}
// Detail finer than about two pixels fades to its mean instead of aliasing.
static inline float keep(float frequency, float footprint) { return 1.0 - smoothstep(0.25, 0.5, frequency * footprint); }
static inline float fbm3(float2 p) { float2 p1 = p * 2.03 + float2(1.7, 9.2); return 0.5 * noise(p) + 0.25 * noise(p1) + 0.125 * noise(p1 * 2.03 + float2(1.7, 9.2)) + 0.047; }
static inline float2 fbmRidge(float2 p, float footprint) {
  float v = 0.0, ridges = 0.0, a = 0.5, w = 1.0, frequency = 1.0;
  for (int i = 0; i < 5; i++) {
    float k = keep(frequency, footprint), n = noise(p), rr = 1.0 - abs(2.0 * n - 1.0); rr *= rr;
    v += a * mix(0.5, n, k); ridges += a * mix(0.35, rr * w, k); w = clamp(rr * 2.0, 0.0, 1.0);
    p = m2(1.6, 1.2, -1.2, 1.6) * p + float2(1.7, 9.2); a *= 0.5; frequency *= 2.0;
  }
  return float2(v, ridges);
}
// A narrow profile across an arm, widened (with its light conserved) once the arm spacing approaches a pixel.
static inline float band(float ph, float k, float dph) { float kk = k / (1.0 + 0.3 * k * dph * dph); return pow(0.5 + 0.5 * cos(ph), kk) * sqrt(kk / k); }
// One star per cell, a round pinpoint on screen: M maps a step in the disc to points.
static inline float2 discStar(float2 g, float cell, int salt, float chance, float2x2 M) {
  float4 h = hash4(floor(g / cell), salt);
  if (h.x > chance) return float2(0.0);
  float d = length(M * ((fract(g / cell) - 0.5 - (h.yz - 0.5) * 0.8) * cell)), mag = pow(h.w, 2.5);
  return float2(exp(-d * d * (4.5 - 2.5 * mag)) * (0.3 + 1.6 * mag), h.x / max(chance, 1e-4));
}
// Cells about `points` across on screen, blended over two octaves so zooming reveals new stars rather than resizing old ones.
static inline float2 starLayer(float2 g, float points, float unitsPerPoint, int salt, float chance, float2x2 M) {
  float level = max(log2(points * unitsPerPoint / 0.0005), -4.0), l0 = floor(level), f = level - l0, cell = 0.0005 * exp2(l0);
  int i = int(l0) + 64;
  return discStar(g, cell, salt * 256 + i, chance, M) * (1.0 - f) + discStar(g, cell * 2.0, salt * 256 + i + 1, chance, M) * f;
}
// An H II region with its young cluster, physically sized (0.8-3.2 points at the original's 390 points per disc radius).
static inline float2 knot(float2 g, float cell, float chance, float2x2 M, float pointsPerUnit) {
  float4 h = hash4(floor(g / cell), 41);
  if (h.x > chance) return float2(0.0);
  float size = (0.8 + 2.4 * pow(h.w, 3.0)) / 390.0 * pointsPerUnit, shown = max(size, 0.7);
  float l = length(M * ((fract(g / cell) - 0.5 - (h.yz - 0.5) * 0.3) * cell)) / shown;
  return float2(exp(-l * l * 2.0), exp(-l * l * 8.0)) * (0.3 + 0.7 * h.x / max(chance, 1e-4)) * (size * size) / (shown * shown);
}
static inline float discLight(float r, float k) { return exp(-r / SCALE) * smoothstep(FADE_END * k, FADE_START * k, r); }
}

fragment float4 atlas_volume_look(VolumeOut in [[stage_in]], constant AtlasVolumeUniforms &u [[buffer(0)]],
                                  texture2d<float> density [[texture(0)]], sampler densitySampler [[sampler(0)]]) {
  using namespace look;
  float S = u.pattern.w, k = u.pattern.z, EXTENT = 1.6 * k, H_OLD = 0.065 * S, H_YOUNG = 0.028 * S, H_DUST = 0.019 * S;
  float3 oRe = u.origin * float3(1.0, 1.0, u.thickness), o = oRe * S;
  float3 ray = normalize(volumeRay(in.ndc, u) * float3(1.0, 1.0, u.thickness));
  float cosi = abs(ray.z), tp = abs(ray.z) < 1e-6 ? -1.0 : -o.z / ray.z;
  // Derivatives before any discard: the crossing point's footprint on the disc, turned (and mirrored) into the pattern.
  float pc = cos(u.pattern.x), ps = sin(u.pattern.x);
  float2x2 R = m2(pc, -ps * u.pattern.y, ps, pc * u.pattern.y);
  float2 g = R * (o + ray * clamp(tp, 0.0, 64.0)).xy, gx = dfdx(g), gy = dfdy(g);
  float4 home = LOOK_HOME ? diskMarch(oRe, ray, u, density, densitySampler) : float4(0.0, 0.0, 0.0, -1.0);
  float arms = u.shape.x, cot = u.shape.y, bar = u.shape.z, bulgeR = u.shape.w, ragged = u.arms.x, r0 = max(bar, bulgeR * 1.6);
  // The bulge: an oblate cloud whose projection is the original's Sersic n=2 profile, part ahead of the camera, part behind the dust.
  float3 P = o * float3(1.0, 1.0, 1.0 / QB), D = ray * float3(1.0, 1.0, 1.0 / QB);
  float dd = dot(D, D), tc = -dot(P, D) / dd, bulgeW = max(bulgeR * 1.7, 1e-4), rb = length(P + D * tc) / bulgeW;
  float bulge = (20.0 * exp(-3.67 * sqrt(rb)) + 1.5 * exp(-rb * rb * 60.0)) / (sqrt(dd) * QB) * clamp(0.5 + 0.5 * tc * sqrt(dd) / bulgeW, 0.0, 1.0);
  float behind = tp > 0.0 ? clamp(0.5 - 0.5 * (tp - tc) * sqrt(dd) / bulgeW, 0.0, 1.0) : 0.0;
  // Finite slab and cylinder, including inside views.
  float3 inv = float3(ray.x < 0.0 ? -1.0 : 1.0, ray.y < 0.0 ? -1.0 : 1.0, ray.z < 0.0 ? -1.0 : 1.0) / max(abs(ray), float3(1e-7));
  float3 a = (-float3(EXTENT, EXTENT, SLAB) - o) * inv, b = (float3(EXTENT, EXTENT, SLAB) - o) * inv, lo = min(a, b), hi = max(a, b);
  float entry = max(0.0, max(lo.x, max(lo.y, lo.z))), exit = min(hi.x, min(hi.y, hi.z));
  float qa = dot(ray.xy, ray.xy), qb = dot(o.xy, ray.xy), qc = dot(o.xy, o.xy) - EXTENT * EXTENT, disc = qb * qb - qa * qc;
  if (qa > 1e-8 && disc >= 0.0) { float root = sqrt(disc); entry = max(entry, (-qb - root) / qa); exit = min(exit, (-qb + root) / qa); } else if (qc > 0.0) exit = entry;
  float dust0 = u.arms.y * u.dustStrength, w = smoothstep(0.06, 0.16, cosi) * (LOOK_HOME ? smoothstep(0.05, 0.2, abs(o.z)) : 1.0);
  if (exit <= entry && bulge < 1e-4 && home.a < 0.0) { discard_fragment(); return float4(0.0); }
  float3 light = float3(0.0), transmission = float3(1.0), vivid = float3(0.0), bulgeDust = float3(1.0);
  if (w > 0.0 && exit > entry) {
    float r = length(g), ro = r / k;
    // Screen footprint in disc units per point, and its inverse for round pinpoints.
    float2x2 J = float2x2(gx, gy) * u.pixelRatio;
    float ja = dot(J[0], J[0]), jb = dot(J[0], J[1]), jd = dot(J[1], J[1]), half_ = 0.5 * (ja + jd), spread = sqrt(max(half_ * half_ - (ja * jd - jb * jb), 0.0));
    float sMax = sqrt(half_ + spread), sMin = sqrt(max(half_ - spread, 1e-20)), fp = sMax / u.pixelRatio, det = J[0].x * J[1].y - J[1].x * J[0].y;
    float2x2 M = m2(J[1].y, -J[0].y, -J[1].x, J[0].x) * (1.0 / (abs(det) < 1e-20 ? 1e-20 : det));
    float steep = smoothstep(0.5, 0.25, cosi), soft = mix(1.0, 0.4, steep);
    // Swirled space: logarithmic arms are straight rays, and noise is sheared along them.
    float lr = log(max(r, r0 * 0.35) / r0);
    float2 q = turn(g, lr * cot), qn = turn(g, lr * min(cot, 1.0));
    float warp = fbm3(q * 2.2 + u.seed) - 0.5, aq = atan2(q.y, q.x), ph = arms * aq + warp * (2.0 + 5.0 * ragged);
    float dph = arms * sqrt(1.0 + cot * cot) / max(r, r0 * 0.35) * fp;
    float armN = wrapMod(floor(ph / 6.2832 + 0.5), arms);
    float armAmp = (0.6 + 0.4 * hash4(float2(armN, floor(u.seed.x)), 5).x) * mix(1.0, u.arms.z, wrapMod(armN, 2.0));
    float crest = band(ph, (4.0 - 2.0 * ragged) * soft, dph) * armAmp, young = band(ph - 0.35, 8.0 * soft, dph) * armAmp, hii = band(ph + 0.2, 10.0 * soft, dph) * armAmp;
    float n5 = noise(q * 5.0 + u.seed.yx), floc = ragged * ragged;
    crest *= mix(1.0, smoothstep(0.3, 0.7, n5), ragged);
    if (floc > 0.1) {
      float patches = smoothstep(0.45, 0.8, n5 * 0.6 + mix(0.5, noise(q * 11.0 - u.seed), keep(11.0, fp * 1.5)) * 0.4) * armAmp;
      crest = mix(crest, max(crest * 0.35, patches), floc); young = mix(young, patches, floc); hii = mix(hii, patches, floc);
    }
    // Star clouds are lumpy in the disc itself, so arms read as clusters, not brush strokes.
    float lumps = mix(0.5, noise(g * 16.0 + u.seed), keep(16.0, fp)) * 0.5 + mix(0.5, noise(m2(0.8, 0.6, -0.6, 0.8) * g * 47.0 - u.seed), keep(47.0, fp)) * 0.5;
    float clump = smoothstep(0.2, 0.9, lumps);
    float inArms = smoothstep(r0 * 0.8, r0 * 1.5, r) * mix(1.0, smoothstep(1.25, 0.9, ro), steep);
    float sigma = discLight(r, k), arm = crest * inArms * (0.5 + 0.9 * clump);
    // Dust: broken lanes on the arms' inner edges with narrow dark cores, feathers, a filament web down to the nucleus,
    // and lanes along a bar's leading edges.
    float2 fr = fbmRidge(qn * 6.0 + u.seed * 1.3 + 3.0, fp * 6.0 * 1.5);
    float dt = fr.x, lp = ph + 0.45 + (dt - 0.5) * 2.5, lc = 0.5 + 0.5 * cos(lp);
    float along = lc > 0.6 ? mix(0.5, noise(qn * 40.0 + u.seed), keep(40.0, fp * 1.5)) : 0.5;
    float broken = smoothstep(0.25, 0.8, lumps + dt - 0.5);
    float lane = band(lp, 14.0 * mix(1.0, 0.7, steep), dph) * broken * mix(0.45, 1.0, smoothstep(0.3, 0.7, along));
    float perp = r / arms / sqrt(1.0 + cot * cot), lw = (0.004 + 0.006 * lumps) * (1.0 + 1.5 * steep), lwShown = max(lw, 0.6 * fp);
    float l1 = (lp - 6.2832 * floor(lp / 6.2832 + 0.5)) * perp / lwShown;
    float core = exp(-l1 * l1) * lw / lwShown * smoothstep(0.3, 0.7, along) * broken;
    float tanP = 1.0 / cot, kf = (1.0 - tanP * 0.7) / (tanP + 0.7);
    float fu = 18.0 * (aq - (cot - kf) * lr) / 6.2832 + (dt - 0.5) * 0.8, phw = ph - 6.2832 * floor(ph / 6.2832 + 0.5);
    float feather = pow(0.5 + 0.5 * cos(6.2832 * fu), 8.0) * step(0.45, hash4(float2(wrapMod(floor(fu + 0.5), 18.0), floor(u.seed.y)), 9).x)
                  * smoothstep(-1.8, -0.3, phw) * smoothstep(0.7, 0.4, phw) * smoothstep(0.3, 0.55, dt) * keep(18.0 / 6.2832 / max(r, 0.05), fp);
    float web = smoothstep(0.25, 0.7, fr.y) * mix(1.0, 0.4, steep);
    float ax = abs(g.x) / max(bar, 0.001), barY = (g.y - sign(g.x) * bar * (0.1 + 0.15 * ax * ax)) / (0.02 + 0.02 * dt);
    float barLane = step(0.001, bar) * exp(-barY * barY) * smoothstep(0.1, 0.35, ax) * smoothstep(1.1, 0.8, ax) * smoothstep(0.3, 0.6, dt + 0.2);
    float barZone = mix(1.0, smoothstep(bar * 0.7, bar * 1.1, r), step(0.001, bar));
    float dust = ((lane * 0.7 + core * 0.8) * (1.0 - 0.7 * floc) + feather * 0.7 * (1.0 - ragged)) * smoothstep(r0 * 0.5, r0 * 0.95, r)
               + barLane * 0.9 + web * (0.25 + 0.9 * crest) * smoothstep(0.015, 0.06, r) * barZone;
    // A thin midplane sheet: it reddens the light behind it, blue first.
    float3 absorb = exp(-dust * smoothstep(1.3, 0.5, ro) * dust0 / cosi * float3(0.65, 0.8, 1.0));
    float bx = g.x / max(bar, 0.001), by = g.y / max(bar * 0.3, 0.001); bx *= bx;
    float barLight = step(0.001, bar) * exp(-bx * bx - by * by);
    float3 old = mix(u.coreColor, u.diskColor, smoothstep(0.05, 0.7, r)), tint = mix(old, u.youngColor, clamp(arm * 0.7 + 0.6 * smoothstep(0.4, 1.1, ro), 0.0, 1.0));
    float tex = 0.7 + 0.6 * (0.55 * lumps + 0.45 * mix(0.5, noise(m2(0.6, -0.8, 0.8, 0.6) * g * 110.0 + u.seed.yx), keep(110.0, fp)));
    // Dust sits in a thin midplane layer: as in the original, a third of the old disc's light is in front of it.
    float zs = clamp(o.z, -SLAB, SLAB), ze = tp > 0.0 ? -sign(o.z) * SLAB : sign(ray.z) * SLAB, zc = tp > 0.0 ? 0.0 : ze;
    float oldFront = column(zs, zc, H_OLD, ray.z, 0.0), oldBack = tp > 0.0 ? column(0.0, ze, H_OLD, ray.z, 0.0) : 0.0;
    float youngColumn = column(zs, zc, H_YOUNG, ray.z, 0.0) + (tp > 0.0 ? column(0.0, ze, H_YOUNG, ray.z, 0.0) : 0.0);
    float3 seen = tp > 0.0 ? absorb : float3(1.0);
    float3 a1 = (tint * sigma * 0.84 * tex + u.coreColor * barLight * 0.9) * (oldFront + oldBack) * mix(seen, float3(1.0), 0.3);
    float3 a2 = (tint * sigma * 3.5 * arm * tex + u.youngColor * young * inArms * clump * sigma * 1.2) * youngColumn * seen;
    // Resolved stars: a fine grain that follows the light, and blue giants past the crests.
    float2 s1 = starLayer(g, 2.2, sMax, 3, clamp(crest * inArms * 4.0 * smoothstep(1.4, 0.9, ro) + sigma * 0.6, 0.0, 0.85), M);
    float giants = clamp(young * inArms * clump * 2.0, 0.0, 0.3) * smoothstep(1.4, 1.0, ro);
    float2 s2 = giants > 0.002 ? starLayer(g, 11.0, sMax, 11, giants, M) : float2(0.0);
    float3 stars = (mix(old, u.youngColor, smoothstep(0.05, 0.4, crest)) * s1.x * min(sigma * (1.5 + 3.0 * arm), 0.3) + u.youngColor * s2.x * 0.5) * seen;
    // H II regions in complexes along the arms' inner edges; part of their pink stays saturated past the stretch.
    float2 kn = float2(0.0);
    float strung = hii * inArms * smoothstep(1.2, 0.8, ro), shownKnots = smoothstep(2.0, 5.0, 0.041 / sMax);
    if (strung > 0.002 && shownKnots > 0.0) {
      float groups = smoothstep(0.3, 0.7, noise(g * 9.0 + u.seed.yx));
      kn = knot(g, 0.041, clamp(strung * groups * 12.0 * u.arms.w, 0.0, 0.9), M, 1.0 / sMin) * shownKnots * mix(1.0, 1.6, clamp(u.arms.w - 1.0, 0.0, 1.0));
    }
    float fade = 0.25 + 0.75 * smoothstep(1.2, 0.3, ro);
    float3 through = sqrt(seen);
    float weight = LOOK_HOME ? 1.0 : w;
    light = (a1 + a2 + stars + (u.emissionColor * kn.x * 1.5 + mix(u.youngColor, float3(1.0), 0.5) * kn.y * 1.5) * through * fade) * weight;
    vivid = u.emissionColor * kn.x * 0.7 * through * fade * weight;
    transmission = seen; bulgeDust = seen;
  }
  if (!LOOK_HOME && w < 1.0 && exit > entry) {
    // In-plane and grazing rays: march the azimuthally averaged disc and dust.
    float dt = (exit - entry) / float(STEPS);
    float3 marched = float3(0.0), through = float3(1.0), atBulge = float3(1.0);
    for (int i = 0; i < STEPS; i++) {
      float t = entry + (float(i) + 0.5) * dt;
      float3 p = o + ray * t;
      float r = length(p.xy), ro = r / k, z0 = p.z - ray.z * dt * 0.5, z1 = p.z + ray.z * dt * 0.5, sigma = discLight(r, k);
      float inArms = smoothstep(r0 * 0.8, r0 * 1.5, r);
      float3 old = mix(u.coreColor, u.diskColor, smoothstep(0.05, 0.7, r)), tint = mix(old, u.youngColor, clamp(0.14 * inArms + 0.6 * smoothstep(0.4, 1.1, ro), 0.0, 1.0));
      float cellO = column(z0, z1, H_OLD, ray.z, dt), cellY = column(z0, z1, H_YOUNG, ray.z, dt), cellD = column(z0, z1, H_DUST, ray.z, dt);
      float3 e = tint * sigma * (0.84 * cellO + 0.6 * inArms * cellY);
      float3 tau = 0.15 * smoothstep(1.3, 0.5, ro) * smoothstep(r0 * 0.5, r0 * 0.95, r) * dust0 * cellD * float3(0.65, 0.8, 1.0);
      float3 cell = exp(-tau);
      marched += through * e * (1.0 - cell + 1e-5) / (tau + 1e-5);
      through *= cell;
      if (t < tc) atBulge = through;
    }
    light += marched * (1.0 - w); transmission = mix(through, transmission, w); bulgeDust = mix(atBulge, bulgeDust, w);
  }
  light += u.coreColor * bulge * ((1.0 - behind) + behind * bulgeDust);
  // Hubble-style stretch on brightness: faint outskirts lift, the core keeps its colour, and only the brightest parts pale.
  float lum = dot(light, float3(0.3, 0.5, 0.2)) + 1e-4, stretched = log(20.0 * lum + sqrt(400.0 * lum * lum + 1.0)) / 6.17;
  float3 col = mix(min(light * stretched / lum, float3(1.0)), float3(stretched), 0.5 * smoothstep(0.55, 1.0, stretched)) + vivid;
  col = 0.96 * min(col, float3(1.0));
  float opacity = 1.0 - dot(transmission, float3(0.2126, 0.7152, 0.0722));
  if (LOOK_HOME) { float4 shown = mix(max(home, float4(0.0)), float4(col, opacity), w); col = shown.rgb; opacity = shown.a; }
  if (max(col.r, max(col.g, col.b)) < 0.002 && opacity < 0.0001) { discard_fragment(); return float4(0.0); }
  return float4(col * u.mix, opacity * u.mix);
}
