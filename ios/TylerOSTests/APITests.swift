import XCTest
@testable import TylerOS
final class StubProtocol: URLProtocol {
 static var handler: ((URLRequest) throws -> (Int, Data))?
 override class func canInit(with request: URLRequest) -> Bool { true }
 override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
 override func startLoading() { do { let (status, data) = try Self.handler!(request); client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed); client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self) } catch { client?.urlProtocol(self, didFailWithError: error) } }
 override func stopLoading() {}
}
final class APITests: XCTestCase {
 func testRejectsUnsafeServers() { XCTAssertThrowsError(try API.serverURL("http://example.com")); XCTAssertThrowsError(try API.serverURL("https://user:secret@example.com")); XCTAssertThrowsError(try API.serverURL("https://example.com?token=secret")); XCTAssertNoThrow(try API.serverURL("https://example.com")) }
 func testCaptureSendsBearerToken() async throws {
  let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [StubProtocol.self]
  StubProtocol.handler = { request in XCTAssertEqual(request.url?.path, "/api/mobile/capture"); XCTAssertEqual(request.httpMethod, "POST"); XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-only-token"); return (200, Data(#"{"data":{"id":"fixture-item","entityType":"item"}}"#.utf8)) }
  let result: CaptureResult = try await API(baseURL: URL(string: "https://example.com")!, token: "test-only-token", session: URLSession(configuration: config)).request("capture", method: "POST", body: ["requestId": "fixture-request", "text": "SYNTHETIC TEST"]); XCTAssertEqual(result.id, "fixture-item")
 }
 func testConflictExplainsCanonicalStateChanged() async {
  let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [StubProtocol.self]; StubProtocol.handler = { _ in (409, Data(#"{"error":{"code":"conflict","message":"This item changed. Refresh before editing."}}"#.utf8)) }
  do { let _: Item = try await API(baseURL: URL(string: "https://example.com")!, session: URLSession(configuration: config)).request("items/fixture"); XCTFail("Expected conflict") } catch { XCTAssertEqual(error.localizedDescription, "This item changed. Refresh before editing.") }
 }
 func testConsumptionModePersistsWithoutEditingDescription() throws {
  let draft = Draft(text: "Lunch friday @cafe", requestId: "fixed", consumptionKind: .food)
  let restored = try JSONDecoder().decode(Draft.self, from: JSONEncoder().encode(draft))
  XCTAssertEqual(restored.text, "Lunch friday @cafe"); XCTAssertEqual(restored.captureText, "food: Lunch friday @cafe"); XCTAssertEqual(restored.requestId, "fixed")
  let legacy = try JSONDecoder().decode(Draft.self, from: Data(#"{"text":"note: reference","requestId":"old"}"#.utf8))
  XCTAssertNil(legacy.consumptionKind); XCTAssertEqual(legacy.captureText, "note: reference")
 }
 func testDraftRoundTripRetainsIdempotencyKey() throws { var draft = Draft(); draft.text = "SYNTHETIC draft"; let restored = try JSONDecoder().decode(Draft.self, from: JSONEncoder().encode(draft)); XCTAssertEqual(restored.requestId, draft.requestId); XCTAssertEqual(restored.text, draft.text) }
 func testVaultRoundTripAndDeletion() throws { let key = "test-" + UUID().uuidString; defer { Vault.delete(key) }; try Vault.save(Draft(text: "SYNTHETIC", requestId: "fixed"), key: key); let value: Draft? = Vault.read(key); XCTAssertEqual(value?.requestId, "fixed"); Vault.delete(key); let deleted: Draft? = Vault.read(key); XCTAssertNil(deleted) }
 @MainActor func testSessionCannotSendTokenToChangedServer() throws {
  let store = Store(); store.server = "https://other.example.com"
  store.session = Session(token: "test-only-token", expiresAt: "2099-01-01", server: "https://original.example.com")
  XCTAssertThrowsError(try store.api)
  store.server = "https://original.example.com"
  XCTAssertEqual(try store.api.token, "test-only-token")
 }
 @MainActor func testSuccessfulOperationClearsPriorError() async {
  let store = Store(); store.error = "Previous failure"
  await store.perform { }
  XCTAssertNil(store.error); XCTAssertFalse(store.busy)
 }
 @MainActor func testBriefingRetryPreservesPendingIdentifierAfterFailure() async {
  let store = Store(); let original = store.pendingBriefingRequest
  defer { if let original { try? Vault.save(original, key: "briefingRequest") } else { Vault.delete("briefingRequest") } }
  store.server = "http://invalid.example.com"; store.pendingBriefingRequest = "test-only-retry-id"
  await store.requestBriefing()
  XCTAssertEqual(store.pendingBriefingRequest, "test-only-retry-id")
  let saved: String? = Vault.read("briefingRequest"); XCTAssertEqual(saved, "test-only-retry-id")
 }
 func testTodayDecodesLegacyAndCanonicalOperations() throws {
  let legacy = #"{"today":"2026-09-09","view":{"overdue":[],"dueToday":[],"upcoming":[],"needsTriage":[],"totalSurfaced":0}}"#
  XCTAssertNil(try JSONDecoder().decode(Today.self, from: Data(legacy.utf8)).operations)
  let current = legacy.dropLast() + #", "operations":{"since":"2026-09-08T19:00:00Z","asOf":"2026-09-09T19:00:00Z","pendingApprovals":1,"failedJobs":0,"savedNotes":2}}"#
  let operations = try XCTUnwrap(JSONDecoder().decode(Today.self, from: Data(current.utf8)).operations)
  XCTAssertEqual(operations.pendingApprovals, 1)
  XCTAssertTrue(operations.needsAttention)
  XCTAssertTrue(operations.hasActivity)
 }
 func testSavedOperationsDoNotClaimToNeedAttention() {
  let summary = OperationsSummary(since: "start", asOf: "end", pendingApprovals: 0, failedJobs: 0, savedNotes: 2)
  XCTAssertTrue(summary.hasActivity); XCTAssertFalse(summary.needsAttention)
 }

 @MainActor func testBusyApprovalDoesNotReportSuccessOrDismiss() async {
  let store = Store(); store.busy = true
  let proposal = Approval(id: "fixture", title: "Synthetic", body: "Fixture", status: "pending", standingAuthorityKey: nil)
  let saved = await store.decide(proposal, decision: "accept")
  XCTAssertFalse(saved); XCTAssertNotNil(store.error)
  XCTAssertNotEqual(store.notice, "Approved and saved as a note.")
 }

 func testKnowledgeHealthIsAdditiveAndDistinguishesUnavailableSources() throws {
  let legacy = #"{"entries":[],"mode":"snapshot","asOf":null}"#
  XCTAssertNil(try JSONDecoder().decode(Knowledge.self, from: Data(legacy.utf8)).health)
  let current = #"{"entries":[],"mode":"snapshot","asOf":null,"health":{"status":"unavailable","message":"Source could not be loaded."}}"#
  let knowledge = try JSONDecoder().decode(Knowledge.self, from: Data(current.utf8))
  XCTAssertEqual(knowledge.health?.status, "unavailable")
  XCTAssertEqual(knowledge.health?.message, "Source could not be loaded.")
  XCTAssertEqual(try JSONDecoder().decode(WorkBoard.self, from: Data(current.utf8)).health?.status, "unavailable")
 }

 func testPalateSelectionRequiresCanonicalMetadataAndKeepsLegacyDecode() throws {
  let base: [String: Any] = ["id": "synthetic", "title": "Food & Drink Palate", "body": "Synthetic preference"]
  func decode(_ properties: [String: Any]) throws -> KnowledgeEntry { try JSONDecoder().decode(KnowledgeEntry.self, from: JSONSerialization.data(withJSONObject: properties)) }
  XCTAssertFalse(try decode(base).isPalatePreference)
  let fields = ["domain": "Food & Drink", "knowledgeType": "Preference", "steward": "Palate", "status": "Active"]
  let current = base.merging(fields) { _, new in new }
  XCTAssertTrue(try decode(current).isPalatePreference)
  for key in fields.keys { var wrong = current; wrong[key] = "Other"; XCTAssertFalse(try decode(wrong).isPalatePreference) }
  var archived = current; archived["status"] = "Archived"; XCTAssertFalse(try decode(archived).isPalatePreference)
 }

}
