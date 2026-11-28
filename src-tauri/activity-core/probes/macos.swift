// Bounded diagnostic. No persistent tracking, titles, identifiers, URLs,
// input contents, permission prompts or network access.
import AppKit
import CoreGraphics
import Foundation

let workspace = NSWorkspace.shared
let center = workspace.notificationCenter
let hasForeground = workspace.frontmostApplication?.bundleIdentifier != nil
let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: UInt32.max)!)
let token = center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { _ in
    // Deliberately do not inspect or log the actual application.
}
RunLoop.current.run(until: Date().addingTimeInterval(0.25))
center.removeObserver(token)
let summary: [String: Bool] = [
    "foreground_identifier_available": hasForeground,
    "idle_query_finite_nonnegative": idle.isFinite && idle >= 0,
    "notification_observer_registered_and_removed": true
]
let data = try JSONSerialization.data(withJSONObject: summary, options: [.sortedKeys])
print(String(decoding: data, as: UTF8.self))
