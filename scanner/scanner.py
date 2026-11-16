"""노트북을 G1 대신 게이트로 쓰는 백업 스캐너.

맥 블루투스로 FSC-BP106을 듣고 1초마다 G1과 같은 JSON-LONG 형식으로 g1-ingest에 POST한다.
macOS는 BLE MAC을 숨기므로(기기마다 UUID로 보임) Feasycom 정보 프레임(0xFFF0)에 실린 MAC을 찾아 매핑한다.
못 찾으면 macOS UUID를 그대로 mac 자리에 보낸다 → 대시보드 원본 데이터에서 보고 products.mac에 등록하면 된다.

실행: .venv/bin/python scanner.py
"""
import asyncio
import json
import time
import urllib.request

from bleak import BleakScanner
from bleak.backends.corebluetooth.CentralManagerDelegate import CentralManagerDelegate


# bleak은 macOS에서 중복 광고를 묶어서(AllowDuplicates=False) 가끔만 알려준다.
# 비콘 RSSI를 1초 단위로 받으려면 중복 허용으로 스캔해야 한다.
async def _start_scan_allow_dupes(self, service_uuids):
    self.central_manager.scanForPeripheralsWithServices_options_(None, {"kCBScanOptionAllowDuplicates": True})


CentralManagerDelegate.start_scan = _start_scan_allow_dupes

SUPABASE = "https://hnnsiqgiibqgiyskdxyj.supabase.co"
ANON = "sb_publishable_ylnOekVqABfCQRtqlPL-lg_tOPEOHLF"
INGEST = f"{SUPABASE}/functions/v1/g1-ingest?key=postic"
FRESH_SEC = 8  # 이 시간 안에 들린 비콘만 업로드 (BP106 기본 송출 1.3초 + 맥 스캔 누락 감안)


def load_known_macs() -> dict[str, str]:
    req = urllib.request.Request(
        f"{SUPABASE}/rest/v1/products?select=name,mac&mac=not.is.null",
        headers={"apikey": ANON, "Authorization": f"Bearer {ANON}"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return {p["mac"].upper(): p["name"] for p in json.load(r)}


def find_mac(blob: str, known: dict[str, str]) -> str | None:
    """광고 데이터 hex 안에서 등록된 MAC을 찾는다 (정순/역순 둘 다)."""
    for mac in known:
        rev = "".join(reversed([mac[i : i + 2] for i in range(0, 12, 2)]))
        if mac in blob or rev in blob:
            return mac
    return None


async def main():
    known = load_known_macs()
    print("등록된 비콘:", ", ".join(f"{m}({n})" for m, n in known.items()))
    uuid_to_mac: dict[str, str] = {}
    last: dict[str, dict] = {}

    def on_adv(device, adv):
        name = adv.local_name or device.name or ""
        blobs = [v.hex().upper() for v in adv.service_data.values()]
        blobs += [v.hex().upper() for v in adv.manufacturer_data.values()]
        blob = "".join(blobs)
        is_feasy = "BP106" in name or any("fff0" in k or "feaa" in k for k in adv.service_data)
        mac = uuid_to_mac.get(device.address) or find_mac(blob, known)
        if mac:
            uuid_to_mac[device.address] = mac
        elif not is_feasy:
            return
        key = mac or device.address.replace("-", "").upper()
        prev = last.get(key)
        rssi = adv.rssi if not prev or time.time() - prev["t"] > 0.5 else max(adv.rssi, prev["rssi"])
        last[key] = {"mac": key, "rssi": rssi, "name": name, "t": time.time(), "mapped": bool(mac)}

    async with BleakScanner(on_adv):
        print("스캔 시작 (Ctrl+C로 종료)")
        while True:
            await asyncio.sleep(1)
            now = time.time()
            fresh = [v for v in last.values() if now - v["t"] <= FRESH_SEC]
            body = [{"type": "Gateway", "mac": "MACBOOK-SCANNER"}] + [
                {"type": "Unknown", "mac": v["mac"], "rssi": v["rssi"], "bleName": v["name"], "gateway": "LAPTOP-GW"}
                for v in fresh
            ]
            try:
                req = urllib.request.Request(
                    INGEST, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST"
                )
                with urllib.request.urlopen(req, timeout=5) as r:
                    res = json.load(r)
            except Exception as e:  # 네트워크 끊김 등: 다음 주기에 재시도
                res = {"error": str(e)}
            line = "  ".join(f"{known.get(v['mac'], v['mac'][:8])} {v['rssi']}dBm{'' if v['mapped'] else '(미등록)'}" for v in fresh)
            print(time.strftime("%H:%M:%S"), f"감지 {len(fresh)}개 → 서버 accepted={res.get('accepted', res)} |", line)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
