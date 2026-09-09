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
            if let consumption = store.today?.consumption {
                Section("Food & drink") {
                    Text("Logged today: \(consumption.food) food entries · \(consumption.drink) drink entries").accessibilityIdentifier("consumptionSummary")
                    NavigationLink("Open food & drink log") { FoodLogView(showCapture: $showCapture) }.accessibilityIdentifier("foodLog")
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


struct FoodLogView: View {
    @Environment(Store.self) private var store
    @Binding var showCapture: Bool
    @State private var history: ConsumptionHistory?
    @State private var error: String?
    @State private var saving = false
    var body: some View {
        List {
            Section {
                Text("Log what you had. Portions or the place can go in the description. Nutrition and pantry stock are not inferred.").font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button("Log food") { beginCapture("food") }.accessibilityIdentifier("logFood")
                    Button("Log drink") { beginCapture("drink") }.accessibilityIdentifier("logDrink")
                }.buttonStyle(.bordered)
            }
            Section("Your taste profile") {
                Text("Saved canonical preferences. Meal feedback remains separate evidence.").font(.caption).foregroundStyle(.secondary)
                let preferences = (store.knowledge?.entries ?? []).filter { $0.isPalatePreference }
                if preferences.isEmpty {
                    Text(store.knowledgeUnavailable ? "Personal knowledge could not be refreshed." : store.knowledge?.health?.status == "available" ? "No active Palate preference record is present in this import." : store.knowledge?.health?.message ?? "Taste preferences have not loaded yet.").font(.caption).accessibilityIdentifier("palateHealth")
                }
                ForEach(preferences) { entry in
                    DisclosureGroup(entry.title) {
                        NoteBody(text: entry.body)
                        Text(entry.sourceHealth?.reviewMessage ?? "Review timing unverified. Check the source in Notion.").font(.caption).foregroundStyle(.secondary)
                        if let imported = entry.sourceHealth?.importMessage { Text(imported).font(.caption).foregroundStyle(.secondary) }
                        if let source = entry.sourceUrl, let url = URL(string: source), url.scheme == "https" { Link("Open canonical preferences", destination: url) }
                    }.accessibilityIdentifier("palateProfile")
                }
            }
            if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("foodError") }
            if let history {
                Section("Logged today · \(history.today.day)") {
                    Text("\(history.today.food) food entries · \(history.today.drink) drink entries")
                    Text(history.today.timeZone).font(.caption).foregroundStyle(.secondary)
                }
                Section("Your feedback") {
                    Text("Only explicit likes and dislikes count. Logging something does not mean you liked it.").font(.caption).foregroundStyle(.secondary)
                    ForEach(Array(history.feedback.enumerated()), id: \.offset) { _, feedback in Text("\(feedback.description): \(feedback.likes) likes · \(feedback.dislikes) dislikes") }
                }
                Section("Recent logs") {
                    if history.entries.isEmpty { Text("No food or drinks logged yet.") }
                    ForEach(history.entries) { entry in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(entry.description).font(.headline)
                            Text("\(entry.kind) · \(entry.loggedOn)" + (entry.voidedAt == nil ? "" : " · Removed (not counted)")).font(.caption).foregroundStyle(.secondary)
                            if entry.voidedAt == nil {
                                HStack { Button("Like") { change(entry, "like") }; Button("Dislike") { change(entry, "dislike") }; Button("Clear") { change(entry, "clear") } }.buttonStyle(.bordered)
                                if let feedback = entry.feedback { Text("Feedback: \(feedback)").font(.caption) }
                                Button("Remove log") { change(entry, "remove") }.buttonStyle(.borderless)
                            } else { Button("Restore") { change(entry, "restore") }.buttonStyle(.borderless) }
                        }.disabled(saving).accessibilityElement(children: .contain).accessibilityIdentifier("foodEntry-" + entry.description)
                    }
                }
            } else if error == nil { ProgressView("Loading food log") }
        }.navigationTitle("Food & drink").task { await load() }.refreshable { await store.refresh(); await load() }.onChange(of: store.refreshedAt) { _, _ in Task { await load() } }
    }
    private func beginCapture(_ kind: String) {
        // Never replace an existing unsent draft just to select a capture mode.
        if store.draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { store.draft.consumptionKind = ConsumptionKind(rawValue: kind); store.saveDraft() }
        showCapture = true
    }
    private func load() async {
        do { history = try await store.api.request("consumption"); error = nil }
        catch { self.error = "Food log could not be refreshed. Any displayed entries are from the previous load." }
    }
    private func change(_ entry: ConsumptionEntry, _ action: String) {
        guard !saving else { return }; saving = true
        Task {
            defer { saving = false }
            do {
                let _: ConsumptionEntry = try await store.api.request("consumption/\(entry.id)", method: "PATCH", body: ["requestId": UUID().uuidString, "action": action])
                await load(); await store.refresh()
            } catch { self.error = error.localizedDescription }
        }
    }
}
