import SwiftUI

struct MilesView: View {
    @Environment(Store.self) private var store
    @State private var selected: Approval?
    @Environment(\.scenePhase) private var scenePhase
    @State private var visible = false
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) { Image(systemName: "sparkle").font(.largeTitle).foregroundStyle(.teal); Text("A clear head.\nA steady hand.").font(.title.bold()); Text("Miles works through your existing runtime and authority rules. You stay in control of proposed changes.").foregroundStyle(.secondary); Button("Request today’s briefing") { Task { await store.requestBriefing() } }.buttonStyle(.borderedProminent).disabled(store.busy).accessibilityIdentifier("requestBriefing") }.padding(.vertical, 10)
            }
            if store.jobs.isEmpty { EmptyCard(title: "Ready when you are", detail: "Request a briefing to start a run. Its status and any approval will appear here.", symbol: "sparkle") }
            ForEach(store.jobs) { row in
                Section {
                    VStack(alignment: .leading, spacing: 9) { HStack(alignment: .top) { Text(row.job.title).font(.headline); Spacer(); Text(row.job.status.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption).foregroundStyle(.teal) }; Text(row.job.authorization.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption).foregroundStyle(.secondary); if let summary = row.latestRun?.resultSummary { Text(summary).font(.subheadline) }; if let approval = row.pendingApproval { Button { selected = approval } label: { Label("Review proposed note", systemImage: "checkmark.shield") }.buttonStyle(.bordered).accessibilityIdentifier("reviewApproval") }; if let approval = row.latestApproval, approval.status == "auto_executed" { Label("Saved under standing authority", systemImage: "checkmark.shield.fill").font(.caption); if let key = approval.standingAuthorityKey { Text(key).font(.caption2).foregroundStyle(.secondary) } } }.padding(.vertical, 7)
                }
            }
        }.navigationTitle("Miles").refreshable { await store.refresh() }.toolbar { Button { Task { await store.refresh() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Refresh runs") }.sheet(item: $selected) { approval in ApprovalView(approval: approval) }.onAppear { visible = true }.onDisappear { visible = false }.task { while !Task.isCancelled { try? await Task.sleep(for: .seconds(8)); if !Task.isCancelled && visible && selected == nil && scenePhase == .active && store.jobs.contains(where: { ["queued", "running"].contains($0.job.status) }) { await store.refreshJobs() } } }
    }
}
struct ApprovalView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let approval: Approval
    @State private var confirm = false
    var body: some View {
        NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 20) { Label("Proposed note", systemImage: "checkmark.shield").foregroundStyle(.teal); Text(approval.title).font(.title.bold()); NoteBody(text: approval.body); Text("Accepting saves this content as a canonical TylerOS note. Dismissing creates no note.").font(.caption).foregroundStyle(.secondary); Button("Accept and save note") { confirm = true }.buttonStyle(.borderedProminent).disabled(store.busy).accessibilityIdentifier("acceptApproval"); Button("Dismiss proposal", role: .destructive) { Task { if await store.decide(approval, decision: "dismiss") { dismiss() } } }.disabled(store.busy) }.padding(24) }.navigationTitle("Review").navigationBarTitleDisplayMode(.inline).toolbar { Button("Close") { dismiss() } }.confirmationDialog("Save this proposed note?", isPresented: $confirm, titleVisibility: .visible) { Button("Accept and save") { Task { if await store.decide(approval, decision: "accept") { dismiss() } } }.disabled(store.busy) } }
    }
}
struct LibraryView: View {
    @Environment(Store.self) private var store
    @State private var query = ""
    @State private var results: SearchResults?
    @State private var searchError: String?
    var notes: [Note] { store.notes.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || $0.body.localizedCaseInsensitiveContains(query) } }
    var entries: [KnowledgeEntry] { (store.knowledge?.entries ?? []).filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || $0.body.localizedCaseInsensitiveContains(query) } }
    var body: some View {
        List {
            if let knowledge = store.knowledge { Section { Label("Notion · \(knowledge.mode.capitalized)", systemImage: "link"); if let date = knowledge.asOf { Text("Source snapshot: \(date)").font(.caption).foregroundStyle(.secondary) } } }
            if !entries.isEmpty { Section("Personal knowledge") { ForEach(entries) { entry in NavigationLink { ScrollView { VStack(alignment: .leading, spacing: 18) { Text(entry.title).font(.title.bold()); Text(entry.freshness ?? "Freshness unverified").font(.caption).foregroundStyle(.orange); NoteBody(text: entry.body); if let edited = entry.sourceEditedAt { Text("Source edited: \(edited)").font(.caption).foregroundStyle(.secondary) }; if let reviewed = entry.lastReviewed { Text("Last reviewed: \(reviewed)").font(.caption).foregroundStyle(.secondary) }; if let source = entry.sourceUrl, let url = URL(string: source), url.scheme == "https" { Link("Open source in Notion", destination: url) } }.padding(24) }.navigationTitle("Knowledge").navigationBarTitleDisplayMode(.inline) } label: { VStack(alignment: .leading, spacing: 5) { Text(entry.title); Text(entry.freshness ?? "Unverified").font(.caption).foregroundStyle(.secondary) } } } } }
            Section("Notes") { ForEach(notes) { note in NavigationLink { ScrollView { VStack(alignment: .leading, spacing: 18) { Text(note.title).font(.title.bold()); NoteBody(text: note.body); Text("Updated \(note.updatedAt)").font(.caption).foregroundStyle(.secondary) }.padding(24).frame(maxWidth: .infinity, alignment: .leading) }.navigationTitle("Note").navigationBarTitleDisplayMode(.inline) } label: { VStack(alignment: .leading, spacing: 6) { Text(note.title); Text(note.body).lineLimit(2).font(.caption).foregroundStyle(.secondary) } } } }
            if let results { ForEach(results.groups) { group in Section("\(group.label) on the web") { ForEach(group.hits) { hit in if let base = try? API.serverURL(store.server), let url = URL(string: hit.href, relativeTo: base), url.host == base.host { Link(destination: url) { VStack(alignment: .leading) { Text(hit.title); if let context = hit.context { Text(context).font(.caption).foregroundStyle(.secondary) } } } } } } } }
            if let searchError { Text(searchError).font(.caption).foregroundStyle(.secondary) }
            if notes.isEmpty && entries.isEmpty && results?.total ?? 0 == 0 { EmptyCard(title: query.isEmpty ? "A place for what you know" : "No matches yet", detail: "Capture with “note:” to save knowledge, or search your connected TylerOS.", symbol: "books.vertical") }
        }.navigationTitle("Knowledge").searchable(text: $query, prompt: "Search your second brain").refreshable { await store.refresh() }.task(id: query) { guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { results = nil; searchError = nil; return }; do { try await Task.sleep(for: .milliseconds(350)); let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+?#"))) ?? ""; let result: SearchResults = try await store.api.request("search?q=\(encoded)"); try Task.checkCancellation(); results = result; searchError = nil } catch is CancellationError {} catch { searchError = "Search unavailable. Showing matching loaded notes." } }
    }
}
