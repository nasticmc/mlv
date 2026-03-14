#!/usr/bin/env python3
"""
MeshCore Mesh Visualizer - Backend Server

Connects to a MeshCore radio node (via serial, TCP, or BLE) and streams
raw packets and state updates to connected WebSocket clients.

Usage:
    # Serial connection (most common)
    python server.py --serial /dev/ttyUSB0

    # TCP connection
    python server.py --tcp 192.168.1.100:4000

    # BLE connection
    python server.py --ble 12:34:56:78:90:AB

    # Custom WebSocket port
    python server.py --serial /dev/ttyUSB0 --ws-port 8765

    # With TNC/serial baud rate
    python server.py --serial /dev/ttyUSB0 --baud 115200
"""

import argparse
import asyncio
import json
import logging
import sys
import time
from typing import Any

import websockets
from websockets.server import WebSocketServerProtocol

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

# Global state
connected_clients: set[WebSocketServerProtocol] = set()
meshcore_instance: MeshCore | None = None
cached_state: dict[str, Any] = {
    "config": None,
    "contacts": [],
    "advert_paths": [],
}
packet_counter = 0


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


async def send_state(client: WebSocketServerProtocol) -> None:
    """Send the current state to a newly connected client."""
    await client.send(json.dumps({
        "type": "state_update",
        **cached_state,
    }))


async def handle_client(websocket: WebSocketServerProtocol) -> None:
    """Handle a new WebSocket client connection."""
    connected_clients.add(websocket)
    addr = websocket.remote_address
    log.info(f"Client connected: {addr}")

    try:
        # Send current state immediately
        await send_state(websocket)

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

        # Keep connection alive until client disconnects
        async for _ in websocket:
            pass  # We don't process incoming messages from the frontend

    except websockets.exceptions.ConnectionClosedError:
        pass
    except Exception as e:
        log.warning(f"Client error: {e}")
    finally:
        connected_clients.discard(websocket)
        log.info(f"Client disconnected: {addr}")


def build_contact_dict(contact: Any) -> dict:
    """Convert a meshcore contact object to a JSON-serializable dict."""
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
    """Convert a meshcore config/self-info object to a JSON-serializable dict."""
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
    """Fetch and cache current contacts and config from the radio."""
    global cached_state

    try:
        # Get self info / config
        result = await mc.commands.get_device_info()
        if result and result.payload:
            cached_state["config"] = build_config_dict(result.payload)
    except Exception as e:
        log.debug(f"Failed to get device info: {e}")

    try:
        # Get contacts
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
    except Exception as e:
        log.debug(f"Failed to get contacts: {e}")

    # Broadcast updated state to all clients
    await broadcast({"type": "state_update", **cached_state})


async def on_raw_packet(event: Any) -> None:
    """Handle a raw packet event from MeshCore."""
    global packet_counter
    packet_counter += 1

    payload = event.payload if hasattr(event, "payload") else event
    now = time.time()

    # Extract packet data - the meshcore library provides raw hex data
    data_hex = ""
    if hasattr(payload, "data"):
        raw = payload.data
        if isinstance(raw, (bytes, bytearray)):
            data_hex = raw.hex()
        elif isinstance(raw, str):
            data_hex = raw
    elif hasattr(payload, "raw"):
        raw = payload.raw
        if isinstance(raw, (bytes, bytearray)):
            data_hex = raw.hex()
        elif isinstance(raw, str):
            data_hex = raw

    if not data_hex:
        return

    snr = None
    rssi = None
    if hasattr(payload, "snr"):
        try:
            snr = float(payload.snr)
        except (TypeError, ValueError):
            pass
    if hasattr(payload, "rssi"):
        try:
            rssi = float(payload.rssi)
        except (TypeError, ValueError):
            pass

    # Build decrypted_info if we have context
    decrypted_info = None
    is_decrypted = False
    if hasattr(payload, "decrypted") and payload.decrypted:
        is_decrypted = True
        decrypted_info = {
            "channel_name": getattr(payload, "channel_name", None),
            "sender": getattr(payload, "sender", None),
            "channel_key": getattr(payload, "channel_key", None),
            "contact_key": getattr(payload, "contact_key", None),
        }

    packet = {
        "id": packet_counter,
        "observation_id": packet_counter,
        "timestamp": now,
        "data": data_hex,
        "payload_type": getattr(payload, "payload_type", "unknown") or "unknown",
        "snr": snr,
        "rssi": rssi,
        "decrypted": is_decrypted,
        "decrypted_info": decrypted_info,
    }

    await broadcast({"type": "packet", "packet": packet})


async def on_advertisement(event: Any) -> None:
    """Handle advertisement events - these also carry routing path info."""
    payload = event.payload if hasattr(event, "payload") else event
    global packet_counter
    packet_counter += 1

    data_hex = ""
    if hasattr(payload, "data"):
        raw = payload.data
        if isinstance(raw, (bytes, bytearray)):
            data_hex = raw.hex()
        elif isinstance(raw, str):
            data_hex = raw

    if not data_hex:
        return

    snr = None
    rssi = None
    if hasattr(payload, "snr"):
        try:
            snr = float(payload.snr)
        except (TypeError, ValueError):
            pass
    if hasattr(payload, "rssi"):
        try:
            rssi = float(payload.rssi)
        except (TypeError, ValueError):
            pass

    packet = {
        "id": packet_counter,
        "observation_id": packet_counter,
        "timestamp": time.time(),
        "data": data_hex,
        "payload_type": "advert",
        "snr": snr,
        "rssi": rssi,
        "decrypted": False,
        "decrypted_info": None,
    }

    await broadcast({"type": "packet", "packet": packet})

    # After an advertisement, refresh contacts (new node might have appeared)
    if meshcore_instance:
        asyncio.create_task(refresh_state(meshcore_instance))


async def run_meshcore(args: argparse.Namespace) -> None:
    """Connect to MeshCore and set up event subscriptions."""
    global meshcore_instance

    log.info("Connecting to MeshCore radio...")

    try:
        if args.serial:
            mc = await MeshCore.create_serial(args.serial, args.baud)
        elif args.tcp:
            host, _, port_str = args.tcp.rpartition(":")
            port = int(port_str) if port_str else 4000
            if not host:
                host = args.tcp
                port = 4000
            mc = await MeshCore.create_tcp(host, port, auto_reconnect=True)
        elif args.ble:
            mc = await MeshCore.create_ble(args.ble)
        else:
            log.error("No connection method specified. Use --serial, --tcp, or --ble")
            return

        meshcore_instance = mc
        log.info("Connected to MeshCore radio!")

        # Subscribe to packet events
        try:
            mc.subscribe(EventType.RAW_DATA, lambda e: asyncio.create_task(on_raw_packet(e)))
        except AttributeError:
            log.debug("RAW_DATA event type not available, trying alternative events")

        try:
            mc.subscribe(EventType.ADVERTISEMENT, lambda e: asyncio.create_task(on_advertisement(e)))
        except AttributeError:
            pass

        # Try subscribing to all packet-carrying events
        for event_name in ["PACKET_RECV", "MSG_RECV", "CONTACT_MSG_RECV", "CHANNEL_MSG_RECV"]:
            try:
                event_type = getattr(EventType, event_name, None)
                if event_type:
                    mc.subscribe(event_type, lambda e: asyncio.create_task(on_raw_packet(e)))
            except Exception:
                pass

        # Initial state fetch
        await refresh_state(mc)

        # Periodic state refresh (contacts can change)
        async def periodic_refresh():
            while True:
                await asyncio.sleep(30)
                if meshcore_instance:
                    await refresh_state(meshcore_instance)

        asyncio.create_task(periodic_refresh())

        # Notify connected clients
        await broadcast({"type": "connected", "message": "Connected to MeshCore radio"})

        log.info("Listening for packets...")

    except Exception as e:
        log.error(f"Failed to connect to MeshCore: {e}")
        await broadcast({"type": "error", "message": f"Failed to connect: {e}"})
        meshcore_instance = None


async def main(args: argparse.Namespace) -> None:
    """Main entry point."""
    ws_host = args.ws_host
    ws_port = args.ws_port

    log.info(f"Starting WebSocket server on {ws_host}:{ws_port}")

    # Start WebSocket server
    server = await websockets.serve(handle_client, ws_host, ws_port)
    log.info(f"WebSocket server ready at ws://{ws_host}:{ws_port}")
    log.info("Open the frontend at http://localhost:5173 (or wherever Vite serves it)")

    # Connect to MeshCore (non-blocking - clients can connect while we're connecting)
    if args.serial or args.tcp or args.ble:
        asyncio.create_task(run_meshcore(args))
    else:
        log.warning("No MeshCore connection specified. Clients can connect but won't receive packets.")
        log.warning("Use --serial PORT, --tcp HOST:PORT, or --ble ADDRESS to connect to a radio.")

    await server.wait_closed()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="MeshCore Mesh Visualizer Backend",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    conn_group = parser.add_mutually_exclusive_group()
    conn_group.add_argument(
        "--serial", "-s",
        metavar="PORT",
        help="Serial port to connect to (e.g. /dev/ttyUSB0 or COM3)",
    )
    conn_group.add_argument(
        "--tcp", "-t",
        metavar="HOST:PORT",
        help="TCP address to connect to (e.g. 192.168.1.100:4000)",
    )
    conn_group.add_argument(
        "--ble", "-b",
        metavar="ADDRESS",
        help="BLE MAC address to connect to (e.g. 12:34:56:78:90:AB)",
    )

    parser.add_argument(
        "--baud",
        type=int,
        default=115200,
        help="Serial baud rate (default: 115200)",
    )
    parser.add_argument(
        "--ws-host",
        default="localhost",
        help="WebSocket server host (default: localhost)",
    )
    parser.add_argument(
        "--ws-port",
        type=int,
        default=8765,
        help="WebSocket server port (default: 8765)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )

    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    try:
        asyncio.run(main(args))
    except KeyboardInterrupt:
        log.info("Shutting down...")
