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
}
