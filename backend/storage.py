"""
SQLite persistence for the MeshCore Mesh Visualizer.

Stores raw packets and key-value state (contacts, config) so the
visualization can be reconstructed across restarts and by new clients.
"""

import json
import sqlite3
from pathlib import Path
from typing import Any


def init_db(db_path: Path) -> None:
    """Create tables if they don't exist."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS packets (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   REAL    NOT NULL,
                data        TEXT    NOT NULL,
                payload_type TEXT,
                snr         REAL,
                rssi        REAL,
                decrypted   INTEGER DEFAULT 0,
                decrypted_info TEXT,
                created_at  REAL    DEFAULT (unixepoch('subsec'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS kv (
                key         TEXT    PRIMARY KEY,
                value       TEXT    NOT NULL,
                updated_at  REAL    DEFAULT (unixepoch('subsec'))
            )
        """)
        conn.commit()


def store_packet(db_path: Path, packet: dict[str, Any]) -> dict[str, Any]:
    """
    Persist a packet and return it with its stable DB row id filled in.
    The returned packet has `id` and `observation_id` both set to the row id.
    """
    decrypted_info_json = (
        json.dumps(packet.get("decrypted_info")) if packet.get("decrypted_info") else None
    )
    with sqlite3.connect(db_path) as conn:
        cur = conn.execute(
            """
            INSERT INTO packets (timestamp, data, payload_type, snr, rssi, decrypted, decrypted_info)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                packet["timestamp"],
                packet["data"],
                packet.get("payload_type", "unknown"),
                packet.get("snr"),
                packet.get("rssi"),
                int(bool(packet.get("decrypted", False))),
                decrypted_info_json,
            ),
        )
        row_id = cur.lastrowid
        conn.commit()

    packet = dict(packet)
    packet["id"] = row_id
    packet["observation_id"] = row_id
    return packet


def prune_packets(db_path: Path, max_packets: int) -> int:
    """Delete oldest packets beyond max_packets. Returns number deleted."""
    with sqlite3.connect(db_path) as conn:
        cur = conn.execute("SELECT COUNT(*) FROM packets")
        count = cur.fetchone()[0]
        if count <= max_packets:
            return 0
        to_delete = count - max_packets
        conn.execute(
            """
            DELETE FROM packets WHERE id IN (
                SELECT id FROM packets ORDER BY id ASC LIMIT ?
            )
            """,
            (to_delete,),
        )
        conn.commit()
        return to_delete


def load_recent_packets(db_path: Path, limit: int) -> list[dict[str, Any]]:
    """Load the most recent `limit` packets, oldest-first (ready to replay)."""
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(
            """
            SELECT id, timestamp, data, payload_type, snr, rssi, decrypted, decrypted_info
            FROM packets
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()

    # Reverse so we replay oldest-first
    result = []
    for row in reversed(rows):
        decrypted_info = None
        if row["decrypted_info"]:
            try:
                decrypted_info = json.loads(row["decrypted_info"])
            except Exception:
                pass
        result.append({
            "id": row["id"],
            "observation_id": row["id"],
            "timestamp": row["timestamp"],
            "data": row["data"],
            "payload_type": row["payload_type"] or "unknown",
            "snr": row["snr"],
            "rssi": row["rssi"],
            "decrypted": bool(row["decrypted"]),
            "decrypted_info": decrypted_info,
        })
    return result


def save_state(db_path: Path, key: str, value: Any) -> None:
    """Upsert a JSON-serializable value under `key`."""
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, unixepoch('subsec')) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, json.dumps(value)),
        )
        conn.commit()


def load_state(db_path: Path, key: str, default: Any = None) -> Any:
    """Load a previously saved value, or return `default` if not found."""
    with sqlite3.connect(db_path) as conn:
        cur = conn.execute("SELECT value FROM kv WHERE key = ?", (key,))
        row = cur.fetchone()
    if row is None:
        return default
    try:
        return json.loads(row[0])
    except Exception:
        return default
