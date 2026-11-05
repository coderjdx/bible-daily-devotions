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

    def recv(self, expected_id=None, timeout=10.0):
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

    def call(self, method, params=None, timeout=10.0):
        mid = self.send(method, params)
        return self.recv(expected_id=mid, timeout=timeout)

    def eval_js(self, expression, await_promise=False):
        res = self.call("Runtime.evaluate", {
            "expression": expression,
            "awaitPromise": await_promise,
            "returnByValue": True
        })
        val = res.get("result", {}).get("result", {}).get("value")
        return val

def main():
    res = urllib.request.urlopen("http://127.0.0.1:9222/json")
    targets = json.loads(res.read())
    page = next(t for t in targets if t.get("type") == "page")
    ws_url = page["webSocketDebuggerUrl"]
    print("Connecting to Chrome CDP:", ws_url)
    ws = SimpleWebSocket(ws_url)
    
    ws.call("Page.enable")
    ws.call("Runtime.enable")
    
    # Listen to console / errors
    ws.eval_js("window.__errors = []; window.addEventListener('error', e => window.__errors.push(e.message));")
    
    # -------------------------------------------------------------
    # TEST 1: Mobile Portrait (iPhone 14 Pro: 393 x 852)
    # -------------------------------------------------------------
    print("\n=== TEST 1: Mobile Portrait Floating Notepad FAB & Sheet ===")
    ws.call("Emulation.setDeviceMetricsOverride", {
        "width": 393,
        "height": 852,
        "deviceScaleFactor": 3,
        "mobile": True
    })
    
    ws.call("Page.navigate", {"url": "http://localhost:8080/?day=3&view=devotion"})
    time.sleep(2.0)
    
    # Check for console errors
    errs = ws.eval_js("window.__errors")
    print("Console errors on load:", errs)
    
    # Check floating button visibility & position
    fab_data = json.loads(ws.eval_js("""
        (() => {
            const fab = document.getElementById('btn-floating-notepad');
            const sheet = document.getElementById('devotion-notes-section');
            const backdrop = document.getElementById('devotion-journal-backdrop');
            const styleFab = window.getComputedStyle(fab);
            const styleSheet = window.getComputedStyle(sheet);
            const fabRect = fab.getBoundingClientRect();
            
            return JSON.stringify({
                fabDisplay: styleFab.display,
                fabPosition: styleFab.position,
                fabBottom: fabRect.bottom,
                fabRight: fabRect.right,
                fabTop: fabRect.top,
                fabWidth: fabRect.width,
                fabHeight: fabRect.height,
                sheetHasOpenClass: sheet.classList.contains('sheet-open'),
                sheetVisibility: styleSheet.visibility,
                backdropDisplay: backdrop.style.display
            });
        })()
    """))
    print("FAB initial state:", json.dumps(fab_data, indent=2))
    assert fab_data["fabDisplay"] in ["inline-flex", "flex"], f"Expected fabDisplay inline-flex or flex, got {fab_data['fabDisplay']}"
    assert fab_data["sheetHasOpenClass"] == False, "Sheet should not be open initially"
    assert fab_data["sheetVisibility"] == "hidden", "Sheet should be hidden initially"
    
    # Screenshot 1: Devotion reading with floating button visible
    shot1 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_floating_notepad_fab.png", "wb") as f:
        f.write(base64.b64decode(shot1["result"]["data"]))
    print("Saved screenshot_floating_notepad_fab.png")
    
    # -------------------------------------------------------------
    # TEST 2: Tap Floating Button -> Opens Sheet
    # -------------------------------------------------------------
    print("\n=== TEST 2: Tap Floating Button -> Opens Sheet ===")
    ws.eval_js("document.getElementById('btn-floating-notepad').click()")
    time.sleep(0.5)
    
    sheet_open_data = json.loads(ws.eval_js("""
        (() => {
            const sheet = document.getElementById('devotion-notes-section');
            const backdrop = document.getElementById('devotion-journal-backdrop');
            const styleSheet = window.getComputedStyle(sheet);
            const sheetRect = sheet.getBoundingClientRect();
            const closeBtn = document.getElementById('btn-close-journal-sheet');
            const doneBtn = document.getElementById('btn-done-journal-sheet');
            
            return JSON.stringify({
                sheetHasOpenClass: sheet.classList.contains('sheet-open'),
                sheetVisibility: styleSheet.visibility,
                sheetOpacity: styleSheet.opacity,
                sheetBottom: sheetRect.bottom,
                sheetTop: sheetRect.top,
                sheetHeight: sheetRect.height,
                backdropDisplay: backdrop.style.display,
                closeBtnDisplay: window.getComputedStyle(closeBtn).display,
                doneBtnDisplay: window.getComputedStyle(doneBtn).display
            });
        })()
    """))
    print("Sheet open state:", json.dumps(sheet_open_data, indent=2))
    assert sheet_open_data["sheetHasOpenClass"] == True, "Sheet must have sheet-open class"
    assert sheet_open_data["sheetVisibility"] == "visible", "Sheet must be visible"
    assert sheet_open_data["backdropDisplay"] == "block", "Backdrop must be block"
    assert sheet_open_data["doneBtnDisplay"] != "none", "Done button must be displayed"
    
    # Screenshot 2: Open floating sheet
    shot2 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_floating_sheet_open.png", "wb") as f:
        f.write(base64.b64decode(shot2["result"]["data"]))
    print("Saved screenshot_floating_sheet_open.png")
    
    # -------------------------------------------------------------
    # TEST 3: Type Notes & Auto-Save, Tap Done -> Closes Sheet & Shows Badge
    # -------------------------------------------------------------
    print("\n=== TEST 3: Enter Notes & Tap Done -> Closes Sheet & Shows Green Dot Badge ===")
    ws.eval_js("""
        (() => {
            const notesInput = document.getElementById('devotion-notes-input');
            notesInput.value = 'Walking in love and light today. Jeremiah 15:16 was deeply comforting.';
            notesInput.dispatchEvent(new Event('input', { bubbles: true }));
        })()
    """)
    time.sleep(0.6) # Allow debounce auto-save
    
    # Tap Done
    ws.eval_js("document.getElementById('btn-done-journal-sheet').click()")
    time.sleep(0.5)
    
    done_data = json.loads(ws.eval_js("""
        (() => {
            const sheet = document.getElementById('devotion-notes-section');
            const backdrop = document.getElementById('devotion-journal-backdrop');
            const badge = document.getElementById('notepad-has-notes-badge');
            
            return JSON.stringify({
                sheetHasOpenClass: sheet.classList.contains('sheet-open'),
                backdropDisplay: backdrop.style.display,
                badgeDisplay: badge.style.display
            });
        })()
    """))
    print("After tapping Done:", json.dumps(done_data, indent=2))
    assert done_data["sheetHasOpenClass"] == False, "Sheet must close when Done is tapped"
    assert done_data["badgeDisplay"] == "inline-block", "Badge dot must appear when notes exist"
    
    # Screenshot 3: Devotion view with green dot badge on floating button
    shot3 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_floating_notepad_badge_active.png", "wb") as f:
        f.write(base64.b64decode(shot3["result"]["data"]))
    print("Saved screenshot_floating_notepad_badge_active.png")
    
    # -------------------------------------------------------------
    # TEST 4: Re-open Sheet & Verify Data Persistence in Store
    # -------------------------------------------------------------
    print("\n=== TEST 4: Re-open Sheet & Verify Data Persistence ===")
    ws.eval_js("document.getElementById('btn-floating-notepad').click()")
    time.sleep(0.4)
    
    recheck_data = json.loads(ws.eval_js("""
        (async () => {
            const noteInStore = await window.devotionStore.getNote('2026-11-03');
            const inputVal = document.getElementById('devotion-notes-input').value;
            return JSON.stringify({
                noteInStore: noteInStore,
                inputVal: inputVal
            });
        })()
    """, await_promise=True))
    print("Persisted data check:", json.dumps(recheck_data, indent=2))
    assert "Jeremiah 15:16" in recheck_data["inputVal"], "Input value must persist"
    assert "Jeremiah 15:16" in recheck_data["noteInStore"], "Store value must persist"
    
    # Close via Close button (✕)
    ws.eval_js("document.getElementById('btn-close-journal-sheet').click()")
    time.sleep(0.3)
    
    # -------------------------------------------------------------
    # TEST 5: Desktop Screen (1280 x 800)
    # -------------------------------------------------------------
    print("\n=== TEST 5: Desktop Screen Layout ===")
    ws.call("Emulation.setDeviceMetricsOverride", {
        "width": 1280,
        "height": 800,
        "deviceScaleFactor": 2,
        "mobile": False
    })
    time.sleep(0.5)
    
    desktop_data = json.loads(ws.eval_js("""
        (() => {
            const fab = document.getElementById('btn-floating-notepad');
            const sheet = document.getElementById('devotion-notes-section');
            const handle = document.getElementById('journal-sheet-handle');
            const closeBtn = document.getElementById('btn-close-journal-sheet');
            
            return JSON.stringify({
                fabDisplay: window.getComputedStyle(fab).display,
                sheetPosition: window.getComputedStyle(sheet).position,
                sheetDisplay: window.getComputedStyle(sheet).display,
                handleDisplay: window.getComputedStyle(handle).display,
                closeBtnDisplay: window.getComputedStyle(closeBtn).display
            });
        })()
    """))
    print("Desktop state:", json.dumps(desktop_data, indent=2))
    assert desktop_data["fabDisplay"] == "none", "FAB must be hidden on desktop"
    assert desktop_data["sheetPosition"] == "static", "Notes section must be static on desktop"
    assert desktop_data["handleDisplay"] == "none", "Sheet drag handle must be hidden on desktop"
    assert desktop_data["closeBtnDisplay"] == "none", "Close button must be hidden on desktop"
    
    # Clean up test note so we leave clean DB state
    ws.eval_js("""
        (async () => {
            await window.devotionStore.deleteNote('2026-11-03');
            document.getElementById('devotion-notes-input').value = '';
        })()
    """, await_promise=True)
    
    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    main()
