import SwiftUI

@main struct TylerOSApp: App {
    @State private var store = Store()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            ZStack {
                RootView().environment(store)
                if phase != .active { Color(.systemBackground).ignoresSafeArea(); Label("TylerOS", systemImage: "lock.shield").font(.largeTitle.weight(.semibold)) }
            }.tint(.teal)
        }
    }
}
struct RootView: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    @State private var capture = false
    var body: some View {
        @Bindable var store = store
        VStack(spacing: 0) {
            if store.connected {
                TabView {
                    NavigationStack { TodayView(showCapture: $capture) }.tabItem { Label("Today", systemImage: "sun.max") }
                    NavigationStack { TasksView(showCapture: $capture) }.tabItem { Label("Tasks", systemImage: "checklist") }
                    NavigationStack { MilesView() }.tabItem { Label("Miles", systemImage: "sparkle") }.badge(store.jobs.filter { $0.pendingApproval != nil }.count)
                    NavigationStack { LibraryView() }.tabItem { Label("Knowledge", systemImage: "books.vertical") }
                    NavigationStack { SettingsView() }.tabItem { Label("Settings", systemImage: "slider.horizontal.3") }
                }.sheet(isPresented: $capture) { CaptureView() }
            } else { LoginView() }
            if let notice = store.notice {
                HStack { Text(notice).font(.caption); Spacer(); Button { store.notice = nil } label: { Image(systemName: "xmark.circle.fill") }.accessibilityLabel("Dismiss message") }.padding(12).background(.thinMaterial)
            }
        }
        .alert("Something needs attention", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) { Button("OK") { store.error = nil } } message: { Text(store.error ?? "") }
        .task { await store.refresh() }
        .onChange(of: phase) { _, phase in if phase == .active { Task { await store.refresh() } } }
    }
}
struct LoginView: View {
    @Environment(Store.self) private var store
    @State private var passphrase = ""
    var body: some View {
        @Bindable var store = store
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Image(systemName: "circle.hexagongrid.fill").font(.system(size: 54)).foregroundStyle(.teal).padding(.top, 45)
                    VStack(alignment: .leading, spacing: 10) { Text("Your life.\nWithin reach.").font(.largeTitle.bold()); Text("TylerOS on iPhone").font(.title3).foregroundStyle(.secondary) }
                    Text("Connect to your existing TylerOS. Miles, your tasks, and your knowledge stay together.").foregroundStyle(.secondary)
                    VStack(spacing: 16) {
                        TextField("https://your-tyleros-server", text: $store.server).keyboardType(.URL).textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("serverURL")
                        Divider()
                        SecureField("Mobile passphrase", text: $passphrase).textContentType(.password).accessibilityIdentifier("passphrase")
                    }.padding(20).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
                    Button { Task { await store.login(passphrase: passphrase); passphrase = "" } } label: { HStack { Spacer(); if store.busy { ProgressView() } else { Text("Connect securely").fontWeight(.semibold); Image(systemName: "arrow.right") }; Spacer() }.padding(10) }.buttonStyle(.borderedProminent).disabled(store.busy || passphrase.isEmpty || store.server.isEmpty).accessibilityIdentifier("connect")
                    Label("Your session stays in this iPhone’s Keychain.", systemImage: "lock.shield").font(.caption).foregroundStyle(.secondary)
                }.padding(28)
            }.background(Color(.systemGroupedBackground))
        }
    }
}
struct EmptyCard: View {
    let title: String; let detail: String; var symbol = "tray"
    var body: some View { VStack(alignment: .leading, spacing: 10) { Image(systemName: symbol).font(.title2).foregroundStyle(.teal); Text(title).font(.headline); Text(detail).font(.subheadline).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading).padding(22).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22)) }
}
struct ItemRow: View {
    let item: Item
    var body: some View { HStack(alignment: .top, spacing: 12) { Image(systemName: item.status == "done" ? "checkmark.circle.fill" : "circle").foregroundStyle(item.status == "done" ? .teal : .secondary); VStack(alignment: .leading, spacing: 5) { Text(item.title).foregroundStyle(.primary); Text([item.kind.capitalized, item.dueOn].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary) } }.padding(.vertical, 5) }
}

/// Lightweight, selectable rendering of source notes without changing their stored text.
struct NoteBody: View {
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(text.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                if line.hasPrefix("### ") { Text(String(line.dropFirst(4))).font(.headline) }
                else if line.hasPrefix("## ") { Text(String(line.dropFirst(3))).font(.title3.bold()).padding(.top, 8) }
                else if line.hasPrefix("# ") { Text(String(line.dropFirst(2))).font(.title2.bold()).padding(.top, 8) }
                else if line.hasPrefix("- ") || line.hasPrefix("* ") { HStack(alignment: .top) { Text("•"); inline(String(line.dropFirst(2))) } }
                else if !line.isEmpty { inline(line) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
    }
    private func inline(_ line: String) -> Text { Text((try? AttributedString(markdown: line, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(line)) }
}
