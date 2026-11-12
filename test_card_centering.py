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

    # Set mobile viewport
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

    print("\n--- Test Centering of Scripture Text & Footer ---")
    centering_info = evaluate("""
        (() => {
            window.openCardGenerator({
                verseText: 'A constant dripping on a rainy day and a contentious woman are alike— restraining her is like holding back the wind or grasping oil with one’s right hand.',
                reference: 'Proverbs 27:15–16 • BSB'
            });

            const canvas = document.getElementById('scripture-card-canvas');
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;

            // Measure footer bounds
            // Footer is at y = h - 50 - 35 = h - 85
            const footerY = h - 85;
            const footerData = ctx.getImageData(0, footerY - 12, w, 24).data;

            let minX = w, maxX = 0;
            // Scan between margins (ignoring the outer decorative border at x=50)
            for (let x = 60; x < w - 60; x++) {
                for (let y = 0; y < 24; y++) {
                    const alpha = footerData[(y * w + x) * 4 + 3];
                    const r = footerData[(y * w + x) * 4];
                    if (r > 60 && alpha > 100) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                    }
                }
            }

            const footerCenter = (minX + maxX) / 2;
            const leftMargin = minX;
            const rightMargin = w - maxX;

            return {
                canvasWidth: w,
                canvasHeight: h,
                footerMinX: minX,
                footerMaxX: maxX,
                footerWidth: maxX - minX,
                footerCenter: footerCenter,
                leftMargin: leftMargin,
                rightMargin: rightMargin,
                marginDifference: Math.abs(leftMargin - rightMargin),
                isCentered: Math.abs(footerCenter - 540) <= 5
            };
        })()
    """)
    print("Footer Centering Measurement:", centering_info)
    assert centering_info['isCentered'], f"Footer must be horizontally centered around 540px, got {centering_info['footerCenter']}"
    assert centering_info['footerMaxX'] < 1030, f"Footer must not go off the right card boundary (1030px), got {centering_info['footerMaxX']}"
    assert centering_info['footerMinX'] > 50, f"Footer must not go off the left card boundary (50px), got {centering_info['footerMinX']}"

    time.sleep(0.5)
    capture_screenshot("screenshot_card_centered_verified.png")

    # Test Short Verse Centering
    print("\n--- Test Short Verse Centering ---")
    short_center = evaluate("""
        (() => {
            window.openCardGenerator({
                verseText: 'Jesus wept.',
                reference: 'John 11:35 • BSB'
            });

            const canvas = document.getElementById('scripture-card-canvas');
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;

            // Verse text is in the middle of canvas around y = 675
            // Sample vertical band from y = 500 to 750
            const textData = ctx.getImageData(0, 500, w, 250).data;
            let minX = w, maxX = 0;
            for (let x = 0; x < w; x++) {
                for (let y = 0; y < 250; y++) {
                    const r = textData[(y * w + x) * 4];
                    const alpha = textData[(y * w + x) * 4 + 3];
                    if (r > 150 && alpha > 200) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                    }
                }
            }

            const textCenter = (minX + maxX) / 2;
            return {
                textMinX: minX,
                textMaxX: maxX,
                textWidth: maxX - minX,
                textCenter: textCenter,
                isCentered: Math.abs(textCenter - 540) <= 6
            };
        })()
    """)
    print("Short verse text centering measurement:", short_center)
    assert short_center['isCentered'], f"Short verse text must be centered around 540px, got {short_center['textCenter']}"

    time.sleep(0.5)
    capture_screenshot("screenshot_card_short_verse_centered.png")

    evaluate("window.closeCardGenerator()")

    print("\n==========================================")
    print("ALL CENTERING TESTS PASSED PERFECTLY!")
    print("==========================================")
    ws.close()

if __name__ == '__main__':
    run_test()
