import json
import urllib.request
import websocket
import time
import base64

def get_ws_url():
    resp = urllib.request.urlopen("http://127.0.0.1:9222/json")
    targets = json.loads(resp.read().decode())
    for t in targets:
        if t.get("type") == "page" and "localhost:8080" in t.get("url", ""):
            return t["webSocketDebuggerUrl"]
    return targets[0]["webSocketDebuggerUrl"]

def cdp_call(ws, method, params=None, msg_id=1):
    req = {"id": msg_id, "method": method, "params": params or {}}
    ws.send(json.dumps(req))
    while True:
        resp = json.loads(ws.recv())
        if resp.get("id") == msg_id:
            return resp

def evaluate(ws, expr, msg_id=100):
    res = cdp_call(ws, "Runtime.evaluate", {
        "expression": expr,
        "awaitPromise": True,
        "returnByValue": True
    }, msg_id)
    return res.get("result", {}).get("result", {}).get("value")

def capture_screenshot(ws, path, msg_id=200):
    shot = cdp_call(ws, "Page.captureScreenshot", {"format": "png"}, msg_id)
    data = base64.b64decode(shot["result"]["data"])
    with open(path, "wb") as f:
        f.write(data)
    print(f"Saved screenshot: {path}")

def run_tests():
    ws_url = get_ws_url()
    print(f"Connecting to {ws_url}...")
    ws = websocket.create_connection(ws_url, timeout=10)

    # Reload page
    print("Reloading page with cache bypass...")
    cdp_call(ws, "Page.reload", {"ignoreCache": True}, 1)
    time.sleep(2.0)

    # Reset any previous test notes on 2026-11-03
    evaluate(ws, """
    (async () => {
        await window.devotionStore.deleteNote('2026-11-03');
    })()
    """, 2)

    # =========================================================================
    # TEST 1: Mobile Portrait (393 x 852) - Open at top of reading
    # =========================================================================
    print("\n=== TEST 1: Mobile Portrait - Open Floating Journal at top of reading ===")
    cdp_call(ws, "Emulation.setDeviceMetricsOverride", {
        "width": 393,
        "height": 852,
        "deviceScaleFactor": 3,
        "mobile": True
    }, 10)

    evaluate(ws, "window.switchView('devotion')", 11)
    time.sleep(1.0)

    # Tap floating notepad button at scroll 0
    evaluate(ws, "document.getElementById('btn-floating-notepad').click()", 12)
    time.sleep(0.5)

    modal_info = evaluate(ws, """
    (() => {
        const modal = document.getElementById('modal-devotion-journal');
        const sheet = document.getElementById('devotion-notes-section');
        const mv = document.getElementById('main-viewport');
        const rect = sheet.getBoundingClientRect();
        const modalRect = modal.getBoundingClientRect();
        
        return {
            modalActive: modal.classList.contains('active'),
            modalDisplay: window.getComputedStyle(modal).display,
            modalPos: window.getComputedStyle(modal).position,
            modalRect: { top: modalRect.top, left: modalRect.left, width: modalRect.width, height: modalRect.height },
            sheetRect: { top: rect.top, bottom: rect.bottom, height: rect.height, width: rect.width },
            windowHeight: window.innerHeight,
            scrollTop: mv.scrollTop,
            isInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight + 10 && rect.height > 100
        };
    })()
    """, 13)
    print("Modal at scroll 0:", json.dumps(modal_info, indent=2))
    assert modal_info["modalActive"] == True, "Modal must be active"
    assert modal_info["modalDisplay"] == "flex", "Modal display must be flex"
    assert modal_info["modalPos"] == "fixed", "Modal position must be fixed"
    assert modal_info["isInViewport"] == True, f"Floating journal sheet must be in viewport: {modal_info['sheetRect']}"

    capture_screenshot(ws, "/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_floating_journal_modal_top.png", 14)

    # Close via Close button (✕)
    evaluate(ws, "document.getElementById('btn-close-journal-sheet').click()", 15)
    time.sleep(0.4)
    is_closed = evaluate(ws, "!document.getElementById('modal-devotion-journal').classList.contains('active')", 16)
    assert is_closed == True, "Modal must close on ✕ click"

    # =========================================================================
    # TEST 2: Mobile Portrait - Open Floating Journal while scrolled deep in scriptures
    # =========================================================================
    print("\n=== TEST 2: Mobile Portrait - Open while scrolled to 1200px in scripture reading ===")
    evaluate(ws, "document.getElementById('main-viewport').scrollTop = 1200", 20)
    time.sleep(0.6)
    scroll_pos_before = evaluate(ws, "document.getElementById('main-viewport').scrollTop", 21)
    print(f"Scrolled to: {scroll_pos_before}px")
    assert scroll_pos_before >= 1000, "Should be scrolled deep into reading"

    # Tap floating notepad button
    evaluate(ws, "document.getElementById('btn-floating-notepad').click()", 22)
    time.sleep(0.5)

    deep_info = evaluate(ws, """
    (() => {
        const modal = document.getElementById('modal-devotion-journal');
        const sheet = document.getElementById('devotion-notes-section');
        const mv = document.getElementById('main-viewport');
        const rect = sheet.getBoundingClientRect();
        
        return {
            modalActive: modal.classList.contains('active'),
            sheetRect: { top: rect.top, bottom: rect.bottom, height: rect.height, width: rect.width },
            windowHeight: window.innerHeight,
            scrollTop: mv.scrollTop,
            isInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight + 10 && rect.height > 100
        };
    })()
    """, 23)
    print("Modal while scrolled at 2500px:", json.dumps(deep_info, indent=2))
    assert deep_info["modalActive"] == True, "Modal must be active"
    assert deep_info["isInViewport"] == True, "Sheet must float directly in current viewport, NOT at bottom of page"

    # Type note and add tag inside the floating modal
    evaluate(ws, """
    (() => {
        const noteInput = document.getElementById('devotion-notes-input');
        noteInput.value = 'Floating journal test: God is my refuge and strength.';
        noteInput.dispatchEvent(new Event('input'));
    })()
    """, 24)
    time.sleep(0.5)

    capture_screenshot(ws, "/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_floating_journal_modal_scrolled.png", 25)

    # Click Done button
    evaluate(ws, "document.getElementById('btn-done-journal-sheet').click()", 26)
    time.sleep(0.5)

    after_done = evaluate(ws, """
    (() => {
        const modal = document.getElementById('modal-devotion-journal');
        const mv = document.getElementById('main-viewport');
        const badge = document.getElementById('notepad-has-notes-badge');
        
        return {
            modalActive: modal.classList.contains('active'),
            scrollTop: mv.scrollTop,
            badgeDisplay: window.getComputedStyle(badge).display
        };
    })()
    """, 27)
    print("After Done button:", json.dumps(after_done, indent=2))
    assert after_done["modalActive"] == False, "Modal must be closed"
    assert abs(after_done["scrollTop"] - scroll_pos_before) < 50, f"Scroll position must be preserved! Was {scroll_pos_before}, now {after_done['scrollTop']}"
    assert after_done["badgeDisplay"] in ["block", "inline-block"], f"Badge dot on FAB must be visible after saving notes: {after_done['badgeDisplay']}"

    # =========================================================================
    # TEST 3: Navigation Bar "Journal" button opens floating modal on devotion view
    # =========================================================================
    print("\n=== TEST 3: Nav bar 'Journal' button opens floating modal on devotion view ===")
    evaluate(ws, "document.querySelector('.nav-item[data-nav=\"journal\"]').click()", 30)
    time.sleep(0.5)

    nav_opened = evaluate(ws, """
    (() => {
        const modal = document.getElementById('modal-devotion-journal');
        const isDevotionActive = document.getElementById('view-devotion').classList.contains('active');
        return {
            modalActive: modal.classList.contains('active'),
            isDevotionActive: isDevotionActive
        };
    })()
    """, 31)
    print("Nav bar click result:", json.dumps(nav_opened, indent=2))
    assert nav_opened["modalActive"] == True, "Tapping Journal nav button on devotion screen must open floating modal"
    assert nav_opened["isDevotionActive"] == True, "Active view should remain devotion"

    # Close by clicking the modal backdrop
    evaluate(ws, "document.getElementById('modal-devotion-journal').click()", 32)
    time.sleep(0.4)
    backdrop_closed = evaluate(ws, "!document.getElementById('modal-devotion-journal').classList.contains('active')", 33)
    assert backdrop_closed == True, "Modal must close on backdrop click"

    # =========================================================================
    # TEST 4: Desktop layout (1280 x 800) - Centered floating modal & Companion card
    # =========================================================================
    print("\n=== TEST 4: Desktop layout (1280 x 800) ===")
    cdp_call(ws, "Emulation.setDeviceMetricsOverride", {
        "width": 1280,
        "height": 800,
        "deviceScaleFactor": 2,
        "mobile": False
    }, 40)
    time.sleep(0.8)

    desktop_checks = evaluate(ws, """
    (() => {
        const fab = document.getElementById('btn-floating-notepad');
        const companionCard = document.getElementById('devotion-companion-card');
        const btnOpenCompanion = document.getElementById('btn-open-journal-companion');
        
        return {
            fabDisplay: window.getComputedStyle(fab).display,
            companionDisplay: window.getComputedStyle(companionCard).display,
            hasOpenBtn: !!btnOpenCompanion
        };
    })()
    """, 41)
    print("Desktop initial checks:", json.dumps(desktop_checks, indent=2))
    assert desktop_checks["companionDisplay"] == "block", "Companion card must be visible on desktop study column"
    assert desktop_checks["fabDisplay"] in ["flex", "inline-flex"], f"Floating notepad FAB should be visible on desktop devotion view: {desktop_checks['fabDisplay']}"

    # Click the Companion card button to open modal
    evaluate(ws, "document.getElementById('btn-open-journal-companion').click()", 42)
    time.sleep(0.5)

    desktop_modal = evaluate(ws, """
    (() => {
        const modal = document.getElementById('modal-devotion-journal');
        const sheet = document.getElementById('devotion-notes-section');
        const rect = sheet.getBoundingClientRect();
        
        return {
            modalActive: modal.classList.contains('active'),
            sheetRect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
            isHorizontallyCentered: Math.abs((window.innerWidth - rect.width) / 2 - rect.left) < 50,
            isVerticallyCentered: rect.top >= 20 && rect.bottom <= window.innerHeight - 20
        };
    })()
    """, 43)
    print("Desktop modal position:", json.dumps(desktop_modal, indent=2))
    assert desktop_modal["modalActive"] == True, "Desktop modal must be active"
    assert desktop_modal["isHorizontallyCentered"] == True, f"Modal must be horizontally centered: left={desktop_modal['sheetRect']['left']}"
    assert desktop_modal["isVerticallyCentered"] == True, f"Modal must be vertically centered in viewport: top={desktop_modal['sheetRect']['top']}"

    capture_screenshot(ws, "/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_floating_journal_modal_desktop.png", 44)

    # Close via Escape key
    cdp_call(ws, "Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape"}, 45)
    time.sleep(0.4)
    esc_closed = evaluate(ws, "!document.getElementById('modal-devotion-journal').classList.contains('active')", 46)
    assert esc_closed == True, "Modal must close on Escape key"

    # Clean up test note
    evaluate(ws, """
    (async () => {
        await window.devotionStore.deleteNote('2026-11-03');
    })()
    """, 47)

    ws.close()
    print("\n🎉 ALL FLOATING JOURNAL MODAL TESTS PASSED 100% PERFECTLY!")

if __name__ == '__main__':
    run_tests()
