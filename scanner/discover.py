"""8초 동안 주변 BLE를 스캔해서 FSC-BP106 광고 데이터를 덤프한다 (매핑 확인용)."""
import asyncio

from bleak import BleakScanner


async def main():
    seen = {}

    def on_adv(device, adv):
        name = adv.local_name or device.name or ""
        sd = {k: v.hex() for k, v in adv.service_data.items()}
        md = {k: v.hex() for k, v in adv.manufacturer_data.items()}
        if "BP106" in name or any("feaa" in k or "fff0" in k for k in sd):
            seen[device.address] = (name, adv.rssi, sd, md)

    async with BleakScanner(on_adv):
        await asyncio.sleep(8)

    for addr, (name, rssi, sd, md) in seen.items():
        print(addr, name, rssi)
        for k, v in sd.items():
            print("   svc", k, v)
        for k, v in md.items():
            print("   mfr", k, v)
    print(f"{len(seen)} device(s)")


asyncio.run(main())
