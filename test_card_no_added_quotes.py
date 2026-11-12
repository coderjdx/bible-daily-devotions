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

    print("Navigating to Devotion and hard reloading...")
    send("Page.navigate", {"url": "http://localhost:8080/?day=12&view=devotion"})
    time.sleep(1.5)
    send("Page.reload", {"ignoreCache": True})
    time.sleep(2)

    # Test 1: Verse without quotes
    print("\n--- Test 1: Verse without quotes (Jesus wept.) ---")
    res1 = evaluate("""
        (() => {
            window.openCardGenerator({
                verseText: 'Jesus wept.',
                reference: 'John 11:35 • BSB'
            });

            // Inspect state & rendered card text lines
            const canvas = document.getElementById('scripture-card-canvas');
            const ctx = canvas.getContext('2d');
            const rawText = window.appState.cardGen.verseText.trim();

            return {
                verseText: rawText,
                startsWithQuote: rawText.startsWith('“') || rawText.startsWith('"'),
                endsWithQuote: rawText.endsWith('”') || rawText.endsWith('"')
            };
        })()
    """)
    print("Test 1 Result:", res1)
    assert not res1['startsWithQuote'], "Verse text must not have added leading quotes"
    assert not res1['endsWithQuote'], "Verse text must not have added trailing quotes"

    time.sleep(0.5)
    capture_screenshot("screenshot_card_no_added_quotes_short.png")

    # Test 2: Multi-verse selection from Devotion Day 12
    print("\n--- Test 2: Multi-verse selection (Proverbs 27:15–16) ---")
    res2 = evaluate("""
        (() => {
            window.closeCardGenerator();
            const verses = document.querySelectorAll('.verse-item');
            verses[0].click();
            verses[1].click();
            document.getElementById('btn-verse-create-card').click();

            return {
                verseText: window.appState.cardGen.verseText,
                reference: window.appState.cardGen.reference,
                startsWithQuote: window.appState.cardGen.verseText.trim().startsWith('“'),
                endsWithQuote: window.appState.cardGen.verseText.trim().endsWith('”')
            };
        })()
    """)
    print("Test 2 Result:", res2)
    assert not res2['startsWithQuote'], "Multi-verse text must not have added leading quotes"
    assert not res2['endsWithQuote'], "Multi-verse text must not have added trailing quotes"

    time.sleep(0.5)
    capture_screenshot("screenshot_card_no_added_quotes_multiverse.png")

    # Test 3: Verse that natively contains authentic quotes inside
    print("\n--- Test 3: Verse with authentic internal quotes ---")
    res3 = evaluate("""
        (() => {
            const verseWithInternalQuote = 'And God said, "Let there be light," and there was light.';
            window.openCardGenerator({
                verseText: verseWithInternalQuote,
                reference: 'Genesis 1:3 • BSB'
            });

            return {
                verseText: window.appState.cardGen.verseText,
                hasInternalQuote: window.appState.cardGen.verseText.includes('"Let there be light,"'),
                startsWithCurlyQuote: window.appState.cardGen.verseText.startsWith('“'),
                endsWithCurlyQuote: window.appState.cardGen.verseText.endsWith('”')
            };
        })()
    """)
    print("Test 3 Result:", res3)
    assert res3['hasInternalQuote'], "Authentic internal quotes must be preserved"
    assert not res3['startsWithCurlyQuote'], "No outer curly quotes added at the start"
    assert not res3['endsWithCurlyQuote'], "No outer curly quotes added at the end"

    time.sleep(0.5)
    capture_screenshot("screenshot_card_authentic_internal_quotes.png")

    evaluate("window.closeCardGenerator()")

    print("\n==========================================")
    print("ALL NO-ADDED-QUOTES TESTS PASSED!")
    print("==========================================")
    ws.close()

if __name__ == '__main__':
    run_test()
