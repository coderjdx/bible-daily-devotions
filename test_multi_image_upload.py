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

# 1x1 transparent PNG data URLs for test images
IMG_RED = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
IMG_BLUE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg=="
IMG_GREEN = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

def run_tests():
    ws_url = get_ws_url()
    print(f"Connecting to {ws_url}...")
    ws = websocket.create_connection(ws_url, timeout=10)

    # 1. Reload page
    print("1. Reloading page...")
    cdp_call(ws, "Page.reload", {"ignoreCache": True}, 1)
    time.sleep(2.0)

    # Check for console errors
    console_errors = evaluate(ws, """
    (() => {
        return window.__test_console_errors || [];
    })()
    """, 2)
    print(f"Console errors: {console_errors}")

    # 2. Verify devotion view input has 'multiple' attribute
    print("2. Verifying Devotion image upload input attributes and resetting test records...")
    input_info = evaluate(ws, """
    (async () => {
        await window.devotionStore.deleteImage('2026-11-03');
        await window.devotionStore.deleteSundayService('2026-11-08');
        const inp = document.getElementById('devotion-image-file');
        const grid = document.getElementById('devotion-images-grid');
        return {
            hasInput: Boolean(inp),
            isMultiple: inp ? inp.hasAttribute('multiple') : false,
            accept: inp ? inp.getAttribute('accept') : null,
            hasGrid: Boolean(grid)
        };
    })()
    """, 3)
    print(f"Devotion input info: {input_info}")
    assert input_info["hasInput"], "Devotion image input missing"
    assert input_info["isMultiple"], "Devotion image input must have 'multiple' attribute"
    assert input_info["hasGrid"], "Devotion images grid container missing"

    # 3. Add multiple images to Devotion day (Day 3 = 2026-11-03)
    print("3. Adding 2 images to Devotion Day 3...")
    add_res = evaluate(ws, f"""
    (async () => {{
        await window.devotionStore.addImage('2026-11-03', '{IMG_RED}', 'photo_red.png');
        await window.devotionStore.addImage('2026-11-03', '{IMG_BLUE}', 'photo_blue.png');
        const rec = await window.devotionStore.getImage('2026-11-03');
        return {{
            imagesLength: rec && rec.images ? rec.images.length : 0,
            hasFallbackDataUrl: Boolean(rec && rec.dataUrl),
            firstFilename: rec && rec.images ? rec.images[0].filename : null,
            secondFilename: rec && rec.images ? rec.images[1].filename : null
        }};
    }})()
    """, 4)
    print(f"Store add images result: {add_res}")
    assert add_res["imagesLength"] == 2, f"Expected 2 images, got {add_res['imagesLength']}"
    assert add_res["hasFallbackDataUrl"], "Record must have fallback dataUrl for legacy compatibility"

    # Render devotion view for Day 3 and verify UI
    print("4. Switching to Devotion view for Day 3 and checking UI grid...")
    ui_info = evaluate(ws, """
    (async () => {
        window.appState.currentDay = 3;
        await window.renderDevotion(3);
        const container = document.getElementById('devotion-image-preview-container');
        const thumbs = document.querySelectorAll('#devotion-images-grid .image-preview-thumb-wrap');
        const removeBtns = document.querySelectorAll('#devotion-images-grid .image-thumb-remove-btn');
        return {
            containerDisplay: container ? container.style.display : null,
            thumbCount: thumbs.length,
            removeBtnCount: removeBtns.length
        };
    })()
    """, 5)
    print(f"Devotion UI grid info: {ui_info}")
    assert ui_info["thumbCount"] == 2, f"Expected 2 thumbnails, got {ui_info['thumbCount']}"
    assert ui_info["removeBtnCount"] == 2, f"Expected 2 remove buttons, got {ui_info['removeBtnCount']}"

    # 5. Click thumbnail to open Lightbox
    print("5. Clicking thumbnail to open Lightbox...")
    lightbox_info = evaluate(ws, """
    (() => {
        const firstThumbImg = document.querySelector('#devotion-images-grid .image-preview-thumb-img');
        if (firstThumbImg) firstThumbImg.click();
        const modal = document.getElementById('modal-lightbox');
        const dateText = document.getElementById('lightbox-date') ? document.getElementById('lightbox-date').textContent : '';
        const scripText = document.getElementById('lightbox-scripture') ? document.getElementById('lightbox-scripture').textContent : '';
        const isActive = modal ? modal.classList.contains('active') : false;
        // Close it
        if (modal) modal.classList.remove('active');
        return { isActive, dateText, scripText };
    })()
    """, 6)
    print(f"Lightbox info: {lightbox_info}")
    assert lightbox_info["isActive"], "Lightbox modal should be active when thumbnail is clicked"
    assert "Day 3" in lightbox_info["dateText"], "Lightbox date must mention Day 3"

    # 6. Delete 1 thumbnail via remove button
    print("6. Deleting 1 thumbnail via remove button...")
    del_res = evaluate(ws, """
    (async () => {
        const firstRemoveBtn = document.querySelector('#devotion-images-grid .image-thumb-remove-btn');
        if (firstRemoveBtn) firstRemoveBtn.click();
        await new Promise(r => setTimeout(r, 200));
        const rec = await window.devotionStore.getImage('2026-11-03');
        const thumbs = document.querySelectorAll('#devotion-images-grid .image-preview-thumb-wrap');
        return {
            storeCount: rec && rec.images ? rec.images.length : 0,
            uiCount: thumbs.length
        };
    })()
    """, 7)
    print(f"After deleting 1 devotion image: {del_res}")
    assert del_res["storeCount"] == 1, f"Expected 1 image in store, got {del_res['storeCount']}"
    assert del_res["uiCount"] == 1, f"Expected 1 thumbnail in UI, got {del_res['uiCount']}"

    # 7. Test Sunday Service Multiple Images
    print("7. Testing Sunday Service Multiple Images...")
    sunday_input_info = evaluate(ws, """
    (() => {
        const inp = document.getElementById('sunday-image-file');
        const grid = document.getElementById('sunday-images-grid');
        return {
            hasInput: Boolean(inp),
            isMultiple: inp ? inp.hasAttribute('multiple') : false,
            hasGrid: Boolean(grid)
        };
    })()
    """, 8)
    print(f"Sunday input info: {sunday_input_info}")
    assert sunday_input_info["hasInput"], "Sunday image input missing"
    assert sunday_input_info["isMultiple"], "Sunday image input must have 'multiple' attribute"
    assert sunday_input_info["hasGrid"], "Sunday images grid container missing"

    # Add 2 images to Sunday service for 2026-11-08
    print("8. Adding 2 images to Sunday Service (2026-11-08)...")
    sunday_add_res = evaluate(ws, f"""
    (async () => {{
        await window.devotionStore.addSundayServiceImage('2026-11-08', '{IMG_BLUE}', 'bulletin_p1.png');
        await window.devotionStore.addSundayServiceImage('2026-11-08', '{IMG_GREEN}', 'bulletin_p2.png');
        const rec = await window.devotionStore.getSundayService('2026-11-08');
        return {{
            imagesLength: rec && rec.images ? rec.images.length : 0,
            firstImgFilename: rec && rec.images ? rec.images[0].filename : null
        }};
    }})()
    """, 9)
    print(f"Sunday service add images result: {sunday_add_res}")
    assert sunday_add_res["imagesLength"] == 2, f"Expected 2 Sunday service images, got {sunday_add_res['imagesLength']}"

    # Open Sunday Modal and check UI thumbnails
    print("9. Opening Sunday Modal and verifying thumbnails...")
    sunday_ui_info = evaluate(ws, """
    (async () => {
        await window.openSundayModal('2026-11-08');
        const container = document.getElementById('sunday-image-preview-container');
        const thumbs = document.querySelectorAll('#sunday-images-grid .image-preview-thumb-wrap');
        const removeBtns = document.querySelectorAll('#sunday-images-grid .image-thumb-remove-btn');
        return {
            containerDisplay: container ? container.style.display : null,
            thumbCount: thumbs.length,
            removeBtnCount: removeBtns.length
        };
    })()
    """, 10)
    print(f"Sunday UI info: {sunday_ui_info}")
    assert sunday_ui_info["thumbCount"] == 2, f"Expected 2 Sunday thumbnails, got {sunday_ui_info['thumbCount']}"

    # Click Sunday thumbnail to open Lightbox
    print("10. Clicking Sunday thumbnail to open Lightbox...")
    sunday_lightbox_info = evaluate(ws, """
    (() => {
        const thumbImg = document.querySelector('#sunday-images-grid .image-preview-thumb-img');
        if (thumbImg) thumbImg.click();
        const modal = document.getElementById('modal-lightbox');
        const dateText = document.getElementById('lightbox-date') ? document.getElementById('lightbox-date').textContent : '';
        const scripText = document.getElementById('lightbox-scripture') ? document.getElementById('lightbox-scripture').textContent : '';
        const isActive = modal ? modal.classList.contains('active') : false;
        if (modal) modal.classList.remove('active');
        return { isActive, dateText, scripText };
    })()
    """, 11)
    print(f"Sunday lightbox info: {sunday_lightbox_info}")
    assert sunday_lightbox_info["isActive"], "Lightbox modal should be active when Sunday thumbnail clicked"
    assert "Sunday Service" in sunday_lightbox_info["dateText"], "Lightbox date must mention Sunday Service"

    # Close Sunday modal
    evaluate(ws, "window.closeSundayModal()", 12)

    # 11. Test Journal Gallery
    print("11. Testing Journal Gallery with Devotion & Sunday photos...")
    gallery_info = evaluate(ws, """
    (async () => {
        window.switchView('journal');
        window.appState.journalCategory = 'gallery';
        window.appState.journalTab = 'gallery';
        await window.renderJournal();
        const tiles = document.querySelectorAll('#journal-gallery-grid .gallery-tile');
        const captions = Array.from(tiles).map(t => t.querySelector('.gallery-tile-caption').textContent);
        return {
            tileCount: tiles.length,
            captions: captions
        };
    })()
    """, 13)
    print(f"Journal gallery info: {gallery_info}")
    # We have 1 devotion photo (Day 3) + 2 Sunday service photos (Nov 8) = 3 total photos!
    assert gallery_info["tileCount"] == 3, f"Expected 3 gallery tiles (1 devotion + 2 Sunday), got {gallery_info['tileCount']}"
    has_sunday_caption = any("Sunday Service" in c for c in gallery_info["captions"])
    has_devotion_caption = any("Day 3" in c for c in gallery_info["captions"])
    assert has_sunday_caption, "Gallery must show Sunday Service photo"
    assert has_devotion_caption, "Gallery must show Devotion photo"

    # 12. Test Journal Entries List thumbnail & badges
    print("12. Testing Journal Entries List with photo thumbnail and badges...")
    entries_info = evaluate(ws, """
    (async () => {
        window.appState.journalCategory = 'all';
        window.appState.journalTab = 'entries';
        await window.renderJournal();
        const cards = document.querySelectorAll('#journal-entries-list .journal-entry-card');
        const badges = Array.from(document.querySelectorAll('#journal-entries-list .entry-thumbnail + span')).map(s => s.textContent);
        return {
            cardCount: cards.length,
            photoBadges: badges
        };
    })()
    """, 14)
    print(f"Journal entries info: {entries_info}")
    assert any("2 Photos" in b or "Attached" in b for b in entries_info["photoBadges"]), f"Expected photo badge in entries list, got {entries_info['photoBadges']}"

    # 13. Test Data Counts & Export
    print("13. Testing Data Counts and Export with multiple images...")
    data_counts = evaluate(ws, """
    (async () => {
        const counts = await window.devotionStore.getDataCounts('2026-11');
        const exported = await window.devotionStore.exportAllData();
        return {
            imagesCount: counts.imagesCount,
            exportedImagesLength: exported.images.length,
            exportedSundayServicesLength: exported.sundayServices.length
        };
    })()
    """, 15)
    print(f"Data counts & export: {data_counts}")
    assert data_counts["imagesCount"] == 3, f"Expected 3 images total in counts, got {data_counts['imagesCount']}"

    # 14. Test reload persistence
    print("14. Testing reload persistence...")
    cdp_call(ws, "Page.reload", {"ignoreCache": True}, 16)
    time.sleep(2.0)
    persisted_info = evaluate(ws, """
    (async () => {
        const devImg = await window.devotionStore.getImage('2026-11-03');
        const sunRec = await window.devotionStore.getSundayService('2026-11-08');
        return {
            devotionImages: devImg && devImg.images ? devImg.images.length : 0,
            sundayImages: sunRec && sunRec.images ? sunRec.images.length : 0
        };
    })()
    """, 17)
    print(f"Persisted info after reload: {persisted_info}")
    assert persisted_info["devotionImages"] == 1, "Devotion image should persist after reload"
    assert persisted_info["sundayImages"] == 2, "Sunday service images should persist after reload"

    # Cleanup test data
    print("15. Cleaning up test data...")
    evaluate(ws, """
    (async () => {
        await window.devotionStore.deleteImage('2026-11-03');
        await window.devotionStore.deleteSundayService('2026-11-08');
    })()
    """, 18)

    print("\nALL MULTI-IMAGE TESTS PASSED 100% SUCCESSFUL!")

if __name__ == "__main__":
    run_tests()
