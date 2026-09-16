import Foundation

/// Locates repository files from the native package so tests reuse the web fixtures without duplicating them.
public enum RepoPaths {
  public static let root: URL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent() // AtlasTestSupport
    .deletingLastPathComponent() // Sources
    .deletingLastPathComponent() // native
    .deletingLastPathComponent() // repo
  public static func file(_ path: String) -> URL { root.appendingPathComponent(path) }
  public static func data(_ path: String) throws -> Data { try Data(contentsOf: file(path)) }
  public static func exists(_ path: String) -> Bool { FileManager.default.fileExists(atPath: file(path).path) }
}
