import UIKit
import MetalKit
import AtlasCore
import AtlasRender

/// The Metal view and its input: one-finger orbit, two-finger pan, pinch dolly, tap to pick. Drawing is on demand,
/// exactly like the web's invalidate(): idle frames are never drawn.
@MainActor
final class AtlasViewController: UIViewController, MTKViewDelegate, UIGestureRecognizerDelegate {
  let session: AtlasSession
  private var metalView: MTKView { view as! MTKView }
  private var lastPan = CGPoint.zero

  init(session: AtlasSession) { self.session = session; super.init(nibName: nil, bundle: nil) }
  required init?(coder: NSCoder) { fatalError() }

  override func loadView() {
    let v = MTKView(frame: .zero, device: session.renderer.device)
    v.colorPixelFormat = AtlasRenderer.colorFormat
    v.depthStencilPixelFormat = AtlasRenderer.depthFormat
    v.clearColor = AtlasRenderer.clearColor
    v.clearDepth = 0 // reversed-Z
    v.sampleCount = 1
    v.framebufferOnly = true
    v.isPaused = true
    v.enableSetNeedsDisplay = true
    v.preferredFramesPerSecond = 60
    v.delegate = self
    v.isMultipleTouchEnabled = true
    view = v
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    // ponytail: parity cap with the web's 1.5 DPR; per-device scale after measurement
    metalView.contentScaleFactor = min(UIScreen.main.nativeScale, 1.5)
    session.invalidate = { [weak self] in self?.metalView.setNeedsDisplay() }
    let rotate = UIPanGestureRecognizer(target: self, action: #selector(rotate(_:)))
    rotate.maximumNumberOfTouches = 1
    rotate.allowedScrollTypesMask = .continuous
    let pan = UIPanGestureRecognizer(target: self, action: #selector(pan(_:)))
    pan.minimumNumberOfTouches = 2; pan.maximumNumberOfTouches = 2
    let pinch = UIPinchGestureRecognizer(target: self, action: #selector(pinch(_:)))
    let tap = UITapGestureRecognizer(target: self, action: #selector(tap(_:)))
    tap.numberOfTouchesRequired = 1
    for g in [rotate, pan, pinch, tap] as [UIGestureRecognizer] { g.delegate = self; view.addGestureRecognizer(g) }
    tap.require(toFail: rotate)
  }
  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    session.viewportPoints = SIMD2(Double(max(1, view.bounds.width)), Double(max(1, view.bounds.height)))
    session.scale = Double(metalView.contentScaleFactor)
    session.invalidate()
  }

  func gestureRecognizer(_ a: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith b: UIGestureRecognizer) -> Bool { !(a is UITapGestureRecognizer || b is UITapGestureRecognizer) }

  @objc private func rotate(_ g: UIPanGestureRecognizer) {
    let p = g.translation(in: view)
    switch g.state {
    case .began: lastPan = p; session.userInputBegan()
    case .changed:
      if session.flight {
        Flight.look(&session.camera, movementX: Double(p.x - lastPan.x) * 2, movementY: Double(p.y - lastPan.y) * 2)
      } else {
        session.orbit.rotate(deltaX: Double(p.x - lastPan.x), deltaY: Double(p.y - lastPan.y), viewportHeight: Double(view.bounds.height))
      }
      lastPan = p; session.invalidate()
    default: session.invalidate()
    }
  }
  @objc private func pan(_ g: UIPanGestureRecognizer) {
    let p = g.translation(in: view)
    switch g.state {
    case .began: lastPan = p; session.userInputBegan()
    case .changed:
      session.orbit.pan(deltaX: Double(p.x - lastPan.x), deltaY: Double(p.y - lastPan.y), camera: session.camera, viewportHeight: Double(view.bounds.height))
      lastPan = p; session.invalidate()
    default: session.invalidate()
    }
  }
  @objc private func pinch(_ g: UIPinchGestureRecognizer) {
    switch g.state {
    case .began: session.userInputBegan()
    case .changed:
      if session.flight || session.autoFly { session.speed = Flight.adjustSpeed(session.speed, wheelDeltaY: -log(Double(g.scale)) / 0.002) }
      else { session.orbit.dollyOut(pow(Double(g.scale), session.orbit.zoomSpeed)) }
      g.scale = 1; session.invalidate()
    default: session.invalidate()
    }
  }
  @objc private func tap(_ g: UITapGestureRecognizer) {
    let p = g.location(in: view), scale = Double(metalView.contentScaleFactor)
    let x = Int((Double(p.x) * scale).rounded(.down)), y = Int(((Double(view.bounds.height) - Double(p.y)) * scale).rounded(.down))
    Task { await session.pick(drawableX: x, drawableY: y) }
  }

  // MARK: MTKViewDelegate
  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) { session.invalidate() }
  func draw(in view: MTKView) {
    let frame = session.tick(now: CACurrentMediaTime())
    guard let descriptor = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
          let commandBuffer = session.renderer.queue.makeCommandBuffer() else { return }
    let stats = session.renderer.encode(frame, to: descriptor, on: commandBuffer)
    commandBuffer.present(drawable)
    commandBuffer.commit()
    session.didDraw(stats)
  }
}
