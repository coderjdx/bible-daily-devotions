import json
import urllib.request
import websocket
import time
import base64
import os

ARTIFACT_DIR = "/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1"

def run_test():
    targets_url = "http://127.0.0.1:9222/json"
    req = urllib.request.urlopen(targets_url)
    targets = json.loads(req.read().decode('utf-8'))
    page_target = next((t for t in targets if t.get('type') == 'page'), targets[0])
    ws_url = page_target['webSocketDebuggerUrl']
    print(f"Connecting to CDP at {ws_url}...")

    ws = websocket.create_connection(ws_url, timeout=15)
    msg_id = 1

    def send(method, params=None):
        nonlocal msg_id
        payload = {"id": msg_id, "method": method, "params": params or {}}
        ws.send(json.dumps(payload))
        msg_id += 1
        while True:
            res = json.loads(ws.recv())
            if res.get('id') == payload['id']:
                return res

    def evaluate(expression):
        res = send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True
        })
        if 'error' in res:
            raise Exception(res['error'])
        result_obj = res.get('result', {})
        if 'exceptionDetails' in result_obj:
            raise Exception(result_obj['exceptionDetails'])
        return result_obj.get('result', {}).get('value')

    def capture_screenshot(filename):
        path = os.path.join(ARTIFACT_DIR, filename)
        res = send("Page.captureScreenshot", {"format": "png"})
        data = res['result']['data']
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        print(f"Screenshot saved to {path}")

    # Set viewport to mobile standard 390x844
    send("Emulation.setDeviceMetricsOverride", {
        "width": 390,
        "height": 844,
        "deviceScaleFactor": 2,
        "mobile": True
    })

    # Enable Page, Runtime, Network
    send("Page.enable")
    send("Runtime.enable")
    send("Network.enable")
    send("Network.setCacheDisabled", {"cacheDisabled": True})

    # Clear SW cache & reload
    evaluate("navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister())))")
    evaluate("caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))")
    send("Page.reload", {"ignoreCache": True})
    time.sleep(2)

    # Clean IDB store for test isolation
    evaluate("(async () => { if (window.devotionStore) await window.devotionStore.deleteAllData(); })()")
    time.sleep(0.5)

    print("Checking app boot and store initialization...")
    boot_status = evaluate("""
        (() => {
            return {
                hasStore: !!window.devotionStore,
                storeVersion: window.devotionStore ? window.devotionStore.dbVersion : null,
                hasBibleService: !!window.bibleService,
                hasHighlightStore: window.devotionStore && window.devotionStore.db ? window.devotionStore.db.objectStoreNames.contains('highlights') : false,
                theme: window.appState ? window.appState.theme : null
            };
        })()
    """)
    print("Boot status:", boot_status)
    assert boot_status['hasStore'], "devotionStore not loaded"
    assert boot_status['storeVersion'] == 4, f"storeVersion expected 4, got {boot_status['storeVersion']}"

    # Ensure dark theme to start
    evaluate("window.setTheme('dark')")

    # Step 1: Navigate to Devotion View Day 3
    print("\n--- Step 1: Devotion View & Verse Highlighting ---")
    evaluate("window.switchView('devotion')")
    time.sleep(1)

    verse_info = evaluate("""
        (() => {
            const verses = document.querySelectorAll('.verse-item');
            if (verses.length === 0) return null;
            const first = verses[0];
            return {
                count: verses.length,
                id: first.dataset.verseId,
                ref: first.dataset.verseRef,
                text: first.dataset.verseText
            };
        })()
    """)
    print("Verses found on Day 3:", verse_info)
    assert verse_info and verse_info['count'] > 0, "No verses found in devotion view"

    # Click on the first verse
    print(f"Clicking first verse: {verse_info['ref']} ({verse_info['id']})...")
    toolbar_status = evaluate(f"""
        (() => {{
            const v = document.getElementById('verse-{verse_info['id']}');
            if (!v) return null;
            v.click();
            const bar = document.getElementById('verse-action-bar');
            return {{
                barVisible: bar && bar.style.display !== 'none',
                refText: document.getElementById('verse-action-ref-text') ? document.getElementById('verse-action-ref-text').textContent : null
            }};
        }})()
    """)
    print("Verse action bar status:", toolbar_status)
    assert toolbar_status['barVisible'], "Verse action bar did not open on verse click"

    # Click Gold Color Dot
    print("Applying Gold highlight...")
    gold_status = evaluate("""
        (() => {
            const goldBtn = document.querySelector('.verse-color-btn.color-gold');
            if (!goldBtn) return null;
            goldBtn.click();
            const v = document.querySelector('.verse-item.verse-selected');
            return {
                isHighlighted: v.classList.contains('verse-highlighted'),
                hasGoldClass: v.classList.contains('highlight-gold')
            };
        })()
    """)
    print("Gold highlight status:", gold_status)
    assert gold_status['isHighlighted'] and gold_status['hasGoldClass'], "Gold highlight class not applied"

    # Toggle Emerald color (click verse to re-enter selection mode, then click Emerald)
    print("Switching to Emerald color...")
    green_status = evaluate("""
        (() => {
            const v = document.querySelector('.verse-item');
            v.click(); // enter selection mode
            const greenBtn = document.querySelector('.verse-color-btn.color-green');
            if (!greenBtn) return null;
            greenBtn.click(); // apply action and exit selection mode
            return {
                hasGreenClass: v.classList.contains('highlight-green'),
                hasGoldClass: v.classList.contains('highlight-gold')
            };
        })()
    """)
    print("Green highlight status:", green_status)
    assert green_status['hasGreenClass'] and not green_status['hasGoldClass'], "Emerald class not switched"

    # Confirm Bookmark button was removed
    print("Verifying bookmark button is removed...")
    bookmark_btn_check = evaluate("""
        (() => {
            const bmBtn = document.getElementById('btn-verse-bookmark');
            return { bmBtnPresent: !!bmBtn };
        })()
    """)
    print("Bookmark button check:", bookmark_btn_check)
    assert not bookmark_btn_check['bmBtnPresent'], "Bookmark button should have been removed"

    # Verify IndexedDB record for this verse
    idb_record = evaluate(f"""
        (async () => {{
            return await window.devotionStore.getHighlight('{verse_info['id']}');
        }})()
    """)
    print("IndexedDB Highlight Record:", idb_record)
    assert idb_record and idb_record['color'] == 'green', "IDB highlight record mismatch"

    # Capture screenshot of highlighted verse in devotion view (Dark)
    time.sleep(0.5)
    capture_screenshot("screenshot_devotion_verse_highlighted_dark.png")

    # Now highlight a second verse in Purple
    second_verse_info = evaluate("""
        (() => {
            const verses = document.querySelectorAll('.verse-item');
            if (verses.length < 2) return null;
            const second = verses[1];
            second.click();
            const purpleBtn = document.querySelector('.verse-color-btn.color-purple');
            if (purpleBtn) purpleBtn.click();
            return {
                id: second.dataset.verseId,
                ref: second.dataset.verseRef
            };
        })()
    """)
    print("Second verse highlighted in Purple:", second_verse_info)

    # Step 2: Switch to Journal View & Check Highlights Section
    print("\n--- Step 2: Journal Tab Highlights Section ---")
    evaluate("window.switchView('journal')")
    time.sleep(1)

    # Verify ✨ Highlights button exists and click it
    cat_click = evaluate("""
        (() => {
            const hlBtn = document.getElementById('btn-journal-cat-highlights');
            if (!hlBtn) return { success: false, reason: 'btn-journal-cat-highlights missing' };
            hlBtn.click();
            const tab = document.getElementById('journal-highlights-tab');
            return {
                success: true,
                btnActive: hlBtn.classList.contains('active'),
                tabVisible: tab && tab.style.display !== 'none'
            };
        })()
    """)
    print("Category click result:", cat_click)
    assert cat_click['success'] and cat_click['btnActive'] and cat_click['tabVisible'], "Highlights tab did not open"

    time.sleep(1)
    highlights_tab_data = evaluate("""
        (() => {
            const cards = document.querySelectorAll('.journal-highlight-card');
            const counts = {
                all: document.getElementById('count-hl-all') ? document.getElementById('count-hl-all').textContent : null,
                gold: document.getElementById('count-hl-gold') ? document.getElementById('count-hl-gold').textContent : null,
                green: document.getElementById('count-hl-green') ? document.getElementById('count-hl-green').textContent : null,
                blue: document.getElementById('count-hl-blue') ? document.getElementById('count-hl-blue').textContent : null,
                purple: document.getElementById('count-hl-purple') ? document.getElementById('count-hl-purple').textContent : null
            };
            const cardData = Array.from(cards).map(c => ({
                id: c.dataset.id,
                ref: c.querySelector('.highlight-reference') ? c.querySelector('.highlight-reference').textContent : ''
            }));
            return { cardCount: cards.length, counts, cardData };
        })()
    """)
    print("Highlights tab rendered data:", highlights_tab_data)
    assert highlights_tab_data['cardCount'] >= 2, f"Expected at least 2 highlight cards, found {highlights_tab_data['cardCount']}"
    assert highlights_tab_data['counts']['all'] == str(highlights_tab_data['cardCount']), "All count mismatch"
    assert highlights_tab_data['counts']['green'] == '1', "Green count expected 1"
    assert highlights_tab_data['counts']['purple'] == '1', "Purple count expected 1"

    capture_screenshot("screenshot_journal_highlights_dark.png")

    # Step 3: Test Filter Pills (Green only)
    print("\n--- Step 3: Testing Color Filter Pills ---")
    green_filter_res = evaluate("""
        (async () => {
            const greenPill = document.querySelector('[data-highlight-filter="green"]');
            if (!greenPill) return null;
            greenPill.click();
            await new Promise(r => setTimeout(r, 250));
            const visibleCards = document.querySelectorAll('.journal-highlight-card');
            return {
                pillActive: greenPill.classList.contains('active'),
                visibleCards: visibleCards.length
            };
        })()
    """)
    print("Green filter result:", green_filter_res)
    assert green_filter_res['visibleCards'] == 1, f"Expected 1 green highlight card, got {green_filter_res['visibleCards']}"

    # Verify bookmarks filter is removed
    bm_filter_present = evaluate("!!document.querySelector('[data-highlight-filter=\"bookmarks\"]')")
    assert not bm_filter_present, "Bookmarks filter should not be present"

    # Reset filter to 'all'
    evaluate("""
        (async () => {
            const allPill = document.querySelector('[data-highlight-filter="all"]');
            if (allPill) allPill.click();
            await new Promise(r => setTimeout(r, 250));
        })()
    """)

    # Step 4: Test 'Read in Context' Navigation
    print("\n--- Step 4: Testing 'Read in Context' ---")
    read_context_res = evaluate(f"""
        (async () => {{
            const card = document.querySelector('.journal-highlight-card[data-id="{second_verse_info['id']}"]');
            if (!card) return {{ success: false, reason: 'card not found' }};
            const btnRead = card.querySelector('.btn-read-context');
            if (!btnRead) return {{ success: false, reason: 'btn-read-context not found' }};
            btnRead.click();
            await new Promise(r => setTimeout(r, 1000));
            const targetEl = document.getElementById('verse-{second_verse_info['id']}');
            return {{
                success: true,
                activeView: window.appState.activeView,
                targetFound: !!targetEl,
                hasPulseFlash: targetEl ? targetEl.classList.contains('verse-pulse-flash') : false
            }};
        }})()
    """)
    print("'Read in Context' result:", read_context_res)
    assert read_context_res['activeView'] == 'devotion', "Did not switch to devotion view"
    assert read_context_res['targetFound'], "Target verse element not found in devotion view"

    # Step 5: Test Clean Light Theme Mode
    print("\n--- Step 5: Testing Clean Light Theme Mode ---")
    evaluate("window.setTheme('light')")
    time.sleep(0.5)

    # In Devotion view light mode:
    evaluate(f"""
        (() => {{
            const v = document.getElementById('verse-{verse_info['id']}');
            if (v) v.click();
        }})()
    """)
    time.sleep(0.5)
    capture_screenshot("screenshot_devotion_highlights_light.png")

    # In Journal view light mode:
    evaluate("window.switchView('journal')")
    time.sleep(0.5)
    evaluate("document.getElementById('btn-journal-cat-highlights').click()")
    time.sleep(0.5)
    capture_screenshot("screenshot_journal_highlights_light.png")

    # Step 6: Test Removing a Highlight
    print("\n--- Step 6: Testing Highlight Removal ---")
    remove_res = evaluate(f"""
        (async () => {{
            await window.devotionStore.deleteHighlight('{second_verse_info['id']}');
            await window.renderJournalHighlights('2026-11');
            const remaining = await window.devotionStore.getAllHighlights();
            const cards = document.querySelectorAll('.journal-highlight-card');
            return {{
                remainingInStore: remaining.length,
                remainingCards: cards.length
            }};
        }})()
    """)
    print("Removal result:", remove_res)
    assert remove_res['remainingInStore'] == 1, f"Expected 1 remaining highlight in store, got {remove_res['remainingInStore']}"
    assert remove_res['remainingCards'] == 1, f"Expected 1 remaining card in DOM, got {remove_res['remainingCards']}"

    print("\n==========================================")
    print("ALL PHASE 2 HIGHLIGHTS TESTS PASSED!")
    print("==========================================")

    ws.close()

if __name__ == '__main__':
    run_test()
