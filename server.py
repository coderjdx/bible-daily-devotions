#!/usr/bin/env python3
"""
Lightweight production static server for Daily Devotions
Works seamlessly on Render Free Tier Web Service
"""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", 8080))

class DevotionRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow Service Worker and cross-origin resource sharing
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

if __name__ == "__main__":
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, DevotionRequestHandler)
    print(f"Daily Devotions server running on port {PORT}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
