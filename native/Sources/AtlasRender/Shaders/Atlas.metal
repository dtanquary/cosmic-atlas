#include <metal_stdlib>
#include "../../AtlasShaderTypes/include/AtlasShaderTypes.h"
using namespace metal;

// Phase 0 placeholder: proves the SwiftPM Metal pipeline. Real passes arrive in Phase 2.
struct PointOut { float4 position [[position]]; float size [[point_size]]; };

vertex PointOut atlas_point_vertex(uint vid [[vertex_id]], const device packed_float3 *positions [[buffer(0)]],
                                   constant AtlasFrameUniforms &frame [[buffer(1)]], constant AtlasChunkUniforms &chunk [[buffer(2)]]) {
  float3 relative = float3(positions[vid]) + chunk.origin;
  PointOut out;
  out.position = frame.projection * float4(frame.viewRotation * relative, 1.0);
  out.size = frame.pointSizePx;
  return out;
}

fragment float4 atlas_point_fragment(float2 coord [[point_coord]]) {
  float r = length(coord - 0.5);
  if (r > 0.5) discard_fragment();
  return float4(0.73, 0.82, 0.9, 0.88 * (1.0 - smoothstep(0.25, 0.5, r)));
}
