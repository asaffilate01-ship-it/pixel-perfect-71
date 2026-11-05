import ExpoModulesCore
import ProximityReader
import UIKit

public final class MealDeckTapEducationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MealDeckTapEducation")

    AsyncFunction("presentHowToTap") { (promise: Promise) in
      Task { @MainActor in
        guard #available(iOS 18.0, *) else {
          promise.resolve("fallback")
          return
        }
        do {
          let discovery = ProximityReaderDiscovery()
          let content = try await discovery.content(for: .payment(.howToTap))
          // Resolve the foreground window after loading content, then the topmost presenter.
          guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
            let window = scene.windows.first(where: { $0.isKeyWindow }),
            let root = window.rootViewController else {
            promise.reject("education_window_unavailable", "Return to the app before opening How to Tap.")
            return
          }
          var presenter = root
          while let presented = presenter.presentedViewController { presenter = presented }
          discovery.presentContent(content, from: presenter)
          promise.resolve("presented")
        } catch {
          // No claim of completed education if Apple's content failed to load/present.
          promise.reject("education_unavailable", "Apple's How to Tap guidance could not be opened. Check your connection and try again.")
        }
      }
    }
  }
}
