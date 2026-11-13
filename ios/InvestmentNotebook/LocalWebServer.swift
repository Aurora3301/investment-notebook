import Darwin
import Foundation

/// Serves the bundled web app on 127.0.0.1 only.
/// A loopback origin keeps IndexedDB and HTTPS quote requests working inside WKWebView.
final class LocalWebServer {
    private var listenFD: Int32 = -1
    private let root: URL
    private var running = true

    init(root: URL) {
        self.root = root
    }

    func start() throws -> UInt16 {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        if fd < 0 { throw URLError(.cannotConnectToHost) }
        var reuse: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = 0
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &addr) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sap in
                bind(fd, sap, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        if bound != 0 || listen(fd, 16) != 0 {
            _ = Darwin.close(fd)
            throw URLError(.cannotConnectToHost)
        }
        var actual = sockaddr_in()
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &actual) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sap in
                getsockname(fd, sap, &length)
            }
        }
        if named != 0 {
            _ = Darwin.close(fd)
            throw URLError(.cannotConnectToHost)
        }
        listenFD = fd
        Thread.detachNewThread { [weak self] in
            self?.acceptLoop()
        }
        return UInt16(bigEndian: actual.sin_port)
    }

    private func acceptLoop() {
        while running {
            let client = accept(listenFD, nil, nil)
            if client < 0 { continue }
            var noSignal: Int32 = 1
            setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
            Thread.detachNewThread { [weak self] in
                self?.handle(client)
            }
        }
    }

    private func handle(_ client: Int32) {
        defer { _ = Darwin.close(client) }
        var buffer = [UInt8](repeating: 0, count: 8192)
        let count = read(client, &buffer, buffer.count)
        guard count > 0 else { return }
        let text = String(decoding: buffer.prefix(count), as: UTF8.self)
        guard let request = text.split(separator: "\r\n", maxSplits: 1).first else { return }
        let parts = request.split(separator: " ")
        guard parts.count >= 2 else { return }
        let method = String(parts[0])
        guard method == "GET" || method == "HEAD" else {
            respond(client, status: "405 Method Not Allowed", body: Data())
            return
        }
        let raw = String(parts[1]).split(separator: "?").first.map(String.init) ?? "/"
        let decoded = raw.removingPercentEncoding ?? raw
        if decoded.contains("..") {
            respond(client, status: "403 Forbidden", body: Data("forbidden".utf8))
            return
        }
        let relative = decoded == "/" ? "index.html" : String(decoded.dropFirst())
        let target = root.appendingPathComponent(relative).standardizedFileURL
        let rootPath = root.standardizedFileURL.path
        guard target.path == rootPath || target.path.hasPrefix(rootPath + "/"),
              FileManager.default.fileExists(atPath: target.path),
              let body = try? Data(contentsOf: target) else {
            respond(client, status: "404 Not Found", body: Data("not found".utf8))
            return
        }
        respond(client, status: "200 OK", body: body, mime: mimeType(target.pathExtension), headOnly: method == "HEAD")
    }

    private func respond(_ client: Int32, status: String, body: Data, mime: String = "text/plain; charset=utf-8", headOnly: Bool = false) {
        let header = "HTTP/1.1 \(status)\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nConnection: close\r\nCache-Control: no-cache\r\n\r\n"
        var payload = Data(header.utf8)
        if !headOnly { payload.append(body) }
        payload.withUnsafeBytes { raw in
            guard let base = raw.baseAddress else { return }
            var sent = 0
            while sent < raw.count {
                let wrote = write(client, base.advanced(by: sent), raw.count - sent)
                if wrote <= 0 { break }
                sent += wrote
            }
        }
    }

    private func mimeType(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "map": return "application/json"
        case "webmanifest": return "application/manifest+json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "ico": return "image/x-icon"
        case "woff2": return "font/woff2"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}
