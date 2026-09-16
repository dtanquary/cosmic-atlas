#ifndef AtlasShaderTypes_h
#define AtlasShaderTypes_h
#include <simd/simd.h>

// Uniform layouts shared by Swift and Metal Shading Language. Sizes stay under 4 KiB so
// every draw can use setVertexBytes/setFragmentBytes.

#define ATLAS_MODEL_LIMIT 12

typedef struct {
  matrix_float4x4 projection;   // reversed-Z (near -> 1, far -> 0)
  matrix_float3x3 viewRotation; // rotation only; translation is folded into per-draw origins on the CPU in float64
  vector_float2 fadeRange;
  float viewportHeightPx;
  float pointSizePx;
  float minOpacity;
  unsigned int depthCues;
  unsigned int enlargePoints;
  unsigned int hideUncertainLocal;
  vector_float3 detailOrigins[ATLAS_MODEL_LIMIT];
  float detailMix[ATLAS_MODEL_LIMIT];
} AtlasFrameUniforms;

typedef struct {
  vector_float3 origin;      // node.center - camera.position
  vector_float3 worldOrigin; // node.center, for the 1 Mpc local guard
  unsigned int nodeCode;             // Number(node.id) + 1; 65535 = nearby layer
  unsigned int localChunk;           // chunk box within 1 Mpc of the observer
} AtlasChunkUniforms;

/// Observer-centred overlays (CMB shell, lookback rings, survey footprint): one full-screen triangle each.
typedef struct {
  matrix_float3x3 rotation;   // camera world rotation
  vector_float2 lens;         // tan(fov/2) * (aspect, 1)
  vector_float3 observer;     // camera / shell radius
  vector_float3 toOrigin;     // unit vector from the camera toward the observer
  float ringAngle[8];
  unsigned int ringCount;
} AtlasOverlayUniforms;

#endif
