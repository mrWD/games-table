import SwiftUI
import WidgetKit

/// Two widgets rather than one with a toggle: on the home screen a widget is chosen once
/// and then just sits there, so "what am I in the middle of" and "what is queued" are
/// two different things a person puts on the screen, not two modes of one thing.

private struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

private struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: Date(), snapshot: SharedStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        // One entry, refreshed in an hour. The app also reloads timelines the moment the
        // library changes, so this is only the floor for a phone that has not been
        // opened — not the mechanism people actually see.
        let entry = SnapshotEntry(date: Date(), snapshot: SharedStore.read())
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private struct Cover: View {
    let name: String?

    var body: some View {
        Group {
            if let name, let url = SharedStore.posterURL(name),
               let data = try? Data(contentsOf: url), let image = UIImage(data: data) {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else {
                // A grey block rather than an icon: at this size an icon reads as noise,
                // and the row still lines up while the app fills the cache in.
                Color.secondary.opacity(0.18)
            }
        }
        // Game art is landscape, unlike a book cover or a poster.
        .frame(width: 64, height: 36)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
    }
}

private struct Row: View {
    let entry: WidgetSnapshot.Entry

    private var detail: String {
        var parts = [entry.status]
        if let platform = entry.platform { parts.append(platform) }
        if let hours = entry.hours, hours > 0 { parts.append("\(hours)h") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: 9) {
            Cover(name: entry.cover)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text(detail).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
            if let score = entry.score {
                Text("\(score)")
                    .font(.system(size: 11, weight: .bold))
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(.green.opacity(0.22), in: RoundedRectangle(cornerRadius: 4))
            }
        }
    }
}

private struct ListView: View {
    let title: String
    let entries: [WidgetSnapshot.Entry]
    let emptyText: String
    @Environment(\.widgetFamily) private var family

    private var limit: Int { family == .systemLarge ? 5 : 2 }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold)).kerning(0.6)
                .foregroundStyle(.secondary)
            if entries.isEmpty {
                Text(emptyText).font(.system(size: 12)).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                ForEach(entries.prefix(limit)) { entry in
                    // Each row opens its own game rather than just the app: tapping a
                    // specific title and landing on a generic screen is a small betrayal
                    // of the tap.
                    Link(destination: URL(string: "gamestable://game/\(entry.id)")!) {
                        Row(entry: entry)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(14)
    }
}

struct PlayingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GamesTablePlaying", provider: Provider()) { entry in
            ListView(
                title: "Playing",
                entries: entry.snapshot.playing,
                emptyText: "Nothing in progress. Start a game to see it here."
            )
            .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Playing")
        .description("Games you are in the middle of, playing or watching.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct BacklogWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GamesTableBacklog", provider: Provider()) { entry in
            ListView(
                title: "Backlog",
                entries: entry.snapshot.backlog,
                emptyText: "The backlog is empty."
            )
            .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Backlog")
        .description("What is queued up to play or watch, longest waiting first.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

@main
struct GamesTableWidgets: WidgetBundle {
    var body: some Widget {
        PlayingWidget()
        BacklogWidget()
    }
}
