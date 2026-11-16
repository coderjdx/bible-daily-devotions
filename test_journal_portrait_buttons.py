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

    # 1. Reload page
    print("Reloading page with cache bypass...")
    cdp_call(ws, "Page.reload", {"ignoreCache": True}, 1)
    time.sleep(2.0)

    # =========================================================================
    # TEST 1: Mobile Portrait (393 x 852 - iPhone 14/15/16 Pro)
    # =========================================================================
    print("\n=== TEST 1: Mobile Portrait (393 x 852) ===")
    cdp_call(ws, "Emulation.setDeviceMetricsOverride", {
        "width": 393,
        "height": 852,
        "deviceScaleFactor": 3,
        "mobile": True
    }, 10)

    evaluate(ws, "window.switchView('journal')", 11)
    time.sleep(0.8)

    info_mobile = evaluate(ws, """
    (() => {
        const topBar = document.querySelector('.journal-top-bar');
        const select = document.querySelector('.month-selector-select');
        const toggle = document.querySelector('.journal-view-toggle');
        const tr = toggle.getBoundingClientRect();
        const btns = Array.from(document.querySelectorAll('.view-toggle-btn')).map(b => {
            const br = b.getBoundingClientRect();
            return {
                id: b.id,
                category: b.dataset.category,
                text: b.textContent.trim(),
                rect: { left: br.left, top: br.top, right: br.right, bottom: br.bottom, width: br.width, height: br.height },
                isActive: b.classList.contains('active')
            };
        });
        
        return {
            windowWidth: window.innerWidth,
            topBarDirection: window.getComputedStyle(topBar).flexDirection,
            selectWidth: select.getBoundingClientRect().width,
            toggleRect: { left: tr.left, top: tr.top, right: tr.right, bottom: tr.bottom, width: tr.width, height: tr.height },
            toggleOverflowX: window.getComputedStyle(toggle).overflowX,
            toggleScrollWidth: toggle.scrollWidth,
            toggleClientWidth: toggle.clientWidth,
            btns
        };
    })()
    """, 12)
    print("Mobile Portrait info:", json.dumps(info_mobile, indent=2))

    assert info_mobile["topBarDirection"] == "column", "Top bar must be stacked in column on mobile portrait"
    assert info_mobile["selectWidth"] >= 340, "Month selector should span full container width"
    assert info_mobile["toggleRect"]["width"] >= 340, "Category toggle bar should span full container width"
    assert info_mobile["toggleOverflowX"] == "auto", "Category toggle bar must have overflow-x: auto"
    assert len(info_mobile["btns"]) == 5, "Must have exactly 5 category buttons"
    
    # Verify the 5 buttons match requirement
    expected_categories = ['all', 'devotions', 'sunday', 'highlights', 'gallery']
    found_categories = [b['category'] for b in info_mobile['btns']]
    assert found_categories == expected_categories, f"Categories must be {expected_categories}, got {found_categories}"

    capture_screenshot(ws, "/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_portrait_fixed_all.png", 13)

    # Test clicking 'Highlights'
    print("\n--- Testing click on Highlights category tab ---")
    evaluate(ws, "document.getElementById('btn-journal-cat-highlights').click()", 14)
    time.sleep(0.5)

    hl_info = evaluate(ws, """
    (() => {
        const btn = document.getElementById('btn-journal-cat-highlights');
        const tab = document.getElementById('journal-highlights-tab');
        const toggle = document.querySelector('.journal-view-toggle');
        const btnRect = btn.getBoundingClientRect();
        const toggleRect = toggle.getBoundingClientRect();
        
        return {
            btnActive: btn.classList.contains('active'),
            tabDisplay: window.getComputedStyle(tab).display,
            isBtnInView: btnRect.left >= toggleRect.left - 5 && btnRect.right <= toggleRect.right + 5
        };
    })()
    """, 15)
    print("Highlights tab state:", json.dumps(hl_info, indent=2))
    assert hl_info["btnActive"] == True, "Highlights button must be active"
    assert hl_info["tabDisplay"] == "block", "Highlights tab content must be displayed"
    assert hl_info["isBtnInView"] == True, "Highlights button should be scrolled smoothly into view"

    capture_screenshot(ws, "/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_portrait_fixed_highlights.png", 16)

    # Test clicking 'Photos' (Gallery)
    print("\n--- Testing click on Photos category tab ---")
    evaluate(ws, "document.getElementById('btn-journal-cat-gallery').click()", 17)
    time.sleep(0.5)

    gallery_info = evaluate(ws, """
    (() => {
        const btn = document.getElementById('btn-journal-cat-gallery');
        const tab = document.getElementById('journal-gallery-tab');
        const toggle = document.querySelector('.journal-view-toggle');
        const btnRect = btn.getBoundingClientRect();
        const toggleRect = toggle.getBoundingClientRect();
        
        return {
            btnActive: btn.classList.contains('active'),
            tabDisplay: window.getComputedStyle(tab).display,
            isBtnInView: btnRect.left >= toggleRect.left - 5 && btnRect.right <= toggleRect.right + 5
        };
    })()
    """, 18)
    print("Photos tab state:", json.dumps(gallery_info, indent=2))
    assert gallery_info["btnActive"] == True, "Photos button must be active"
    assert gallery_info["tabDisplay"] == "block", "Gallery tab content must be displayed"
    assert gallery_info["isBtnInView"] == True, "Photos button should be scrolled smoothly into view"

    capture_screenshot(ws, "/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_portrait_fixed_photos.png", 19)

    # Return to 'All'
    evaluate(ws, "document.getElementById('btn-journal-cat-all').click()", 20)
    time.sleep(0.4)

    # =========================================================================
    # TEST 2: Small Phone Portrait (360 x 740 - Galaxy / Small Android)
    # =========================================================================
    print("\n=== TEST 2: Small Phone Portrait (360 x 740) ===")
    cdp_call(ws, "Emulation.setDeviceMetricsOverride", {
        "width": 360,
        "height": 740,
        "deviceScaleFactor": 2,
        "mobile": True
    }, 30)
    time.sleep(0.5)

    small_info = evaluate(ws, """
    (() => {
        const toggle = document.querySelector('.journal-view-toggle');
        return {
            windowWidth: window.innerWidth,
            toggleWidth: toggle.clientWidth,
            scrollWidth: toggle.scrollWidth,
            isScrollable: toggle.scrollWidth > toggle.clientWidth
        };
    })()
    """, 31)
    print("Small phone state:", json.dumps(small_info, indent=2))
    assert small_info["isScrollable"] == True, "Should be smoothly horizontally scrollable on small phone"

    # =========================================================================
    # TEST 3: Desktop Layout (1280 x 800)
    # =========================================================================
    print("\n=== TEST 3: Desktop Layout (1280 x 800) ===")
    cdp_call(ws, "Emulation.setDeviceMetricsOverride", {
        "width": 1280,
        "height": 800,
        "deviceScaleFactor": 2,
        "mobile": False
    }, 40)
    time.sleep(0.6)

    desktop_info = evaluate(ws, """
    (() => {
        const topBar = document.querySelector('.journal-top-bar');
        const select = document.querySelector('.month-selector-select');
        const toggle = document.querySelector('.journal-view-toggle');
        const btns = Array.from(document.querySelectorAll('.view-toggle-btn')).map(b => {
            const br = b.getBoundingClientRect();
            return {
                text: b.textContent.trim(),
                rect: { left: br.left, right: br.right, top: br.top, bottom: br.bottom, width: br.width, height: br.height }
            };
        });
        
        return {
            windowWidth: window.innerWidth,
            topBarDirection: window.getComputedStyle(topBar).flexDirection,
            allButtonsOnSingleRow: btns.every(b => b.rect.right <= window.innerWidth && b.rect.left >= 0),
            btns
        };
    })()
    """, 41)
    print("Desktop info:", json.dumps(desktop_info, indent=2))
    assert desktop_info["topBarDirection"] == "row", "Top bar should be row layout on desktop"
    assert desktop_info["allButtonsOnSingleRow"] == True, "All buttons must be in a single row without horizontal overflow on desktop"

    capture_screenshot(ws, "/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_desktop_categories.png", 42)

    ws.close()
    print("\n🎉 ALL JOURNAL PORTRAIT BUTTON TESTS PASSED 100% PERFECTLY!")

if __name__ == '__main__':
    run_tests()
