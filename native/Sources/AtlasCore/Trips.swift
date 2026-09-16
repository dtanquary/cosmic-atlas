import Foundation

// Port of src/trips.ts. Untrusted JSON stays `Any` from JSONSerialization so exact-key checks catch unknown fields, dense ids
// and `__proto__` exactly as on the web; links and files are byte-identical to `JSON.stringify` output.

public let MAX_TRIP_STOPS = 10, MAX_SAVED_TRIPS = 10, MAX_TRIP_FILE_BYTES = 65536, MAX_TRIP_URL_BYTES = 8192

public enum TripStop: Sendable, Equatable {
  case place(id: String, route: String, stop: String, note: String? = nil)
  case view(id: String, name: String, hash: String, note: String? = nil)
  public var id: String { switch self { case .place(let id, _, _, _), .view(let id, _, _, _): id } }
  public var note: String? { switch self { case .place(_, _, _, let note), .view(_, _, _, let note): note } }
}
/// ponytail: the web's `version: 1` literal field is implied; every Swift trip is version 1 and the codecs write it. Add a stored
/// version only when a second trip schema exists.
public struct Trip: Sendable, Equatable {
  public var title: String, stops: [TripStop]
  public init(title: String, stops: [TripStop]) { self.title = title; self.stops = stops }
}
public struct SavedTrip: Sendable, Equatable {
  public var id: String, trip: Trip
  public init(id: String, trip: Trip) { self.id = id; self.trip = trip }
}

public protocol TripStorage {
  func getItem(_ key: String) throws -> String?
  func setItem(_ key: String, _ value: String) throws
}

private let STORAGE = "atlas-custom-trips"
private var key: Regex<Substring> { /^[a-z0-9][a-z0-9-]{0,39}$/ }
private func record(_ v: Any?) -> [String: Any]? { v as? [String: Any] }
private func exact(_ v: [String: Any], _ keys: Set<String>) -> Bool { v.keys.allSatisfy(keys.contains) }
/// `v === 1`: a JSON number equal to one, never `true`.
private func isOne(_ v: Any?) -> Bool {
  guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return false }
  return n.doubleValue == 1
}
/// What `String.prototype.trim` removes: WhiteSpace plus line terminators.
private let jsWhitespace = Set<UInt32>([0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF] + Array(0x2000...0x200A))
/// The web's `text()`: a string of at most `max` code points, non-blank unless `empty`, with no C0/C1 control other than LF.
/// Lone surrogates never reach a Swift String: JSONSerialization rejects their escapes, so such input fails to parse.
private func text(_ v: Any?, _ max: Int, empty: Bool = false) -> String? {
  guard let s = v as? String else { return nil }
  let scalars = s.unicodeScalars.map(\.value)
  guard empty || scalars.contains(where: { !jsWhitespace.contains($0) }), scalars.count <= max,
        !scalars.contains(where: { $0 <= 0x09 || (0x0B...0x1F).contains($0) || (0x7F...0x9F).contains($0) }) else { return nil }
  return s
}

public func builtinStop(_ route: Any?, _ stop: Any?, tours: [TourData]) -> TourStop? {
  guard let route = route as? String, let stop = stop as? String else { return nil }
  return tours.first { $0.key == route }?.stops.first { $0.id == stop }
}
public func decodeStopLink(_ hash: String, tours: [TourData]) -> (route: String, stop: String)? {
  guard let match = hash.wholeMatch(of: /^#stop=1:([a-z0-9-]+):([a-z0-9-]+)$/), builtinStop(String(match.1), String(match.2), tours: tours) != nil else { return nil }
  return (String(match.1), String(match.2))
}
public func encodeStopLink(_ route: String, _ stop: String, tours: [TourData]) -> String? {
  builtinStop(route, stop, tours: tours) != nil ? "#stop=1:\(route):\(stop)" : nil
}

/// Untrusted input is normalized into fresh records; neither HTML nor arbitrary URL schemes enter a trip.
public func validateTrip(_ value: Any?, tours: [TourData]) -> Trip? {
  guard let v = record(value), exact(v, ["version", "title", "stops"]), isOne(v["version"]), let title = text(v["title"], 60),
        let rawStops = v["stops"] as? [Any], !rawStops.isEmpty, rawStops.count <= MAX_TRIP_STOPS else { return nil }
  var stops: [TripStop] = [], ids = Set<String>()
  for raw in rawStops {
    guard let s = record(raw), let id = s["id"] as? String, id.wholeMatch(of: key) != nil, ids.insert(id).inserted else { return nil }
    var note: String? = nil
    if let given = s["note"] { guard let checked = text(given, 180, empty: true) else { return nil }; note = checked.isEmpty ? nil : checked }
    let kind = s["kind"] as? String
    if kind == "place", exact(s, ["id", "kind", "route", "stop", "note"]), builtinStop(s["route"], s["stop"], tours: tours) != nil {
      stops.append(.place(id: id, route: s["route"] as! String, stop: s["stop"] as! String, note: note))
    } else if kind == "view", exact(s, ["id", "kind", "name", "hash", "note"]), let name = text(s["name"], 60), let hash = s["hash"] as? String, hash.utf16.count <= 512 {
      let keys = JSQuery.parse(String(hash.dropFirst())).map(\.key)
      guard hash.hasPrefix("#t="), keys.allSatisfy({ ["t", "c", "g"].contains($0) }), Set(keys).count == keys.count,
            let view = ViewLink.decode(hash), let canonical = ViewLink.encode(view) else { return nil }
      stops.append(.view(id: id, name: name, hash: canonical, note: note))
    } else { return nil }
  }
  return Trip(title: title, stops: stops)
}
/// A typed trip is validated through its JSON form, exactly as the web validates the object it is about to serialize.
public func validateTrip(_ trip: Trip, tours: [TourData]) -> Trip? { validateTrip(trip.jsonObject, tours: tours) }

public func parseTripFile(_ value: String, tours: [TourData]) -> Trip? {
  if value.utf8.count > MAX_TRIP_FILE_BYTES { return nil }
  guard let object = try? JSONSerialization.jsonObject(with: Data(value.utf8), options: .fragmentsAllowed) else { return nil }
  return validateTrip(object, tours: tours)
}
public func serializeTrip(_ trip: Trip, tours: [TourData]) -> String? {
  validateTrip(trip, tours: tours).map { stringify($0.json, indent: true) }
}
private func base64url(_ data: Data) -> String {
  data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacing(/=+$/, with: "")
}
public func encodeTripLink(_ trip: Trip, tours: [TourData]) -> String? {
  guard let valid = validateTrip(trip, tours: tours) else { return nil }
  let hash = "#trip=1." + base64url(Data(stringify(valid.json, indent: false).utf8))
  return hash.count <= 8000 ? hash : nil
}
public func decodeTripLink(_ hash: String, tours: [TourData]) -> Trip? {
  guard hash.utf16.count <= 8000, hash.wholeMatch(of: /^#trip=1\.[A-Za-z0-9_-]+$/) != nil else { return nil }
  let payload = String(hash.dropFirst(8))
  // atob forgives missing padding but not a length of 1 mod 4; the re-encode check keeps the payload canonical.
  var base64 = payload.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
  if base64.count % 4 == 1 { return nil }
  base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
  guard let data = Data(base64Encoded: base64), base64url(data) == payload, let json = String(data: data, encoding: .utf8) else { return nil }
  return parseTripFile(json, tours: tours)
}
/// The link on `base` with its query cleared; nil when the whole URL exceeds `MAX_TRIP_URL_BYTES`.
/// ponytail: an unparsable `base` returns nil where `new URL(base)` throws on the web; the app only ever passes its own origin.
public func tripHref(_ trip: Trip, base: String, tours: [TourData]) -> String? {
  guard let hash = encodeTripLink(trip, tours: tours), var url = URLComponents(string: base) else { return nil }
  url.query = nil; url.fragment = String(hash.dropFirst())
  guard let href = url.string, href.utf8.count <= MAX_TRIP_URL_BYTES else { return nil }
  return href
}
public func tripStopTitle(_ stop: TripStop, tours: [TourData]) -> String {
  switch stop {
  case .place(_, let route, let source, _): builtinStop(route, source, tours: tours)!.title
  case .view(_, let name, _, _): name
  }
}
public func tripRoute(_ trip: Trip, tours: [TourData]) -> TourData {
  TourData(key: "custom", title: trip.title, summary: "A shared itinerary", stops: trip.stops.map { s in
    switch s {
    case .place(let id, let route, let source, let note):
      var stop = builtinStop(route, source, tours: tours)!
      stop.id = id; stop.sourceStop = TourStop.SourceStop(route: route, id: source); stop.note = note
      return stop
    case .view(let id, let name, let hash, let note):
      return TourStop(id: id, cue: "Explore this saved perspective.", note: note, title: name,
                      caption: "A saved camera view. Any included galaxy identity is checked against this catalog; unavailable identities use the camera view alone.",
                      target: TourTarget(kind: .view, view: ViewLink.decode(hash)!), travelSeconds: 2.5)
    }
  })
}

public func readTrips(_ storage: TripStorage, tours: [TourData]) -> [SavedTrip] {
  guard let raw = try? storage.getItem(STORAGE), !raw.isEmpty, raw.utf16.count <= MAX_TRIP_FILE_BYTES * MAX_SAVED_TRIPS + 1024,
        let data = record(try? JSONSerialization.jsonObject(with: Data(raw.utf8), options: .fragmentsAllowed)),
        isOne(data["version"]), let items = data["trips"] as? [Any], items.count <= MAX_SAVED_TRIPS else { return [] }
  var out: [SavedTrip] = []
  for item in items {
    guard let item = record(item), let id = item["id"] as? String, id.wholeMatch(of: key) != nil, !out.contains(where: { $0.id == id }),
          let trip = validateTrip(item["trip"], tours: tours) else { return [] }
    out.append(SavedTrip(id: id, trip: trip))
  }
  return out
}
public func writeTrips(_ storage: TripStorage, _ trips: [SavedTrip], tours: [TourData]) -> Bool {
  guard trips.count <= MAX_SAVED_TRIPS, trips.allSatisfy({ $0.id.wholeMatch(of: key) != nil && validateTrip($0.trip, tours: tours) != nil }),
        Set(trips.map(\.id)).count == trips.count else { return false }
  let json = stringify(.object([("version", .number(1)), ("trips", .array(trips.map { .object([("id", .string($0.id)), ("trip", $0.trip.json)]) }))]), indent: false)
  return (try? storage.setItem(STORAGE, json)) != nil
}

// MARK: - JSON.stringify with the web's key order

/// Ordered JSON, so links and files are byte-identical to the web's `JSON.stringify` output.
indirect enum JSON {
  case string(String), number(Int), array([JSON]), object([(String, JSON)])
  /// The untrusted-`Any` view the validator reads.
  var value: Any {
    switch self {
    case .string(let s): s
    case .number(let n): n
    case .array(let items): items.map(\.value)
    case .object(let pairs): Dictionary(pairs.map { ($0.0, $0.1.value) }, uniquingKeysWith: { $1 })
    }
  }
}
extension TripStop {
  var json: JSON {
    let head: [(String, JSON)]
    switch self {
    case .place(let id, let route, let stop, let note): head = [("id", .string(id))] + (note.map { [("note", .string($0))] } ?? []) + [("kind", .string("place")), ("route", .string(route)), ("stop", .string(stop))]
    case .view(let id, let name, let hash, let note): head = [("id", .string(id))] + (note.map { [("note", .string($0))] } ?? []) + [("kind", .string("view")), ("name", .string(name)), ("hash", .string(hash))]
    }
    return .object(head)
  }
  var jsonObject: [String: Any] { json.value as! [String: Any] }
}
extension Trip {
  var json: JSON { .object([("version", .number(1)), ("title", .string(title)), ("stops", .array(stops.map(\.json)))]) }
  var jsonObject: [String: Any] { json.value as! [String: Any] }
}
/// `JSON.stringify(value)` or `JSON.stringify(value, null, 2)`.
func stringify(_ json: JSON, indent: Bool, depth: Int = 0) -> String {
  let open = indent ? "\n" + String(repeating: "  ", count: depth + 1) : "", close = indent ? "\n" + String(repeating: "  ", count: depth) : ""
  switch json {
  case .string(let s): return jsonString(s)
  case .number(let n): return String(n)
  case .array(let items): return items.isEmpty ? "[]" : "[" + items.map { open + stringify($0, indent: indent, depth: depth + 1) }.joined(separator: ",") + close + "]"
  case .object(let pairs): return pairs.isEmpty ? "{}" : "{" + pairs.map { open + jsonString($0.0) + (indent ? ": " : ":") + stringify($0.1, indent: indent, depth: depth + 1) }.joined(separator: ",") + close + "}"
  }
}
/// JavaScript's string quoting: only `"`, `\` and U+0000–U+001F are escaped; everything else is literal UTF-8.
func jsonString(_ s: String) -> String {
  var out = "\""
  for u in s.unicodeScalars {
    switch u {
    case "\"": out += "\\\""
    case "\\": out += "\\\\"
    case "\u{08}": out += "\\b"
    case "\u{0C}": out += "\\f"
    case "\n": out += "\\n"
    case "\r": out += "\\r"
    case "\t": out += "\\t"
    case _ where u.value < 0x20: out += String(format: "\\u%04x", u.value)
    default: out.unicodeScalars.append(u)
    }
  }
  return out + "\""
}
