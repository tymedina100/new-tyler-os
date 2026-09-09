import Foundation

struct Envelope<T: Decodable>: Decodable { let data: T }
struct Session: Codable { let token: String; let expiresAt: String; var server: String? = nil }
struct Item: Decodable, Identifiable, Hashable {
    let id: String; let title: String; let body: String?; let kind: String; let status: String
    let dueOn: String?; let updatedAt: String
}
struct Items: Decodable { let items: [Item] }
struct Today: Decodable { let today: String; let view: TodayBuckets; let operations: OperationsSummary?; let consumption: ConsumptionSummary? }
struct TodayBuckets: Decodable { let overdue: [Item]; let dueToday: [Item]; let upcoming: [Item]; let needsTriage: [Item]; let totalSurfaced: Int }
struct Note: Decodable, Identifiable { let id: String; let title: String; let body: String; let updatedAt: String }
struct Notes: Decodable { let notes: [Note] }
struct Knowledge: Decodable { let entries: [KnowledgeEntry]; let mode: String; let asOf: String?; let health: SnapshotHealth? }
struct KnowledgeEntry: Decodable, Identifiable { let id: String; let title: String; let body: String; let sourceUrl: String?; let sourceEditedAt: String?; let importedAt: String?; let lastReviewed: String?; let freshness: String?; let sensitivity: String?; let sourceHealth: KnowledgeSourceHealth?; let domain: String?; let knowledgeType: String?; let steward: String?; let status: String?
    var isPalatePreference: Bool { domain == "Food & Drink" && knowledgeType == "Preference" && steward == "Palate" && status == "Active" }
}
struct Jobs: Decodable { let jobs: [JobRow] }
struct JobRow: Decodable, Identifiable { var id: String { job.id }; let job: Job; let latestRun: Run?; let pendingApproval: Approval?; let latestApproval: Approval? }
struct Job: Decodable, Identifiable { let id: String; let title: String; let status: String; let authorization: String }
struct Run: Decodable { let status: String; let resultSummary: String? }
struct Approval: Decodable, Identifiable { let id: String; let title: String; let body: String; let status: String; let standingAuthorityKey: String? }
struct CaptureResult: Decodable { let id: String; let entityType: String }
struct DecisionResult: Decodable { let id: String; let decision: String }
enum ConsumptionKind: String, Codable { case food, drink }
struct Draft: Codable {
    var text = ""; var requestId = UUID().uuidString; var consumptionKind: ConsumptionKind?
    var captureText: String { consumptionKind.map { $0.rawValue + ": " + text } ?? text }
}
struct SearchResults: Decodable { let groups: [SearchGroup]; let total: Int }
struct SearchGroup: Decodable, Identifiable { var id: String { domain }; let domain: String; let label: String; let hits: [SearchHit] }
struct SearchHit: Decodable, Identifiable { let id: String; let title: String; let context: String?; let href: String }

struct WorkBoard: Decodable { let entries: [WorkBoardEntry]; let mode: String; let asOf: String?; let health: SnapshotHealth? }
struct WorkBoardEntry: Decodable, Identifiable { let id: String; let title: String; let status: String; let nextAction: String?; let sourceUrl: String?; let sourceEditedAt: String?; let priority: String?; let owner: String?; let needsTyler: Bool? }

struct OperationsSummary: Decodable {
    let since: String; let asOf: String
    let pendingApprovals: Int; let failedJobs: Int; let savedNotes: Int
    var needsAttention: Bool { pendingApprovals > 0 || failedJobs > 0 }
    var hasActivity: Bool { needsAttention || savedNotes > 0 }
}

struct SnapshotHealth: Decodable { let status: String; let message: String }
struct KnowledgeSourceHealth: Decodable { let importMessage: String; let reviewStatus: String; let reviewDueOn: String?; let reviewMessage: String }

struct ConsumptionSummary: Decodable { let day: String; let timeZone: String; let food: Int; let drink: Int }
struct ConsumptionEntry: Decodable, Identifiable { let id: String; let kind: String; let description: String; let occurredAt: String; let loggedOn: String; let feedback: String?; let voidedAt: String? }
struct ConsumptionFeedback: Decodable { let description: String; let likes: Int; let dislikes: Int }
struct ConsumptionHistory: Decodable { let entries: [ConsumptionEntry]; let today: ConsumptionSummary; let feedback: [ConsumptionFeedback] }
