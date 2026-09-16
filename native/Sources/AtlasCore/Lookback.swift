import Foundation

// Port of src/lookback.ts and src/cosmic-scale.ts.

/// Light travel time for a directly measured distance: distance ÷ c, in Gyr.
public func lightTravelGyr(_ mpc: Double) -> Double { mpc * MLY_PER_MPC / 1000 }

public func formatLookback(_ gyr: Double) -> String {
  if !gyr.isFinite || gyr < 0 { return "Unavailable" }
  let years = gyr * 1e9
  let (scale, label): (Double, String) = years >= 1e9 ? (1e9, "billion years") : years >= 1e6 ? (1e6, "million years") : (1, "years")
  return "\(significant(years / scale, 3)) \(label)"
}

public struct LookbackRing: Sendable, Equatable { public var lookbackGyr: Double, comovingMpc: Double, angle: Double }

public struct Lookback: Sendable {
  public let reference: LookbackReference
  public let cmbRadiusMpc: Double
  public init(reference: LookbackReference, cmbRadiusMpc: Double) { self.reference = reference; self.cmbRadiusMpc = cmbRadiusMpc }
  public init(_ data: ReferenceData) { self.init(reference: data.lookback, cmbRadiusMpc: data.cmbRadiusMpc) }

  /// Planck18 lookback time for a present-day comoving distance from the observer.
  public func lookbackForDistance(_ mpc: Double) -> Double {
    let comoving = reference.table.comovingMpc, lookback = reference.table.lookbackGyr, last = comoving.count - 1
    if !mpc.isFinite || mpc < 0 { return .nan }
    if mpc < comoving[0] { return lightTravelGyr(mpc) } // Exact to ~1e-4 below the first row.
    if mpc >= cmbRadiusMpc { return lookback[last] }
    var low = 0, high = last
    while high - low > 1 { let mid = (low + high) >> 1; if comoving[mid] <= mpc { low = mid } else { high = mid } }
    let t = (mpc - comoving[low]) / (comoving[high] - comoving[low])
    return lookback[low] + t * (lookback[high] - lookback[low])
  }

  /// Rings visible from a camera at distance d from the observer: at most 8, ascending, projected ≥28 px apart.
  public func chooseRings(dOriginMpc: Double, fovDeg: Double, aspect: Double, heightPx: Double) -> [LookbackRing] {
    if !dOriginMpc.isFinite || dOriginMpc <= 0 { return [] }
    let tanHalf = tan(fovDeg * .pi / 360), maxAngle = atan(tanHalf * (1 + aspect * aspect).squareRoot()), minAngle = Double.pi / 180
    func pixels(_ angle: Double) -> Double { tan(angle) / tanHalf * heightPx / 2 }
    var kept: [LookbackRing] = []
    // Largest lookback first, so culling drops the crowded inner rings.
    for ring in reference.rings.reversed() where kept.count < 8 {
      if ring.comovingMpc >= dOriginMpc { continue }
      let angle = asin(ring.comovingMpc / dOriginMpc)
      if angle < minAngle || angle > maxAngle { continue }
      // ponytail: fixed 28 px ring spacing stands in for label collision layout; add rect-based culling if oblique views overlap
      if let previous = kept.last, pixels(previous.angle) - pixels(angle) < 28 { continue }
      kept.append(LookbackRing(lookbackGyr: ring.lookbackGyr, comovingMpc: ring.comovingMpc, angle: angle))
    }
    return kept.reversed()
  }
}

/// Radial reach only: neither survey volume nor galaxy census completeness.
public func catalogRadialReach(_ maxDistanceMpc: Double, cmbRadiusMpc: Double) -> Double? {
  maxDistanceMpc.isFinite && maxDistanceMpc >= 0 ? maxDistanceMpc / cmbRadiusMpc : nil
}
