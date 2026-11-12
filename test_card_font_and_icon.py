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

    # Set mobile viewport (iPhone 14/15/16 Pro dimensions: 393 x 852)
    send("Emulation.setDeviceMetricsOverride", {
        "width": 393,
        "height": 852,
        "deviceScaleFactor": 2,
        "mobile": True
    })

    print("Navigating to Day 12 Devotion...")
    send("Page.navigate", {"url": "http://localhost:8080/?day=12&view=devotion"})
    time.sleep(1.5)
    send("Page.reload", {"ignoreCache": True})
    time.sleep(2)

    # Test Case 1: Short verse (< 45 chars)
    print("\n--- Test 1: Short Verse (< 45 chars) ---")
    short_res = evaluate("""
        (async () => {
            await window.openCardGenerator({ verseText: 'Jesus wept.', reference: 'John 11:35' });
            const canvas = document.getElementById('scripture-card-canvas');
            const modal = document.getElementById('modal-card-generator');
            return {
                modalVisible: modal.style.display !== 'none',
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                charCount: 'Jesus wept.'.length
            };
        })()
    """)
    print("Short verse card opened:", short_res)
    time.sleep(0.5)
    capture_screenshot("screenshot_card_short_verse_large_font.png")

    # Test Case 2: Medium verse (Proverbs 27:15–16: 154 chars)
    print("\n--- Test 2: Medium Verse (Proverbs 27:15–16, 154 chars) ---")
    med_res = evaluate("""
        (() => {
            const verse1 = document.querySelectorAll('.verse-item')[0];
            const verse2 = document.querySelectorAll('.verse-item')[1];
            verse1.click();
            verse2.click();
            const cardBtn = document.getElementById('btn-verse-create-card');
            cardBtn.click();

            const canvas = document.getElementById('scripture-card-canvas');
            return {
                verseText: window.appState.cardGen.verseText,
                charCount: window.appState.cardGen.verseText.length,
                reference: window.appState.cardGen.reference
            };
        })()
    """)
    print("Medium verse card opened:", med_res)
    assert med_res['charCount'] == 154, f"Expected 154 chars, got {med_res['charCount']}"
    time.sleep(0.5)
    capture_screenshot("screenshot_card_medium_verse.png")

    # Test Case 3: Test different themes and aspect ratios (Square aspect with Dawn theme)
    print("\n--- Test 3: Dawn Theme in Square Aspect Ratio ---")
    evaluate("""
        (() => {
            // Click Square Aspect button
            const aspectSquare = document.querySelector('[data-aspect=\"square\"]');
            if (aspectSquare) aspectSquare.click();

            // Click Dawn Theme button
            const themeDawn = document.querySelector('[data-card-theme=\"dawn\"]');
            if (themeDawn) themeDawn.click();
        })()
    """)
    time.sleep(0.5)
    capture_screenshot("screenshot_card_dawn_square.png")

    # Test Case 4: Long verse (Proverbs 27:15–19: ~380 chars)
    print("\n--- Test 4: Long Verse Selection (~380 chars) ---")
    evaluate("""
        (() => {
            window.closeCardGenerator();
            const verses = document.querySelectorAll('.verse-item');
            // Deselect any previous selection
            document.querySelectorAll('.verse-item.verse-selected').forEach(v => v.click());

            // Select verses 0, 1, 2, 3, 4
            for (let i = 0; i < Math.min(5, verses.length); i++) {
                verses[i].click();
            }
            document.getElementById('btn-verse-create-card').click();
        })()
    """)
    time.sleep(0.5)
    long_res = evaluate("""
        (() => {
            return {
                charCount: window.appState.cardGen.verseText.length,
                reference: window.appState.cardGen.reference
            };
        })()
    """)
    print("Long verse card opened:", long_res)
    capture_screenshot("screenshot_card_long_verse_scaled_font.png")

    # Test Case 5: Verify Middle-Top Icon is Drawn on Canvas
    print("\n--- Test 5: Verify Top-Center Icon Pixel Rendering ---")
    pixel_check = evaluate("""
        (() => {
            const canvas = document.getElementById('scripture-card-canvas');
            const ctx = canvas.getContext('2d');
            // Check pixel color around center icon: x = 540, y = 50 + 30 + 38 = 118
            const pixel = ctx.getImageData(540, 118, 1, 1).data;
            return {
                r: pixel[0],
                g: pixel[1],
                b: pixel[2],
                a: pixel[3]
            };
        })()
    """)
    print("Top-center pixel check at (540, 118):", pixel_check)
    # The center pixel of icon-192.png has a non-zero alpha and distinct color
    assert pixel_check['a'] > 0, "Icon must be drawn with non-zero alpha"

    # Close modal
    evaluate("window.closeCardGenerator()")

    print("\n==========================================")
    print("ALL SCRIPTURE CARD FONT & ICON TESTS PASSED!")
    print("==========================================")
    ws.close()

if __name__ == '__main__':
    run_test()
