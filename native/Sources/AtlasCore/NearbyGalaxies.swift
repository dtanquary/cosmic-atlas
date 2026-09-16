import Foundation

// Port of src/nearby-galaxies.ts (data side; the ResolvedGalaxy models port with the volume passes).

public func nearbyDetails(_ reference: NearbyReference) throws -> [GalaxyDetailData] {
  let entries = reference.entries
  if entries.count > 12 || Set(entries.map(\.id)).count != entries.count || entries.contains(where: { $0.id >= 0 }) {
    throw AtlasError("Invalid nearby layer: use up to 12 distinct negative internal IDs.")
  }
  return entries.map { entry in
    let family = GalaxyFamily(rawValue: entry.family) ?? .irregular
    return GalaxyDetailData(
      catalogId: "nearby", catalogSourceSha256: reference.source.excerptSha256, name: entry.name,
      galaxy: Galaxy(id: entry.id, targetId: "nearby:\(entry.key)", ra: entry.raDeg, dec: entry.decDeg, z: nil, zerr: nil, distance: entry.distanceMpc, delta: nil,
                     position: cartesian(ra: entry.raDeg, dec: entry.decDeg, distance: entry.distanceMpc),
                     nearby: NearbyInfo(key: entry.key, name: entry.name, aliases: entry.aliases, method: entry.method, distanceError: entry.distanceError, distanceSource: entry.distanceSource, shapeNote: entry.shapeNote, shapeSources: entry.shapeSources, orientationMeasured: entry.orientationMeasured)),
      shape: .init(radiusArcsec: entry.radiusArcsec, e1: entry.e1, e2: entry.e2, sersic: family == .elliptical ? 2 : 1, profileType: "adopted-local"),
      gaussians: entry.gaussians, fitMaxRelativeError: entry.profileFitMaxRelativeError,
      spiral: family == .spiral ? .init(arms: 2, pitchDegrees: entry.key == "m31" ? 12 : 20, phaseRadians: 0.4, seed: UInt32(100 - entry.id)) : nil,
      model: .init(family: family, typeSource: family == .irregular ? .proxy : .catalog, typeLabel: entry.typeLabel, shapeMeasured: entry.shapeMeasured, sourceName: "Nearby-galaxy literature", profileIndex: 0),
      knotCount: 12000, cloud: entry.key == "lmc" ? .lmc : entry.key == "smc" ? .smc : nil)
  }
}
