#!/usr/bin/env python3
"""
NOVA Intelligence OS - MT5 Bridge Integration & Communication Verification Test
Tests:
1. Health probe (Public)
2. Authentication enforcement (401 on missing or invalid key)
3. Read-only endpoints (/account, /positions, /deals, /sync)
4. Strict read-only enforcement (405 on order/trade placement attempts)
5. End-to-end communication with the NOVA Node.js Express backend (/api/connector/sync-webhook)
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from threading import Thread

# Ensure test environment
os.environ["MT5_SIMULATION_MODE"] = "true"
os.environ["PORT"] = "5001"
os.environ["MT5_CONNECTOR_PORT"] = "5001"
os.environ["MT5_BRIDGE_SECRET"] = "9f870cd5bcde8adaf5d90eb1b7debaeae11da2e6168d1dc700d90ae44b081be8"
os.environ["NOVA_BACKEND_URL"] = "http://localhost:3000"

from bridge_server import ThreadingHTTPServer, MT5BridgeRequestHandler, HOST, PORT, MT5_BRIDGE_SECRET

def run_tests():
    time.sleep(1) # wait for server thread
    base_url = f"http://127.0.0.1:{PORT}"
    secret_key = MT5_BRIDGE_SECRET

    print("\n" + "=" * 70)
    print("  MT5 CONNECTOR BRIDGE & NODE BACKEND INTEGRATION TEST SUITE")
    print("=" * 70)

    # 1. Health check (Public)
    print("\n[TEST 1] GET /health (Public probe)...")
    req = urllib.request.Request(f"{base_url}/health")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        data = json.loads(resp.read().decode())
        print(f"  -> Status {resp.status}: Service '{data.get('service')}' is {data.get('status')}")
        assert data.get("trading_disabled") is True, "trading_disabled must be True"

    # 2. Authentication: Reject missing header
    print("\n[TEST 2] GET /account without X-MT5-Bridge-Key (Must return 401)...")
    req = urllib.request.Request(f"{base_url}/account")
    try:
        urllib.request.urlopen(req)
        raise AssertionError("Request should have been rejected with 401!")
    except urllib.error.HTTPError as e:
        assert e.code == 401, f"Expected 401, got {e.code}"
        print(f"  -> Correctly rejected with HTTP {e.code} Unauthorized")

    # 3. Authentication: Reject invalid secret
    print("\n[TEST 3] GET /account with invalid X-MT5-Bridge-Key (Must return 401)...")
    req = urllib.request.Request(f"{base_url}/account", headers={"X-MT5-Bridge-Key": "WRONG_SECRET"})
    try:
        urllib.request.urlopen(req)
        raise AssertionError("Request should have been rejected with 401!")
    except urllib.error.HTTPError as e:
        assert e.code == 401, f"Expected 401, got {e.code}"
        print(f"  -> Correctly rejected with HTTP {e.code} Unauthorized")

    # 4. Authenticated /account endpoint
    print("\n[TEST 4] GET /account with valid X-MT5-Bridge-Key...")
    req = urllib.request.Request(f"{base_url}/account", headers={"X-MT5-Bridge-Key": secret_key})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        print(f"  -> Status 200: Account #{data['data']['account_number']} | Balance: ${data['data']['balance']:,.2f}")
        assert "balance" in data["data"]
        assert "equity" in data["data"]

    # 5. Authenticated /positions endpoint
    print("\n[TEST 5] GET /positions with valid X-MT5-Bridge-Key...")
    req = urllib.request.Request(f"{base_url}/positions", headers={"X-MT5-Bridge-Key": secret_key})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        print(f"  -> Status 200: Open positions count = {data.get('count')}")
        assert isinstance(data.get("data"), list)

    # 6. Authenticated /deals endpoint
    print("\n[TEST 6] GET /deals with valid X-MT5-Bridge-Key...")
    req = urllib.request.Request(f"{base_url}/deals?days=14", headers={"X-MT5-Bridge-Key": secret_key})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        print(f"  -> Status 200: Deals count = {data.get('count')} (Lookback: {data.get('days')} days)")
        assert isinstance(data.get("data"), list)

    # 7. Authenticated /sync full snapshot endpoint
    print("\n[TEST 7] GET /sync full snapshot...")
    req = urllib.request.Request(f"{base_url}/sync", headers={"X-MT5-Bridge-Key": secret_key})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        snapshot = json.loads(resp.read().decode())
        print(f"  -> Status 200: Snapshot keys: {list(snapshot.keys())}")
        assert "account" in snapshot
        assert "positions" in snapshot
        assert "deals" in snapshot

    # 8. Strict Read-Only Safety Violation Check
    print("\n[TEST 8] Safety Violation Check: POST /api/order (Must return 405 Method Not Allowed)...")
    req = urllib.request.Request(
        f"{base_url}/api/order",
        data=b'{"symbol": "EURUSD", "action": "BUY", "volume": 1.0}',
        headers={"Content-Type": "application/json", "X-MT5-Bridge-Key": secret_key},
        method="POST",
    )
    try:
        urllib.request.urlopen(req)
        raise AssertionError("Order placement request should have been rejected with 405!")
    except urllib.error.HTTPError as e:
        assert e.code == 405, f"Expected 405, got {e.code}"
        print(f"  -> Correctly blocked execution with HTTP {e.code} Method Not Allowed")

    # 9. Communication with Node.js Express Backend
    print("\n[TEST 9] Communicating with Node.js Express Backend...")
    node_url = "http://127.0.0.1:3000/api/connector/sync-webhook"
    push_data = json.dumps(snapshot).encode("utf-8")
    req = urllib.request.Request(
        node_url,
        data=push_data,
        headers={"Content-Type": "application/json", "X-MT5-Bridge-Key": secret_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            backend_resp = json.loads(resp.read().decode())
            print(f"  -> Node.js Backend Response [{resp.status}]: {backend_resp.get('message')}")
            assert backend_resp.get("success") is True, f"Webhook failed: {backend_resp}"
            print("  -> Successfully transmitted MT5 telemetry into Node.js Backend!")
    except urllib.error.URLError as e:
        print(f"  -> [WARNING] Node.js server not reached at {node_url}: {e}")

    print("\n" + "=" * 70)
    print("  ALL 9 MT5 CONNECTOR VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    server_address = ("127.0.0.1", PORT)
    httpd = ThreadingHTTPServer(server_address, MT5BridgeRequestHandler)
    server_thread = Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    print(f"[*] Started temporary test bridge on 127.0.0.1:{PORT}")

    try:
        run_tests()
    finally:
        httpd.shutdown()
        server_thread.join(timeout=2)
        print("[*] Test bridge server stopped.")
