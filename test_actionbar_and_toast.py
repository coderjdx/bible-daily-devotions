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

    # Set mobile portrait viewport (iPhone 14/15/16 Pro dimensions: 393 x 852)
    send("Emulation.setDeviceMetricsOverride", {
        "width": 393,
        "height": 852,
        "deviceScaleFactor": 3,
        "mobile": True
    })

    print("Hard reloading page with ignoreCache...")
    send("Page.reload", {"ignoreCache": True})
    time.sleep(1.5)

    print("Initializing view...")
    evaluate("""
        (async () => {
            window.switchView('devotion');
            window.setTheme('dark');
            await window.renderDevotion(3);
        })()
    """)
    time.sleep(1)

    # Step 1: Test Toast Notification Positioning
    print("\n--- Step 1: Test Toast Notification Positioning ---")
    toast_info = evaluate("""
        (() => {
            const toast = document.getElementById('app-toast');
            toast.style.transition = 'none';
            window.showToast('Highlighted Proverbs 27:15–16 ✨');
            const rect = toast.getBoundingClientRect();
            toast.style.transition = '';
            return {
                visible: toast.classList.contains('visible'),
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                text: toast.innerText.trim()
            };
        })()
    """)
    print("Toast measurement:", toast_info)
    assert toast_info['visible'], "Toast should have .visible class"
    assert toast_info['top'] >= 60, f"Toast top ({toast_info['top']}px) must be >= 60px to clear camera notch/island"

    time.sleep(0.3)
    capture_screenshot("screenshot_toast_notification_dark.png")

    # Step 2: Test Verse Action Bar Dimensions in Portrait
    print("\n--- Step 2: Test Verse Action Bar in Portrait ---")
    bar_info = evaluate("""
        (() => {
            const verses = document.querySelectorAll('.verse-item');
            verses[0].click(); // select verse 1
            verses[1].click(); // select verse 2

            const bar = document.getElementById('verse-action-bar');
            const rect = bar.getBoundingClientRect();
            const header = bar.querySelector('.verse-action-header');
            const body = bar.querySelector('.verse-action-body');
            const closeBtn = document.getElementById('btn-verse-close');

            return {
                display: bar.style.display,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                bottom: rect.bottom,
                screenWidth: window.innerWidth,
                headerPresent: !!header,
                bodyPresent: !!body,
                closeBtnPresent: !!closeBtn,
                refText: document.getElementById('verse-action-ref-text').innerText.trim()
            };
        })()
    """)
    print("Action bar measurement in portrait:", bar_info)
    assert bar_info['display'] == 'flex', "Action bar should be visible"
    assert bar_info['width'] <= 360, f"Action bar width ({bar_info['width']}px) must be <= 360px for compact portrait display"
    assert bar_info['headerPresent'] and bar_info['bodyPresent'], "2-tier header and body must be present"

    time.sleep(0.3)
    capture_screenshot("screenshot_portrait_actionbar_dark.png")

    # Step 3: Test Light Theme
    print("\n--- Step 3: Test Light Theme ---")
    evaluate("window.setTheme('light')")
    time.sleep(0.5)

    capture_screenshot("screenshot_portrait_actionbar_light.png")

    # Show toast in light mode
    evaluate("""
        (() => {
            const toast = document.getElementById('app-toast');
            toast.style.transition = 'none';
            window.showToast('Daily Devotions updated ✨');
            toast.style.transition = '';
        })()
    """)
    time.sleep(0.3)
    capture_screenshot("screenshot_toast_notification_light.png")

    # Step 4: Test Close Button
    print("\n--- Step 4: Test Close Button ---")
    close_res = evaluate("""
        (() => {
            const closeBtn = document.getElementById('btn-verse-close');
            closeBtn.click();
            const bar = document.getElementById('verse-action-bar');
            return {
                barHidden: bar.style.display === 'none',
                selectedCount: document.querySelectorAll('.verse-item.verse-selected').length
            };
        })()
    """)
    print("Close button result:", close_res)
    assert close_res['barHidden'], "Action bar should be hidden after clicking close"
    assert close_res['selectedCount'] == 0, "All verses deselected"

    print("\n==========================================")
    print("ALL ACTION BAR & TOAST TESTS PASSED!")
    print("==========================================")
    ws.close()

if __name__ == '__main__':
    run_test()
