import SwiftUI

struct TodayView: View {
    @Environment(Store.self) private var store
    @Binding var showCapture: Bool
    private var displayDate: Date {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.calendar = Calendar(identifier: .gregorian); formatter.timeZone = .current; formatter.dateFormat = "yyyy-MM-dd"
        return store.today.flatMap { formatter.date(from: $0.today) } ?? .now
    }
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text(displayDate.formatted(.dateTime.weekday(.wide).month(.wide).day()).uppercased()).font(.caption.weight(.semibold)).tracking(1.2).foregroundStyle(.secondary)
                    Text("Make room for\nwhat matters.").font(.largeTitle.bold())
                    HStack(spacing: 22) { metric("Due today", count: store.today?.view.dueToday.count ?? 0); metric("To review", count: store.today?.operations?.pendingApprovals ?? store.jobs.filter { $0.pendingApproval != nil }.count); metric("Inbox", count: store.today?.view.needsTriage.count ?? 0) }
                    Button { showCapture = true } label: { Label("Capture a thought", systemImage: "plus.circle.fill").font(.headline).frame(maxWidth: .infinity).padding(9) }.buttonStyle(.borderedProminent)
                }.padding(.vertical, 14)
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            if let operations = store.today?.operations, operations.hasActivity {
                Section("Since yesterday") {
                    if operations.savedNotes > 0 { Label("Briefing notes saved: \(operations.savedNotes)", systemImage: "checkmark.circle").accessibilityIdentifier("operationsSaved") }
                    if operations.pendingApprovals > 0 { Label("Awaiting your decision: \(operations.pendingApprovals)", systemImage: "checkmark.shield").accessibilityIdentifier("operationsPending") }
                    if operations.failedJobs > 0 { Label("Jobs failed: \(operations.failedJobs)", systemImage: "exclamationmark.circle") }
                    Text("Outcomes from the last 24 hours. Waiting decisions include older requests.").font(.caption).foregroundStyle(.secondary)
                    NavigationLink("Review Miles activity") { MilesView() }.accessibilityIdentifier("operationsReview")
                }
            }
            if let view = store.today?.view {
                bucket("Needs attention", items: view.overdue)
                bucket("Today’s focus", items: view.dueToday)
                bucket("On the horizon", items: view.upcoming)
                bucket("Make space for these", items: view.needsTriage)
                if view.totalSurfaced == 0 && !(store.today?.operations?.needsAttention ?? false) { EmptyCard(title: "A little breathing room", detail: "Nothing is due or waiting in your inbox. Capture what is on your mind.", symbol: "sun.horizon").listRowBackground(Color.clear).listRowInsets(EdgeInsets()) }
            } else { EmptyCard(title: "Your day is loading", detail: "Pull to refresh your canonical TylerOS state.").listRowBackground(Color.clear) }
            Section {
                Button { Task { await store.requestBriefing() } } label: { Label("Ask Miles for today’s briefing", systemImage: "sparkle") }.disabled(store.busy)
                Text("Miles follows your existing approval rules, including standing permission to save briefings.").font(.caption).foregroundStyle(.secondary)
                if let date = store.refreshedAt { Text("Synced \(date.formatted(date: .omitted, time: .shortened))").font(.caption2).foregroundStyle(.secondary) }
            }
        }.navigationTitle("Today").refreshable { await store.refresh() }.navigationDestination(for: Item.self) { ItemEditor(item: $0) }
    }
    func metric(_ title: String, count: Int) -> some View { VStack(alignment: .leading, spacing: 3) { Text("\(count)").font(.title.bold()).monospacedDigit(); Text(title).font(.caption).foregroundStyle(.secondary) } }
    @ViewBuilder func bucket(_ title: String, items: [Item]) -> some View { if !items.isEmpty { Section(title) { ForEach(items) { item in NavigationLink(value: item) { ItemRow(item: item) } } } } }
}
struct TasksView: View {
    @Environment(Store.self) private var store
    @Binding var showCapture: Bool
    @State private var query = ""
    @State private var filter = "open"
    var filtered: [Item] { store.items.filter { (filter == "all" || !["done", "archived"].contains($0.status)) && (query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || ($0.body ?? "").localizedCaseInsensitiveContains(query)) } }
    var body: some View {
        List {
            Picker("Show", selection: $filter) { Text("Open").tag("open"); Text("All").tag("all") }.pickerStyle(.segmented)
            if filtered.isEmpty { EmptyCard(title: "Nothing here yet", detail: "Capture a task or change your search.") }
            Section("App tasks") { ForEach(filtered) { item in NavigationLink(value: item) { ItemRow(item: item) } } }
            if store.workBoardUnavailable { Text("Shared Notion tasks are unavailable. Pull to refresh; app tasks remain available.").font(.caption).foregroundStyle(.secondary) }
            if let board = store.workBoard {
                Section("Shared tasks · Notion snapshot") {
                    Text(board.health?.message ?? "Read-only snapshot. Check the canonical task before acting.").font(.caption).foregroundStyle(.secondary)
                    if let date = board.asOf { Text("As of \(date)").font(.caption2).foregroundStyle(.secondary) }
                    ForEach(board.entries.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }) { entry in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(entry.title).font(.headline)
                            Text(entry.status).font(.caption).foregroundStyle(.secondary)
                            if let action = entry.nextAction, !action.isEmpty { Text(action).font(.subheadline) }
                            if let edited = entry.sourceEditedAt { Text("Source edited: \(edited)").font(.caption2).foregroundStyle(.secondary) }
                            if let source = entry.sourceUrl, let url = URL(string: source), url.scheme == "https" { Link("Open task in Notion", destination: url) }
                        }.padding(.vertical, 5)
                    }
                }
            }
        }.navigationTitle("Tasks").searchable(text: $query, prompt: "Find a task").toolbar { Button { showCapture = true } label: { Image(systemName: "plus") }.accessibilityLabel("Capture") }.refreshable { await store.refresh() }.navigationDestination(for: Item.self) { ItemEditor(item: $0) }
    }
}
struct ItemEditor: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let item: Item
    @FocusState private var editing: Bool
    @State private var title: String; @State private var bodyText: String; @State private var status: String; @State private var dueOn: String
    init(item: Item) { self.item = item; _title = State(initialValue: item.title); _bodyText = State(initialValue: item.body ?? ""); _status = State(initialValue: item.status); _dueOn = State(initialValue: item.dueOn ?? "") }
    private static var dateFormatter: DateFormatter { let value = DateFormatter(); value.locale = Locale(identifier: "en_US_POSIX"); value.calendar = Calendar(identifier: .gregorian); value.timeZone = .current; value.dateFormat = "yyyy-MM-dd"; return value }
    private static func dateString(_ date: Date) -> String { dateFormatter.string(from: date) }
    var body: some View {
        Form {
            Section("Task") { TextField("Title", text: $title, axis: .vertical).focused($editing).accessibilityIdentifier("itemTitle"); Picker("Status", selection: $status) { ForEach(["inbox", "active", "someday", "done", "archived"], id: \.self) { Text($0.capitalized).tag($0) } }; Toggle("Due date", isOn: Binding(get: { !dueOn.isEmpty }, set: { dueOn = $0 ? Self.dateString(.now) : "" }))
                if !dueOn.isEmpty { DatePicker("Due", selection: Binding(get: { Self.dateFormatter.date(from: dueOn) ?? .now }, set: { dueOn = Self.dateString($0) }), displayedComponents: .date) } }
            Section("Context") { TextEditor(text: $bodyText).focused($editing).frame(minHeight: 160) }
            Section { Text("Edits save to the same item used by the web app. If it changes elsewhere, refresh before saving again.").font(.caption).foregroundStyle(.secondary) }
        }.navigationTitle("Edit task").navigationBarTitleDisplayMode(.inline).toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    editing = false
                    Task { if await store.update(item, title: title, body: bodyText, status: status, dueOn: dueOn) { dismiss() } }
                }.disabled(store.busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityIdentifier("saveItem")
            }
            ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { editing = false }.accessibilityIdentifier("finishEditing") }
        }
    }
}
