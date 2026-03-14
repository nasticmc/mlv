#!/usr/bin/env python3
"""
MeshCore Mesh Visualizer - Backend Server

Connects to a MeshCore radio node (via serial, TCP, or BLE) and streams
raw packets and state updates to connected WebSocket clients.  All received
packets are persisted in a local SQLite database so any client (or a
refreshed browser) receives the full packet history and reconstructs the
same graph as other connected clients.

Usage:
    # Serial connection (most common)
    python server.py --serial /dev/ttyUSB0

    # TCP connection
    python server.py --tcp 192.168.1.100:4000

    # BLE connection
    python server.py --ble 12:34:56:78:90:AB

    # Listen on all interfaces so other devices on your network can connect
    python server.py --serial /dev/ttyUSB0 --ws-host 0.0.0.0

    # Keep up to 5000 packets in history (default: 2000)
    python server.py --serial /dev/ttyUSB0 --max-packets 5000
"""

import argparse
import asyncio
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

import websockets
from websockets.server import WebSocketServerProtocol

from storage import init_db, load_recent_packets, load_state, prune_packets, save_state, store_packet

try:
    from meshcore import MeshCore
    from meshcore.events import EventType
except ImportError:
    print("ERROR: meshcore package not found. Install with: pip install meshcore", file=sys.stderr)
    sys.exit(1)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("mlv")

# Populated in main()
DB_PATH: Path = Path("data/visualizer.db")
MAX_PACKETS: int = 2000

# Global state
connected_clients: set[WebSocketServerProtocol] = set()
meshcore_instance: MeshCore | None = None
cached_state: dict[str, Any] = {
    "config": None,
    "contacts": [],
    "advert_paths": [],
}


async def broadcast(message: dict) -> None:
    """Send a message to all connected WebSocket clients."""
    if not connected_clients:
        return
    data = json.dumps(message)
    disconnected = set()
    for client in connected_clients:
        try:
            await client.send(data)
        except Exception:
            disconnected.add(client)
    connected_clients.difference_update(disconnected)


async def handle_client(websocket: WebSocketServerProtocol) -> None:
    """Handle a new WebSocket client connection."""
    connected_clients.add(websocket)
    addr = websocket.remote_address
    log.info(f"Client connected: {addr}")

    try:
        # 1. Send persisted state (contacts, config)
        await websocket.send(json.dumps({"type": "state_update", **cached_state}))

        # 2. Replay packet history so the client reconstructs the graph
        history = load_recent_packets(DB_PATH, MAX_PACKETS)
        if history:
            await websocket.send(json.dumps({"type": "history", "packets": history}))
            log.info(f"Sent {len(history)} historical packets to {addr}")

        # 3. Inform client whether radio is live
        if meshcore_instance is None:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Not connected to MeshCore radio",
            }))
        else:
            await websocket.send(json.dumps({
                "type": "connected",
                "message": "Connected to MeshCore radio",
            }))

        async for _ in websocket:
            pass  # No incoming messages expected from the frontend

    except websockets.exceptions.ConnectionClosedError:
        pass
    except Exception as e:
        log.warning(f"Client error: {e}")
    finally:
        connected_clients.discard(websocket)
        log.info(f"Client disconnected: {addr}")


# ---------------------------------------------------------------------------
# MeshCore helpers
# ---------------------------------------------------------------------------

def build_contact_dict(contact: Any) -> dict:
    return {
        "public_key": getattr(contact, "public_key", "") or "",
        "name": getattr(contact, "name", None),
        "type": getattr(contact, "type", 0) or 0,
        "flags": getattr(contact, "flags", 0) or 0,
        "last_path": getattr(contact, "last_path", None),
        "last_path_len": getattr(contact, "last_path_len", 0) or 0,
        "last_advert": getattr(contact, "last_advert", None),
        "lat": getattr(contact, "lat", None),
        "lon": getattr(contact, "lon", None),
        "last_seen": getattr(contact, "last_seen", None),
        "on_radio": bool(getattr(contact, "on_radio", False)),
    }


def build_config_dict(config: Any) -> dict:
    return {
        "public_key": getattr(config, "public_key", "") or "",
        "name": getattr(config, "name", "") or "",
        "lat": float(getattr(config, "lat", 0) or 0),
        "lon": float(getattr(config, "lon", 0) or 0),
        "tx_power": int(getattr(config, "tx_power", 0) or 0),
        "max_tx_power": int(getattr(config, "max_tx_power", 0) or 0),
        "path_hash_mode": int(getattr(config, "path_hash_mode", 0) or 0),
        "path_hash_mode_supported": bool(getattr(config, "path_hash_mode_supported", False)),
    }


async def refresh_state(mc: MeshCore) -> None:
    """Fetch contacts + config from the radio, persist, and broadcast."""
    try:
        result = await mc.commands.get_device_info()
        if result and result.payload:
            cached_state["config"] = build_config_dict(result.payload)
            save_state(DB_PATH, "config", cached_state["config"])
    except Exception as e:
        log.debug(f"Failed to get device info: {e}")

    try:
        result = await mc.commands.get_contacts()
        if result and result.payload:
            contacts_raw = result.payload
            if isinstance(contacts_raw, dict):
                contacts_list = list(contacts_raw.values())
            elif isinstance(contacts_raw, list):
                contacts_list = contacts_raw
            else:
                contacts_list = []
            cached_state["contacts"] = [build_contact_dict(c) for c in contacts_list]
            save_state(DB_PATH, "contacts", cached_state["contacts"])
    except Exception as e:
        log.debug(f"Failed to get contacts: {e}")

    await broadcast({"type": "state_update", **cached_state})


def _extract_hex(payload: Any) -> str:
    """Pull raw hex packet data out of a meshcore event payload."""
    if payload is None:
        return ""

    candidates = ("data", "raw", "payload")

    if isinstance(payload, dict):
        for key in candidates:
            raw = payload.get(key)
            if isinstance(raw, (bytes, bytearray)):
                return raw.hex()
            if isinstance(raw, str) and raw:
                return raw
        return ""

    for attr in candidates:
        raw = getattr(payload, attr, None)
        if raw is None:
            continue
        if isinstance(raw, (bytes, bytearray)):
            return raw.hex()
        if isinstance(raw, str) and raw:
            return raw
    return ""


def _extract_signal(payload: Any) -> tuple[float | None, float | None]:
    snr, rssi = None, None

    def _pick_value(name: str) -> Any:
        upper_name = name.upper()
        if isinstance(payload, dict):
            return payload.get(name, payload.get(upper_name))
        return getattr(payload, name, getattr(payload, upper_name, None))

    for name, slot in (("snr", "snr"), ("rssi", "rssi")):
        val = _pick_value(name)
        try:
            if slot == "snr":
                snr = float(val)
            else:
                rssi = float(val)
        except (TypeError, ValueError):
            pass
    return snr, rssi


async def _dispatch_packet(data_hex: str, payload_type: str, snr: float | None,
                           rssi: float | None, is_decrypted: bool,
                           decrypted_info: dict | None) -> None:
    """Persist and broadcast a single packet."""
    raw_packet: dict[str, Any] = {
        "timestamp": time.time(),
        "data": data_hex,
        "payload_type": payload_type,
        "snr": snr,
        "rssi": rssi,
        "decrypted": is_decrypted,
        "decrypted_info": decrypted_info,
    }
    # store_packet fills in the stable DB id
    packet = store_packet(DB_PATH, raw_packet)

    # Prune old rows (cheap: only runs a DELETE when we're over the limit)
    pruned = prune_packets(DB_PATH, MAX_PACKETS)
    if pruned:
        log.debug(f"Pruned {pruned} old packet(s) from DB")

    await broadcast({"type": "packet", "packet": packet})


async def on_raw_packet(event: Any) -> None:
    payload = event.payload if hasattr(event, "payload") else event
    data_hex = _extract_hex(payload)
    if not data_hex:
        return

    snr, rssi = _extract_signal(payload)

    is_decrypted = bool(getattr(payload, "decrypted", False))
    decrypted_info = None
    if is_decrypted:
        decrypted_info = {
            "channel_name": getattr(payload, "channel_name", None),
            "sender": getattr(payload, "sender", None),
            "channel_key": getattr(payload, "channel_key", None),
            "contact_key": getattr(payload, "contact_key", None),
        }

    payload_type = str(getattr(payload, "payload_type", "unknown") or "unknown")
    await _dispatch_packet(data_hex, payload_type, snr, rssi, is_decrypted, decrypted_info)


async def on_advertisement(event: Any) -> None:
    payload = event.payload if hasattr(event, "payload") else event
    data_hex = _extract_hex(payload)
    if not data_hex:
        return

    snr, rssi = _extract_signal(payload)
    await _dispatch_packet(data_hex, "advert", snr, rssi, False, None)

    # A new advert may mean a new contact appeared
    if meshcore_instance:
        asyncio.create_task(refresh_state(meshcore_instance))


# ---------------------------------------------------------------------------
# MeshCore connection
# ---------------------------------------------------------------------------

async def run_meshcore(args: argparse.Namespace) -> None:
    global meshcore_instance

    log.info("Connecting to MeshCore radio…")
    try:
        if args.serial:
            mc = await MeshCore.create_serial(args.serial, args.baud)
        elif args.tcp:
            host, _, port_str = args.tcp.rpartition(":")
            port = int(port_str) if port_str else 4000
            mc = await MeshCore.create_tcp(host or args.tcp, port, auto_reconnect=True)
        elif args.ble:
            mc = await MeshCore.create_ble(args.ble)
        else:
            log.error("No connection method specified.")
            return

        meshcore_instance = mc
        log.info("Connected to MeshCore radio!")

        try:
            mc.subscribe(EventType.RAW_DATA, lambda e: asyncio.create_task(on_raw_packet(e)))
        except AttributeError:
            log.debug("RAW_DATA event unavailable")

        try:
            mc.subscribe(EventType.ADVERTISEMENT, lambda e: asyncio.create_task(on_advertisement(e)))
        except AttributeError:
            pass

        try:
            mc.subscribe(EventType.RX_LOG_DATA, lambda e: asyncio.create_task(on_raw_packet(e)))
        except AttributeError:
            pass

        for event_name in ("PACKET_RECV", "MSG_RECV", "CONTACT_MSG_RECV", "CHANNEL_MSG_RECV"):
            event_type = getattr(EventType, event_name, None)
            if event_type:
                try:
                    mc.subscribe(event_type, lambda e: asyncio.create_task(on_raw_packet(e)))
                except Exception:
                    pass

        await refresh_state(mc)

        async def periodic_refresh():
            while True:
                await asyncio.sleep(30)
                if meshcore_instance:
                    await refresh_state(meshcore_instance)

        asyncio.create_task(periodic_refresh())
        await broadcast({"type": "connected", "message": "Connected to MeshCore radio"})
        log.info("Listening for packets…")

    except Exception as e:
        log.error(f"Failed to connect to MeshCore: {e}")
        await broadcast({"type": "error", "message": f"Failed to connect: {e}"})
        meshcore_instance = None


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main(args: argparse.Namespace) -> None:
    global DB_PATH, MAX_PACKETS, cached_state

    DB_PATH = Path(args.data_dir) / "visualizer.db"
    MAX_PACKETS = args.max_packets

    # Initialise DB and restore persisted state
    init_db(DB_PATH)
    cached_state["config"] = load_state(DB_PATH, "config")
    cached_state["contacts"] = load_state(DB_PATH, "contacts", default=[])
    log.info(f"Database: {DB_PATH} ({len(load_recent_packets(DB_PATH, MAX_PACKETS))} packets stored)")

    log.info(f"Starting WebSocket server on {args.ws_host}:{args.ws_port}")
    server = await websockets.serve(handle_client, args.ws_host, args.ws_port)

    hint = "0.0.0.0" if args.ws_host in ("0.0.0.0", "") else args.ws_host
    log.info(f"WebSocket ready — ws://{hint}:{args.ws_port}")
    log.info("Serve the frontend build (npm run build) with any static file server,")
    log.info("or run `npm run dev` in the frontend/ directory for development.")

    if args.serial or args.tcp or args.ble:
        asyncio.create_task(run_meshcore(args))
    else:
        log.warning("No radio connection specified — clients will receive stored history only.")
        log.warning("Use --serial PORT, --tcp HOST:PORT, or --ble ADDRESS to stream live packets.")

    await server.wait_closed()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="MeshCore Mesh Visualizer Backend",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    conn = parser.add_mutually_exclusive_group()
    conn.add_argument("--serial", "-s", metavar="PORT",
                      help="Serial port (e.g. /dev/ttyUSB0 or COM3)")
    conn.add_argument("--tcp", "-t", metavar="HOST:PORT",
                      help="TCP address (e.g. 192.168.1.100:4000)")
    conn.add_argument("--ble", "-b", metavar="ADDRESS",
                      help="BLE MAC address (e.g. 12:34:56:78:90:AB)")

    parser.add_argument("--baud", type=int, default=115200,
                        help="Serial baud rate (default: 115200)")
    parser.add_argument("--ws-host", default="0.0.0.0",
                        help="WebSocket bind address (default: 0.0.0.0 — all interfaces)")
    parser.add_argument("--ws-port", type=int, default=8765,
                        help="WebSocket port (default: 8765)")
    parser.add_argument("--data-dir", default="data",
                        help="Directory for the SQLite database (default: data/)")
    parser.add_argument("--max-packets", type=int, default=2000,
                        help="Maximum packets to keep in history (default: 2000)")
    parser.add_argument("--debug", action="store_true",
                        help="Enable debug logging")

    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    try:
        asyncio.run(main(args))
    except KeyboardInterrupt:
        log.info("Shutting down…")
