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
  out.code = (chunk.nodeCode << 16) | vid;
  return out;
}

fragment float4 atlas_point_fragment(PointOut in [[stage_in]], float2 coord [[point_coord]], constant AtlasFrameUniforms &frame [[buffer(2)]]) {
  float r = length(coord - float2(0.5));
  if (r > 0.5 || in.visibility <= 0.0) discard_fragment();
  float alpha = (frame.depthCues ? in.visibility : 0.88) * (1.0 - smoothstep(0.25, 0.5, r));
  alpha *= 1.0 - in.detail;
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
// src/galaxy-portraits.ts). Each is a screen-space quad clipped to a conservative NDC rectangle.

constant int DISK_SIZE [[function_constant(0)]];
constant int DISK_STEPS [[function_constant(1)]];
constant int DISK_KIND [[function_constant(2)]]; // 0 = Milky Way, 1 = portrait

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

/// Shared continuous stellar/dust template: forward rays, finite extent, exact vertical integration and filtered detail
/// at grazing angles. Function constants pick the Milky Way's bar/bulge terms or a portrait's bulge and light mix.
fragment float4 atlas_volume_disk(VolumeOut in [[stage_in]], constant AtlasVolumeUniforms &u [[buffer(0)]],
                                  texture2d<float> density [[texture(0)]], sampler densitySampler [[sampler(0)]]) {
  const float EXTENT = 4.5;
  float3 origin = u.origin * float3(1.0, 1.0, u.thickness);
  float3 ray = normalize(volumeRay(in.ndc, u) * float3(1.0, 1.0, u.thickness));
  // Finite slab plus radial cylinder, including parallel rays and inside views.
  float3 inv = float3(ray.x < 0.0 ? -1.0 : 1.0, ray.y < 0.0 ? -1.0 : 1.0, ray.z < 0.0 ? -1.0 : 1.0) / max(abs(ray), float3(1e-7));
  float3 a = (-float3(EXTENT, EXTENT, 0.8) - origin) * inv, b = (float3(EXTENT, EXTENT, 0.8) - origin) * inv;
  float3 lo = min(a, b), hi = max(a, b);
  float entry = max(0.0, max(lo.x, max(lo.y, lo.z))), exit = min(hi.x, min(hi.y, hi.z));
  float qa = dot(ray.xy, ray.xy), qb = dot(origin.xy, ray.xy), qc = dot(origin.xy, origin.xy) - EXTENT * EXTENT;
  bool dead = false;
  if (qa > 1e-8) { float disc = qb * qb - qa * qc; if (disc < 0.0) dead = true; else { float root = sqrt(disc); entry = max(entry, (-qb - root) / qa); exit = min(exit, (-qb + root) / qa); } }
  else if (qc > 0.0) dead = true;
  if (dead || exit <= entry) { discard_fragment(); return float4(0.0); } // ponytail: neighbours lose this lane's derivatives at the silhouette
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
    float3 emission;
    if (DISK_KIND == 0) {
      float2 barPos = float2(dot(p.xy, u.barDirection), dot(p.xy, float2(-u.barDirection.y, u.barDirection.x)));
      float barEnd = 1.0 - smoothstep(0.75, 1.0, abs(barPos.x) / u.barRadius);
      float barLight = 0.15 * exp(-2.0 * pow(barPos.x / u.barRadius, 2.0) - 2.0 * pow(barPos.y / 0.23, 2.0)) * barEnd * column(z0, z1, 0.055, ray.z, stepSize);
      // Smooth box/peanut center blends into the long bar, with no bright knots.
      float bulgeHeight = 0.13 + 0.055 * exp(-pow((abs(barPos.x) - 0.35) / 0.2, 2.0));
      float bulgeRadius = length(float3(barPos.x / 0.55, barPos.y / 0.27, p.z / bulgeHeight));
      float bulge = 3.8 * exp(-2.3 * bulgeRadius) * stepSize;
      float3 diskColor = mix(float3(0.83, 0.76, 0.65), float3(0.63, 0.70, 0.81), smoothstep(0.5, 2.8, r));
      emission = old * 1.25 * diskColor + young * 0.85 * float3(0.62, 0.70, 0.82) + (barLight + bulge) * float3(1.0, 0.86, 0.66);
    } else {
      float bulge = u.portrait.x * exp(-2.3 * length(float3(p.xy / u.portrait.y, p.z / (u.portrait.y * 0.55)))) * stepSize;
      float3 diskColor = mix(float3(0.83, 0.76, 0.65), float3(0.56, 0.66, 0.81), smoothstep(0.3, 1.8, r));
      emission = old * u.portrait.z * diskColor + young * u.portrait.w * mix(float3(0.53, 0.66, 0.85), u.diskColor, 0.18);
      emission += bulge * mix(float3(1.0, 0.86, 0.68), u.coreColor, 0.15);
    }
    emission += field.a * column(z0, z1, 0.025, ray.z, stepSize) * float3(0.6, 0.24, 0.3);
    float dust = field.b * column(z0, z1, 0.019, ray.z, stepSize) * u.dustStrength;
    // Greater blue extinction gives warm dust edges without orange glow.
    float3 opticalDepth = dust * float3(0.72, 0.95, 1.3);
    float3 through = exp(-opticalDepth);
    light += transmission * emission * (1.0 - through + 1e-5) / (opticalDepth + 1e-5);
    transmission *= through;
  }
  // Fixed exposure with a shoulder: the core retains color at every angle.
  float3 color = 0.94 * (1.0 - exp(-light * 1.65));
  float opacity = 1.0 - dot(transmission, float3(0.2126, 0.7152, 0.0722));
  if (max(color.r, max(color.g, color.b)) < 0.0001 && opacity < 0.0001) { discard_fragment(); return float4(0.0); }
  return float4(color * u.mix, opacity * u.mix);
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
