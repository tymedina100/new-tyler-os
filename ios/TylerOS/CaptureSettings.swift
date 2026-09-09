import SwiftUI
import Speech
import AVFoundation
import UserNotifications

@MainActor @Observable final class Dictation {
 var listening = false; var error: String?
 private var hasTap = false
 private let engine = AVAudioEngine(); private var request: SFSpeechAudioBufferRecognitionRequest?; private var task: SFSpeechRecognitionTask?
 func start(onText: @escaping (String) -> Void) async {
  let permission = await withCheckedContinuation { continuation in SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) } }
  let mic = await AVAudioApplication.requestRecordPermission()
  guard permission == .authorized, mic else { error = "Enable Microphone and Speech Recognition in iPhone Settings."; return }
  guard let recognizer = SFSpeechRecognizer(), recognizer.supportsOnDeviceRecognition else { error = "On-device recognition is unavailable for this language or device. You can type instead."; return }
  do { stop(); let audio = AVAudioSession.sharedInstance(); try audio.setCategory(.record, mode: .measurement, options: .duckOthers); try audio.setActive(true)
   let request = SFSpeechAudioBufferRecognitionRequest(); request.requiresOnDeviceRecognition = true; request.shouldReportPartialResults = true; self.request = request
   let input = engine.inputNode; input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in request.append(buffer) }; hasTap = true; engine.prepare(); try engine.start(); listening = true
   task = recognizer.recognitionTask(with: request) { result, error in Task { @MainActor in if let result { onText(result.bestTranscription.formattedString) }; if error != nil || result?.isFinal == true { self.stop() } } }
  } catch { stop(); self.error = error.localizedDescription }
 }
 func stop() { if engine.isRunning { engine.stop() }; if hasTap { engine.inputNode.removeTap(onBus: 0); hasTap = false }; request?.endAudio(); task?.cancel(); request = nil; task = nil; listening = false; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
}
struct CaptureView: View {
 @Environment(Store.self) private var store
 @Environment(\.dismiss) private var dismiss
 @State private var dictation = Dictation(); @State private var prefix = ""

 var body: some View { @Bindable var store = store
  NavigationStack { VStack(alignment: .leading, spacing: 18) {
   Text("Get it out of your head.").font(.title2.bold())
   Text("A task, an idea, a small thing to remember. Start with “note:” to save reference material.").font(.subheadline).foregroundStyle(.secondary)
   if store.today?.consumption != nil {
    HStack {
     Button("Task / note") { selectKind(nil) }
     Button("Food") { selectKind(.food) }.accessibilityIdentifier("captureFood")
     Button("Drink") { selectKind(.drink) }.accessibilityIdentifier("captureDrink")
    }.buttonStyle(.bordered).disabled(!store.draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
   }
   if let kind = store.draft.consumptionKind { Text("Logging " + kind.rawValue).font(.headline).accessibilityIdentifier("captureKind") }
   TextEditor(text: $store.draft.text).padding(10).frame(minHeight: 150).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16)).scrollContentBackground(.hidden).accessibilityIdentifier("captureText")
   HStack { Button { if dictation.listening { dictation.stop() } else { prefix = store.draft.text; Task { await dictation.start { transcript in store.draft.text = prefix + (prefix.isEmpty ? "" : " ") + transcript; store.saveDraft() } } } } label: { Label(dictation.listening ? "Stop dictation" : "Dictate on device", systemImage: dictation.listening ? "stop.circle.fill" : "mic") }; Spacer() }
   if let error = dictation.error { Text(error).font(.caption).foregroundStyle(.secondary) }
   Label("Draft saved securely on this device. Sending requires a connection.", systemImage: "lock").font(.caption).foregroundStyle(.secondary)
   Button { dictation.stop(); Task { if await store.capture() { dismiss() } } } label: { Text(store.busy ? "Saving…" : "Save to TylerOS").frame(maxWidth: .infinity).padding(10) }.buttonStyle(.borderedProminent).disabled(store.busy || store.draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityIdentifier("saveCapture")
  }.padding(24).background(Color(.systemGroupedBackground)).navigationTitle("Capture").navigationBarTitleDisplayMode(.inline).toolbar { Button("Close") { dismiss() } }.onChange(of: store.draft.text) { _, _ in store.saveDraft() }.onDisappear { dictation.stop() } }
 }
 private func selectKind(_ kind: ConsumptionKind?) { store.draft.consumptionKind = kind; store.saveDraft() }

}
struct SettingsView: View {
 @Environment(Store.self) private var store
 @State private var reminderMessage: String?; @State private var signOut = false
 var body: some View { Form {
  Section("Connected system") { LabeledContent("Server", value: store.server); if let expires = store.session?.expiresAt { Text("Session expires \(expires)").font(.caption).foregroundStyle(.secondary) }; Button("Refresh now") { Task { await store.refresh() } }.disabled(store.busy) }
  Section("A quiet daily nudge") {
   Text("Optional 8 AM reminder on this iPhone. Its text contains no personal information. Server push notifications are not configured.").font(.subheadline).foregroundStyle(.secondary)
   Button("Enable daily reminder") { Task { do { let center = UNUserNotificationCenter.current(); guard try await center.requestAuthorization(options: [.alert, .sound]) else { reminderMessage = "Notifications are disabled. Change this in iPhone Settings."; return }; let content = UNMutableNotificationContent(); content.title = "A moment for your day"; content.body = "Open TylerOS to see what matters today."; content.sound = .default; let trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: 8), repeats: true); try await center.add(UNNotificationRequest(identifier: "tyleros.daily", content: content, trigger: trigger)); reminderMessage = "Daily reminder scheduled for 8 AM." } catch { reminderMessage = error.localizedDescription } } }
   Button("Remove daily reminder") { UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["tyleros.daily"]); reminderMessage = "Daily reminder removed." }
   if let reminderMessage { Text(reminderMessage).font(.caption) }
  }
  Section("Privacy & authority") { Label("Device-only Keychain session and drafts", systemImage: "key"); Label("On-device speech recognition", systemImage: "waveform"); Label("App switcher privacy cover", systemImage: "eye.slash"); Text("Notion and Postgres remain authoritative. Existing standing authority applies to Miles. Review proposals before accepting. No paid AI requests are initiated by this app.").font(.caption).foregroundStyle(.secondary) }
  Section { Button("Sign out and revoke session", role: .destructive) { signOut = true }.disabled(store.busy); Button("Forget session on this iPhone", role: .destructive) { store.forgetSession() }; Text("Forgetting locally does not revoke the server token. Use it only if the server is unreachable. Your capture draft remains on this device.").font(.caption).foregroundStyle(.secondary) }
 }.navigationTitle("Settings").confirmationDialog("Revoke this mobile session?", isPresented: $signOut, titleVisibility: .visible) { Button("Sign out", role: .destructive) { Task { await store.logout() } } } }
}
