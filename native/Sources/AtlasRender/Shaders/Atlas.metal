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
