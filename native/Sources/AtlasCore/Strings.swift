import Foundation

/// User-facing sentences the web app shows, kept verbatim so both clients disclose the same things.
/// `StringsTests` greps each one in `src/app.ts`; change them there first.
public enum Strings {
  public static let footprintHint = "Tinted sky = directions with accepted DESI DR1 rows in this catalog. Dark = not surveyed here, not confirmed empty. Missing points inside the tint are adaptive sampling, distance fading or real structure."
  public static let uncertainLocalPrefix = "Uncertain local position. This redshift does not establish a reliable nearby distance. "
  public static let uncertainLocalShown = "Shown in amber"
  public static let uncertainLocalHidden = "Position hidden"
  public static let uncertainLocalSuffix = "; no physical model is available."
  public static func uncertainLocalWarning(shown: Bool) -> String { uncertainLocalPrefix + (shown ? uncertainLocalShown : uncertainLocalHidden) + uncertainLocalSuffix }
  public static let distanceCaptionNearby = "Independent distance from observer"
  public static let distanceCaptionUncertain = "Unreliable redshift-only distance"
  public static let distanceCaptionComoving = "Comoving distance from observer"
  public static let sourceNearby = "Nearby galaxy", sourceObservation = "Galaxy observation"
  public static let profileAdopted = "Adopted global shape", profileMeasured = "Measured global shape", profileIllustrative = "Illustrative shape"
  public static let portraitAppearance = "Appearance guided by telescope images. Adopted size and sky ellipse are retained; feature placement, depth, colors and exposure remain illustrative. This is not a reconstructed 3D photograph."
  public static let spiralAppearance = "Spiral appearance: morphology, light profile and depth are illustrative. Adopted size and sky ellipse are retained. Colors vary illustratively, not from measured photometry. Source properties are described below."
  public static let lookFromType = " The look follows the recorded visual type.", lookFromIdentity = " The look is chosen from the catalog identity."
  public static let proxyOrigin = "The visual type is an approximation; morphology is not classified. "
  public static let measuredShapeSentence = "Size and projected ellipse follow the catalog. "
  public static let assumedShapeSentence = "No usable shape measurement: size is assumed (5 kpc half-light radius), with no measured orientation. "
  public static let illustrativeSuffix = "Depth, near side, internal structure and colors are illustrative. Sizes are comoving."
  public static let cloudNote = " The stellar haze, knots, gas-like glow and dust are illustrative, not a measured gas map. Near side, depth and colors are assumed."
  public static let nearbyNote = " Internal structure, near side, depth and colors remain illustrative."
  public static let assumedPrefix = "Assumed · "
  public static let angleUnknown = "Unknown", angleUnconstrained = "Unconstrained"
  public static let lookbackCaptionNearby = "Light travel time from the measured distance (distance ÷ c)."
  public static let lookbackCaptionRedshift = "Planck18 lookback time from the redshift-derived distance."
  public static let redshiftNotUsed = "Not used", redshiftErrorUnavailable = "Not available"
  public static let measureFirst = "Select the first galaxy", measureSecond = "Select the second galaxy"
  public static let measureUnreliable = "Unreliable separation · includes an uncertain local redshift distance"
  public static let measureLocal = "Estimated local separation · distance errors not propagated"
  public static let measureMixed = "Estimated map separation · local and redshift distances"
  public static let measureComoving = "Estimated comoving separation · click to start again"
  public static let modelDisplayPoints = "All galaxies stay as points, including the selection. Positions and distances are unchanged."
  public static let modelDisplayFocused = "Only the galaxy opened with Visit or Focus uses a model. Other galaxies remain points."
  public static let savedViewsUnavailable = "Saved views could not be stored in this browser."
  public static let linkOutOfRange = "This view is beyond the range a link can carry."
  public static let linkUnknownGalaxy = "This link points to a galaxy this catalog does not contain."
  public static let modelLoadFailed = "A close-up model could not load; its catalog point is still available."
  public static let shapesLoadFailed = "Some galaxy shapes could not load. Retry missing detail to try again."
  public static let firstDataFailed = "The first galaxy data could not load. Use Retry missing detail below."
  public static let searchNoMatches = "No name matches. Try an NGC, IC, UGC or Messier name."
  public static let searchPopular = "Popular & nearby · available in this atlas"
  public static let searchUnavailable = "Name search is available with the full DESI DR1 atlas."

  public static var all: [String] {
    [footprintHint, uncertainLocalPrefix, uncertainLocalShown, uncertainLocalHidden, uncertainLocalSuffix, distanceCaptionNearby, distanceCaptionUncertain, distanceCaptionComoving,
     sourceNearby, sourceObservation, profileAdopted, profileMeasured, profileIllustrative, portraitAppearance, spiralAppearance, lookFromType, lookFromIdentity, proxyOrigin, measuredShapeSentence, assumedShapeSentence,
     illustrativeSuffix, cloudNote, nearbyNote, assumedPrefix, angleUnknown, angleUnconstrained, lookbackCaptionNearby, lookbackCaptionRedshift, redshiftNotUsed, redshiftErrorUnavailable,
     measureFirst, measureSecond, measureUnreliable, measureLocal, measureMixed, measureComoving, modelDisplayPoints, modelDisplayFocused, savedViewsUnavailable, linkOutOfRange,
     linkUnknownGalaxy, modelLoadFailed, shapesLoadFailed, firstDataFailed, searchNoMatches, searchPopular, searchUnavailable]
  }
}
