import json
import urllib.request
import base64
import time
import socket
import struct
import os
import subprocess

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

def get_val(cdp_res):
    return cdp_res.get("result", {}).get("result", {}).get("value")

def main():
    chrome_cmd = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "--headless=new",
        "--remote-debugging-port=9224",
        "--disable-gpu",
        "--user-data-dir=/tmp/chrome_dev_user_dir_lock",
        "http://localhost:8080"
    ]
    print("Launching headless Chrome for Confirmation & Lock test...")
    chrome_proc = subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Wait for port 9224
    for _ in range(20):
        try:
            res = urllib.request.urlopen("http://127.0.0.1:9224/json", timeout=1.0)
            break
        except Exception:
            time.sleep(0.3)
    else:
        chrome_proc.terminate()
        raise Exception("Could not connect to Chrome on port 9224")

    try:
        run_tests()
    finally:
        chrome_proc.terminate()
        chrome_proc.wait()

def run_tests():
    res = urllib.request.urlopen("http://127.0.0.1:9224/json")
    targets = json.loads(res.read())
    page = next(t for t in targets if t.get("type") == "page")
    ws_url = page["webSocketDebuggerUrl"]
    print("Connecting to Chrome CDP:", ws_url)
    ws = SimpleWebSocket(ws_url)
    
    ws.call("Page.enable")
    ws.call("Runtime.enable")
    
    ws.call("Emulation.setDeviceMetricsOverride", {
        "width": 1280,
        "height": 850,
        "deviceScaleFactor": 2,
        "mobile": False
    })
    
    print("\n========================================================")
    print("SETUP: Initialize Day 5 Devotion (Incomplete State)")
    print("========================================================")
    
    ws.call("Page.navigate", {"url": "http://localhost:8080/?day=5&view=devotion"})
    time.sleep(2.0)
    
    # Reset completion for Day 5 and enable SOAP
    init_res = ws.call("Runtime.evaluate", {
        "expression": """
        (async () => {
            await window.devotionStore.removeCompletion('2026-11-05');
            localStorage.setItem('setting_soap_format', 'true');
            // Write a note for Day 5
            const soapPayload = JSON.stringify({
                format: 'soap',
                scripture: 'Psalms 119:161-168',
                observation: 'Great peace have those who love Your law.',
                application: 'Spend time abiding in God\\'s peace.',
                prayer: 'Lord, grant us peace throughout this day.'
            });
            await window.devotionStore.saveNote('2026-11-05', soapPayload);
            return true;
        })()
        """,
        "awaitPromise": True,
        "returnByValue": True
    })
    
    # Reload page to Day 5
    ws.call("Page.navigate", {"url": "http://localhost:8080/?day=5&view=devotion"})
    time.sleep(1.5)
    
    # -------------------------------------------------------------
    # TEST 1: Initial Incomplete & Unlocked State
    # -------------------------------------------------------------
    print("\n--- TEST 1: Verify Initial Incomplete & Unlocked State ---")
    st1 = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const btnComplete = document.getElementById('btn-mark-complete');
            const compCard = document.getElementById('completed-badge-card');
            const notesSec = document.getElementById('devotion-notes-section');
            const lockBadge = document.getElementById('journal-lock-badge');
            const lockNotice = document.getElementById('journal-locked-notice');
            const obsInp = document.getElementById('soap-observation-input');
            const uploadTrig = document.querySelector('.image-upload-trigger');
            
            return JSON.stringify({
                isBtnCompleteVisible: btnComplete.style.display !== 'none',
                isCompCardVisible: compCard.style.display !== 'none',
                isSectionLocked: notesSec.classList.contains('journal-locked'),
                isLockBadgeVisible: lockBadge.style.display !== 'none',
                isLockNoticeVisible: lockNotice.style.display !== 'none',
                obsReadOnly: obsInp ? obsInp.readOnly : null,
                obsDisabled: obsInp ? obsInp.disabled : null,
                isUploadVisible: uploadTrig ? uploadTrig.style.display !== 'none' : false
            });
        })()
    """, "returnByValue": True})
    
    st1_data = json.loads(get_val(st1))
    print("Initial State:", st1_data)
    assert st1_data["isBtnCompleteVisible"], "Mark Complete button should be visible"
    assert not st1_data["isCompCardVisible"], "Completed card should be hidden"
    assert not st1_data["isSectionLocked"], "Journal section should not be locked"
    assert not st1_data["isLockBadgeVisible"], "Lock badge should be hidden"
    assert not st1_data["obsReadOnly"], "Observation input should not be readOnly"
    assert not st1_data["obsDisabled"], "Observation input should not be disabled"
    assert st1_data["isUploadVisible"], "Upload trigger should be visible"
    print("✅ TEST 1 PASSED: Devotion is incomplete and journal inputs are fully editable.")
    
    # -------------------------------------------------------------
    # TEST 2: Confirmation Dialog on Mark Complete
    # -------------------------------------------------------------
    print("\n--- TEST 2: Confirmation Dialog on Mark as Complete ---")
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-mark-complete').click();
    """})
    time.sleep(0.5)
    
    dlg1 = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const modal = document.getElementById('modal-confirm');
            const isActive = modal.classList.contains('active');
            const title = document.getElementById('confirm-modal-title')?.textContent.trim();
            const desc = document.getElementById('confirm-modal-desc')?.textContent.trim();
            const proceedBtn = document.getElementById('btn-confirm-proceed')?.textContent.trim();
            return JSON.stringify({ isActive, title, desc, proceedBtn });
        })()
    """, "returnByValue": True})
    
    dlg1_data = json.loads(get_val(dlg1))
    print("Completion Confirmation Dialog:", dlg1_data)
    assert dlg1_data["isActive"], "Confirmation modal did not open upon clicking Mark Complete!"
    assert "Day 5" in dlg1_data["title"] and "Complete" in dlg1_data["title"], f"Wrong title: {dlg1_data['title']}"
    assert "locked" in dlg1_data["desc"].lower(), "Description should warn about journal locking"
    print("✅ TEST 2A PASSED: Confirmation dialog appears with title, warning, and action buttons.")
    
    # Capture screenshot of completion confirmation dialog
    shot1 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_completion_confirm_dialog.png", "wb") as f:
        f.write(base64.b64decode(shot1["result"]["data"]))
    print("Saved screenshot: screenshot_completion_confirm_dialog.png")
    
    # Test Cancel first
    ws.call("Runtime.evaluate", {"expression": "document.getElementById('btn-confirm-cancel').click();"})
    time.sleep(0.5)
    
    cancel_check = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const modal = document.getElementById('modal-confirm');
            const btnComplete = document.getElementById('btn-mark-complete');
            return JSON.stringify({
                modalActive: modal.classList.contains('active'),
                btnCompleteVisible: btnComplete.style.display !== 'none'
            });
        })()
    """, "returnByValue": True})
    canc_data = json.loads(get_val(cancel_check))
    assert not canc_data["modalActive"], "Modal should close on cancel"
    assert canc_data["btnCompleteVisible"], "Day should remain incomplete after cancel"
    print("✅ TEST 2B PASSED: Canceling confirmation aborts completion.")
    
    # -------------------------------------------------------------
    # TEST 3: Proceed with Completion & Verify Locked Journal Section
    # -------------------------------------------------------------
    print("\n--- TEST 3: Proceed with Completion & Verify Locked Journal ---")
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-mark-complete').click();
    """})
    time.sleep(0.4)
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-confirm-proceed').click();
    """})
    time.sleep(0.9)
    
    locked_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const btnComplete = document.getElementById('btn-mark-complete');
            const compCard = document.getElementById('completed-badge-card');
            const notesSec = document.getElementById('devotion-notes-section');
            const lockBadge = document.getElementById('journal-lock-badge');
            const lockNotice = document.getElementById('journal-locked-notice');
            const obsInp = document.getElementById('soap-observation-input');
            const appInp = document.getElementById('soap-application-input');
            const prayerInp = document.getElementById('soap-prayer-input');
            const scripInp = document.getElementById('soap-scripture-input');
            const uploadTrig = document.querySelector('.image-upload-trigger');
            const toggleSoap = document.getElementById('btn-toggle-soap-devotion');
            const toast = document.getElementById('toast-message')?.textContent.trim();
            
            return JSON.stringify({
                btnCompleteHidden: btnComplete.style.display === 'none',
                compCardVisible: compCard.style.display !== 'none',
                isSectionLocked: notesSec.classList.contains('journal-locked'),
                lockBadgeVisible: lockBadge.style.display !== 'none',
                lockNoticeVisible: lockNotice.style.display !== 'none',
                obsReadOnly: obsInp.readOnly,
                obsDisabled: obsInp.disabled,
                appDisabled: appInp.disabled,
                prayerDisabled: prayerInp.disabled,
                scripDisabled: scripInp.disabled,
                uploadHidden: uploadTrig ? uploadTrig.style.display === 'none' : true,
                toggleSoapDisabled: toggleSoap ? toggleSoap.disabled : false,
                toast
            });
        })()
    """, "returnByValue": True})
    
    locked_data = json.loads(get_val(locked_res))
    print("Locked State Verification:", locked_data)
    assert locked_data["btnCompleteHidden"], "Mark Complete button should be hidden"
    assert locked_data["compCardVisible"], "Completed badge card should be visible"
    assert locked_data["isSectionLocked"], "Journal section missing .journal-locked class"
    assert locked_data["lockBadgeVisible"], "Lock badge 🔒 should be visible in header"
    assert locked_data["lockNoticeVisible"], "Lock notice banner should be displayed"
    assert locked_data["obsReadOnly"] and locked_data["obsDisabled"], "Observation input must be locked"
    assert locked_data["appDisabled"] and locked_data["prayerDisabled"], "Application & Prayer must be locked"
    assert locked_data["scripDisabled"], "Scripture box must be locked"
    assert locked_data["uploadHidden"], "Upload photo trigger must be hidden"
    assert locked_data["toggleSoapDisabled"], "SOAP format toggle must be disabled"
    print("✅ TEST 3 PASSED: Day is marked completed and the entire journal section is securely locked!")
    
    # Capture screenshot of locked journal section
    shot2 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_section_locked.png", "wb") as f:
        f.write(base64.b64decode(shot2["result"]["data"]))
    print("Saved screenshot: screenshot_journal_section_locked.png")
    
    # -------------------------------------------------------------
    # TEST 4: Confirmation Dialog on Unmarking Day as Complete
    # -------------------------------------------------------------
    print("\n--- TEST 4: Confirmation Dialog on Unmark Devotion ---")
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-unmark-complete').click();
    """})
    time.sleep(0.5)
    
    dlg2 = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const modal = document.getElementById('modal-confirm');
            const isActive = modal.classList.contains('active');
            const title = document.getElementById('confirm-modal-title')?.textContent.trim();
            const desc = document.getElementById('confirm-modal-desc')?.textContent.trim();
            const proceedBtn = document.getElementById('btn-confirm-proceed')?.textContent.trim();
            return JSON.stringify({ isActive, title, desc, proceedBtn });
        })()
    """, "returnByValue": True})
    
    dlg2_data = json.loads(get_val(dlg2))
    print("Unmark Confirmation Dialog:", dlg2_data)
    assert dlg2_data["isActive"], "Confirmation modal did not open upon clicking Mark as Incomplete!"
    assert "Incomplete" in dlg2_data["title"] or "Unmark" in dlg2_data["title"]
    assert "unlock" in dlg2_data["desc"].lower(), "Description should mention unlocking journal"
    print("✅ TEST 4A PASSED: Confirmation dialog appears before unmarking day.")
    
    # Capture screenshot of uncomplete confirmation dialog
    shot3 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_uncomplete_confirm_dialog.png", "wb") as f:
        f.write(base64.b64decode(shot3["result"]["data"]))
    print("Saved screenshot: screenshot_uncomplete_confirm_dialog.png")
    
    # Confirm unmark
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-confirm-proceed').click();
    """})
    time.sleep(0.8)
    
    unlocked_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const btnComplete = document.getElementById('btn-mark-complete');
            const compCard = document.getElementById('completed-badge-card');
            const notesSec = document.getElementById('devotion-notes-section');
            const lockBadge = document.getElementById('journal-lock-badge');
            const lockNotice = document.getElementById('journal-locked-notice');
            const obsInp = document.getElementById('soap-observation-input');
            const uploadTrig = document.querySelector('.image-upload-trigger');
            const toast = document.getElementById('toast-message')?.textContent.trim();
            
            return JSON.stringify({
                btnCompleteVisible: btnComplete.style.display !== 'none',
                compCardHidden: compCard.style.display === 'none',
                isSectionLocked: notesSec.classList.contains('journal-locked'),
                lockBadgeHidden: lockBadge.style.display === 'none',
                lockNoticeHidden: lockNotice.style.display === 'none',
                obsDisabled: obsInp.disabled,
                obsReadOnly: obsInp.readOnly,
                uploadVisible: uploadTrig ? uploadTrig.style.display !== 'none' : false,
                toast
            });
        })()
    """, "returnByValue": True})
    
    unlocked_data = json.loads(get_val(unlocked_res))
    print("Unlocked State Verification:", unlocked_data)
    assert unlocked_data["btnCompleteVisible"], "Mark Complete button should be visible again"
    assert unlocked_data["compCardHidden"], "Completed card should be hidden"
    assert not unlocked_data["isSectionLocked"], ".journal-locked class should be removed"
    assert unlocked_data["lockBadgeHidden"], "Lock badge should be hidden"
    assert unlocked_data["lockNoticeHidden"], "Lock notice should be hidden"
    assert not unlocked_data["obsDisabled"] and not unlocked_data["obsReadOnly"], "Observation input must be editable"
    assert unlocked_data["uploadVisible"], "Upload button should be visible again"
    print("✅ TEST 4B PASSED: Unmarking devotion unlocks the journal section!")
    
    # Capture screenshot of unlocked devotion view
    shot4 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_section_unlocked.png", "wb") as f:
        f.write(base64.b64decode(shot4["result"]["data"]))
    print("Saved screenshot: screenshot_journal_section_unlocked.png")
    
    # -------------------------------------------------------------
    # TEST 5: Persistence of Locked State across page reloads
    # -------------------------------------------------------------
    print("\n--- TEST 5: Persistence of Locked State on Completed Days ---")
    # Complete Day 5 again
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-mark-complete').click();
    """})
    time.sleep(0.4)
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-confirm-proceed').click();
    """})
    time.sleep(0.8)
    
    # Navigate to Calendar view, then back to Day 5 Devotion
    ws.call("Page.navigate", {"url": "http://localhost:8080/?view=calendar"})
    time.sleep(1.2)
    ws.call("Page.navigate", {"url": "http://localhost:8080/?day=5&view=devotion"})
    time.sleep(1.5)
    
    persist_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const notesSec = document.getElementById('devotion-notes-section');
            const obsInp = document.getElementById('soap-observation-input');
            const lockBadge = document.getElementById('journal-lock-badge');
            return JSON.stringify({
                isLocked: notesSec.classList.contains('journal-locked'),
                isDisabled: obsInp.disabled,
                isBadgeVisible: lockBadge.style.display !== 'none'
            });
        })()
    """, "returnByValue": True})
    
    persist_data = json.loads(get_val(persist_res))
    print("Persistence check after navigating away and returning:", persist_data)
    assert persist_data["isLocked"], "Section must remain locked on completed day upon reload"
    assert persist_data["isDisabled"], "Input must remain disabled upon reload"
    assert persist_data["isBadgeVisible"], "Lock badge must remain visible upon reload"
    print("✅ TEST 5 PASSED: Completed days consistently render locked across sessions and navigations.")
    
    print("\n========================================================")
    print("🎉 ALL CONFIRMATION & LOCK REQUIREMENTS VERIFIED 100%!")
    print("========================================================")

if __name__ == "__main__":
    main()
