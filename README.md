# MeshCore Mesh Visualizer

A real-time 3D mesh network visualizer for MeshCore radio nodes. Displays your local mesh topology as an interactive 3D graph, showing nodes, links, and animated packet flows.

Based on the visualization engine from [Remote Terminal for MeshCore](https://github.com/jkingsman/Remote-Terminal-for-MeshCore).

## Features

- **3D interactive visualization** — rotate, zoom, and pan the mesh graph
- **Live packet animation** — colored particles travel along links showing packet type and direction
- **Node identification** — nodes labelled by name; ambiguous repeaters handled gracefully
- **Click-to-inspect** — click any node to highlight its neighbors and see details
- **Configurable** — control repulsion, particle speed, observation window, stale node pruning, and more
- **WebSocket-based** — frontend connects to a local backend over WebSocket

## Architecture

```
MeshCore Radio
      │ (serial / TCP / BLE)
      ▼
backend/server.py  ──── WebSocket (ws://localhost:8765) ────►  frontend (React + Three.js)
```

## Setup

### Docker Compose

Run both frontend and backend with Docker:

```bash
docker compose up --build
```

The app will be available at http://localhost:8080 and the backend WebSocket at
`ws://localhost:8765`.

By default the backend starts without a live radio connection (history-only mode).
To pass MeshCore connection arguments, set `MESH_ARGS`:

```bash
# Serial
MESH_ARGS="--serial /dev/ttyUSB0" docker compose up --build

# TCP
MESH_ARGS="--tcp 192.168.1.100:4000" docker compose up --build

# BLE
MESH_ARGS="--ble 12:34:56:78:90:AB" docker compose up --build
```

If using serial devices, also pass device mappings (for example via
`docker compose run --device=/dev/ttyUSB0 ...`) depending on your platform.

### Backend

```bash
cd backend
pip install -r requirements.txt

# Connect via serial port
python server.py --serial /dev/ttyUSB0

# Connect via TCP
python server.py --tcp 192.168.1.100:4000

# Connect via BLE
python server.py --ble 12:34:56:78:90:AB

# Custom WebSocket port
python server.py --serial /dev/ttyUSB0 --ws-port 8765
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, enter the WebSocket URL (`ws://localhost:8765` by default), and click **Connect**.

### Production build

```bash
cd frontend
npm run build
# Serve the dist/ folder with any static file server
```

## Packet Types

| Label | Color  | Type              |
|-------|--------|-------------------|
| AD    | Amber  | Advertisement     |
| GT    | Cyan   | Group Text        |
| DM    | Purple | Direct Message    |
| ACK   | Green  | Acknowledgment    |
| TR    | Orange | Trace             |
| RQ    | Pink   | Request           |
| RS    | Teal   | Response          |
| ?     | Gray   | Other/Unknown     |

## Node Types

| Color | Type     |
|-------|----------|
| Green | Self (you) |
| Blue  | Repeater |
| White | Client   |
| Gray  | Ambiguous (prefix collision) |

## Controls

- **Drag** — rotate the 3D view
- **Scroll** — zoom in/out
- **Click node** — pin tooltip, highlight neighbors
- **Show controls** — toggle the legend and settings panel
- **Oooh Big Stretch!** — expand nodes apart to untangle the graph
- **Clear & Reset** — clear all visualization state

## Backend CLI Options

```
--serial PORT       Serial port (e.g. /dev/ttyUSB0, COM3)
--tcp HOST:PORT     TCP address (e.g. 192.168.1.100:4000)
--ble ADDRESS       BLE MAC address
--baud RATE         Serial baud rate (default: 115200)
--ws-host HOST      WebSocket host (default: localhost)
--ws-port PORT      WebSocket port (default: 8765)
--debug             Enable debug logging
```
