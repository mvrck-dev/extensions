# Meteor

A full-featured download manager for Raycast, powered by [aria2](https://aria2.github.io/) — the open-source lightweight multi-protocol download utility.

---

## Features

- **Unified Task Dashboard** — view all active, waiting, paused, completed, and failed downloads in one flat list
- **Add Downloads** — queue URLs (HTTP/HTTPS/FTP), Magnet links, and direct file links; supports multi-connection splitting and custom headers
- **Torrent Support** — load local `.torrent` files directly from Finder (auto-detects selected file) and queue them in aria2
- **Visual Chunk Progress** — open any active download to see a live piece-map grid showing exactly which chunks have been downloaded, exactly as aria2 reports them
- **Configuration** — set default download directory, bandwidth limits (up/down), BitTorrent seed ratio/time, connection limits, and mock User-Agent — all without leaving Raycast
- **Session Persistence** — download queue survives daemon restarts and configuration changes; aria2 session is auto-saved every 10 seconds
- **Dynamic Remove/Delete** — optionally configure the extension to delete the downloaded file from disk when removing a task

---

## Requirements

### Option A — Bundled Binary (recommended, zero setup)

The extension ships with a bundled `aria2c` binary for both Apple Silicon (`arm64`) and Intel (`x64`) Macs. No installation needed.

### Option B — System Homebrew

If you prefer to manage aria2 yourself:

```bash
brew install aria2
```

The extension will automatically find it at `/opt/homebrew/bin/aria2c` or `/usr/local/bin/aria2c`.

---

## Configuration

### Extension Preferences (Raycast Settings)

| Setting | Default | Description |
|---|---|---|
| **Aria2 RPC Port** | `6800` | Port for the aria2 JSON-RPC server |
| **RPC Secret Token** | _(empty)_ | Optional secret for authenticated RPC access |
| **Auto-Start Daemon** | On | Automatically launch a local aria2c daemon if none is running |
| **Verify SSL Certificates** | Off | Enable to enforce HTTPS certificate validation |

### In-App Configuration (Configuration command)

Open the **Configuration** command from Raycast to set:

- Default download directory
- Download and upload bandwidth limits
- BitTorrent save-metadata, encryption, seeding behaviour
- Maximum concurrent downloads and connections per server
- Mock User-Agent (presets: Chrome, Aria2, Transmission, Wget)
- Protocol defaults for Magnet and Thunder links
- File deletion behaviour when removing tasks

---

## Usage

### Tasks

Open **Tasks** to see your full download queue. Use the action panel (`Cmd+K`) to:

- Pause / Resume individual downloads
- Remove or Delete tasks
- Reveal completed files in Finder
- Copy source URLs
- Pause All / Resume All / Clear History globally

### Add Download

Open **Add Download** and paste one or more URLs (one per line). Choose a save directory, number of connection splits, optional rename, and advanced curl-style options (User-Agent, Referer, Cookie, Authorization, Proxy).

### Download from Torrent

Select a `.torrent` file in Finder, then open **Download from Torrent**. The file path is pre-filled automatically. Choose your save directory and confirm.

### Configuration

Open **Configuration** to adjust download limits, BitTorrent behaviour, and other daemon settings. Changes are applied immediately — the daemon restarts in the background if needed, preserving your entire task queue via session files.

---

## Remote Aria2 Instance

The extension can also connect to a remote aria2 daemon. Set the **Aria2 RPC Port** and **RPC Secret Token** in preferences, and disable **Auto-Start Daemon** so the extension doesn't try to spawn a local one.

---

## Contributing

Issues and PRs welcome at [github.com/mvrck-dev/meteor](https://github.com/mvrck-dev/meteor).
