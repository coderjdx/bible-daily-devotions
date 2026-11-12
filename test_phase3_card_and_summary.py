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

    send("Page.enable")
    send("Runtime.enable")
    send("Network.enable")
    send("Network.setCacheDisabled", {"cacheDisabled": True})

    # Clear SW cache & reload
    evaluate("navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister())))")
    evaluate("caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))")
    send("Page.reload", {"ignoreCache": True})
    time.sleep(2)

    # Setup rich test data for Phase 3
    print("Setting up test data for monthly review & card generator...")
    setup_data = evaluate("""
        (async () => {
            // Completions for Day 1, 2, 3
            await window.devotionStore.setCompletion('2026-11-01', { completed: true, timestamp: '2026-11-01T07:00:00Z' });
            await window.devotionStore.setCompletion('2026-11-02', { completed: true, timestamp: '2026-11-02T07:00:00Z' });
            await window.devotionStore.setCompletion('2026-11-03', { completed: true, timestamp: '2026-11-03T07:00:00Z' });

            // Devotion Note with tags
            await window.devotionStore.saveNote('2026-11-03', 'God teaches us that iron sharpens iron in community.', ['faith', 'community', 'gratitude']);

            // Sunday Services for Nov 1 & Nov 8
            await window.devotionStore.saveSundayService('2026-11-01', {
                attended: true,
                title: 'The Great Commission',
                speaker: 'Pastor Paul',
                notes: 'Go therefore and make disciples.',
                tags: ['faith', 'evangelism']
            });
            await window.devotionStore.saveSundayService('2026-11-08', {
                attended: true,
                title: 'Living in Hope',
                speaker: 'Pastor John',
                notes: 'Hope anchors the soul.',
                tags: ['hope', 'peace', 'faith']
            });

            // Highlight
            await window.devotionStore.saveHighlight({
                id: 'PRO_27_17',
                reference: 'Proverbs 27:17',
                bookId: 'PRO',
                bookName: 'Proverbs',
                chapter: 27,
                verse: 17,
                color: 'gold',
                text: 'As iron sharpens iron, so one person sharpens another.',
                translation: 'BSB',
                isBookmarked: true,
                dayNum: 3,
                dateStr: '2026-11-03'
            });

            return true;
        })()
    """)
    print("Test data initialized:", setup_data)

    evaluate("window.setTheme('dark')")

    # Step 1: Test Shareable Scripture Card Generator from Devotion View
    print("\n--- Step 1: Testing Shareable Scripture Card Generator ---")
    evaluate("window.switchView('devotion')")
    time.sleep(1)

    # Click first verse to open action toolbar
    card_btn_check = evaluate("""
        (() => {
            const v = document.querySelector('.verse-item');
            if (v) v.click();
            const btnCard = document.getElementById('btn-verse-create-card');
            return {
                btnExists: !!btnCard,
                selectedRef: window.appState.selectedVerse ? window.appState.selectedVerse.reference : null
            };
        })()
    """)
    print("Verse action bar card button status:", card_btn_check)
    assert card_btn_check['btnExists'], "btn-verse-create-card not found in verse action bar"

    # Click Card button to open modal
    open_card_gen = evaluate("""
        (() => {
            const btnCard = document.getElementById('btn-verse-create-card');
            btnCard.click();
            const modal = document.getElementById('modal-card-generator');
            const canvas = document.getElementById('scripture-card-canvas');
            return {
                modalVisible: modal && modal.style.display !== 'none',
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0
            };
        })()
    """)
    print("Card Generator opened:", open_card_gen)
    assert open_card_gen['modalVisible'], "Card generator modal did not open"
    assert open_card_gen['canvasWidth'] == 1080 and open_card_gen['canvasHeight'] == 1350, f"Expected 1080x1350, got {open_card_gen['canvasWidth']}x{open_card_gen['canvasHeight']}"

    # Verify canvas is drawn (not blank)
    pixel_check = evaluate("""
        (() => {
            const canvas = document.getElementById('scripture-card-canvas');
            const ctx = canvas.getContext('2d');
            const p = ctx.getImageData(540, 675, 1, 1).data; // center pixel
            return { r: p[0], g: p[1], b: p[2], a: p[3] };
        })()
    """)
    print("Canvas center pixel data:", pixel_check)
    assert pixel_check['a'] > 0, "Canvas appears to be blank"

    # Test changing Aspect Ratio to Story (9:16)
    story_aspect = evaluate("""
        (() => {
            const storyBtn = document.querySelector('[data-aspect="story"]');
            if (storyBtn) storyBtn.click();
            const canvas = document.getElementById('scripture-card-canvas');
            return {
                activeAspect: window.appState.cardGen.aspect,
                width: canvas.width,
                height: canvas.height
            };
        })()
    """)
    print("Story aspect ratio:", story_aspect)
    assert story_aspect['activeAspect'] == 'story' and story_aspect['height'] == 1920, "Aspect ratio change to 9:16 failed"

    # Switch back to Portrait (4:5)
    evaluate("document.querySelector('[data-aspect=\"portrait\"]').click()")

    # Test Theme switching: Dawn Radiance
    dawn_theme = evaluate("""
        (() => {
            const dawnBtn = document.querySelector('.card-theme-btn.theme-dawn');
            if (dawnBtn) dawnBtn.click();
            return { activeTheme: window.appState.cardGen.theme };
        })()
    """)
    print("Theme switched to Dawn:", dawn_theme)
    assert dawn_theme['activeTheme'] == 'dawn', "Dawn theme selection failed"

    # Test Theme switching: Midnight Gold
    evaluate("document.querySelector('.card-theme-btn.theme-midnight').click()")

    # Test reflection checkbox toggle
    evaluate("""
        (() => {
            const chk = document.getElementById('check-include-reflection');
            if (chk) {
                chk.checked = true;
                chk.dispatchEvent(new Event('change'));
            }
        })()
    """)

    time.sleep(0.5)
    capture_screenshot("screenshot_card_generator_dark.png")

    # Test in Clean Light Theme mode
    evaluate("window.setTheme('light')")
    time.sleep(0.5)
    capture_screenshot("screenshot_card_generator_light.png")

    # Close card generator
    evaluate("document.getElementById('btn-close-card-generator').click()")
    time.sleep(0.5)

    # Step 2: Test Monthly Summary Infographic
    print("\n--- Step 2: Testing Monthly Summary Infographic ---")
    evaluate("window.setTheme('dark')")
    evaluate("window.switchView('calendar')")
    time.sleep(1)

    # Click My Spiritual Walk Summary button
    summary_btn_check = evaluate("""
        (() => {
            const btn = document.getElementById('btn-open-monthly-summary');
            if (btn) btn.click();
            const modal = document.getElementById('modal-monthly-summary');
            return {
                btnFound: !!btn,
                modalVisible: modal && modal.style.display !== 'none'
            };
        })()
    """)
    print("Monthly Summary button & modal status:", summary_btn_check)
    assert summary_btn_check['btnFound'] and summary_btn_check['modalVisible'], "Monthly summary modal did not open"

    time.sleep(1)
    summary_data = evaluate("""
        (() => {
            return {
                monthTitle: document.getElementById('summary-banner-month-title') ? document.getElementById('summary-banner-month-title').textContent : '',
                daysInScripture: document.getElementById('summary-metric-days') ? document.getElementById('summary-metric-days').textContent : '',
                streak: document.getElementById('summary-metric-streak') ? document.getElementById('summary-metric-streak').textContent : '',
                sundayServices: document.getElementById('summary-metric-sunday') ? document.getElementById('summary-metric-sunday').textContent : '',
                notes: document.getElementById('summary-metric-notes') ? document.getElementById('summary-metric-notes').textContent : '',
                highlights: document.getElementById('summary-metric-highlights') ? document.getElementById('summary-metric-highlights').textContent : '',
                topTags: Array.from(document.querySelectorAll('#summary-top-tags-chips .card-tag-pill')).map(p => p.textContent)
            };
        })()
    """)
    print("Monthly Summary rendered metrics:", summary_data)
    assert '3 / 30' in summary_data['daysInScripture'], f"Expected 3 / 30, got {summary_data['daysInScripture']}"
    assert '2 / 5' in summary_data['sundayServices'], f"Expected 2 / 5, got {summary_data['sundayServices']}"
    assert len(summary_data['topTags']) > 0, "No top tags found in summary"
    assert any('faith' in t for t in summary_data['topTags']), "Top tag #faith missing"

    capture_screenshot("screenshot_monthly_summary_dark.png")

    # Light theme mode for monthly summary
    evaluate("window.setTheme('light')")
    time.sleep(0.5)
    capture_screenshot("screenshot_monthly_summary_light.png")

    # Close monthly summary modal
    evaluate("document.getElementById('btn-close-monthly-summary').click()")
    time.sleep(0.5)

    # Step 3: Test Quick Card on Home View
    print("\n--- Step 3: Testing Home View Quick Card ---")
    evaluate("window.switchView('home')")
    time.sleep(0.5)

    home_card_check = evaluate("""
        (() => {
            const card = document.getElementById('card-nav-monthly-summary');
            if (!card) return { found: false };
            card.click();
            const modal = document.getElementById('modal-monthly-summary');
            return {
                found: true,
                modalVisible: modal && modal.style.display !== 'none'
            };
        })()
    """)
    print("Home view quick card navigation:", home_card_check)
    assert home_card_check['found'] and home_card_check['modalVisible'], "Home quick card did not open monthly summary"
    evaluate("document.getElementById('btn-close-monthly-summary').click()")

    print("\n==========================================")
    print("ALL PHASE 3 CARD & SUMMARY TESTS PASSED!")
    print("==========================================")

    ws.close()

if __name__ == '__main__':
    run_test()
