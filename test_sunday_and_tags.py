import json
import urllib.request
import websocket
import time
import base64
import os

def run_test():
    # 1. Discover target
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

    def capture_screenshot(path):
        res = send("Page.captureScreenshot", {"format": "png"})
        data = res['result']['data']
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        print(f"Screenshot saved to {path}")

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

    # Check for console errors or syntax errors
    print("Checking app boot and store initialization...")
    boot_status = evaluate("""
        (() => {
            return {
                hasStore: !!window.devotionStore,
                storeVersion: window.devotionStore ? window.devotionStore.dbVersion : null,
                hasBibleService: !!window.bibleService,
                activeTranslation: window.bibleService ? window.bibleService.activeTranslation : null
            };
        })()
    """)
    print("Boot status:", boot_status)
    assert boot_status['hasStore'] is True, "Devotion store failed to initialize"
    assert boot_status['storeVersion'] == 3, f"Expected store version 3, got {boot_status['storeVersion']}"

    # TEST 1: Devotion View & Tagging
    print("\n--- TEST 1: Devotion View & Devotion Tags ---")
    evaluate("switchView('devotion')")
    time.sleep(0.5)

    # Type note and add tags #faith, #prayer, #healing
    res_tag = evaluate("""
        (async () => {
            // Set note text
            const noteInput = document.getElementById('devotion-notes-input');
            if (noteInput) {
                noteInput.value = "Great devotional reflection on God's sustaining grace.";
                noteInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Add tags
            const tagInput = document.getElementById('devotion-tag-input');
            const addBtn = document.getElementById('btn-add-devotion-tag');

            tagInput.value = 'faith';
            addBtn.click();

            tagInput.value = 'prayer';
            addBtn.click();

            tagInput.value = 'healing';
            addBtn.click();

            // Wait a tick for debounced save
            await new Promise(r => setTimeout(r, 800));

            // Check store
            const dateStr = window.getDayDateStr(window.appState.currentDay);
            const rec = await window.devotionStore.getNoteRecord(dateStr);
            return {
                chipsCount: document.querySelectorAll('#devotion-tags-chips .tag-chip').length,
                chipsText: Array.from(document.querySelectorAll('#devotion-tags-chips .tag-chip')).map(c => c.textContent),
                record: rec
            };
        })()
    """)
    print("Devotion tags test result:", res_tag)
    assert res_tag['chipsCount'] == 3, f"Expected 3 chips, got {res_tag['chipsCount']}"
    assert 'faith' in res_tag['record']['tags'], "Tag 'faith' not found in store record"
    assert 'prayer' in res_tag['record']['tags'], "Tag 'prayer' not found in store record"
    assert 'healing' in res_tag['record']['tags'], "Tag 'healing' not found in store record"

    # Remove tag #healing
    remove_tag_res = evaluate("""
        (async () => {
            const delBtns = document.querySelectorAll('#devotion-tags-chips .tag-chip-del');
            // Click last delete button (#healing)
            if (delBtns.length >= 3) {
                delBtns[2].click();
            }
            await new Promise(r => setTimeout(r, 800));
            const dateStr = window.getDayDateStr(window.appState.currentDay);
            const rec = await window.devotionStore.getNoteRecord(dateStr);
            return {
                chipsCount: document.querySelectorAll('#devotion-tags-chips .tag-chip').length,
                record: rec
            };
        })()
    """)
    print("After removing #healing:", remove_tag_res)
    assert remove_tag_res['chipsCount'] == 2, f"Expected 2 chips, got {remove_tag_res['chipsCount']}"
    assert 'healing' not in remove_tag_res['record']['tags'], "Tag 'healing' was not removed"

    capture_screenshot("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_devotion_tags.png")

    # TEST 2: Sunday Church Service Modal & Auto-save
    print("\n--- TEST 2: Sunday Service Modal & Save ---")
    sunday_res = evaluate("""
        (async () => {
            // Open Sunday modal for 2026-11-01 (Sunday, Day 1)
            await openSundayModal('2026-11-01');

            const toggle = document.getElementById('sunday-attendance-toggle');
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));

            const titleInput = document.getElementById('sunday-title-input');
            titleInput.value = "Walking in the Spirit (Part 3)";
            titleInput.dispatchEvent(new Event('input', { bubbles: true }));

            const speakerInput = document.getElementById('sunday-speaker-input');
            speakerInput.value = "Pastor John Doe";
            speakerInput.dispatchEvent(new Event('input', { bubbles: true }));

            const notesInput = document.getElementById('sunday-notes-input');
            notesInput.value = "Abiding in Christ produces lasting fruit. Walk by the Spirit, and you will not gratify the desires of the flesh.";
            notesInput.dispatchEvent(new Event('input', { bubbles: true }));

            // Add Sunday tags
            const sundayTagInput = document.getElementById('sunday-tag-input');
            const sundayAddBtn = document.getElementById('btn-add-sunday-tag');

            sundayTagInput.value = 'sermon-series';
            sundayAddBtn.click();

            sundayTagInput.value = 'faith';
            sundayAddBtn.click();

            // Wait a tick for auto-save
            await new Promise(r => setTimeout(r, 600));

            // Query store directly
            const saved = await window.devotionStore.getSundayService('2026-11-01');
            return {
                modalActive: document.getElementById('modal-sunday-service').classList.contains('active'),
                attendanceChecked: toggle.checked,
                cardHasAttendedClass: document.getElementById('sunday-attendance-card').classList.contains('attended'),
                savedRecord: saved
            };
        })()
    """)
    print("Sunday save result:", sunday_res)
    assert sunday_res['savedRecord']['attended'] is True, "Sunday attendance was not saved as true"
    assert sunday_res['savedRecord']['title'] == "Walking in the Spirit (Part 3)", "Title not matched"
    assert sunday_res['savedRecord']['speaker'] == "Pastor John Doe", "Speaker not matched"
    assert 'sermon-series' in sunday_res['savedRecord']['tags'], "Tag 'sermon-series' not saved"
    assert 'faith' in sunday_res['savedRecord']['tags'], "Tag 'faith' not saved"

    # Capture Sunday modal screenshot
    capture_screenshot("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_sunday_modal_dark.png")

    # Close modal
    evaluate("closeSundayModal()")
    time.sleep(0.3)

    # TEST 3: Home View Sunday Card
    print("\n--- TEST 3: Home View Sunday Card on Sunday ---")
    home_sunday_test = evaluate("""
        (async () => {
            // Simulate simulatedTodayDay = 1 (Sunday, Nov 1, 2026)
            window.appState.simulatedTodayDay = 1;
            switchView('home');
            await renderHome();

            const card = document.getElementById('home-sunday-card');
            const pill = document.getElementById('home-sunday-attendance-pill');
            const desc = document.getElementById('home-sunday-desc');
            const btnText = document.getElementById('home-sunday-action-text');

            return {
                display: card.style.display,
                pillDisplay: pill.style.display,
                pillText: pill.textContent.trim(),
                descText: desc.textContent.trim(),
                btnText: btnText.textContent.trim()
            };
        })()
    """)
    print("Home Sunday Card test:", home_sunday_test)
    assert home_sunday_test['display'] == 'block', "Home Sunday Card should be displayed on Sunday"
    assert home_sunday_test['pillDisplay'] == 'inline-flex', "Attendance pill should be displayed"
    assert 'Walking in the Spirit' in home_sunday_test['descText'], "Sermon title should be previewed"

    capture_screenshot("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_home_sunday_card.png")

    # TEST 4: Calendar Sunday Attendance Indicator
    print("\n--- TEST 4: Calendar Sunday Attendance Indicator ---")
    cal_res = evaluate("""
        (async () => {
            switchView('calendar');
            await renderCalendar();
            // Check day 1 cell
            const cells = Array.from(document.querySelectorAll('.cal-day-cell:not(.empty)'));
            const day1Cell = cells[0];
            const churchDot = day1Cell ? day1Cell.querySelector('.cal-church-dot') : null;
            return {
                day1Num: day1Cell ? day1Cell.querySelector('.day-num').textContent : null,
                hasChurchDot: !!churchDot,
                churchDotText: churchDot ? churchDot.textContent : null
            };
        })()
    """)
    print("Calendar Day 1 attendance indicator:", cal_res)
    assert cal_res['hasChurchDot'] is True, "Sunday Day 1 cell missing church attendance dot"
    assert cal_res['churchDotText'] == '⛪', f"Expected ⛪, got {cal_res['churchDotText']}"

    capture_screenshot("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_calendar_sunday_indicator.png")

    # TEST 5: Journal Tab Categories & Tag Filtering
    print("\n--- TEST 5: Journal Tab Categories & Tag Filter Bar ---")
    journal_res = evaluate("""
        (async () => {
            switchView('journal');
            window.appState.selectedJournalMonth = 'all';
            window.appState.journalCategory = 'all';
            window.appState.selectedTagFilter = null;
            await renderJournal();

            const cards = Array.from(document.querySelectorAll('#journal-entries-list .journal-entry-card'));
            const tagsBar = document.getElementById('journal-tags-bar');
            const tagPills = Array.from(tagsBar ? tagsBar.querySelectorAll('.journal-tag-filter-pill') : []);

            return {
                cardsCount: cards.length,
                hasSundayCard: cards.some(c => c.classList.contains('sunday-service-entry')),
                tagPillsText: tagPills.map(p => p.textContent.trim())
            };
        })()
    """)
    print("Journal 'All' category test:", journal_res)
    assert journal_res['cardsCount'] >= 2, f"Expected at least 2 cards (1 devotion, 1 sunday), got {journal_res['cardsCount']}"
    assert journal_res['hasSundayCard'] is True, "Sunday service card not found in Journal catalog"

    capture_screenshot("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_all_categories.png")

    # Test filtering by tag '#sermon-series'
    print("Filtering by tag 'sermon-series'...")
    filter_tag_res = evaluate("""
        (async () => {
            window.appState.selectedTagFilter = 'sermon-series';
            await renderJournal();
            const cards = Array.from(document.querySelectorAll('#journal-entries-list .journal-entry-card'));
            return {
                cardsCount: cards.length,
                allSunday: cards.every(c => c.classList.contains('sunday-service-entry'))
            };
        })()
    """)
    print("Tag filter 'sermon-series':", filter_tag_res)
    assert filter_tag_res['cardsCount'] == 1, f"Expected 1 card for 'sermon-series', got {filter_tag_res['cardsCount']}"
    assert filter_tag_res['allSunday'] is True, "Only Sunday card should match 'sermon-series'"

    # Test filtering by tag '#prayer'
    print("Filtering by tag 'prayer'...")
    filter_prayer_res = evaluate("""
        (async () => {
            window.appState.selectedTagFilter = 'prayer';
            await renderJournal();
            const cards = Array.from(document.querySelectorAll('#journal-entries-list .journal-entry-card'));
            return {
                cardsCount: cards.length,
                allDevotion: cards.every(c => !c.classList.contains('sunday-service-entry'))
            };
        })()
    """)
    print("Tag filter 'prayer':", filter_prayer_res)
    assert filter_prayer_res['cardsCount'] == 1, f"Expected 1 devotion card for 'prayer', got {filter_prayer_res['cardsCount']}"
    assert filter_prayer_res['allDevotion'] is True, "Only devotion card should match 'prayer'"

    # Test category button switching: ⛪ Sunday Service
    print("Switching category to 'sunday'...")
    cat_sunday_res = evaluate("""
        (async () => {
            window.appState.selectedTagFilter = null;
            document.getElementById('btn-journal-cat-sunday').click();
            await new Promise(r => setTimeout(r, 200));
            const cards = Array.from(document.querySelectorAll('#journal-entries-list .journal-entry-card'));
            return {
                activeCategory: window.appState.journalCategory,
                cardsCount: cards.length,
                allSunday: cards.every(c => c.classList.contains('sunday-service-entry'))
            };
        })()
    """)
    print("Category 'sunday' result:", cat_sunday_res)
    assert cat_sunday_res['activeCategory'] == 'sunday', "Active category should be sunday"
    assert cat_sunday_res['allSunday'] is True, "Only Sunday service cards should be visible"

    # Test category button switching: ✍️ Devotions
    print("Switching category to 'devotions'...")
    cat_devotions_res = evaluate("""
        (async () => {
            document.getElementById('btn-journal-cat-devotions').click();
            await new Promise(r => setTimeout(r, 200));
            const cards = Array.from(document.querySelectorAll('#journal-entries-list .journal-entry-card'));
            return {
                activeCategory: window.appState.journalCategory,
                cardsCount: cards.length,
                allDevotion: cards.every(c => !c.classList.contains('sunday-service-entry'))
            };
        })()
    """)
    print("Category 'devotions' result:", cat_devotions_res)
    assert cat_devotions_res['activeCategory'] == 'devotions', "Active category should be devotions"
    assert cat_devotions_res['allDevotion'] is True, "Only devotion cards should be visible"

    # TEST 6: Light Mode Aesthetics
    print("\n--- TEST 6: Light Mode Verification ---")
    evaluate("""
        (() => {
            window.appState.journalCategory = 'all';
            document.getElementById('btn-journal-cat-all').click();
            setTheme('light');
        })()
    """)
    time.sleep(0.5)
    capture_screenshot("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_journal_light_mode.png")

    # Open Sunday modal in light mode
    evaluate("openSundayModal('2026-11-01')")
    time.sleep(0.5)
    capture_screenshot("/Users/michdeleon/.gemini/antigravity/brain/b6419480-c78f-44a4-952a-2b474ae435f1/screenshot_sunday_modal_light.png")

    # Switch back to dark theme
    evaluate("closeSundayModal()")
    evaluate("setTheme('dark')")
    time.sleep(0.3)

    print("\n✅ ALL TESTS PASSED SUCCESSFULLY!")
    ws.close()

if __name__ == '__main__':
    run_test()
