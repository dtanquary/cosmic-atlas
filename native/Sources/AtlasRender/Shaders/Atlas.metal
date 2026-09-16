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
