import Foundation

/// JavaScript number and query formatting, reproduced exactly so links round-trip with the web app.
public enum JSNumber {
  /// `` `${+v.toPrecision(precision)}` `` — round to significant digits (half-up), reparse, print shortest form.
  public static func format(_ v: Double, precision: Int = 12) -> String {
    guard v.isFinite else { return v.isNaN ? "NaN" : (v < 0 ? "-Infinity" : "Infinity") }
    if v == 0 { return "0" }
    // Exact-enough decimal expansion, then half-up rounding as ToPrecision specifies ("pick the larger n").
    let exp = String(format: "%.60e", abs(v))
    let parts = exp.split(separator: "e")
    var digits = Array(parts[0].replacingOccurrences(of: ".", with: ""))
    var exponent = Int(parts[1])!
    if digits.count > precision {
      let roundUp = digits[precision] >= "5"
      digits = Array(digits[0..<precision])
      if roundUp {
        var i = precision - 1
        while i >= 0 {
          if digits[i] == "9" { digits[i] = "0"; i -= 1 } else { digits[i] = Character(String(digits[i].wholeNumberValue! + 1)); break }
        }
        if i < 0 { digits.insert("1", at: 0); digits.removeLast(); exponent += 1 }
      }
    }
    let rounded = Double("\(v < 0 ? "-" : "")\(digits[0]).\(String(digits[1...]))e\(exponent)")!
    return toString(rounded)
  }

  /// `Number.prototype.toString()` for a finite double: shortest round-trip digits in JavaScript's layout.
  public static func toString(_ v: Double) -> String {
    if v == 0 { return "0" }
    // Swift's description is the shortest round-trip representation; only the layout differs from JS.
    let text = abs(v).description
    let parts = text.split(separator: "e")
    let mantissa = parts[0]
    var exponent = parts.count > 1 ? Int(parts[1])! : 0
    let pieces = mantissa.split(separator: ".", omittingEmptySubsequences: false)
    var integer = String(pieces[0]), fraction = pieces.count > 1 ? String(pieces[1]) : ""
    // Normalise to 0.d1d2…dk × 10^n
    var n = integer.count + exponent
    var digitString = integer + fraction
    while digitString.hasPrefix("0") { digitString.removeFirst(); n -= 1 }
    while digitString.hasSuffix("0") { digitString.removeLast() }
    integer = ""; fraction = ""; exponent = 0
    let digits = Array(digitString), k = digits.count
    var out: String
    if k <= n && n <= 21 {
      out = digitString + String(repeating: "0", count: n - k)
    } else if 0 < n && n <= 21 {
      out = String(digits[0..<n]) + "." + String(digits[n...])
    } else if -6 < n && n <= 0 {
      out = "0." + String(repeating: "0", count: -n) + digitString
    } else {
      let e = n - 1
      let sign = e < 0 ? "-" : "+"
      out = (k == 1 ? String(digits[0]) : String(digits[0]) + "." + String(digits[1...])) + "e" + sign + String(abs(e))
    }
    return (v < 0 ? "-" : "") + out
  }

  static var numberGrammar: Regex<(Substring, Substring?, Substring?)> { /^-?\d+(\.\d+)?(e-?\d+)?$/.ignoresCase() }
  /// The web's `NUMBER` grammar followed by `Number()`.
  public static func parse(_ text: String) -> Double? {
    guard text.wholeMatch(of: numberGrammar) != nil else { return nil }
    return Double(text)
  }
}

public enum JSQuery {
  /// `new URLSearchParams(text)`: `&`-separated pairs, first `=` splits, `+` is a space, percent-decoding.
  public static func parse(_ text: String) -> [(key: String, value: String)] {
    text.split(separator: "&", omittingEmptySubsequences: true).map { pair in
      let halves = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
      let decode = { (s: Substring) -> String in String(s).replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? String(s) }
      return (decode(halves[0]), halves.count > 1 ? decode(halves[1]) : "")
    }
  }
  /// `params.get(key)`: the first value, or nil when absent.
  public static func first(_ params: [(key: String, value: String)], _ key: String) -> String? { params.first { $0.key == key }?.value }
}
