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
    print("Connecting to Chrome CDP:", ws_url)
    ws = SimpleWebSocket(ws_url)
    
    ws.call("Page.enable")
    ws.call("Runtime.enable")
    
    # -------------------------------------------------------------
    # TEST 1: Initial load when SOAP is ALREADY ENABLED
    # -------------------------------------------------------------
    print("\n--- TEST 1: Initial load when user ALREADY HAS SOAP ENABLED ---")
    
    # Pre-configure SOAP setting in localStorage
    ws.call("Runtime.evaluate", {"expression": "localStorage.setItem('setting_soap_format', 'true')"})
    
    # Set desktop viewport 1280x800
    ws.call("Emulation.setDeviceMetricsOverride", {
        "width": 1280,
        "height": 800,
        "deviceScaleFactor": 2,
        "mobile": False
    })
    
    print("Navigating to devotion view...")
    ws.call("Page.navigate", {"url": "http://localhost:8080/?day=5&view=devotion"})
    time.sleep(2.0)
    
    state_check = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const btn = document.getElementById('btn-mark-complete');
            const compSection = document.getElementById('devotion-complete-section');
            const prayerCard = document.querySelector('.soap-card-p');
            const prayerInput = document.getElementById('soap-prayer-input');
            const studyCol = document.querySelector('.devotion-study-col');

            const bRect = btn.getBoundingClientRect();
            const pRect = prayerCard.getBoundingClientRect();
            const ptRect = prayerInput.getBoundingClientRect();

            const isOverlapCard = !(bRect.top >= pRect.bottom || bRect.bottom <= pRect.top);
            const isOverlapTextarea = !(bRect.top >= ptRect.bottom || bRect.bottom <= ptRect.top);

            return JSON.stringify({
                soapFormatEnabled: document.getElementById('notes-soap-wrap').style.display !== 'none',
                compSectionHasSoapActive: compSection.classList.contains('soap-active'),
                compSectionComputedPosition: window.getComputedStyle(compSection).position,
                studyColComputedMaxHeight: window.getComputedStyle(studyCol).maxHeight,
                studyColComputedOverflowY: window.getComputedStyle(studyCol).overflowY,
                btnTop: bRect.top,
                prayerBottom: pRect.bottom,
                gapBetweenPrayerAndBtn: bRect.top - pRect.bottom,
                isOverlapCard: isOverlapCard,
                isOverlapTextarea: isOverlapTextarea
            }, null, 2);
        })()
    """})
    
    test1_data = json.loads(state_check["result"]["result"]["value"])
    print("Initial Load (Desktop) Results:")
    print(json.dumps(test1_data, indent=2))
    
    assert test1_data["soapFormatEnabled"] == True, "SOAP should be enabled"
    assert test1_data["compSectionHasSoapActive"] == True, "compSection should have soap-active class"
    assert test1_data["compSectionComputedPosition"] == "static", "compSection should be static positioning"
    assert test1_data["isOverlapCard"] == False, "Button must NOT overlap prayer card"
    assert test1_data["isOverlapTextarea"] == False, "Button must NOT overlap prayer textarea"
    assert test1_data["gapBetweenPrayerAndBtn"] > 0, "Button must be positioned below prayer"

    # Screenshot Desktop (SOAP already enabled)
    res_img = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_soap_desktop_fixed.png", "wb") as f:
        f.write(base64.b64decode(res_img["result"]["data"]))
    print("Saved screenshot_soap_desktop_fixed.png")

    # -------------------------------------------------------------
    # TEST 2: Dynamic Toggle (Standard -> SOAP -> Standard)
    # -------------------------------------------------------------
    print("\n--- TEST 2: Dynamic Toggle (Standard -> SOAP -> Standard) ---")
    
    # Toggle to Standard
    print("Toggling to Standard mode...")
    ws.call("Runtime.evaluate", {"expression": "document.getElementById('btn-toggle-soap-devotion').click()"})
    time.sleep(0.6)
    
    std_check = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const compSection = document.getElementById('devotion-complete-section');
            return JSON.stringify({
                soapFormatEnabled: document.getElementById('notes-soap-wrap').style.display !== 'none',
                compSectionHasSoapActive: compSection.classList.contains('soap-active')
            });
        })()
    """})
    print("Standard mode state:", std_check["result"]["result"]["value"])
    assert json.loads(std_check["result"]["result"]["value"])["compSectionHasSoapActive"] == False
    
    # Toggle to SOAP
    print("Toggling back to SOAP mode...")
    ws.call("Runtime.evaluate", {"expression": "document.getElementById('btn-toggle-soap-devotion').click()"})
    time.sleep(0.6)
    
    soap_check = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const btn = document.getElementById('btn-mark-complete');
            const compSection = document.getElementById('devotion-complete-section');
            const prayerCard = document.querySelector('.soap-card-p');
            const prayerInput = document.getElementById('soap-prayer-input');

            const bRect = btn.getBoundingClientRect();
            const pRect = prayerCard.getBoundingClientRect();

            return JSON.stringify({
                soapFormatEnabled: document.getElementById('notes-soap-wrap').style.display !== 'none',
                compSectionHasSoapActive: compSection.classList.contains('soap-active'),
                compSectionPosition: window.getComputedStyle(compSection).position,
                overlap: !(bRect.top >= pRect.bottom || bRect.bottom <= pRect.top),
                gap: bRect.top - pRect.bottom
            });
        })()
    """})
    test2_data = json.loads(soap_check["result"]["result"]["value"])
    print("Dynamically Toggled SOAP Results:", json.dumps(test2_data, indent=2))
    assert test2_data["compSectionHasSoapActive"] == True
    assert test2_data["compSectionPosition"] == "static"
    assert test2_data["overlap"] == False
    assert test2_data["gap"] > 0

    # -------------------------------------------------------------
    # TEST 3: Mobile Viewport & Scrolling (390 x 844 iPhone)
    # -------------------------------------------------------------
    print("\n--- TEST 3: Mobile Viewport & Scrolling (390 x 844) ---")
    ws.call("Emulation.setDeviceMetricsOverride", {
        "width": 390,
        "height": 844,
        "deviceScaleFactor": 3,
        "mobile": True
    })
    time.sleep(0.5)

    # Scroll directly to prayer section
    ws.call("Runtime.evaluate", {"expression": """
        const prayer = document.querySelector('.soap-card-p');
        prayer.scrollIntoView({ block: 'start' });
    """})
    time.sleep(0.6)

    mobile_check = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const btn = document.getElementById('btn-mark-complete');
            const compSection = document.getElementById('devotion-complete-section');
            const prayerCard = document.querySelector('.soap-card-p');
            const prayerInput = document.getElementById('soap-prayer-input');

            const bRect = btn.getBoundingClientRect();
            const pRect = prayerCard.getBoundingClientRect();
            const ptRect = prayerInput.getBoundingClientRect();

            const isOverlap = !(bRect.top >= pRect.bottom || bRect.bottom <= pRect.top);

            return JSON.stringify({
                compSectionPosition: window.getComputedStyle(compSection).position,
                prayerCardTop: Math.round(pRect.top),
                prayerCardBottom: Math.round(pRect.bottom),
                btnTop: Math.round(bRect.top),
                btnBottom: Math.round(bRect.bottom),
                gapBelowPrayer: Math.round(bRect.top - pRect.bottom),
                isOverlap: isOverlap
            }, null, 2);
        })()
    """})
    
    test3_data = json.loads(mobile_check["result"]["result"]["value"])
    print("Mobile Results:")
    print(json.dumps(test3_data, indent=2))
    assert test3_data["compSectionPosition"] == "static"
    assert test3_data["isOverlap"] == False, "Mobile button must NOT overlap prayer"
    assert test3_data["gapBelowPrayer"] > 0, "Button must be below prayer on mobile"

    # Screenshot Mobile
    res_img2 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_soap_mobile_fixed.png", "wb") as f:
        f.write(base64.b64decode(res_img2["result"]["data"]))
    print("Saved screenshot_soap_mobile_fixed.png")

    print("\n========================================================")
    print("SUCCESS: Mark as Complete button adjustment tests passed 100%!")
    print("Button is strictly non-overlapping and static below Prayer!")
    print("========================================================")

if __name__ == "__main__":
    main()
