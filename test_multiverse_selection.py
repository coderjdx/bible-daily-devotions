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

    # Set viewport
    send("Emulation.setDeviceMetricsOverride", {
        "width": 414,
        "height": 896,
        "deviceScaleFactor": 2,
        "mobile": True
    })

    # Hard reload with ignoreCache
    send("Page.reload", {"ignoreCache": True})
    time.sleep(1.5)

    print("Checking app readiness...")
    evaluate("""
        (async () => {
            if (window.devotionStore) {
                await window.devotionStore.deleteAllData();
            }
            window.switchView('devotion');
            window.setTheme('dark');
            await window.renderDevotion(3);
        })()
    """)
    time.sleep(1)

    # Step 1: Click first verse (Proverbs 27:15)
    print("\n--- Step 1: Select First Verse ---")
    step1_res = evaluate("""
        (() => {
            const verses = document.querySelectorAll('.verse-item');
            if (verses.length < 5) return { error: 'Not enough verses' };
            verses[0].click();
            const bar = document.getElementById('verse-action-bar');
            const refText = document.getElementById('verse-action-ref-text').textContent;
            const subText = document.getElementById('verse-action-sub-text').textContent;
            const cardBtn = document.getElementById('btn-verse-create-card');
            return {
                barVisible: bar && bar.style.display !== 'none',
                selectedCount: document.querySelectorAll('.verse-item.verse-selected').length,
                refText,
                subText,
                cardDisabled: cardBtn.classList.contains('btn-card-disabled')
            };
        })()
    """)
    print("Step 1 result:", step1_res)
    assert step1_res['barVisible'], "Verse action bar should be visible"
    assert step1_res['selectedCount'] == 1, "Expected 1 selected verse"
    assert "Proverbs 27:15" in step1_res['refText'], f"Expected Proverbs 27:15, got {step1_res['refText']}"
    assert not step1_res['cardDisabled'], "Card button should be enabled"

    # Step 2: Click second verse (Proverbs 27:16)
    print("\n--- Step 2: Select Second Verse (Multi-Select) ---")
    step2_res = evaluate("""
        (() => {
            const verses = document.querySelectorAll('.verse-item');
            verses[1].click();
            const refText = document.getElementById('verse-action-ref-text').textContent;
            const subText = document.getElementById('verse-action-sub-text').textContent;
            const badge = document.querySelector('.verse-count-badge');
            const cardBtn = document.getElementById('btn-verse-create-card');
            return {
                selectedCount: document.querySelectorAll('.verse-item.verse-selected').length,
                refText,
                badgeText: badge ? badge.textContent : null,
                subText,
                cardDisabled: cardBtn.classList.contains('btn-card-disabled')
            };
        })()
    """)
    print("Step 2 result:", step2_res)
    assert step2_res['selectedCount'] == 2, "Expected 2 selected verses"
    assert "Proverbs 27:15–16" in step2_res['refText'], f"Expected range Proverbs 27:15–16, got {step2_res['refText']}"
    assert step2_res['badgeText'] == "2 verses", f"Expected '2 verses' badge, got {step2_res['badgeText']}"
    assert not step2_res['cardDisabled'], "Card button should be enabled for 2 verses"

    # Step 3: Outside Click Does NOT Dismiss Selection Mode
    print("\n--- Step 3: Verify Outside Click Does NOT Dismiss Selection Mode ---")
    outside_res = evaluate("""
        (() => {
            // Click outside the verses (e.g. document body or devotion header)
            document.body.click();
            const bar = document.getElementById('verse-action-bar');
            return {
                barVisible: bar && bar.style.display !== 'none',
                selectedCount: document.querySelectorAll('.verse-item.verse-selected').length
            };
        })()
    """)
    print("Outside click test:", outside_res)
    assert outside_res['barVisible'], "Toolbar must remain visible on outside clicks"
    assert outside_res['selectedCount'] == 2, "Verses must remain selected on outside clicks"

    # Step 4: Toggle off Verse 2
    print("\n--- Step 4: Deselect Verse 2 ---")
    step4_res = evaluate("""
        (() => {
            const verses = document.querySelectorAll('.verse-item');
            verses[1].click(); // toggle off second verse
            const refText = document.getElementById('verse-action-ref-text').textContent;
            return {
                selectedCount: document.querySelectorAll('.verse-item.verse-selected').length,
                refText
            };
        })()
    """)
    print("Deselect result:", step4_res)
    assert step4_res['selectedCount'] == 1, "Expected 1 verse left after toggle off"
    assert "Proverbs 27:15" in step4_res['refText'], "Expected reference to revert to Proverbs 27:15"

    # Re-select verse 2 and also verse 3, 4, 5, 6, 7 to test Guardrail (> 450 characters)
    print("\n--- Step 5: Test Character Guardrail for Card Generator ---")
    guardrail_res = evaluate("""
        (() => {
            const verses = document.querySelectorAll('.verse-item');
            // Select verses 1 through 6 to exceed 450 characters
            for (let i = 1; i < 7; i++) {
                if (verses[i]) verses[i].click();
            }
            const refText = document.getElementById('verse-action-ref-text').textContent;
            const subText = document.getElementById('verse-action-sub-text').textContent;
            const cardBtn = document.getElementById('btn-verse-create-card');
            const hasWarning = !!document.querySelector('.verse-char-warning');

            // Try clicking card button while disabled
            cardBtn.click();
            const modal = document.getElementById('modal-card-generator');

            return {
                selectedCount: document.querySelectorAll('.verse-item.verse-selected').length,
                refText,
                subText,
                hasWarning,
                cardDisabled: cardBtn.classList.contains('btn-card-disabled'),
                modalOpened: modal && modal.style.display !== 'none'
            };
        })()
    """)
    print("Guardrail test result:", guardrail_res)
    assert guardrail_res['hasWarning'], "Warning message should appear when over limit"
    assert guardrail_res['cardDisabled'], "Card button should have disabled styling"
    assert not guardrail_res['modalOpened'], "Card Generator must NOT open when over 450 characters"

    capture_screenshot("screenshot_multiverse_guardrail_dark.png")

    # Step 6: Trim back to 2 verses and apply highlight action
    print("\n--- Step 6: Trim to 2 Verses and Apply Gold Highlight ---")
    step6_res = evaluate("""
        (async () => {
            const verses = document.querySelectorAll('.verse-item');
            // Deselect verses 2 through 6
            for (let i = 2; i < 7; i++) {
                if (verses[i] && verses[i].classList.contains('verse-selected')) {
                    verses[i].click();
                }
            }
            // Ensure verse 0 and verse 1 are selected
            if (!verses[0].classList.contains('verse-selected')) verses[0].click();
            if (!verses[1].classList.contains('verse-selected')) verses[1].click();

            const countBeforeAction = document.querySelectorAll('.verse-item.verse-selected').length;

            // Click Gold highlight swatch
            const goldBtn = document.querySelector('.verse-color-btn.color-gold');
            goldBtn.click();
            await new Promise(r => setTimeout(r, 400));

            const bar = document.getElementById('verse-action-bar');
            const countAfterAction = document.querySelectorAll('.verse-item.verse-selected').length;
            const v0Hl = verses[0].classList.contains('verse-highlighted') && verses[0].classList.contains('highlight-gold');
            const v1Hl = verses[1].classList.contains('verse-highlighted') && verses[1].classList.contains('highlight-gold');

            return {
                countBeforeAction,
                countAfterAction,
                barHidden: bar.style.display === 'none',
                v0Hl,
                v1Hl
            };
        })()
    """)
    print("Action apply result:", step6_res)
    assert step6_res['countBeforeAction'] == 2, "Expected 2 verses before action"
    assert step6_res['countAfterAction'] == 0, "Selection mode must exit after action is applied"
    assert step6_res['barHidden'], "Action bar must be hidden after action is applied"
    assert step6_res['v0Hl'] and step6_res['v1Hl'], "Both verses must be highlighted in Gold"

    # Verify IDB records
    idb_check = evaluate("""
        (async () => {
            const all = await window.devotionStore.getAllHighlights();
            return {
                count: all.length,
                records: all.map(r => ({ id: r.id, color: r.color }))
            };
        })()
    """)
    print("IndexedDB check:", idb_check)
    assert idb_check['count'] == 2, f"Expected 2 highlights in store, got {idb_check['count']}"

    capture_screenshot("screenshot_multiverse_highlighted_dark.png")

    # Step 7: Select multiple verses and open Card Generator
    print("\n--- Step 7: Multi-Verse Card Generator ---")
    card_test_res = evaluate("""
        (async () => {
            const verses = document.querySelectorAll('.verse-item');
            verses[0].click();
            verses[1].click();

            const cardBtn = document.getElementById('btn-verse-create-card');
            cardBtn.click();
            await new Promise(r => setTimeout(r, 500));

            const modal = document.getElementById('modal-card-generator');
            const bar = document.getElementById('verse-action-bar');
            const cardState = window.appState.cardGen;

            return {
                modalOpen: modal && modal.style.display !== 'none',
                barHidden: bar.style.display === 'none',
                selectedCount: document.querySelectorAll('.verse-item.verse-selected').length,
                cardRef: cardState.reference,
                cardTextLength: cardState.verseText.length
            };
        })()
    """)
    print("Card test result:", card_test_res)
    assert card_test_res['modalOpen'], "Card Generator modal should be open"
    assert card_test_res['barHidden'], "Selection action bar should close when card is created"
    assert "Proverbs 27:15–16" in card_test_res['cardRef'], f"Expected Proverbs 27:15–16, got {card_test_res['cardRef']}"

    capture_screenshot("screenshot_multiverse_card_generator_dark.png")

    # Close card generator
    evaluate("window.closeCardGenerator()")
    time.sleep(0.5)

    # Step 8: Test Clean Light Theme
    print("\n--- Step 8: Clean Light Theme ---")
    evaluate("window.setTheme('light')")
    time.sleep(0.5)

    light_res = evaluate("""
        (() => {
            const verses = document.querySelectorAll('.verse-item');
            verses[0].click();
            verses[1].click();
            const bar = document.getElementById('verse-action-bar');
            return {
                barVisible: bar && bar.style.display !== 'none',
                selectedCount: document.querySelectorAll('.verse-item.verse-selected').length
            };
        })()
    """)
    print("Light mode selection:", light_res)
    assert light_res['barVisible'] and light_res['selectedCount'] == 2

    capture_screenshot("screenshot_multiverse_selection_light.png")

    # Clear highlights via Clear action
    clear_res = evaluate("""
        (async () => {
            const clearBtn = document.getElementById('btn-verse-clear');
            clearBtn.click();
            await new Promise(r => setTimeout(r, 400));
            const all = await window.devotionStore.getAllHighlights();
            const bar = document.getElementById('verse-action-bar');
            return {
                remainingHighlights: all.length,
                barHidden: bar.style.display === 'none',
                selectedCount: document.querySelectorAll('.verse-item.verse-selected').length
            };
        })()
    """)
    print("Clear action result:", clear_res)
    assert clear_res['remainingHighlights'] == 0, "All highlights should be cleared"
    assert clear_res['barHidden'], "Bar should close after Clear action"
    assert clear_res['selectedCount'] == 0, "Selection mode should exit after Clear action"

    print("\n==========================================")
    print("ALL MULTI-VERSE SELECTION TESTS PASSED!")
    print("==========================================")
    ws.close()

if __name__ == '__main__':
    run_test()
