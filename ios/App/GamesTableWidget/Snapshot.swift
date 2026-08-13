import Foundation

/// What the app hands the widgets.
///
/// The widget runs in its own process and cannot read the app's container, so the two
/// meet in an App Group. The app writes this structure as JSON whenever the library
/// changes; the widgets only ever read it. Nothing here is fetched from the network —
/// the app has already done that, and a widget that phoned home would break the promise
/// that the library never leaves the device.
struct WidgetSnapshot: Codable {
    /// Games in progress — playing or watching, the two tracks side by side.
    var playing: [Entry]
    /// What is queued up: the backlog and the want-to-watch list.
    var backlog: [Entry]
    /// When the app last wrote this, so a stale widget can say so rather than lie.
    var updatedAt: Date

    struct Entry: Codable, Identifiable {
        var id: String
        var title: String
        /// The status as the app words it — "Playing", "Watching", "Want to play".
        var status: String
        var platform: String?
        var hours: Int?
        /// Critic score, absent when the catalogue has none.
        var score: Int?
        /// File name inside the App Group's caches, written by the app.
        var cover: String?
    }

    static let empty = WidgetSnapshot(playing: [], backlog: [], updatedAt: .distantPast)
}

enum SharedStore {
    /// Must match the App Group on both targets and `lib/widget.ts` in the web app.
    static let suite = "group.com.mrwd.gamestable"
    static let key = "widget-snapshot-v1"

    static func read() -> WidgetSnapshot {
        guard let defaults = UserDefaults(suiteName: suite),
              let raw = defaults.string(forKey: key),
              let data = raw.data(using: .utf8) else { return .empty }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        return (try? decoder.decode(WidgetSnapshot.self, from: data)) ?? .empty
    }

    /// Covers are files the app dropped in the group; the widget only reads.
    static func posterURL(_ name: String) -> URL? {
        guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: suite)
        else { return nil }
        return dir.appendingPathComponent("posters").appendingPathComponent(name)
    }
}
