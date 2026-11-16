import json
import urllib.request
import websocket
import time

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

def run_tests():
    ws_url = get_ws_url()
    print(f"Connecting to {ws_url}...")
    ws = websocket.create_connection(ws_url, timeout=10)

    # 1. Reload page with bypass cache
    print("Reloading page with bypass cache...")
    cdp_call(ws, "Page.reload", {"ignoreCache": True}, 1)
    time.sleep(2.0)

    # 2. Test Mobile Portrait (393 x 852 - iPhone 14/15/16 Pro)
    print("\n--- Test 1: Spacing below final passage on Mobile Portrait (All Readings) ---")
    cdp_call(ws, "Emulation.setDeviceMetricsOverride", {
        "width": 393,
        "height": 852,
        "deviceScaleFactor": 3,
        "mobile": True
    }, 2)

    evaluate(ws, "window.switchView('devotion')", 3)
    time.sleep(1.0)

    info_mobile = evaluate(ws, """
    (() => {
        const mv = document.getElementById('main-viewport');
        const complete = document.getElementById('devotion-complete-section');
        const cards = Array.from(document.querySelectorAll('.passage-card')).filter(c => c.style.display !== 'none');
        const lastCard = cards[cards.length - 1];
        
        const lastCardBottom = lastCard.offsetTop + lastCard.offsetHeight;
        const completeTop = complete.offsetTop;
        const completeBottom = complete.offsetTop + complete.offsetHeight;
        const gap = completeTop - lastCardBottom;
        const bottomVoid = mv.scrollHeight - completeBottom;
        
        return {
            visibleCards: cards.length,
            lastCardBottom,
            completeTop,
            completeBottom,
            gap,
            bottomVoid,
            mvScrollHeight: mv.scrollHeight,
            mvClientHeight: mv.clientHeight
        };
    })()
    """, 4)
    print("Mobile Spacing info:", json.dumps(info_mobile, indent=2))
    assert info_mobile["gap"] <= 30, f"Gap between final passage and complete button is too large: {info_mobile['gap']}px"
    assert info_mobile["bottomVoid"] <= 100, f"Excessive trailing void below complete section: {info_mobile['bottomVoid']}px"
    print("Test 1 PASSED: Complete button is directly below final passage with natural 20-24px margin (no 800px void).")

    # 3. Test on each Individual Passage Tab
    print("\n--- Test 2: Spacing on each Individual Passage Tab ---")
    tabs_count = evaluate(ws, "document.querySelectorAll('.passage-tab').length", 5)
    for i in range(tabs_count):
        tab_info = evaluate(ws, f"""
        (() => {{
            const tabs = document.querySelectorAll('.passage-tab');
            tabs[{i}].click();
            const activeTab = document.querySelector('.passage-tab.active').textContent;
            const mv = document.getElementById('main-viewport');
            const complete = document.getElementById('devotion-complete-section');
            const visibleCards = Array.from(document.querySelectorAll('.passage-card')).filter(c => c.style.display !== 'none');
            const lastCard = visibleCards[visibleCards.length - 1];
            
            const lastCardBottom = lastCard.offsetTop + lastCard.offsetHeight;
            const completeTop = complete.offsetTop;
            const completeBottom = complete.offsetTop + complete.offsetHeight;
            const gap = completeTop - lastCardBottom;
            const bottomVoid = mv.scrollHeight - completeBottom;
            
            return {{
                tab: activeTab,
                gap,
                bottomVoid,
                completeTop,
                lastCardBottom
            }};
        }})()
        """, 6 + i)
        print(f"Tab '{tab_info['tab']}': gap={tab_info['gap']}px, bottomVoid={tab_info['bottomVoid']}px")
        assert tab_info["gap"] <= 30, f"Tab {tab_info['tab']} gap too large: {tab_info['gap']}"
        assert tab_info["bottomVoid"] <= 100, f"Tab {tab_info['tab']} void too large: {tab_info['bottomVoid']}"
    print("Test 2 PASSED: All tabs have compact spacing directly below the active passage.")

    # 4. Test "Devotion Completed!" Badge Panel State
    print("\n--- Test 3: Devotion Completed panel spacing ---")
    evaluate(ws, "document.querySelector('.passage-tab[data-target=\"all\"]').click()", 20)
    info_completed = evaluate(ws, """
    (() => {
        const btnMark = document.getElementById('btn-mark-complete');
        const badge = document.getElementById('completed-badge-card');
        btnMark.style.display = 'none';
        badge.style.display = 'block';
        
        const mv = document.getElementById('main-viewport');
        const complete = document.getElementById('devotion-complete-section');
        const cards = Array.from(document.querySelectorAll('.passage-card')).filter(c => c.style.display !== 'none');
        const lastCard = cards[cards.length - 1];
        
        const lastCardBottom = lastCard.offsetTop + lastCard.offsetHeight;
        const completeTop = complete.offsetTop;
        const completeBottom = complete.offsetTop + complete.offsetHeight;
        
        return {
            gap: completeTop - lastCardBottom,
            bottomVoid: mv.scrollHeight - completeBottom,
            badgeVisible: badge.offsetHeight > 0
        };
    })()
    """, 21)
    print("Completed panel state:", json.dumps(info_completed, indent=2))
    assert info_completed["gap"] <= 30, f"Completed panel gap too large: {info_completed['gap']}"
    assert info_completed["bottomVoid"] <= 100, f"Completed panel bottom void too large: {info_completed['bottomVoid']}"
    print("Test 3 PASSED: Completed badge card preserves clean compact spacing.")

    ws.close()
    print("\n🎉 ALL SPACING TESTS PASSED PERFECTLY!")

if __name__ == '__main__':
    run_tests()
