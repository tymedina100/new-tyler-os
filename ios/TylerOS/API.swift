import Foundation
import Security

struct APIError: LocalizedError { let message: String; var errorDescription: String? { message } }
struct Failure: Decodable { struct Detail: Decodable { let message: String }; let error: Detail }
struct API {
    let baseURL: URL
    let token: String?
    let session: URLSession
    init(baseURL: URL, token: String? = nil, session: URLSession = SecureTransport.session) { self.baseURL = baseURL; self.token = token; self.session = session }
    static func serverURL(_ input: String) throws -> URL {
        guard let url = URL(string: input.trimmingCharacters(in: .whitespacesAndNewlines)), let host = url.host, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else { throw APIError(message: "Enter your TylerOS server address.") }
        var allowed = url.scheme == "https"
        #if DEBUG
        allowed = allowed || (url.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host))
        #endif
        guard allowed else { throw APIError(message: "Use HTTPS to protect your session.") }
        return url
    }
    func request<T: Decodable>(_ path: String, method: String = "GET", body: [String: String]? = nil) async throws -> T {
        guard let url = URL(string: "api/mobile/" + path, relativeTo: URL(string: baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/")!) else { throw APIError(message: "Invalid server address.") }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.timeoutInterval = 25; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONEncoder().encode(body) }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "The server did not respond.") }
        guard (200..<300).contains(http.statusCode) else {
            let detail = try? JSONDecoder().decode(Failure.self, from: data)
            throw APIError(message: detail?.error.message ?? "Server returned \(http.statusCode). Refresh and try again.")
        }
        return try JSONDecoder().decode(Envelope<T>.self, from: data).data
    }
}

enum Vault {
    static let service = "com.tylermedina.tyleros.mobile"
    static func read<T: Decodable>(_ key: String) -> T? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecReturnData as String: true]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
    static func save<T: Encodable>(_ value: T, key: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        let data = try JSONEncoder().encode(value)
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            guard SecItemAdd(query.merging(attributes) { _, b in b } as CFDictionary, nil) == errSecSuccess else { throw APIError(message: "Could not securely save on this device.") }; return
        }
        guard status == errSecSuccess else { throw APIError(message: "Could not securely save on this device.") }
    }
    static func delete(_ key: String) { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key] as CFDictionary) }
}
