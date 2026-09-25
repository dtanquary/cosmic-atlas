import Foundation

// Procedural density fields from src/milky-way-light.ts and src/magellanic-clouds.ts.
// A density field, not a photograph or a catalog of individual stars.

public let HOME_FIELD_SIZE = 512, HOME_EXTENT_RE = 4.5, HOME_RAY_STEPS = 64
public let CLOUD_FIELD_SIZE = 48, CLOUD_EXTENT_RE = 4.5, CLOUD_RAY_STEPS = 64

@inline(__always) func smooth(_ a: Double, _ b: Double, _ x: Double) -> Double { let t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
@inline(__always) func ridge(_ angle: Double, _ width: Double) -> Double { let w = atan2(sin(angle), cos(angle)) / width; return exp(-0.5 * w * w) }
@inline(__always) func jsFloor(_ x: Double) -> Int32 { Int32(truncatingIfNeeded: Int64(floor(x))) }
@inline(__always) func hash2(_ x: Int32, _ y: Int32, _ seed: Int32) -> Double {
  var h = imul(x, 374761393) ^ imul(y, 668265263) ^ seed
  h = imul(h ^ ushr(h, 13), 1274126177)
  return Double(UInt32(bitPattern: h ^ ushr(h, 16))) / 4294967295
}
func noise2(_ x: Double, _ y: Double, _ seed: Int32) -> Double {
  let ix = jsFloor(x), iy = jsFloor(y), u = smooth(0, 1, x - Double(ix)), v = smooth(0, 1, y - Double(iy))
  let a = hash2(ix, iy, seed), b = hash2(ix &+ 1, iy, seed), c = hash2(ix, iy &+ 1, seed), d = hash2(ix &+ 1, iy &+ 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/// Channels hold sqrt(old disk), sqrt(young arms), dust, and faint emission regions.
public func milkyWayDensityField(_ reference: MilkyWayReference, size: Int = HOME_FIELD_SIZE) -> [UInt8] {
  var data = [UInt8](repeating: 0, count: size * size * 4)
  let winding = 1 / tan(14 * Double.pi / 180)
  let phase = Double.pi - reference.barAngleDeg * .pi / 180, bar = reference.barHalfLengthMpc / reference.radiusMpc
  let sunR = reference.observerDistanceMpc / reference.radiusMpc
  for y in 0..<size { for x in 0..<size {
    let px = ((Double(x) + 0.5) / Double(size) * 2 - 1) * HOME_EXTENT_RE, py = ((Double(y) + 0.5) / Double(size) * 2 - 1) * HOME_EXTENT_RE, r = hypot(px, py)
    let edge = 1 - smooth(3.5, HOME_EXTENT_RE, r); if edge == 0 { continue }
    let coarse = noise2(px * 3.1 + 7, py * 3.1 - 4, 20260911), fine = noise2(px * 18 - 9, py * 18 + 2, 20260911), grain = noise2(px * 65, py * 65, 20260911)
    let cloud = 0.5 * coarse + 0.3 * fine + 0.2 * grain
    let theta = atan2(py, px), spiral = phase + winding * log(max(r, bar) / bar)
    let bend = 0.42 * (coarse - 0.5) + 0.1 * (fine - 0.5) + 0.07 * sin(r * 7 + theta * 3)
    let width = 0.23 + 0.1 / max(1, r)
    var arms = 0.0, dust = 0.0
    // Two stronger stellar arms and two fainter, broken secondary arms: illustrative paths, not a fit to arm tracers.
    for arm in 0..<4 {
      let strength = arm % 2 == 0 ? 1 : 0.48 + 0.16 * sin(r * 7 + Double(arm))
      let offset = theta - spiral - Double(arm) * .pi / 2 + bend + 0.07 * sin(r * 4 + Double(arm) * 1.7)
      arms += strength * ridge(offset, width)
      dust += strength * (ridge(offset + 0.19, width * 0.25) + 0.55 * ridge(offset + 0.34 + 0.07 * fine, width * 0.14))
    }
    // A short local spur near the Sun (negative model X), not an extra ring.
    let spur = theta - .pi - winding * log(max(r, 0.1) / sunR)
    let spurFall = (r - 1.86) / 0.4
    arms += 0.32 * ridge(spur, 0.12) * exp(-(spurFall * spurFall))
    let onset = smooth(0.78, 1.3, r), outer = exp(-0.8 * r) * edge
    let old = exp(-1.67834699 * r) * edge * (0.7 + 0.6 * cloud)
    let young = outer * onset * (0.24 + 0.76 * arms) * (0.24 + 1.45 * cloud)
    let filaments = pow(1 - abs(2 * noise2(px * 11 + coarse * 2, py * 11, 20260911) - 1), 9)
    let dustDensity = smooth(0.4, 1.2, r) * edge * exp(-0.22 * r) * (0.1 + 1.65 * dust + 0.5 * filaments) * (0.15 + 1.65 * cloud)
    let emission = young * smooth(0.64, 0.84, fine) * smooth(0.5, 0.8, grain) * 0.65
    let i = (y * size + x) * 4
    data[i] = UInt8((old.squareRoot() * 255).rounded()); data[i + 1] = UInt8((min(1, young).squareRoot() * 255).rounded())
    data[i + 2] = UInt8((min(1, dustDensity) * 255).rounded()); data[i + 3] = UInt8((min(1, emission) * 255).rounded())
  } }
  return data
}

@inline(__always) func hash3(_ x: Int32, _ y: Int32, _ z: Int32, _ seed: Int32) -> Double {
  var h = imul(x, 374761393) ^ imul(y, 668265263) ^ imul(z, 2147483647) ^ seed
  h = imul(h ^ ushr(h, 13), 1274126177)
  return Double(UInt32(bitPattern: h ^ ushr(h, 16))) / 4294967295
}
func noise3(_ x: Double, _ y: Double, _ z: Double, _ seed: Int32) -> Double {
  let ix = jsFloor(x), iy = jsFloor(y), iz = jsFloor(z), u = smooth(0, 1, x - Double(ix)), v = smooth(0, 1, y - Double(iy)), w = smooth(0, 1, z - Double(iz))
  func mix(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }
  func plane(_ k: Int32) -> Double { mix(mix(hash3(ix, iy, k, seed), hash3(ix &+ 1, iy, k, seed), u), mix(hash3(ix, iy &+ 1, k, seed), hash3(ix &+ 1, iy &+ 1, k, seed), u), v) }
  return mix(plane(iz), plane(iz &+ 1), w)
}
@inline(__always) func gaussian3(_ x: Double, _ y: Double, _ z: Double, _ sx: Double, _ sy: Double, _ sz: Double) -> Double { exp(-0.5 * ((x / sx) * (x / sx) + (y / sy) * (y / sy) + (z / sz) * (z / sz))) }

/// RG stores sqrt(stellar light) and dust. No telescope pixels or gas map.
public func cloudDensityField(_ kind: MagellanicCloudKind, size: Int = CLOUD_FIELD_SIZE) -> [UInt8] {
  var data = [UInt8](repeating: 0, count: size * size * size * 2)
  let seed: Int32 = kind == .lmc ? 2026091203 : 2026091204
  for z in 0..<size { for y in 0..<size { for x in 0..<size {
    let px = ((Double(x) + 0.5) / Double(size) * 2 - 1) * CLOUD_EXTENT_RE, py = ((Double(y) + 0.5) / Double(size) * 2 - 1) * CLOUD_EXTENT_RE, pz = ((Double(z) + 0.5) / Double(size) * 2 - 1) * CLOUD_EXTENT_RE
    let edge = 1 - smooth(3.3, CLOUD_EXTENT_RE - CLOUD_EXTENT_RE * 2 / Double(size), (px * px + py * py + pz * pz).squareRoot()); if edge == 0 { continue }
    let coarse = noise3(px * 1.8 + 4, py * 1.8 - 3, pz * 2, seed), fine = noise3(px * 4.3, py * 4.3, pz * 0.8, seed), grain = noise3(px * 8, py * 8, pz * 1.4, seed)
    let warp = (coarse - 0.5) * 0.55
    let envelope: Double, knots: Double
    if kind == .lmc {
      envelope = 0.13 * gaussian3(px, py, pz, 1.35, 1.2, 0.8) + 0.39 * gaussian3(px - 0.12, py + 0.23, pz, 1.25, 0.3, 0.55)
      knots = 0.19 * gaussian3(px - 1.05, py - 0.65, pz - 0.15, 0.38, 0.5, 0.48) + 0.11 * gaussian3(px + 0.95, py - 0.85, pz + 0.2, 0.57, 0.4, 0.6)
        + 0.09 * gaussian3(px + 0.8, py + 0.9, pz, 0.68, 0.43, 0.48) + 0.1 * gaussian3(px - 1.35, py + 0.6, pz + 0.25, 0.45, 0.7, 0.55)
    } else {
      envelope = 0.12 * gaussian3(px, py, pz, 1.35, 0.95, 1.1) + 0.29 * gaussian3(px + 0.35, py + 0.12, pz, 1.05, 0.52, 0.75)
      knots = 0.14 * gaussian3(px + 0.9, py - 0.18 - warp, pz + 0.24, 0.52, 0.43, 0.68) + 0.14 * gaussian3(px - 0.35, py + 0.27 - warp, pz - 0.18, 0.6, 0.48, 0.58)
        + 0.2 * gaussian3(px - 1.25, py - 0.7, pz + 0.2, 0.7, 0.42, 0.7) + 0.07 * gaussian3(px + 0.3, py - 1.1, pz - 0.5, 0.46, 0.57, 0.55)
    }
    let billow = 0.12 + 5 * pow(0.65 * coarse + 0.35 * fine, 2.5)
    let stellar = (envelope * (0.75 + 0.5 * coarse) + knots * billow) * edge
    let filaments = pow(1 - abs(2 * fine - 1), 5)
    let dust = stellar * (0.2 + 2.8 * filaments) * (0.35 + 0.8 * grain)
    let index = ((z * size + y) * size + x) * 2
    data[index] = UInt8((min(1, stellar).squareRoot() * 255).rounded()); data[index + 1] = UInt8((min(1, dust) * 255).rounded())
  } } }
  return data
}

public struct CloudSamples: Sendable, Equatable { public var positions: [Float], sizes: [Float], emission: [UInt8] }
/// Uniform rejection samples of this same bounded field, not generic clumps.
public func cloudLightSamples(_ kind: MagellanicCloudKind, field: [UInt8], count: Int = 4096) -> CloudSamples {
  var random = JSRandom(seed: kind == .lmc ? 1203 : 1204)
  var positions = [Float](repeating: 0, count: count * 3), sizes = [Float](repeating: 0, count: count), emission = [UInt8](repeating: 0, count: count)
  var i = 0
  let s = CLOUD_FIELD_SIZE
  while i < count {
    let x = random.next(), y = random.next(), z = random.next()
    let index = ((Int(z * Double(s)) * s + Int(y * Double(s))) * s + Int(x * Double(s))) * 2
    let v = Double(field[index]) / 255
    if random.next() > v * v { continue }
    positions[i * 3] = Float((x * 2 - 1) * CLOUD_EXTENT_RE); positions[i * 3 + 1] = Float((y * 2 - 1) * CLOUD_EXTENT_RE); positions[i * 3 + 2] = Float((z * 2 - 1) * CLOUD_EXTENT_RE)
    sizes[i] = Float(0.024 + random.next() * 0.028); emission[i] = random.next() < 0.025 ? 1 : 0
    i += 1
  }
  return CloudSamples(positions: positions, sizes: sizes, emission: emission)
}
