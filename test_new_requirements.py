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
    
    ws.call("Emulation.setDeviceMetricsOverride", {
        "width": 1280,
        "height": 800,
        "deviceScaleFactor": 2,
        "mobile": False
    })
    
    # -------------------------------------------------------------
    # PART 1: Test S.O.A.P. Autosave Guard (Requirement 1)
    # -------------------------------------------------------------
    print("\n========================================================")
    print("PART 1: Testing S.O.A.P. Auto-save Guard (Scripture-only)")
    print("========================================================")
    
    # Clear any previous Day 7 note
    ws.call("Runtime.evaluate", {"expression": """
        localStorage.setItem('setting_soap_format', 'true');
        localStorage.removeItem('note_2026-11-07');
    """})
    
    print("Navigating to Day 7 devotion with SOAP enabled...")
    ws.call("Page.navigate", {"url": "http://localhost:8080/?day=7&view=devotion"})
    time.sleep(2.0)
    
    # Check that SCRIPTURE is auto-filled
    res1 = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const scripture = document.getElementById('soap-scripture-input').value;
            const obs = document.getElementById('soap-observation-input').value;
            const app = document.getElementById('soap-application-input').value;
            const prayer = document.getElementById('soap-prayer-input').value;
            const badge = document.getElementById('notes-save-badge').textContent.trim();

            return JSON.stringify({
                scripture: scripture,
                obs: obs,
                app: app,
                prayer: prayer,
                badge: badge
            });
        })()
    """})
    data1 = json.loads(res1["result"]["result"]["value"])
    print("Initial Day 7 field values:")
    print(f"  Scripture (auto-filled): {data1['scripture']}")
    print(f"  Observation: '{data1['obs']}'")
    print(f"  Application: '{data1['app']}'")
    print(f"  Prayer: '{data1['prayer']}'")
    print(f"  Save Badge: '{data1['badge']}'")
    
    assert len(data1['scripture']) > 0, "Scripture should be auto-populated"
    assert data1['obs'] == "", "Observation should be blank"
    assert data1['badge'] == "", "Badge should NOT show Saved when only Scripture is filled"
    
    # Trigger an input event on scripture (simulating user touching/editing scripture)
    print("Triggering input on Scripture only...")
    ws.call("Runtime.evaluate", {"expression": """
        const s = document.getElementById('soap-scripture-input');
        s.value = s.value + " (Focus: v1-3)";
        s.dispatchEvent(new Event('input'));
    """})
    time.sleep(1.5)
    
    # Check note in DB
    db_check = ws.call("Runtime.evaluate", {
        "expression": "window.devotionStore.getNote('2026-11-07')",
        "awaitPromise": True
    })
    saved_note = db_check["result"]["result"].get("value")
    badge_after = ws.call("Runtime.evaluate", {"expression": "document.getElementById('notes-save-badge').textContent.trim()"})
    print(f"Note saved in IndexedDB after Scripture edit: {repr(saved_note)}")
    print(f"Save Badge text: '{badge_after['result']['result'].get('value')}'")
    
    assert saved_note is None or saved_note == "", "Note MUST NOT be saved when only Scripture is populated!"
    assert badge_after['result']['result'].get('value') == "", "Badge must be empty"
    
    # Check Journal entries list does NOT contain Day 7
    print("Checking Journal view: Day 7 must NOT appear in journal entries list...")
    ws.call("Runtime.evaluate", {"expression": "document.querySelector(\"[data-nav='journal']\").click()"})
    time.sleep(1.0)
    
    has_day7 = ws.call("Runtime.evaluate", {"expression": """
        Array.from(document.querySelectorAll('.entry-date-badge')).some(b => b.textContent.includes('Day 7'))
    """})
    print(f"Day 7 in Journal list: {has_day7['result']['result']['value']}")
    assert has_day7['result']['result']['value'] == False, "Day 7 must NOT appear in Journal entries"

    # Now type user reflection into Observation
    print("\nNow typing reflection into Observation...")
    ws.call("Runtime.evaluate", {"expression": "document.querySelector(\"[data-nav='devotion']\").click()"})
    time.sleep(0.8)
    
    ws.call("Runtime.evaluate", {"expression": """
        const obs = document.getElementById('soap-observation-input');
        obs.value = "God provides guidance through every valley.";
        obs.dispatchEvent(new Event('input'));
    """})
    time.sleep(1.5)
    
    db_check2 = ws.call("Runtime.evaluate", {
        "expression": "window.devotionStore.getNote('2026-11-07')",
        "awaitPromise": True
    })
    saved_note2 = db_check2["result"]["result"].get("value")
    badge_after2 = ws.call("Runtime.evaluate", {"expression": "document.getElementById('notes-save-badge').textContent.trim()"})
    print(f"Note saved after Observation typed: {saved_note2[:80]}...")
    print(f"Save Badge after Observation typed: '{badge_after2['result']['result'].get('value')}'")
    assert saved_note2 is not None and "valley" in saved_note2, "Note MUST be saved now"
    assert "Saved" in badge_after2['result']['result'].get('value')

    # Verify Day 7 now appears in Journal
    ws.call("Runtime.evaluate", {"expression": "document.querySelector(\"[data-nav='journal']\").click()"})
    time.sleep(1.0)
    has_day7_now = ws.call("Runtime.evaluate", {"expression": """
        Array.from(document.querySelectorAll('.entry-date-badge')).some(b => b.textContent.includes('Day 7'))
    """})
    print(f"Day 7 in Journal list now: {has_day7_now['result']['result']['value']}")
    assert has_day7_now['result']['result']['value'] == True, "Day 7 should now appear in Journal"

    # Clean up Day 7 note for fresh state
    ws.call("Runtime.evaluate", {
        "expression": "window.devotionStore.deleteNote('2026-11-07')",
        "awaitPromise": True
    })

    print(">>> S.O.A.P. Auto-save Guard: PASSED 100% <<<")

    # -------------------------------------------------------------
    # PART 2: Test Future Devotion Preview & Disabled Completion (Requirement 2)
    # -------------------------------------------------------------
    print("\n========================================================")
    print("PART 2: Testing Future Dates (Previewable but not completable)")
    print("========================================================")
    
    # Today is Day 5 (Nov 5, 2026)
    today_day = 5
    future_day = 8
    print(f"Today is Day {today_day}, testing future Day {future_day}")
    
    # 1. Check Today (Day 5) - Mark complete is ENABLED
    print(f"1. Checking Today (Day {today_day})...")
    ws.call("Runtime.evaluate", {"expression": f"window.location.href = 'http://localhost:8080/?day={today_day}&view=devotion'"})
    time.sleep(1.5)
    
    today_btn_check = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const btn = document.getElementById('btn-mark-complete');
            return JSON.stringify({
                disabled: btn.disabled,
                text: btn.textContent.trim(),
                isFutureClass: btn.classList.contains('disabled-future')
            });
        })()
    """})
    today_data = json.loads(today_btn_check["result"]["result"]["value"])
    print("Today button state:", json.dumps(today_data, indent=2))
    assert today_data["disabled"] == False, "Today button should be enabled"
    assert "Mark Day as Complete" in today_data["text"]

    # 2. Check Future Day (Day 8) - Mark complete is DISABLED with preview banner
    print(f"\n2. Checking Future Day (Day {future_day})...")
    ws.call("Runtime.evaluate", {"expression": f"window.location.href = 'http://localhost:8080/?day={future_day}&view=devotion'"})
    time.sleep(1.5)

    future_btn_check = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const btn = document.getElementById('btn-mark-complete');
            const subtitle = document.getElementById('devotion-day-subtitle').textContent;
            return JSON.stringify({
                disabled: btn.disabled,
                text: btn.textContent.trim(),
                hasDisabledClass: btn.classList.contains('disabled-future'),
                subtitle: subtitle
            }, null, 2);
        })()
    """})
    future_data = json.loads(future_btn_check["result"]["result"]["value"])
    print("Future Day button state:")
    print(json.dumps(future_data, indent=2))
    
    assert future_data["disabled"] == True, "Future button must be disabled"
    assert "Preview Only" in future_data["text"], "Future button text must say Preview Only"
    assert future_data["hasDisabledClass"] == True, "Button must have disabled-future class"
    assert "Preview Mode" in future_data["subtitle"], "Subtitle should show Preview Mode"

    # Attempt to click future complete button
    print("Attempting to click disabled future complete button...")
    ws.call("Runtime.evaluate", {"expression": "document.getElementById('btn-mark-complete').click()"})
    time.sleep(0.5)

    comp_check = ws.call("Runtime.evaluate", {
        "expression": f"window.devotionStore.getCompletion(getDayDateStr({future_day}))",
        "awaitPromise": True
    })
    comp_val = comp_check["result"]["result"].get("value")
    print(f"Future day completion state in DB: {comp_val}")
    assert comp_val is None or comp_val.get("completed") != True, "Future day MUST NOT be marked as complete!"

    # Screenshot Future Devotion
    res_img1 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_future_devotion_preview.png", "wb") as f:
        f.write(base64.b64decode(res_img1["result"]["data"]))
    print("Saved screenshot_future_devotion_preview.png")

    # 3. Check Calendar: Future cells are clickable for preview
    print("\n3. Checking Calendar: Clicking future date cell...")
    ws.call("Runtime.evaluate", {"expression": "document.querySelector(\"[data-nav='calendar']\").click()"})
    time.sleep(1.0)

    # Click on future day in calendar
    print(f"Clicking calendar cell for Day {future_day}...")
    ws.call("Runtime.evaluate", {"expression": f"""
        const cells = Array.from(document.querySelectorAll('.cal-day-cell'));
        const cell = cells.find(c => c.querySelector('.day-num')?.textContent.trim() === '{future_day}');
        if (cell) cell.click();
    """})
    time.sleep(1.0)

    # Check that app navigated to devotion view for future day
    view_check = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const subtitle = document.getElementById('devotion-day-subtitle').textContent;
            return JSON.stringify({
                devotionActive: document.getElementById('view-devotion').classList.contains('active'),
                subtitle: subtitle
            });
        })()
    """})
    view_data = json.loads(view_check["result"]["result"]["value"])
    print("Navigation after calendar future click:", json.dumps(view_data, indent=2))
    assert view_data["devotionActive"] == True, "Must navigate to devotion view"
    assert f"Day {future_day}" in view_data["subtitle"], f"Subtitle must indicate Day {future_day}"

    # Screenshot Calendar with clickable future preview styles
    ws.call("Runtime.evaluate", {"expression": "document.querySelector(\"[data-nav='calendar']\").click()"})
    time.sleep(0.8)
    res_img2 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_calendar_preview_clickable.png", "wb") as f:
        f.write(base64.b64decode(res_img2["result"]["data"]))
    print("Saved screenshot_calendar_preview_clickable.png")

    print("\n========================================================")
    print("ALL TESTS COMPLETED SUCCESSFULLY WITH 100% PASS RATE!")
    print("========================================================")

if __name__ == "__main__":
    main()
