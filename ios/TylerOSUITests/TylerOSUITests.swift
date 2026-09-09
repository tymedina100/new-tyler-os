import XCTest

final class TylerOSUITests: XCTestCase {
    @MainActor func testAConnectScreenHasAccessibleConnectionControls() throws {
        let app = XCUIApplication(); app.launch()
        // Session may already exist from a previous authenticated test.
        if !app.textFields["serverURL"].waitForExistence(timeout: 5) { throw XCTSkip("Device already connected; authenticated flow exercises the session.") }
        XCTAssertTrue(app.secureTextFields["passphrase"].exists)
        XCTAssertTrue(app.buttons["connect"].exists)
        XCTAssertFalse(app.buttons["connect"].isEnabled)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "TylerOS-connect"; screenshot.lifetime = .keepAlways; add(screenshot)
    }
    @MainActor func testConfiguredAuthenticatedCaptureEditAndMilesFlow() async throws {
        struct Configuration: Decodable { let server: String; let passphrase: String }
        let fallback = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("work/ios-ui-configuration.json")
        let file = ProcessInfo.processInfo.environment["TYLEROS_UI_CONFIGURATION"].map { URL(fileURLWithPath: $0) } ?? fallback
        guard let data = try? Data(contentsOf: file) else { throw XCTSkip("Provide work/ios-ui-configuration.json for isolated authenticated integration testing.") }
        let config = try JSONDecoder().decode(Configuration.self, from: data)
        func api(_ path: String, method: String = "GET", body: [String: String]? = nil, token: String? = nil) async throws -> [String: Any] {
            var request = URLRequest(url: URL(string: config.server + "/api/mobile/" + path)!)
            request.httpMethod = method
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
            if let body { request.httpBody = try JSONEncoder().encode(body) }
            let (data, response) = try await URLSession.shared.data(for: request)
            XCTAssertTrue((200..<300).contains((response as! HTTPURLResponse).statusCode))
            return (try JSONSerialization.jsonObject(with: data) as! [String: Any])["data"] as! [String: Any]
        }
        let session = try await api("session", method: "POST", body: ["passphrase": config.passphrase])
        let token = try XCTUnwrap(session["token"] as? String)
        let app = XCUIApplication(); app.launch()
        if app.textFields["serverURL"].waitForExistence(timeout: 3) {
            let server = app.textFields["serverURL"]; server.tap(); server.press(forDuration: 1.2)
            if app.menuItems["Select All"].exists { app.menuItems["Select All"].tap() }
            server.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (server.value as? String)?.count ?? 0) + config.server)
            let passphrase = app.secureTextFields["passphrase"]; passphrase.tap(); passphrase.typeText(config.passphrase)
            app.buttons["connect"].tap()
        }
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 30))
        let todayShot = XCTAttachment(screenshot: app.screenshot()); todayShot.name = "TylerOS-Today"; todayShot.lifetime = .keepAlways; add(todayShot)
        let title = "SYNTHETIC iOS capture " + UUID().uuidString.prefix(8)
        app.buttons["Capture a thought"].tap()
        let editor = app.textViews["captureText"]; XCTAssertTrue(editor.waitForExistence(timeout: 5)); editor.tap(); editor.typeText(title)
        app.buttons["saveCapture"].tap()
        XCTAssertTrue(editor.waitForNonExistence(timeout: 15))
        app.tabBars.buttons["Tasks"].tap()
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 15)); app.staticTexts[title].tap()
        let field = app.textFields["itemTitle"].exists ? app.textFields["itemTitle"] : app.textViews["itemTitle"]
        XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap(); field.typeText(" edited")
        let editedTitle = try XCTUnwrap(field.value as? String).trimmingCharacters(in: .whitespacesAndNewlines)
        if app.buttons["finishEditing"].exists { app.buttons["finishEditing"].tap() }
        XCTAssertTrue(app.buttons["Dismiss message"].exists, "Exercise Save while the capture success banner is visible.")
        let beforeSave = XCTAttachment(screenshot: app.screenshot()); beforeSave.name = "TylerOS-before-save"; beforeSave.lifetime = .keepAlways; add(beforeSave)
        XCTAssertTrue(app.buttons["saveItem"].isEnabled)
        app.buttons["saveItem"].tap()
        let afterSave = XCTAttachment(screenshot: app.screenshot()); afterSave.name = "TylerOS-after-save"; afterSave.lifetime = .keepAlways; add(afterSave)
        XCTAssertTrue(app.staticTexts[editedTitle].waitForExistence(timeout: 15))
        let items = try await api("items", token: token)
        let item = try XCTUnwrap((items["items"] as? [[String: Any]])?.first { ($0["title"] as? String) == editedTitle })
        let id = try XCTUnwrap(item["id"] as? String)
        let updated = try XCTUnwrap(item["updatedAt"] as? String)
        _ = try await api("items/" + id, method: "PATCH", body: ["requestId": UUID().uuidString, "expectedUpdatedAt": updated, "title": title + " web update"], token: token)
        app.terminate(); app.launch(); app.tabBars.buttons["Tasks"].tap()
        XCTAssertTrue(app.staticTexts[title + " web update"].waitForExistence(timeout: 20))
        let taskShot = XCTAttachment(screenshot: app.screenshot()); taskShot.name = "TylerOS-Tasks-persisted"; taskShot.lifetime = .keepAlways; add(taskShot)
        app.tabBars.buttons["Miles"].tap(); app.buttons["requestBriefing"].tap()
        let review = app.buttons["reviewApproval"].firstMatch
        XCTAssertTrue(review.waitForExistence(timeout: 90), "A running deterministic runtime must claim and finish the job.")
        review.tap()
        XCTAssertTrue(app.navigationBars["Review"].waitForExistence(timeout: 10))
        try await Task.sleep(for: .milliseconds(800))
        let reviewShot = XCTAttachment(screenshot: app.screenshot()); reviewShot.name = "TylerOS-Approval-review"; reviewShot.lifetime = .keepAlways; add(reviewShot)
        XCTAssertTrue(app.buttons["acceptApproval"].waitForExistence(timeout: 10)); app.buttons["acceptApproval"].tap(); app.buttons["Accept and save"].tap()
        XCTAssertTrue(app.staticTexts["Approved and saved as a note."].waitForExistence(timeout: 15))
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "TylerOS-Miles-authenticated"; screenshot.lifetime = .keepAlways; add(screenshot)
        XCTAssertTrue(app.buttons["Dismiss message"].exists)
        XCTAssertTrue(app.navigationBars["Review"].waitForNonExistence(timeout: 20), "Wait for approval refresh and sheet dismissal before changing tabs.")
        app.tabBars.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Today"].waitForExistence(timeout: 10))
        let savedOperations = app.descendants(matching: .any)["operationsSaved"].firstMatch
        XCTAssertTrue(savedOperations.waitForExistence(timeout: 15))
        let operationsShot = XCTAttachment(screenshot: app.screenshot()); operationsShot.name = "TylerOS-Operations"; operationsShot.lifetime = .keepAlways; add(operationsShot)
        app.buttons["operationsReview"].tap()
        XCTAssertTrue(app.navigationBars["Miles"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Knowledge"].tap()
        XCTAssertTrue(app.navigationBars["Knowledge"].waitForExistence(timeout: 10), "Success notices must not block tab navigation.")
        let knowledgeShot = XCTAttachment(screenshot: app.screenshot()); knowledgeShot.name = "TylerOS-Knowledge"; knowledgeShot.lifetime = .keepAlways; add(knowledgeShot)
        _ = try await api("session", method: "DELETE", token: token)
    }
}
