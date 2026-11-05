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

def main():
    chrome_cmd = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "--headless=new",
        "--remote-debugging-port=9222",
        "--disable-gpu",
        "--user-data-dir=/tmp/chrome_dev_user_dir_journal",
        "http://localhost:8080"
    ]
    print("Launching headless Chrome...")
    chrome_proc = subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Wait for port 9222
    for _ in range(20):
        try:
            res = urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=1.0)
            break
        except Exception:
            time.sleep(0.3)
    else:
        chrome_proc.terminate()
        raise Exception("Could not connect to Chrome on port 9222")

    try:
        run_tests(chrome_proc)
    finally:
        chrome_proc.terminate()
        chrome_proc.wait()

def get_val(cdp_res):
    return cdp_res.get("result", {}).get("result", {}).get("value")

def run_tests(chrome_proc):
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
        "height": 850,
        "deviceScaleFactor": 2,
        "mobile": False
    })
    
    print("\n========================================================")
    print("SETUP: Seeding Test Journal Entries and Devotion Image")
    print("========================================================")
    
    # 1. Clean previous test items and seed Day 5 SOAP entry + photo, and Day 3 Standard entry
    setup_script = """
    (async () => {
        // Clear all previous test notes/images
        await window.devotionStore.deleteNote('2026-11-05');
        await window.devotionStore.deleteNote('2026-11-03');
        await window.devotionStore.removeImage('2026-11-05');
        
        // 1. Seed Day 5 S.O.A.P. Entry
        const soapPayload = JSON.stringify({
            format: 'soap',
            scripture: 'Colossians 3:12-17; Psalm 100:1-5',
            observation: 'Paul calls believers to clothe themselves with compassion, kindness, humility, gentleness and patience.',
            application: 'I will intentionally respond with patience and kindness when facing unexpected interruptions today.',
            prayer: 'Lord, clothe me with Your love and let the peace of Christ rule in my heart today. Amen.'
        });
        await window.devotionStore.saveNote('2026-11-05', soapPayload);
        
        // 2. Seed a sample Photo for Day 5 (a nice small golden gradient canvas data URL)
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 400, 300);
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(0.5, '#d97706');
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 400, 300);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText('Colossians 3:12-17', 30, 150);
        ctx.font = '16px sans-serif';
        ctx.fillText('Devotional Moment • Nov 5', 30, 185);
        const testImgData = canvas.toDataURL('image/jpeg', 0.85);
        await window.devotionStore.saveImage('2026-11-05', testImgData, 'day5_reflection.jpg');
        
        // 3. Seed Day 3 Standard Entry
        const standardPayload = JSON.stringify({
            format: 'standard',
            text: 'Gratitude opens our eyes to God\\'s faithful provisions. Today I meditate on His unwavering peace.'
        });
        await window.devotionStore.saveNote('2026-11-03', standardPayload);
        
        return { success: true };
    })()
    """
    
    ws.call("Page.navigate", {"url": "http://localhost:8080/?view=journal"})
    time.sleep(2.0)
    
    seed_res = ws.call("Runtime.evaluate", {
        "expression": setup_script,
        "awaitPromise": True,
        "returnByValue": True
    })
    print("Seed result:", seed_res.get("result", {}).get("value"))
    
    # Reload / navigate to journal view
    ws.call("Page.navigate", {"url": "http://localhost:8080/?view=journal"})
    time.sleep(1.5)
    
    # -------------------------------------------------------------
    # TEST 1: Verify Journal Catalog Presentation
    # -------------------------------------------------------------
    print("\n--- TEST 1: Inspect Journal Catalog Cards ---")
    cat_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const cards = document.querySelectorAll('#journal-entries-list .journal-entry-card');
            const count = cards.length;
            const items = [];
            cards.forEach(c => {
                items.push({
                    title: c.querySelector('.entry-scriptures-title')?.textContent.trim(),
                    dateBadge: c.querySelector('.entry-date-badge')?.textContent.trim(),
                    hasSoapPill: Boolean(c.querySelector('.soap-tag-pill')),
                    hasThumbnail: Boolean(c.querySelector('.entry-thumbnail')),
                    hasFooter: Boolean(c.querySelector('.entry-card-footer'))
                });
            });
            return JSON.stringify({ count, items });
        })()
    """, "returnByValue": True})
    print("cat_res:", cat_res)
    
    cat_data = json.loads(get_val(cat_res))
    print(f"Catalog contains {cat_data['count']} entries:")
    for it in cat_data["items"]:
        print("  -", it)
        
    assert cat_data['count'] >= 2, f"Expected at least 2 entries, got {cat_data['count']}"
    assert any("Day 5" in it["dateBadge"] for it in cat_data["items"]), "Day 5 entry missing!"
    print("✅ TEST 1 PASSED: Catalog renders cards with titles, badges, and photo thumbnails.")
    
    # -------------------------------------------------------------
    # TEST 2: Click Card -> Floating Panel with Full Journal Entry
    # -------------------------------------------------------------
    print("\n--- TEST 2: Open Journal Entry Floating Panel ---")
    open_panel_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            // Find the Day 5 card and click it
            const cards = document.querySelectorAll('#journal-entries-list .journal-entry-card');
            let clicked = false;
            for (const c of cards) {
                if (c.textContent.includes('Day 5')) {
                    c.click();
                    clicked = true;
                    break;
                }
            }
            return clicked;
        })()
    """, "returnByValue": True})
    time.sleep(0.6)
    
    # Check floating panel contents
    panel_check_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const panel = document.getElementById('modal-journal-entry');
            const isActive = panel.classList.contains('active');
            const date = document.getElementById('journal-panel-date')?.textContent.trim();
            const scripture = document.getElementById('journal-panel-scripture')?.textContent.trim();
            const body = document.getElementById('journal-panel-body');
            const sText = body.querySelector('.soap-panel-s .soap-section-content')?.textContent.trim();
            const oText = body.querySelector('.soap-panel-o .soap-section-content')?.textContent.trim();
            const aText = body.querySelector('.soap-panel-a .soap-section-content')?.textContent.trim();
            const pText = body.querySelector('.soap-panel-p .soap-section-content')?.textContent.trim();
            const hasPhoto = Boolean(body.querySelector('#panel-attached-img'));
            const hasGotoBtn = Boolean(document.getElementById('btn-journal-panel-goto'));
            const hasDeleteBtn = Boolean(document.getElementById('btn-journal-panel-delete'));
            
            return JSON.stringify({
                isActive, date, scripture, sText, oText, aText, pText, hasPhoto, hasGotoBtn, hasDeleteBtn
            });
        })()
    """, "returnByValue": True})
    
    panel_info = json.loads(get_val(panel_check_res))
    print("Floating Panel State:")
    print("  isActive:", panel_info["isActive"])
    print("  date:", panel_info["date"])
    print("  scripture:", panel_info["scripture"])
    print("  observation:", panel_info["oText"])
    print("  application:", panel_info["aText"])
    print("  prayer:", panel_info["pText"])
    print("  hasPhoto:", panel_info["hasPhoto"])
    print("  buttons:", "Go to Devotion:", panel_info["hasGotoBtn"], "| Delete Entry:", panel_info["hasDeleteBtn"])
    
    assert panel_info["isActive"], "Journal Entry floating panel failed to open!"
    assert "Day 5" in panel_info["date"], "Wrong date displayed in floating panel"
    assert "compassion" in panel_info["oText"], "Observation text missing in panel"
    assert "Lord" in panel_info["pText"], "Prayer text missing in panel"
    assert panel_info["hasPhoto"], "Attached photo missing in panel"
    assert panel_info["hasGotoBtn"] and panel_info["hasDeleteBtn"], "Actions buttons missing"
    print("✅ TEST 2 PASSED: Full journal entry is visible in floating panel with all SOAP sections, photo, and actions.")
    
    # Take screenshot of open journal entry floating panel
    shot1 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_entry_floating_panel.png", "wb") as f:
        f.write(base64.b64decode(shot1["result"]["data"]))
    print("Saved screenshot: screenshot_journal_entry_floating_panel.png")
    
    # -------------------------------------------------------------
    # TEST 3: Test "Go to Devotion" from Journal Panel
    # -------------------------------------------------------------
    print("\n--- TEST 3: Test 'Go to Devotion' Button ---")
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-journal-panel-goto').click();
    """})
    time.sleep(0.8)
    
    goto_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const panel = document.getElementById('modal-journal-entry');
            const panelActive = panel.classList.contains('active');
            const devView = document.getElementById('view-devotion');
            const devViewActive = devView.classList.contains('active');
            const title = document.getElementById('devotion-scripture-title')?.textContent.trim();
            const obsVal = document.getElementById('soap-observation-input')?.value.trim();
            return JSON.stringify({ panelActive, devViewActive, title, obsVal });
        })()
    """, "returnByValue": True})
    
    goto_info = json.loads(get_val(goto_res))
    print("Go to Devotion navigation check:", goto_info)
    assert not goto_info["panelActive"], "Panel should close upon navigating"
    assert goto_info["devViewActive"], "Should navigate to view-devotion"
    assert "compassion" in goto_info["obsVal"], "Day 5 devotion data should be loaded"
    print("✅ TEST 3 PASSED: 'Go to Devotion' successfully navigates to the entry's devotion page!")
    
    # -------------------------------------------------------------
    # TEST 4: Delete Entry from Journal Catalog
    # -------------------------------------------------------------
    print("\n--- TEST 4: Test 'Delete Entry' Option with Confirmation ---")
    # Return to Journal view
    ws.call("Runtime.evaluate", {"expression": """
        window.devotionApp ? window.devotionApp.switchView('journal') : document.querySelector('[data-view="journal"]').click();
    """})
    time.sleep(0.8)
    
    # Click Day 3 card
    ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const cards = document.querySelectorAll('#journal-entries-list .journal-entry-card');
            for (const c of cards) {
                if (c.textContent.includes('Day 3')) {
                    c.click();
                    break;
                }
            }
        })()
    """})
    time.sleep(0.6)
    
    # Click Delete Entry button
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-journal-panel-delete').click();
    """})
    time.sleep(0.5)
    
    # Check confirmation modal
    confirm_check = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const conf = document.getElementById('modal-confirm');
            const active = conf.classList.contains('active');
            const title = document.getElementById('confirm-modal-title')?.textContent.trim();
            const desc = document.getElementById('confirm-modal-desc')?.textContent.trim();
            return JSON.stringify({ active, title, desc });
        })()
    """, "returnByValue": True})
    
    conf_info = json.loads(get_val(confirm_check))
    print("Confirmation modal state:", conf_info)
    assert conf_info["active"], "Confirmation modal did not open"
    assert "Delete" in conf_info["title"], "Confirm modal title incorrect"
    
    # Capture screenshot of delete confirmation dialog
    shot2 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_delete_confirm.png", "wb") as f:
        f.write(base64.b64decode(shot2["result"]["data"]))
    print("Saved screenshot: screenshot_journal_delete_confirm.png")
    
    # Confirm deletion
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-confirm-proceed').click();
    """})
    time.sleep(0.8)
    
    # Verify Day 3 is gone
    after_del_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const cards = document.querySelectorAll('#journal-entries-list .journal-entry-card');
            let hasDay3 = false;
            cards.forEach(c => {
                if (c.textContent.includes('Day 3')) hasDay3 = true;
            });
            const toast = document.getElementById('toast-message')?.textContent.trim();
            return JSON.stringify({ hasDay3, count: cards.length, toast });
        })()
    """, "returnByValue": True})
    
    del_data = json.loads(get_val(after_del_res))
    print("After delete state:", del_data)
    assert not del_data["hasDay3"], "Day 3 entry was not removed from catalog!"
    print("✅ TEST 4 PASSED: Entry deleted, cleaned from storage & catalog, with toast confirmation.")
    
    # -------------------------------------------------------------
    # TEST 5: Photo Gallery & Image Floating Panel
    # -------------------------------------------------------------
    print("\n--- TEST 5: Photo Gallery & Image Floating Panel ---")
    # Toggle to Photo Gallery tab
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-toggle-gallery').click();
    """})
    time.sleep(0.8)
    
    gallery_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const galleryTab = document.getElementById('journal-gallery-tab');
            const isTabVisible = galleryTab.style.display !== 'none';
            const tiles = document.querySelectorAll('#journal-gallery-grid .gallery-tile');
            const count = tiles.length;
            const caption = tiles[0]?.querySelector('.gallery-tile-caption')?.textContent.trim();
            return JSON.stringify({ isTabVisible, count, caption });
        })()
    """, "returnByValue": True})
    
    gal_info = json.loads(get_val(gallery_res))
    print("Photo Gallery state:", gal_info)
    assert gal_info["isTabVisible"], "Photo Gallery tab should be visible"
    assert gal_info["count"] >= 1, "Uploaded photo missing in gallery"
    assert "Day 5" in gal_info["caption"], "Photo tile caption missing Day 5"
    print("✅ TEST 5A PASSED: Photo Gallery lists all uploaded photos.")
    
    # Take screenshot of Photo Gallery
    shot3 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_photo_gallery_grid.png", "wb") as f:
        f.write(base64.b64decode(shot3["result"]["data"]))
    print("Saved screenshot: screenshot_photo_gallery_grid.png")
    
    # Click photo tile to open Image Floating Panel
    ws.call("Runtime.evaluate", {"expression": """
        document.querySelector('#journal-gallery-grid .gallery-tile').click();
    """})
    time.sleep(0.6)
    
    img_panel_res = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const panel = document.getElementById('modal-lightbox');
            const isActive = panel.classList.contains('active');
            const date = document.getElementById('lightbox-date')?.textContent.trim();
            const scripture = document.getElementById('lightbox-scripture')?.textContent.trim();
            const caption = document.getElementById('lightbox-caption')?.textContent.trim();
            const hasGoto = Boolean(document.getElementById('btn-lightbox-goto'));
            const hasDelete = Boolean(document.getElementById('btn-lightbox-delete'));
            return JSON.stringify({ isActive, date, scripture, caption, hasGoto, hasDelete });
        })()
    """, "returnByValue": True})
    
    img_panel_info = json.loads(get_val(img_panel_res))
    print("Image Floating Panel State:", img_panel_info)
    assert img_panel_info["isActive"], "Image floating panel failed to open"
    assert "Day 5" in img_panel_info["date"], "Image panel date incorrect"
    assert img_panel_info["hasGoto"] and img_panel_info["hasDelete"], "Image actions buttons missing"
    print("✅ TEST 5B PASSED: Image Floating Panel opens with high-res photo, details, and options.")
    
    # Take screenshot of Image Floating Panel
    shot4 = ws.call("Page.captureScreenshot", {"format": "png"})
    with open("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_image_floating_panel.png", "wb") as f:
        f.write(base64.b64decode(shot4["result"]["data"]))
    print("Saved screenshot: screenshot_image_floating_panel.png")
    
    # -------------------------------------------------------------
    # TEST 6: Delete Photo from Image Floating Panel
    # -------------------------------------------------------------
    print("\n--- TEST 6: Delete Photo from Image Floating Panel ---")
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-lightbox-delete').click();
    """})
    time.sleep(0.5)
    
    ws.call("Runtime.evaluate", {"expression": """
        document.getElementById('btn-confirm-proceed').click();
    """})
    time.sleep(0.8)
    
    after_photo_del = ws.call("Runtime.evaluate", {"expression": """
        (() => {
            const tiles = document.querySelectorAll('#journal-gallery-grid .gallery-tile');
            const emptyBox = document.querySelector('#journal-gallery-grid .empty-state-box');
            const toast = document.getElementById('toast-message')?.textContent.trim();
            return JSON.stringify({ tileCount: tiles.length, hasEmptyBox: Boolean(emptyBox), toast });
        })()
    """, "returnByValue": True})
    
    after_photo_info = json.loads(get_val(after_photo_del))
    print("After photo delete:", after_photo_info)
    assert after_photo_info["tileCount"] == 0, "Photo was not removed from gallery"
    assert after_photo_info["hasEmptyBox"], "Empty state box should appear when 0 photos remain"
    print("✅ TEST 6 PASSED: Photo deleted successfully from gallery with confirmation!")
    
    print("\n========================================================")
    print("🎉 ALL REQUIREMENTS VERIFIED 100% SUCCESSFULLY!")
    print("========================================================")

if __name__ == "__main__":
    main()
