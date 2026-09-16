import Foundation
import Compression

/// Whole-file gzip → raw bytes, using Apple's Compression framework on the deflate body.
/// The origin serves `.bin` chunks without `Content-Encoding`, so the client inflates them itself.
public enum Gunzip {
  public static func inflate(_ gz: Data, expectedBytes: Int) throws -> Data {
    guard gz.count >= 18, gz[gz.startIndex] == 0x1f, gz[gz.startIndex + 1] == 0x8b, gz[gz.startIndex + 2] == 8 else { throw AtlasError("Data is not gzip") }
    let flags = gz[gz.startIndex + 3]
    var offset = 10
    func need(_ n: Int) throws { if offset + n > gz.count - 8 { throw AtlasError("Truncated gzip header") } }
    if flags & 0x04 != 0 { try need(2); let xlen = Int(gz[gz.startIndex + offset]) | Int(gz[gz.startIndex + offset + 1]) << 8; offset += 2; try need(xlen); offset += xlen }
    if flags & 0x08 != 0 { while gz[gz.startIndex + offset] != 0 { offset += 1; try need(1) }; offset += 1 }
    if flags & 0x10 != 0 { while gz[gz.startIndex + offset] != 0 { offset += 1; try need(1) }; offset += 1 }
    if flags & 0x02 != 0 { try need(2); offset += 2 }
    let bodyEnd = gz.count - 8
    guard offset < bodyEnd else { throw AtlasError("Truncated gzip body") }
    let isize = gz.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: gz.count - 4, as: UInt32.self) }
    guard Int(isize) == expectedBytes & 0xffff_ffff else { throw AtlasError("Unexpected decoded size") }
    // One byte of slack detects a stream longer than the manifest claims.
    var out = Data(count: expectedBytes + 1)
    let written = out.withUnsafeMutableBytes { dst -> Int in
      gz.withUnsafeBytes { src -> Int in
        compression_decode_buffer(dst.baseAddress!.assumingMemoryBound(to: UInt8.self), expectedBytes + 1,
                                  src.baseAddress!.advanced(by: offset).assumingMemoryBound(to: UInt8.self), bodyEnd - offset, nil, COMPRESSION_ZLIB)
      }
    }
    guard written == expectedBytes else { throw AtlasError("Unexpected decoded size") }
    out.removeLast()
    return out
  }
}
