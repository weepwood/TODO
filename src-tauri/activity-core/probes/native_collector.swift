// Explicit bounded process. No window titles, input contents, screenshots,
// Automation, Accessibility, network or system preference changes.
import AppKit
import CoreGraphics
import Foundation

final class NativeCollector: @unchecked Sendable {
    let workspace = NSWorkspace.shared
    let started = ProcessInfo.processInfo.systemUptime
    let allowed: Set<String>
    var sleeping = false
    var inactive = false
    var lastMono: UInt64?
    var observers: [NSObjectProtocol] = []
    var timer: Timer?
    init(allowed: Set<String>) { self.allowed = allowed }
    func sample(_ reason: String) {
        let mono = UInt64(max(0, (ProcessInfo.processInfo.systemUptime - started) * 1000))
        if let last = lastMono, mono <= last { return }
        lastMono = mono
        let wall = Int64(Date().timeIntervalSince1970 * 1000)
        var state = "unknown"
        var subject: String? = nil
        if sleeping { state = "suspended" }
        else if inactive { state = "unknown" }
        else {
            // Session availability is not proof that the screen is unlocked.
            // No unsupported private lock key is treated as authoritative.
            let session = CGSessionCopyCurrentDictionary() as? [String: Any]
            if session?[kCGSessionOnConsoleKey as String] as? Bool == true {
                let idle = CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: CGEventType(rawValue: UInt32.max)!)
                if idle.isFinite && idle >= 180 { state = "idle" }
                else if idle.isFinite && idle >= 0, let app = workspace.frontmostApplication?.bundleIdentifier {
                    // Deny by default; suppress excluded IDs before serialization.
                    if allowed.contains(app) { state = "active"; subject = app }
                    else { state = "excluded" }
                }
            }
        }
        var value: [String: Any] = ["wall_ms": wall, "monotonic_ms": mono, "state": state, "reason": reason]
        if let subject { value["subject"] = subject }
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        FileHandle.standardOutput.write(data + Data([10]))
    }
    func start() {
        let c = workspace.notificationCenter
        observers.append(c.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] _ in self?.sample("event") })
        observers.append(c.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in self?.sleeping = true; self?.sample("event") })
        observers.append(c.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in self?.sleeping = false; self?.sample("event") })
        observers.append(c.addObserver(forName: NSWorkspace.sessionDidResignActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.inactive = true; self?.sample("event") })
        observers.append(c.addObserver(forName: NSWorkspace.sessionDidBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.inactive = false; self?.sample("event") })
        sample("poll")
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.sample("poll") }
    }
    func stop() {
        timer?.invalidate(); timer = nil
        sample("event")
        for observer in observers { workspace.notificationCenter.removeObserver(observer) }
        observers.removeAll()
    }
}
let args = CommandLine.arguments
guard args.count >= 3, args[1] == "--isolated", let duration = Double(args[2]), duration.isFinite, duration >= 1, duration <= 60 else {
    exit(2)
}
// This experimental build allows only synthetic test bundle identifiers.
// Production collection needs an explicit consent and verified lock adapter.
let allow = Set(args.dropFirst(3))
guard allow.allSatisfy({ $0.hasPrefix("org.todo.fixture.") }) else { exit(2) }
let collector = NativeCollector(allowed: allow)
collector.start()
RunLoop.current.run(until: Date().addingTimeInterval(duration))
collector.stop()
