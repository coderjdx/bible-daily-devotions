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

    # 2. Check initial view and passages count
    info = evaluate(ws, """
    (() => {
        return {
            activeView: window.state ? window.state.activeView : null,
            passageCount: document.querySelectorAll('.passage-card').length
        };
    })()
    """, 2)
    print(f"Initial load state: {info}")

    # 3. Test Testcase A: Navigate to devotion view via nav click
    print("\n--- Testcase A: Navigate from Home to Devotion via nav click ---")
    res = evaluate(ws, """
    (async () => {
        // Ensure starting on home
        window.switchView('home');
        await new Promise(r => setTimeout(r, 200));

        // Click devotion nav item
        const navDevotion = document.querySelector('.nav-item[data-nav="devotion"]');
        navDevotion.click();

        // Wait for rendering
        await new Promise(r => setTimeout(r, 800));

        const cards = Array.from(document.querySelectorAll('.passage-card'));
        const headers = cards.map(c => c.querySelector('.passage-reference') ? c.querySelector('.passage-reference').innerText.trim() : '');
        const verseCount = document.querySelectorAll('.verse-item').length;
        
        return {
            cardCount: cards.length,
            headers: headers,
            verseCount: verseCount
        };
    })()
    """, 3)
    print("Testcase A result:", json.dumps(res, indent=2))
    assert res['cardCount'] == 4, f"Expected 4 passage cards, got {res['cardCount']}"
    assert len(set(res['headers'])) == 4, f"Expected 4 unique headers, got {res['headers']}"
    print("Testcase A PASSED: Exactly 4 unique passages rendered, no duplicates.")

    # 4. Test Testcase B: Rapid clicking on Devotion nav item
    print("\n--- Testcase B: Rapid clicking on Devotion nav item (5x in 100ms) ---")
    res_rapid = evaluate(ws, """
    (async () => {
        const navDevotion = document.querySelector('.nav-item[data-nav="devotion"]');
        for (let i = 0; i < 5; i++) {
            navDevotion.click();
            await new Promise(r => setTimeout(r, 20));
        }
        await new Promise(r => setTimeout(r, 1000));

        const cards = Array.from(document.querySelectorAll('.passage-card'));
        const headers = cards.map(c => c.querySelector('.passage-reference') ? c.querySelector('.passage-reference').innerText.trim() : '');
        return {
            cardCount: cards.length,
            headers: headers,
            verseCount: document.querySelectorAll('.verse-item').length
        };
    })()
    """, 4)
    print("Testcase B result:", json.dumps(res_rapid, indent=2))
    assert res_rapid['cardCount'] == 4, f"Expected 4 passage cards, got {res_rapid['cardCount']}"
    assert len(set(res_rapid['headers'])) == 4, f"Expected 4 unique headers, got {res_rapid['headers']}"
    print("Testcase B PASSED: Rapid navigation does not produce duplicate cards.")

    # 5. Test Testcase C: Close out of devotion screen (switch to other views) and return
    print("\n--- Testcase C: Close out of devotion and return multiple times ---")
    views_to_test = ['home', 'journal', 'calendar', 'settings']
    for v in views_to_test:
        res_cycle = evaluate(ws, f"""
        (async () => {{
            window.switchView('{v}');
            await new Promise(r => setTimeout(r, 300));

            // Return to devotion
            const navDevotion = document.querySelector('.nav-item[data-nav="devotion"]');
            navDevotion.click();
            await new Promise(r => setTimeout(r, 600));

            const cards = Array.from(document.querySelectorAll('.passage-card'));
            const headers = cards.map(c => c.querySelector('.passage-reference') ? c.querySelector('.passage-reference').innerText.trim() : '');
            return {{
                fromView: '{v}',
                cardCount: cards.length,
                headers: headers
            }};
        }})()
        """, 5)
        print(f"Cycle from '{v}' back to 'devotion': cardCount={res_cycle['cardCount']}, headers={res_cycle['headers']}")
        assert res_cycle['cardCount'] == 4, f"Failed on cycle from {v}: expected 4 cards, got {res_cycle['cardCount']}"
        assert len(set(res_cycle['headers'])) == 4, f"Duplicate headers found on cycle from {v}"
    print("Testcase C PASSED: Returning from other screens never duplicates passages.")

    # 6. Test Testcase D: Prev/Next Day navigation
    print("\n--- Testcase D: Prev and Next day navigation ---")
    res_days = evaluate(ws, """
    (async () => {
        const btnNext = document.getElementById('btn-next-day');
        const btnPrev = document.getElementById('btn-prev-day');
        
        btnNext.click();
        await new Promise(r => setTimeout(r, 600));
        const day4Cards = document.querySelectorAll('.passage-card').length;

        btnPrev.click();
        await new Promise(r => setTimeout(r, 600));
        const day3Cards = document.querySelectorAll('.passage-card').length;

        return { day4Cards, day3Cards };
    })()
    """, 6)
    print("Testcase D result:", json.dumps(res_days, indent=2))
    assert res_days['day4Cards'] == 4, f"Day 4 expected 4 cards, got {res_days['day4Cards']}"
    assert res_days['day3Cards'] == 4, f"Day 3 expected 4 cards, got {res_days['day3Cards']}"
    print("Testcase D PASSED: Day navigation does not duplicate passages.")

    # 7. Test Testcase E: Check that individual verse items are unique in the DOM
    print("\n--- Testcase E: Verse element uniqueness check ---")
    res_verses = evaluate(ws, """
    (() => {
        const verseEls = Array.from(document.querySelectorAll('.verse-item'));
        const ids = verseEls.map(v => v.dataset.verseId || v.id);
        const uniqueIds = new Set(ids);
        return {
            totalVerses: verseEls.length,
            uniqueVerseCount: uniqueIds.size,
            allUnique: verseEls.length === uniqueIds.size
        };
    })()
    """, 7)
    print("Testcase E result:", json.dumps(res_verses, indent=2))
    assert res_verses['allUnique'], f"Found duplicate verse IDs: {res_verses}"
    print("Testcase E PASSED: All verse elements are unique.")

    ws.close()
    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    run_tests()
