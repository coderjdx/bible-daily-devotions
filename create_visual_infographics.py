import json
import urllib.request
import base64
import time
import socket
import struct
import os

class SimpleWebSocket:
    def __init__(self, ws_url):
        parts = ws_url.replace("ws://", "").split("/", 1)
        host_port = parts[0].split(":")
        self.host = host_port[0]
        self.port = int(host_port[1])
        self.path = "/" + (parts[1] if len(parts) > 1 else "")
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect((self.host, self.port))
        
        key = base64.b64encode(os.urandom(16)).decode('utf-8')
        req = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode('utf-8'))
        resp = self.sock.recv(4096).decode('utf-8')
        if "101" not in resp:
            raise Exception("WebSocket handshake failed: " + resp)
        self.msg_id = 0

    def send(self, method, params=None):
        self.msg_id += 1
        msg = {"id": self.msg_id, "method": method}
        if params:
            msg["params"] = params
        payload = json.dumps(msg).encode('utf-8')
        
        length = len(payload)
        frame = bytearray([0x81])
        mask = os.urandom(4)
        
        if length <= 125:
            frame.append(0x80 | length)
        elif length <= 65535:
            frame.append(0x80 | 126)
            frame.extend(struct.pack("!H", length))
        else:
            frame.append(0x80 | 127)
            frame.extend(struct.pack("!Q", length))
            
        frame.extend(mask)
        masked = bytearray(length)
        for i in range(length):
            masked[i] = payload[i] ^ mask[i % 4]
        frame.extend(masked)
        self.sock.sendall(frame)
        return self.msg_id

    def recv(self, expected_id=None, timeout=15.0):
        start = time.time()
        while time.time() - start < timeout:
            b1, b2 = self.sock.recv(2)
            fin = b1 & 0x80
            opcode = b1 & 0x0F
            is_masked = b2 & 0x80
            payload_len = b2 & 0x7F
            
            if payload_len == 126:
                payload_len = struct.unpack("!H", self.sock.recv(2))[0]
            elif payload_len == 127:
                payload_len = struct.unpack("!Q", self.sock.recv(8))[0]
                
            if is_masked:
                mask = self.sock.recv(4)
            data = bytearray()
            while len(data) < payload_len:
                chunk = self.sock.recv(min(4096, payload_len - len(data)))
                data.extend(chunk)
                
            if is_masked:
                unmasked = bytearray(payload_len)
                for i in range(payload_len):
                    unmasked[i] = data[i] ^ mask[i % 4]
                data = unmasked
                
            text = data.decode('utf-8', errors='ignore')
            try:
                msg = json.loads(text)
                if expected_id is not None:
                    if msg.get("id") == expected_id:
                        return msg
                else:
                    return msg
            except Exception:
                pass
        raise Exception("Timeout waiting for message id=" + str(expected_id))

    def call(self, method, params=None, timeout=15.0):
        mid = self.send(method, params)
        return self.recv(expected_id=mid, timeout=timeout)

def render_html_to_image(ws, html_content, output_path, width=1000, height=800):
    ws.call("Emulation.setDeviceMetricsOverride", {
        "width": width,
        "height": height,
        "deviceScaleFactor": 2,
        "mobile": False
    })
    
    # Navigate to about:blank
    ws.call("Page.navigate", {"url": "about:blank"})
    time.sleep(0.3)
    
    # Set document content
    ws.call("Page.setDocumentContent", {
        "frameId": ws.call("Page.getFrameTree")["result"]["frameTree"]["frame"]["id"],
        "html": html_content
    })
    time.sleep(1.0)
    
    shot = ws.call("Page.captureScreenshot", {"format": "png"})
    with open(output_path, "wb") as f:
        f.write(base64.b64decode(shot["result"]["data"]))
    print(f"Rendered: {output_path}")

def main():
    res = urllib.request.urlopen("http://127.0.0.1:9222/json")
    targets = json.loads(res.read())
    page = next(t for t in targets if t.get("type") == "page")
    ws_url = page["webSocketDebuggerUrl"]
    print("Connecting to Chrome CDP:", ws_url)
    ws = SimpleWebSocket(ws_url)
    
    ws.call("Page.enable")
    ws.call("Runtime.enable")
    
    art_dir = "/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1"

    # =========================================================================
    # 1. iOS Safari Install Guide Visual Card
    # =========================================================================
    ios_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif; }
        body { background: #0b0f19; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
        .card { width: 920px; background: #131d31; border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 36px 40px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 24px; margin-bottom: 30px; }
        .title-wrap { display: flex; align-items: center; gap: 16px; }
        .apple-badge { width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 28px; }
        h1 { font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; }
        p.subtitle { color: #94a3b8; font-size: 14px; margin-top: 4px; }
        .pwa-pill { background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
        
        .steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
        .step-col { background: #0f172a; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 22px 18px; display: flex; flex-direction: column; position: relative; }
        .step-num { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); color: #0b0f19; font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
        .step-title { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 8px; line-height: 1.3; }
        .step-desc { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px; flex-grow: 1; }
        
        .mock-ui { background: #1a253c; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; text-align: center; }
        .mock-safari-bar { display: flex; justify-content: space-around; align-items: center; padding: 6px 0; color: #38bdf8; font-size: 18px; }
        .mock-share-btn { background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; border-radius: 8px; padding: 4px 10px; font-size: 18px; animation: pulse 2s infinite; }
        
        .mock-sheet-item { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.06); padding: 8px 10px; border-radius: 8px; font-size: 13px; font-weight: 600; color: #ffffff; text-align: left; }
        .mock-sheet-icon { font-size: 16px; width: 22px; text-align: center; color: #38bdf8; }
        
        .mock-dialog-top { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #94a3b8; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 8px; }
        .mock-add-btn { color: #38bdf8; font-weight: 800; font-size: 13px; }
        
        .mock-app-icon-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .mock-app-icon { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #f59e0b; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4); }
        .mock-app-label { font-size: 11px; font-weight: 600; color: #ffffff; }

        .footer-banner { background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 16px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; }
        .footer-icon { font-size: 26px; }
        .footer-text { font-size: 13.5px; color: #cbd5e1; line-height: 1.5; }
        .footer-text strong { color: #fbbf24; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="title-wrap">
            <div class="apple-badge"></div>
            <div>
              <h1>How to Install on iPhone (Safari)</h1>
              <p class="subtitle">Get a fast, full-screen native app icon on your iOS Home Screen in seconds</p>
            </div>
          </div>
          <div class="pwa-pill">iOS Safari PWA</div>
        </div>

        <div class="steps-grid">
          <!-- Step 1 -->
          <div class="step-col">
            <div class="step-num">1</div>
            <div class="step-title">Open in Safari</div>
            <div class="step-desc">Launch Safari on your iPhone and visit the live site URL. Make sure you use Safari (not Chrome on iOS) for native Home Screen installation.</div>
            <div class="mock-ui">
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Safari Address Bar</div>
              <div style="font-size: 12px; color: #f8fafc; font-family: monospace; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">🔒 daily-devotions...</div>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="step-col">
            <div class="step-num">2</div>
            <div class="step-title">Tap Share</div>
            <div class="step-desc">Look at the bottom toolbar of Safari and tap the <strong>Share button</strong> (the square box with an arrow pointing upwards).</div>
            <div class="mock-ui">
              <div class="mock-safari-bar">
                <span>◀</span>
                <span>▶</span>
                <span class="mock-share-btn">⎋</span>
                <span>📖</span>
                <span>⧉</span>
              </div>
            </div>
          </div>

          <!-- Step 3 -->
          <div class="step-col">
            <div class="step-num">3</div>
            <div class="step-title">Add to Home Screen</div>
            <div class="step-desc">Scroll down through the share sheet options and tap <strong>"Add to Home Screen"</strong> (with the plus sign ⊞ icon).</div>
            <div class="mock-ui">
              <div class="mock-sheet-item">
                <span class="mock-sheet-icon">⊞</span>
                <span>Add to Home Screen</span>
              </div>
            </div>
          </div>

          <!-- Step 4 -->
          <div class="step-col">
            <div class="step-num">4</div>
            <div class="step-title">Tap "Add" & Done!</div>
            <div class="step-desc">Confirm the title ("Daily Devotions") and tap <strong>Add</strong> in the top-right corner. The app will immediately appear on your Home Screen!</div>
            <div class="mock-ui">
              <div class="mock-dialog-top">
                <span>Cancel</span>
                <span class="mock-add-btn">Add</span>
              </div>
              <div class="mock-app-icon-wrap" style="margin-top: 6px;">
                <div class="mock-app-icon">📖</div>
                <div class="mock-app-label">Daily Devotions</div>
              </div>
            </div>
          </div>
        </div>

        <div class="footer-banner">
          <div class="footer-icon">✨</div>
          <div class="footer-text">
            <strong>Full-Screen Standalone Experience:</strong> Launching from your Home Screen removes all Safari URL bars and bottom navigation, giving you a clean, distraction-free devotional sanctuary with full offline capabilities!
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    render_html_to_image(ws, ios_html, f"{art_dir}/infographic_ios_install.png", 1000, 680)

    # =========================================================================
    # 2. Android Chrome Install Guide Visual Card
    # =========================================================================
    android_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Roboto", "Segoe UI", sans-serif; }
        body { background: #0b0f19; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
        .card { width: 920px; background: #131d31; border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 36px 40px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 24px; margin-bottom: 30px; }
        .title-wrap { display: flex; align-items: center; gap: 16px; }
        .android-badge { width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #064e3b, #022c22); border: 1px solid #10b981; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #10b981; }
        h1 { font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; }
        p.subtitle { color: #94a3b8; font-size: 14px; margin-top: 4px; }
        .pwa-pill { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
        
        .steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
        .step-col { background: #0f172a; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 22px 18px; display: flex; flex-direction: column; position: relative; }
        .step-num { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
        .step-title { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 8px; line-height: 1.3; }
        .step-desc { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px; flex-grow: 1; }
        
        .mock-ui { background: #1a253c; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; text-align: center; }
        .mock-chrome-bar { display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; background: rgba(0,0,0,0.25); border-radius: 8px; color: #94a3b8; font-size: 13px; }
        .mock-menu-btn { background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; border-radius: 6px; padding: 2px 8px; color: #10b981; font-weight: 900; font-size: 14px; }
        
        .mock-banner { background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 8px 10px; font-size: 11px; text-align: left; display: flex; align-items: center; gap: 8px; color: #cbd5e1; }
        .mock-banner-btn { background: #10b981; color: #0b0f19; font-weight: 700; font-size: 10px; padding: 4px 8px; border-radius: 4px; margin-left: auto; }
        
        .mock-menu-item { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.06); padding: 8px 10px; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: #ffffff; text-align: left; }
        
        .mock-app-icon-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .mock-app-icon { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #10b981; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); }
        .mock-app-label { font-size: 11px; font-weight: 600; color: #ffffff; }

        .footer-banner { background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 16px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; }
        .footer-icon { font-size: 26px; }
        .footer-text { font-size: 13.5px; color: #cbd5e1; line-height: 1.5; }
        .footer-text strong { color: #34d399; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="title-wrap">
            <div class="android-badge">🤖</div>
            <div>
              <h1>How to Install on Android (Chrome / Edge)</h1>
              <p class="subtitle">Install directly to your App Drawer & Home Screen with offline storage</p>
            </div>
          </div>
          <div class="pwa-pill">Android WebAPK</div>
        </div>

        <div class="steps-grid">
          <!-- Step 1 -->
          <div class="step-col">
            <div class="step-num">1</div>
            <div class="step-title">Open in Chrome</div>
            <div class="step-desc">Open Google Chrome or Samsung Internet and visit the web app. The browser will automatically detect the PWA manifest.</div>
            <div class="mock-ui">
              <div class="mock-chrome-bar">
                <span>🔒 daily-devotions...</span>
                <span class="mock-menu-btn">⋮</span>
              </div>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="step-col">
            <div class="step-num">2</div>
            <div class="step-title">Tap Menu or Banner</div>
            <div class="step-desc">A bottom banner may pop up: "Add Daily Devotions to Home screen". Alternatively, tap the <strong>Three Dots (⋮)</strong> in the top-right.</div>
            <div class="mock-ui">
              <div class="mock-banner">
                <span>📖</span>
                <span>Add to Home</span>
                <span class="mock-banner-btn">Install</span>
              </div>
            </div>
          </div>

          <!-- Step 3 -->
          <div class="step-col">
            <div class="step-num">3</div>
            <div class="step-title">Select "Install App"</div>
            <div class="step-desc">From the Chrome dropdown menu, select <strong>"Install app"</strong> (or "Add to Home screen").</div>
            <div class="mock-ui">
              <div class="mock-menu-item">
                <span>⬇️</span>
                <span>Install app</span>
              </div>
            </div>
          </div>

          <!-- Step 4 -->
          <div class="step-col">
            <div class="step-num">4</div>
            <div class="step-title">Tap "Install"</div>
            <div class="step-desc">Tap <strong>Install</strong> on the confirmation modal. Android will create an app shortcut in your App Drawer and on your Home Screen!</div>
            <div class="mock-ui">
              <div class="mock-app-icon-wrap">
                <div class="mock-app-icon">📖</div>
                <div class="mock-app-label">Daily Devotions</div>
              </div>
            </div>
          </div>
        </div>

        <div class="footer-banner">
          <div class="footer-icon">⚡</div>
          <div class="footer-text">
            <strong>True Android Native Integration:</strong> The app behaves just like a Play Store app — with an edge-to-edge layout, app drawer presence, instant launch, and full offline caching via Service Worker!
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    render_html_to_image(ws, android_html, f"{art_dir}/infographic_android_install.png", 1000, 680)

    # =========================================================================
    # 3. Privacy & On-Device Local Storage Infographic Card
    # =========================================================================
    privacy_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #0b0f19; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
        .card { width: 920px; background: linear-gradient(135deg, #131d31 0%, #0d1527 100%); border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 36px 40px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 24px; margin-bottom: 28px; }
        .title-wrap { display: flex; align-items: center; gap: 16px; }
        .shield-icon { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); display: flex; align-items: center; justify-content: center; font-size: 30px; box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4); }
        h1 { font-size: 26px; font-weight: 800; color: #ffffff; }
        p.subtitle { color: #94a3b8; font-size: 14px; margin-top: 4px; }
        .badge { background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; text-transform: uppercase; }

        .pillars-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 28px; }
        .pillar { background: #0f172a; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 24px 20px; text-align: left; }
        .pillar-icon { font-size: 32px; margin-bottom: 14px; }
        .pillar-title { font-size: 17px; font-weight: 700; color: #ffffff; margin-bottom: 8px; }
        .pillar-desc { font-size: 13px; color: #94a3b8; line-height: 1.6; }

        .quote-box { background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 18px; padding: 20px 24px; display: flex; align-items: center; gap: 18px; }
        .quote-icon { font-size: 32px; }
        .quote-text { font-size: 14px; color: #cbd5e1; line-height: 1.6; }
        .quote-text strong { color: #60a5fa; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="title-wrap">
            <div class="shield-icon">🛡️</div>
            <div>
              <h1>100% On-Device Privacy Guarantee</h1>
              <p class="subtitle">Your sacred personal reflections, prayers, and photos belong solely to you</p>
            </div>
          </div>
          <div class="badge">Zero Cloud Tracking</div>
        </div>

        <div class="pillars-grid">
          <div class="pillar">
            <div class="pillar-icon">🔒</div>
            <div class="pillar-title">Local IndexedDB Storage</div>
            <div class="pillar-desc">
              All your S.O.A.P. notes, freeform journal reflections, attached photos, and devotion streaks are stored directly in your phone's private, encrypted browser database.
            </div>
          </div>

          <div class="pillar">
            <div class="pillar-icon">🚫</div>
            <div class="pillar-title">No Accounts & No Tracking</div>
            <div class="pillar-desc">
              No logins, no email signups, no analytics cookies, and no cloud databases. No one—not even the site creators or hosting servers—has access to what you write.
            </div>
          </div>

          <div class="pillar">
            <div class="pillar-icon">✈️</div>
            <div class="pillar-title">Fully Offline Capable</div>
            <div class="pillar-desc">
              Scriptures, notes, and photos work seamlessly even without Wi-Fi or cellular signal. Complete your morning quiet time on a plane, in nature, or during a commute.
            </div>
          </div>
        </div>

        <div class="quote-box">
          <div class="quote-icon">🕊️</div>
          <div class="quote-text">
            <strong>Peace of Mind for Your Quiet Time:</strong> <em>"Your words were found, and I ate them. Your words became a delight to me and the joy of my heart." (Jeremiah 15:16)</em><br>
            Write freely with utter vulnerability—your devotion journal is an intimate, private conversation between you and God, kept safely on your device.
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    render_html_to_image(ws, privacy_html, f"{art_dir}/infographic_privacy_local.png", 1000, 580)

    # =========================================================================
    # 4. Features Panoramic Overview Infographic Card
    # =========================================================================
    features_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #0b0f19; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
        .card { width: 1040px; background: #131d31; border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 36px 40px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 24px; margin-bottom: 28px; }
        .title-wrap { display: flex; align-items: center; gap: 16px; }
        .logo-badge { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; font-size: 30px; box-shadow: 0 8px 24px rgba(245, 158, 11, 0.4); }
        h1 { font-size: 26px; font-weight: 800; color: #ffffff; }
        p.subtitle { color: #94a3b8; font-size: 14px; margin-top: 4px; }
        .pwa-pill { background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; text-transform: uppercase; }

        .feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 28px; }
        .feat-card { background: #0f172a; border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 20px 18px; display: flex; flex-direction: column; }
        .feat-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
        .feat-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
        .icon-gold { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .icon-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
        .icon-green { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .icon-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
        .icon-rose { background: rgba(244, 63, 94, 0.15); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.3); }
        .icon-cyan { background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }

        .feat-title { font-size: 15.5px; font-weight: 700; color: #ffffff; }
        .feat-desc { font-size: 12.5px; color: #94a3b8; line-height: 1.5; }

        .bottom-summary { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
        .summary-stats { display: flex; gap: 32px; }
        .stat-item { text-align: left; }
        .stat-val { font-size: 18px; font-weight: 800; color: #fbbf24; }
        .stat-lbl { font-size: 11.5px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="title-wrap">
            <div class="logo-badge">📖</div>
            <div>
              <h1>Daily Devotions: Bible Companion App</h1>
              <p class="subtitle">Complete Feature Architecture — Crafted for Peace, Focus, and Daily Spiritual Growth</p>
            </div>
          </div>
          <div class="pwa-pill">Feature Suite v2.3</div>
        </div>

        <div class="feat-grid">
          <!-- Feat 1 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-gold">📜</div>
              <div class="feat-title">Multi-Passage Scripture</div>
            </div>
            <div class="feat-desc">Read Psalms, Old Testament, and New Testament side-by-side. Seamlessly switch between Berean Standard Bible (BSB) and Ang Biblia (Tagalog).</div>
          </div>

          <!-- Feat 2 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-blue">🎧</div>
              <div class="feat-title">Read Aloud Audio</div>
            </div>
            <div class="feat-desc">Calm text-to-speech voice with verse-by-verse audio controls, floating player bar, and individual passage listening for hands-free meditation.</div>
          </div>

          <!-- Feat 3 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-purple">✍️</div>
              <div class="feat-title">S.O.A.P. & Freeform Journal</div>
            </div>
            <div class="feat-desc">Study via Scripture, Observation, Application, and Prayer. Features a floating slide-up sheet in portrait mode and continuous auto-save.</div>
          </div>

          <!-- Feat 4 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-rose">📸</div>
              <div class="feat-title">Photo Reflections & Gallery</div>
            </div>
            <div class="feat-desc">Capture images of your printed Bible notes or inspiring devotion moments. View them in a visual memory grid and full-screen lightbox.</div>
          </div>

          <!-- Feat 5 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-green">🔥</div>
              <div class="feat-title">Strict Streak & Catch-Up</div>
            </div>
            <div class="feat-desc">Streaks strictly count on-time consecutive days. Missed days can still be recovered without falsely inflating or falsifying your streak!</div>
          </div>

          <!-- Feat 6 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-cyan">⏰</div>
              <div class="feat-title">Morning & 7 PM Alarms</div>
            </div>
            <div class="feat-desc">Set custom wake-up devotion chimes (Harp, Bells, Zen) with snooze and a dedicated 7:00 PM evening reminder so you never miss a day.</div>
          </div>
        </div>

        <div class="bottom-summary">
          <div class="summary-stats">
            <div class="stat-item"><div class="stat-val">100%</div><div class="stat-lbl">Local Privacy</div></div>
            <div class="stat-item"><div class="stat-val">Offline</div><div class="stat-lbl">Ready Everywhere</div></div>
            <div class="stat-item"><div class="stat-val">2 Themes</div><div class="stat-lbl">Dark & Clean Light</div></div>
            <div class="stat-item"><div class="stat-val">0 Accounts</div><div class="stat-lbl">Instant Access</div></div>
          </div>
          <div style="font-size: 12.5px; color: #94a3b8;">
            Available on iOS, Android, macOS, Windows & Tablets
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    render_html_to_image(ws, features_html, f"{art_dir}/infographic_features_overview.png", 1120, 680)

    print("All visual infographics generated successfully!")

if __name__ == '__main__':
    main()
