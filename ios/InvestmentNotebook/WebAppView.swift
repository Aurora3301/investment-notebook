import SwiftUI
import WebKit

final class ServerModel: ObservableObject {
    @Published var url: URL?
    @Published var error: String?
    private var server: LocalWebServer?

    func start() {
        guard url == nil, error == nil else { return }
        guard let resource = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true),
              FileManager.default.fileExists(atPath: resource.appendingPathComponent("index.html").path) else {
            error = "找不到內置網頁。請先在專案執行 npm run build:ios，再用 Xcode 安裝。"
            return
        }
        let server = LocalWebServer(root: resource)
        do {
            let port = try server.start()
            self.server = server
            url = URL(string: "http://127.0.0.1:\(port)/index.html")
        } catch {
            self.error = "無法在本機開啟頁面。"
        }
    }
}

struct WebAppView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct RootView: View {
    @StateObject private var model = ServerModel()

    var body: some View {
        Group {
            if let url = model.url {
                WebAppView(url: url)
                    .ignoresSafeArea()
            } else if let error = model.error {
                Text(error)
                    .padding()
                    .multilineTextAlignment(.center)
            } else {
                ProgressView("正在開啟投資手帳")
            }
        }
        .onAppear { model.start() }
    }
}
