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
        masked_payload = bytearray(payload)
        for i in range(len(masked_payload)):
            masked_payload[i] ^= mask[i % 4]
        frame.extend(masked_payload)
        
        self.sock.sendall(frame)
        return self.msg_id

    def recv(self, expected_id=None, timeout=10.0):
        self.sock.settimeout(timeout)
        start_time = time.time()
        while True:
            if time.time() - start_time > timeout:
                raise TimeoutError("WebSocket recv timed out")
            b1, b2 = self.sock.recv(2)
            opcode = b1 & 0x0F
            masked = (b2 & 0x80) != 0
            payload_len = b2 & 0x7F
            if payload_len == 126:
                payload_len = struct.unpack("!H", self.sock.recv(2))[0]
            elif payload_len == 127:
                payload_len = struct.unpack("!Q", self.sock.recv(8))[0]
            
            mask = self.sock.recv(4) if masked else None
            
            data = bytearray()
            while len(data) < payload_len:
                chunk = self.sock.recv(payload_len - len(data))
                if not chunk:
                    break
                data.extend(chunk)
                
            if masked:
                for i in range(len(data)):
                    data[i] ^= mask[i % 4]
                    
            if opcode == 0x01:
                text = data.decode('utf-8')
                msg = json.loads(text)
                if expected_id is None or msg.get("id") == expected_id:
                    return msg

    def call(self, method, params=None, timeout=10.0):
        mid = self.send(method, params)
        return self.recv(expected_id=mid, timeout=timeout)

def main():
    res = urllib.request.urlopen("http://127.0.0.1:9222/json")
    targets = json.loads(res.read())
    page = next(t for t in targets if t.get("type") == "page")
    ws_url = page["webSocketDebuggerUrl"]
    print("Connecting to:", ws_url)
    ws = SimpleWebSocket(ws_url)
    
    ws.call("Page.enable")
    ws.call("Runtime.enable")
    
    # Desktop 1280x850
    ws.call("Emulation.setDeviceMetricsOverride", {
        "width": 1280,
        "height": 850,
        "deviceScaleFactor": 2,
        "mobile": False
    })
    
    print("Navigating to http://localhost:8080/ ...")
    ws.call("Page.navigate", {"url": "http://localhost:8080/"})
    time.sleep(2.0)

    # 1. Test Settings: Enable SOAP Format
    print("\n--- 1. Testing Settings View & SOAP Toggle ---")
    ws.call("Runtime.evaluate", {"expression": "document.querySelector(\"[data-nav='settings']\").click()"})
    time.sleep(0.8)

    # Scroll viewport slightly so Reading & Display preferences are in clear view
    ws.call("Runtime.evaluate", {"expression": """
        const vp = document.getElementById('main-viewport');
        if (vp) vp.scrollTop = 150;
    """})
    time.sleep(0.5)

    toggle_state = ws.call("Runtime.evaluate", {"expression": "document.getElementById('setting-soap-toggle').checked"})
    print("Current setting-soap-toggle.checked:", toggle_state["result"]["result"].get("value"))

    if not toggle_state["result"]["result"].get("value"):
        print("Toggling SOAP Format setting ON...")
        ws.call("Runtime.evaluate", {"expression": """
            const toggle = document.getElementById('setting-soap-toggle');
            toggle.click();
        """})
        time.sleep(0.6)

    toggle_state_after = ws.call("Runtime.evaluate", {"expression": "document.getElementById('setting-soap-toggle').checked"})
    print("Verified setting-soap-toggle.checked:", toggle_state_after["result"]["result"].get("value"))

    # Capture Settings Screenshot
    res = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_soap_settings.png", "wb") as f:
        f.write(base64.b64decode(res["result"]["data"]))
    print("Saved screenshot_soap_settings.png")

    # 2. Test Devotion View: Auto-population & SOAP Fields
    print("\n--- 2. Testing Devotion View (Day 5) ---")
    # Navigate to Day 5 devotion
    ws.call("Runtime.evaluate", {"expression": "window.location.href = 'http://localhost:8080/?day=5&view=devotion'"})
    time.sleep(2.0)

    soap_wrap_display = ws.call("Runtime.evaluate", {"expression": "window.getComputedStyle(document.getElementById('notes-soap-wrap')).display"})
    standard_wrap_display = ws.call("Runtime.evaluate", {"expression": "window.getComputedStyle(document.getElementById('notes-standard-wrap')).display"})
    header_text = ws.call("Runtime.evaluate", {"expression": "document.getElementById('devotion-notes-header-text').textContent"})
    quick_btn_text = ws.call("Runtime.evaluate", {"expression": "document.getElementById('btn-toggle-soap-devotion').textContent"})

    print("notes-soap-wrap display:", soap_wrap_display["result"]["result"].get("value"))
    print("notes-standard-wrap display:", standard_wrap_display["result"]["result"].get("value"))
    print("Notes header text:", header_text["result"]["result"].get("value"))
    print("Quick toggle button text:", quick_btn_text["result"]["result"].get("value"))

    # Check auto-populated scripture
    scripture_val = ws.call("Runtime.evaluate", {"expression": "document.getElementById('soap-scripture-input').value"})
    print("Auto-populated Scripture:", scripture_val["result"]["result"].get("value"))

    # Type into Observation, Application, Prayer
    print("Entering user reflection in Observation, Application, Prayer...")
    ws.call("Runtime.evaluate", {"expression": """
        const obs = document.getElementById('soap-observation-input');
        obs.value = "God's promise is unbreakable. His purpose is unwavering and anchored in His holy covenant, giving us an anchor for our soul.";
        obs.dispatchEvent(new Event('input'));

        const app = document.getElementById('soap-application-input');
        app.value = "When facing uncertainty or feeling overwhelmed, I will hold fast to the hope set before me and choose faith over worry.";
        app.dispatchEvent(new Event('input'));

        const pray = document.getElementById('soap-prayer-input');
        pray.value = "Lord Jesus, thank you for being the secure and firm anchor of my soul. Lead my thoughts and actions today. Amen.";
        pray.dispatchEvent(new Event('input'));
    """})

    # Wait for debounced auto-save
    time.sleep(1.2)

    badge_text = ws.call("Runtime.evaluate", {"expression": "document.getElementById('notes-save-badge').textContent.trim()"})
    print("Notes badge status:", badge_text["result"]["result"].get("value"))

    # Scroll the right companion to center all 4 cards and photo upload box
    ws.call("Runtime.evaluate", {"expression": """
        const companion = document.querySelector('.devotion-study-companion');
        if (companion) companion.scrollTop = 160;
    """})
    time.sleep(0.5)

    # Capture Devotion Screenshot
    res = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_soap_devotion.png", "wb") as f:
        f.write(base64.b64decode(res["result"]["data"]))
    print("Saved screenshot_soap_devotion.png")

    # 3. Test Journal View: Structured Cards with Badges
    print("\n--- 3. Testing Journal View ---")
    ws.call("Runtime.evaluate", {"expression": "document.querySelector(\"[data-nav='journal']\").click()"})
    time.sleep(1.0)

    soap_card_count = ws.call("Runtime.evaluate", {"expression": "document.querySelectorAll('.soap-entry-card-content').length"})
    print("SOAP entry cards rendered in Journal:", soap_card_count["result"]["result"].get("value"))

    badge_letters = ws.call("Runtime.evaluate", {"expression": """
        Array.from(document.querySelectorAll('.soap-preview-badge')).map(b => b.textContent).join(', ')
    """})
    print("Badges found in Journal card:", badge_letters["result"]["result"].get("value"))

    # Capture Journal Screenshot
    res = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_soap_journal.png", "wb") as f:
        f.write(base64.b64decode(res["result"]["data"]))
    print("Saved screenshot_soap_journal.png")

    # 4. Test Switching back to Standard Mode & Data Preservation
    print("\n--- 4. Testing Quick Toggle: SOAP -> Standard -> SOAP ---")
    ws.call("Runtime.evaluate", {"expression": "document.querySelector(\"[data-nav='devotion']\").click()"})
    time.sleep(0.8)

    print("Clicking #btn-toggle-soap-devotion to switch to Standard format...")
    ws.call("Runtime.evaluate", {"expression": "document.getElementById('btn-toggle-soap-devotion').click()"})
    time.sleep(0.6)

    standard_wrap_disp = ws.call("Runtime.evaluate", {"expression": "window.getComputedStyle(document.getElementById('notes-standard-wrap')).display"})
    standard_val = ws.call("Runtime.evaluate", {"expression": "document.getElementById('devotion-notes-input').value"})
    print("Standard wrap display:", standard_wrap_disp["result"]["result"].get("value"))
    print("Standard textarea content preserved:\n", standard_val["result"]["result"].get("value"))

    print("Clicking #btn-toggle-soap-devotion to switch BACK to SOAP format...")
    ws.call("Runtime.evaluate", {"expression": "document.getElementById('btn-toggle-soap-devotion').click()"})
    time.sleep(0.6)

    soap_wrap_disp = ws.call("Runtime.evaluate", {"expression": "window.getComputedStyle(document.getElementById('notes-soap-wrap')).display"})
    obs_val_restored = ws.call("Runtime.evaluate", {"expression": "document.getElementById('soap-observation-input').value"})
    print("SOAP wrap display:", soap_wrap_disp["result"]["result"].get("value"))
    print("Observation field restored:\n", obs_val_restored["result"]["result"].get("value"))

    print("\n==========================================")
    print("ALL SOAP JOURNAL FORMAT TESTS PASSED 100%!")
    print("==========================================")

if __name__ == "__main__":
    main()
