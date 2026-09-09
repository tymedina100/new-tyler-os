import SwiftUI

@MainActor @Observable final class Store {
    var server = UserDefaults.standard.string(forKey: "server") ?? ""
    var session: Session? = Vault.read("session")
    var draft: Draft = Vault.read("captureDraft") ?? Draft()
    var today: Today?; var items: [Item] = []; var notes: [Note] = []; var jobs: [JobRow] = []; var knowledge: Knowledge?
    var workBoard: WorkBoard?
    var workBoardUnavailable = false
    var pendingBriefingRequest: String? = Vault.read("briefingRequest")
    var error: String?; var notice: String?; var busy = false; var refreshedAt: Date?
    var connected: Bool { session?.server != nil }
    var api: API { get throws {
        let url = try API.serverURL(server)
        guard session?.server == url.absoluteString else { throw APIError(message: "This session belongs to a different server. Reconnect securely.") }
        return API(baseURL: url, token: session?.token)
    } }
    func login(passphrase: String) async {
        await perform {
            let url = try API.serverURL(self.server)
            var result: Session = try await API(baseURL: url).request("session", method: "POST", body: ["passphrase": passphrase])
            result.server = url.absoluteString
            try Vault.save(result, key: "session")
            UserDefaults.standard.set(url.absoluteString, forKey: "server")
            self.session = result
        }
        if connected { await refresh() }
    }
    func logout() async {
        await perform {
            struct Revoked: Decodable { let revoked: Bool? }
            let _: Revoked = try await self.api.request("session", method: "DELETE")
            Vault.delete("session"); self.session = nil
            self.today = nil; self.items = []; self.notes = []; self.jobs = []; self.knowledge = nil; self.refreshedAt = nil; self.workBoard = nil
        }
    }
    func forgetSession() { Vault.delete("session"); session = nil; today = nil; items = []; notes = []; jobs = []; knowledge = nil; refreshedAt = nil; workBoard = nil }
    func refresh() async {
        guard connected, !busy else { return }
        await perform {
            let api = try self.api
            async let today: Today = api.request("today")
            async let items: Items = api.request("items")
            async let notes: Notes = api.request("notes")
            async let jobs: Jobs = api.request("jobs")
            let values = try await (today, items, notes, jobs)
            self.today = values.0; self.items = values.1.items; self.notes = values.2.notes; self.jobs = values.3.jobs; self.refreshedAt = .now
            do { self.workBoard = try await api.request("work-board"); self.workBoardUnavailable = false } catch { self.workBoard = nil; self.workBoardUnavailable = true }
            do { self.knowledge = try await api.request("knowledge") } catch { self.notice = "Personal knowledge is unavailable. Notes and tasks are current." }
        }
    }
    func refreshJobs() async {
        guard connected, !busy else { return }
        await perform { let result: Jobs = try await self.api.request("jobs"); self.jobs = result.jobs }
    }
    func saveDraft() { do { try Vault.save(draft, key: "captureDraft") } catch { self.error = error.localizedDescription } }
    func capture() async -> Bool {
        var saved = false
        await perform {
            let _: CaptureResult = try await self.api.request("capture", method: "POST", body: ["requestId": self.draft.requestId, "text": self.draft.text])
            self.draft = Draft(); self.saveDraft(); self.notice = "Captured in TylerOS."; saved = true
        }
        if saved { await refresh() }; return saved
    }
    func update(_ item: Item, title: String, body: String, status: String, dueOn: String) async -> Bool {
        var saved = false
        await perform {
            let _: Item = try await self.api.request("items/\(item.id)", method: "PATCH", body: ["requestId": UUID().uuidString, "expectedUpdatedAt": item.updatedAt, "title": title, "body": body, "status": status, "dueOn": dueOn])
            saved = true; self.notice = "Changes saved."
        }
        if saved { await refresh() }; return saved
    }
    func requestBriefing() async {
        var submitted = false
        await perform {
            let requestId = self.pendingBriefingRequest ?? UUID().uuidString
            try Vault.save(requestId, key: "briefingRequest")
            self.pendingBriefingRequest = requestId
            let _: Job = try await self.api.request("requests", method: "POST", body: ["requestId": requestId, "kind": "today_briefing"])
            Vault.delete("briefingRequest"); self.pendingBriefingRequest = nil
            self.notice = "Briefing requested. Your runtime will pick it up."; submitted = true
        }; if submitted { await refresh() }
    }
    @discardableResult func decide(_ approval: Approval, decision: String) async -> Bool {
        guard !busy else { error = "TylerOS is refreshing. Please try your decision again."; return false }
        var saved = false
        await perform {
            let _: DecisionResult = try await self.api.request("approvals/\(approval.id)", method: "POST", body: ["requestId": UUID().uuidString, "decision": decision])
            self.notice = decision == "accept" ? "Approved and saved as a note." : "Dismissed."; saved = true
        }; if saved { await refresh() }; return saved
    }
    func perform(_ action: () async throws -> Void) async { guard !busy else { return }; busy = true; error = nil; defer { busy = false }; do { try await action() } catch { self.error = error.localizedDescription } }
}
