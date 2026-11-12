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

def render_html_to_image(ws, html_content, output_path, width=1080, height=720):
    ws.call("Emulation.setDeviceMetricsOverride", {
        "width": width,
        "height": height,
        "deviceScaleFactor": 2,
        "mobile": False
    })
    
    ws.call("Page.navigate", {"url": "about:blank"})
    time.sleep(0.3)
    
    ws.call("Page.setDocumentContent", {
        "frameId": ws.call("Page.getFrameTree")["result"]["frameTree"]["frame"]["id"],
        "html": html_content
    })
    time.sleep(1.2)
    
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
    # 1. Apple Devices (iOS / iPadOS) Install Guide Visual Card
    # =========================================================================
    ios_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif; }
        body { background: #070a12; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
        .card { width: 960px; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 36px 40px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 24px; margin-bottom: 30px; }
        .title-wrap { display: flex; align-items: center; gap: 16px; }
        .apple-badge { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; font-size: 30px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        h1 { font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; }
        p.subtitle { color: #94a3b8; font-size: 14px; margin-top: 4px; }
        .pwa-pill { background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
        
        .steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 28px; }
        .step-col { background: #131d31; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 22px 18px; display: flex; flex-direction: column; position: relative; }
        .step-num { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); color: #0b0f19; font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); }
        .step-title { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 8px; line-height: 1.3; }
        .step-desc { font-size: 12.8px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px; flex-grow: 1; }
        
        .mock-ui { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; text-align: center; }
        .mock-safari-bar { display: flex; justify-content: space-around; align-items: center; padding: 6px 0; color: #38bdf8; font-size: 18px; }
        .mock-share-btn { background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; border-radius: 8px; padding: 4px 10px; font-size: 18px; }
        
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
              <h1>How to Install on iPhone & iPad</h1>
              <p class="subtitle">Fast, full-screen native standalone app directly from Safari in under 10 seconds</p>
            </div>
          </div>
          <div class="pwa-pill">Apple iOS / iPadOS</div>
        </div>

        <div class="steps-grid">
          <!-- Step 1 -->
          <div class="step-col">
            <div class="step-num">1</div>
            <div class="step-title">Open in Safari</div>
            <div class="step-desc">Open the app URL in <strong>Safari</strong> on your iPhone or iPad. Apple requires Safari to install PWAs natively to the Home Screen.</div>
            <div class="mock-ui">
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Safari Address Bar</div>
              <div style="font-size: 12px; color: #f8fafc; font-family: monospace; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">🔒 daily-bible-devotion...</div>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="step-col">
            <div class="step-num">2</div>
            <div class="step-title">Tap Share</div>
            <div class="step-desc">Tap the <strong>Share button</strong> at the bottom of the Safari screen (or top toolbar on iPad) — the square with an arrow pointing up.</div>
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
            <div class="step-desc">Scroll down the iOS share sheet actions and tap <strong>"Add to Home Screen"</strong> (with the plus ⊞ icon).</div>
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
            <div class="step-desc">Tap <strong>Add</strong> in the top-right corner. The official Daily Devotions app icon appears instantly on your Home Screen!</div>
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
            <strong>Optimized for iPhone Dynamic Island & Notch:</strong> When launched from your Home Screen, all browser URL bars and toolbars disappear. Popups, banners, and the floating verse action bar automatically clear the camera island and Home indicator!
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    render_html_to_image(ws, ios_html, f"{art_dir}/infographic_ios_install.png", 1040, 700)

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
        body { background: #070a12; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
        .card { width: 960px; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 36px 40px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 24px; margin-bottom: 30px; }
        .title-wrap { display: flex; align-items: center; gap: 16px; }
        .android-badge { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #064e3b, #022c22); border: 1px solid #10b981; display: flex; align-items: center; justify-content: center; font-size: 30px; color: #10b981; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3); }
        h1 { font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; }
        p.subtitle { color: #94a3b8; font-size: 14px; margin-top: 4px; }
        .pwa-pill { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #10b981; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
        
        .steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 28px; }
        .step-col { background: #131d31; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 22px 18px; display: flex; flex-direction: column; position: relative; }
        .step-num { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); }
        .step-title { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 8px; line-height: 1.3; }
        .step-desc { font-size: 12.8px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px; flex-grow: 1; }
        
        .mock-ui { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; text-align: center; }
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
              <h1>How to Install on Android</h1>
              <p class="subtitle">Install directly to your App Drawer & Home Screen with offline storage via Chrome / Samsung Internet</p>
            </div>
          </div>
          <div class="pwa-pill">Android WebAPK</div>
        </div>

        <div class="steps-grid">
          <!-- Step 1 -->
          <div class="step-col">
            <div class="step-num">1</div>
            <div class="step-title">Open in Chrome</div>
            <div class="step-desc">Open <strong>Google Chrome</strong> or <strong>Samsung Internet</strong> and visit the app URL. The browser detects the PWA manifest immediately.</div>
            <div class="mock-ui">
              <div class="mock-chrome-bar">
                <span>🔒 daily-bible-devotion...</span>
                <span class="mock-menu-btn">⋮</span>
              </div>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="step-col">
            <div class="step-num">2</div>
            <div class="step-title">Tap Menu or Banner</div>
            <div class="step-desc">Look for the bottom prompt <em>"Add Daily Devotions to Home screen"</em>, or tap the <strong>Three Dots (⋮)</strong> in the top-right corner.</div>
            <div class="mock-ui">
              <div class="mock-banner">
                <span>📖</span>
                <span>Install Daily Devotions</span>
                <span class="mock-banner-btn">Install</span>
              </div>
            </div>
          </div>

          <!-- Step 3 -->
          <div class="step-col">
            <div class="step-num">3</div>
            <div class="step-title">Select "Install App"</div>
            <div class="step-desc">From the Chrome dropdown menu, tap <strong>"Install app"</strong> (or "Add to Home screen").</div>
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
            <div class="step-desc">Tap <strong>Install</strong> on the modal prompt. Android packages it as a native WebAPK with full offline cache storage!</div>
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
    render_html_to_image(ws, android_html, f"{art_dir}/infographic_android_install.png", 1040, 700)

    # =========================================================================
    # 3. Comprehensive Feature Suite Panoramic Overview Infographic Card
    # =========================================================================
    features_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #070a12; color: #f8fafc; padding: 36px; display: flex; justify-content: center; }
        .card { width: 1100px; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 32px 36px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 20px; margin-bottom: 24px; }
        .title-wrap { display: flex; align-items: center; gap: 16px; }
        .logo-badge { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; font-size: 30px; box-shadow: 0 8px 24px rgba(245, 158, 11, 0.4); }
        h1 { font-size: 25px; font-weight: 800; color: #ffffff; }
        p.subtitle { color: #94a3b8; font-size: 13.5px; margin-top: 4px; }
        .pwa-pill { background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; text-transform: uppercase; }

        .feat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 22px; }
        .feat-card { background: #131d31; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px 16px; display: flex; flex-direction: column; }
        .feat-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .feat-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
        .icon-gold { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .icon-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
        .icon-green { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .icon-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
        .icon-rose { background: rgba(244, 63, 94, 0.15); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.3); }
        .icon-cyan { background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }
        .icon-amber { background: rgba(217, 119, 6, 0.15); color: #f59e0b; border: 1px solid rgba(217, 119, 6, 0.3); }
        .icon-indigo { background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); }

        .feat-title { font-size: 14.5px; font-weight: 700; color: #ffffff; }
        .feat-desc { font-size: 12px; color: #94a3b8; line-height: 1.45; }

        .bottom-summary { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
        .summary-stats { display: flex; gap: 32px; }
        .stat-item { text-align: left; }
        .stat-val { font-size: 18px; font-weight: 800; color: #fbbf24; }
        .stat-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="title-wrap">
            <div class="logo-badge">📖</div>
            <div>
              <h1>Daily Devotions: Feature Suite Overview</h1>
              <p class="subtitle">Complete Feature Architecture — Crafted for Peace, Focus, and Daily Spiritual Growth (v1.0.0 Stable)</p>
            </div>
          </div>
          <div class="pwa-pill">v1.0.0 Stable Reference</div>
        </div>

        <div class="feat-grid">
          <!-- Feat 1 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-gold">📜</div>
              <div class="feat-title">Multi-Passage Scripture</div>
            </div>
            <div class="feat-desc">Read Psalms, Old Testament, and New Testament side-by-side with instant Berean Standard Bible (BSB) & Ang Biblia (Tagalog) translation toggling.</div>
          </div>

          <!-- Feat 2 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-amber">🎨</div>
              <div class="feat-title">Scripture Card Generator</div>
            </div>
            <div class="feat-desc">Turn verses into aesthetic cards. 4 themes, 9:16 Story format for Instagram & Facebook, inverse dynamic font scaling, and app icon branding.</div>
          </div>

          <!-- Feat 3 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-purple">🖍️</div>
              <div class="feat-title">Verse Highlighting</div>
            </div>
            <div class="feat-desc">In-text highlighting with 4 colors (Gold, Green, Sky, Purple). Multi-verse selection mode with a 2-tier compact portrait action bar & dedicated Journal catalog.</div>
          </div>

          <!-- Feat 4 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-indigo">⛪</div>
              <div class="feat-title">Sunday Church Notes</div>
            </div>
            <div class="feat-desc">Appears automatically on Sundays. 1-tap service attendance confirmation, sermon title, speaker, notes, and a dedicated Sunday category in Journal.</div>
          </div>

          <!-- Feat 5 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-cyan">🏷️</div>
              <div class="feat-title">Universal Tagging</div>
            </div>
            <div class="feat-desc">Apply tags to devotions and Sunday notes. Filter entries in the Journal by tag pills with live entry count badges.</div>
          </div>

          <!-- Feat 6 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-rose">✍️</div>
              <div class="feat-title">S.O.A.P. & Photo Journal</div>
            </div>
            <div class="feat-desc">Study via Scripture, Observation, Application, and Prayer. Attach photos with a visual gallery grid and full-screen memory lightbox.</div>
          </div>

          <!-- Feat 7 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-green">📊</div>
              <div class="feat-title">Monthly Infographics</div>
            </div>
            <div class="feat-desc">Canvas-rendered "Spiritual Walk with God" monthly card with reading completion, total scriptures read, streak consistency, and top tags.</div>
          </div>

          <!-- Feat 8 -->
          <div class="feat-card">
            <div class="feat-head">
              <div class="feat-icon icon-blue">🎧</div>
              <div class="feat-title">Audio TTS & Privacy</div>
            </div>
            <div class="feat-desc">Calm text-to-speech audio reader with verse-by-verse playback. 100% on-device private storage in encrypted IndexedDB with zero cloud tracking.</div>
          </div>
        </div>

        <div class="bottom-summary">
          <div class="summary-stats">
            <div class="stat-item"><div class="stat-val">100%</div><div class="stat-lbl">Local Privacy</div></div>
            <div class="stat-item"><div class="stat-val">Offline</div><div class="stat-lbl">PWA Ready</div></div>
            <div class="stat-item"><div class="stat-val">2 Themes</div><div class="stat-lbl">Dark & Light</div></div>
            <div class="stat-item"><div class="stat-val">0 Accounts</div><div class="stat-lbl">Instant Access</div></div>
          </div>
          <div style="font-size: 12.5px; color: #94a3b8;">
            Compatible with iOS, iPadOS, Android, macOS, Windows & Tablets
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    render_html_to_image(ws, features_html, f"{art_dir}/infographic_features_overview.png", 1180, 680)

    # =========================================================================
    # 4. Scripture Card Generator Feature Guide Card
    # =========================================================================
    card_guide_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #070a12; color: #f8fafc; padding: 36px; display: flex; justify-content: center; }
        .card { width: 1040px; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 34px 38px; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 20px; margin-bottom: 26px; }
        .title-wrap { display: flex; align-items: center; gap: 16px; }
        .badge-icon { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; font-size: 30px; box-shadow: 0 8px 24px rgba(245, 158, 11, 0.4); }
        h1 { font-size: 26px; font-weight: 800; color: #ffffff; }
        p.subtitle { color: #94a3b8; font-size: 13.5px; margin-top: 4px; }
        .pill { background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; text-transform: uppercase; }

        .content-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 24px; }
        .item-box { background: #131d31; border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 22px 20px; }
        .item-icon { font-size: 28px; margin-bottom: 10px; }
        .item-title { font-size: 16.5px; font-weight: 700; color: #ffffff; margin-bottom: 8px; }
        .item-desc { font-size: 12.8px; color: #94a3b8; line-height: 1.5; }
        .item-desc strong { color: #fbbf24; }

        .banner { background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 16px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; }
        .banner-icon { font-size: 26px; }
        .banner-text { font-size: 13.5px; color: #cbd5e1; line-height: 1.5; }
        .banner-text strong { color: #38bdf8; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="title-wrap">
            <div class="badge-icon">🎨</div>
            <div>
              <h1>Shareable Scripture Card Generator</h1>
              <p class="subtitle">Turn any devotion verse or multi-verse passage into aesthetic shareable artwork</p>
            </div>
          </div>
          <div class="pill">Visual Storyteller</div>
        </div>

        <div class="content-grid">
          <div class="item-box">
            <div class="item-icon">📐</div>
            <div class="item-title">Native Aspect Ratios</div>
            <div class="item-desc">
              Toggle between <strong>Portrait (4:5)</strong> for feeds, <strong>Square (1:1)</strong> for posts, and <strong>Story (9:16)</strong> for Instagram Stories and Facebook Stories (1080 × 1920).
            </div>
          </div>

          <div class="item-box">
            <div class="item-icon">🔤</div>
            <div class="item-title">Inverse Font Scaling</div>
            <div class="item-desc">
              Short verses automatically scale up to a bold <strong>70px</strong> headline. Multi-verse selections scale dynamically (23px–46px) with an auto-fitting loop so text never overflows.
            </div>
          </div>

          <div class="item-box">
            <div class="item-icon">✨</div>
            <div class="item-title">Official Top-Center Branding</div>
            <div class="item-desc">
              Every card features the official <strong>Daily Devotions icon</strong> in a 76px squircle badge with a theme-matching accent border and soft drop shadow.
            </div>
          </div>

          <div class="item-box">
            <div class="item-icon">🎨</div>
            <div class="item-title">4 Themes & Photo Mode</div>
            <div class="item-desc">
              Choose from <strong>Midnight</strong>, <strong>Dawn</strong>, <strong>Ocean</strong>, and <strong>Garden</strong>, or use your own attached devotional photo with a smart cinematic vignette.
            </div>
          </div>

          <div class="item-box">
            <div class="item-icon">📱</div>
            <div class="item-title">Direct Native Sharing</div>
            <div class="item-desc">
              Web Share API Level 2 dispatches the card image to the iOS and Android share sheets for 1-tap posting to <strong>Instagram Stories</strong>, <strong>Facebook</strong>, or Camera Roll.
            </div>
          </div>

          <div class="item-box">
            <div class="item-icon">🔒</div>
            <div class="item-title">100% Client-Side Canvas</div>
            <div class="item-desc">
              Cards are rendered in high-resolution directly in your browser's 2D Canvas context. No images are uploaded to any server or cloud API.
            </div>
          </div>
        </div>

        <div class="banner">
          <div class="banner-icon">💡</div>
          <div class="banner-text">
            <strong>How to create a card:</strong> Tap any verse (or multiple verses) in the daily reading to bring up the compact action bar, tap the <strong>Card (🎨)</strong> tool button, select your favorite theme and format, and tap <strong>Share</strong> or <strong>Save Image</strong>!
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    render_html_to_image(ws, card_guide_html, f"{art_dir}/infographic_card_generator_guide.png", 1120, 680)

    print("All visual infographics generated successfully!")
    ws.sock.close()

if __name__ == '__main__':
    main()
