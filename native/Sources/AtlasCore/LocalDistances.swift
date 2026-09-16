import Foundation

// Port of src/local-distances.ts.

/// Display safeguard for the current redshift-only catalogs, not a reliability boundary.
public let LOCAL_REDSHIFT_GUARD_MPC = 1.0
public func uncertainLocalDistance(_ distanceMpc: Double) -> Bool {
  distanceMpc.isFinite && distanceMpc >= 0 && distanceMpc < LOCAL_REDSHIFT_GUARD_MPC
}
public func uncertainLocalPosition(_ galaxy: Galaxy) -> Bool { galaxy.nearby == nil && uncertainLocalDistance(galaxy.distance) }
