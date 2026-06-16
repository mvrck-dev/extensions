# Changelog

## [1.0.0] - 2026-06-16

### Added

- **Tasks** command: unified dashboard showing active, waiting, paused, completed, and errored downloads in a flat list
- **Add Download** command: queue URLs, Magnet links, and direct HTTP/FTP links with multi-connection splitting, rename, and advanced curl-style options (User-Agent, Referer, Cookie, Authorization, Proxy)
- **Download from Torrent** command: auto-detects selected `.torrent` file in Finder, queues torrent downloads via base64 RPC upload
- **Configuration** command: in-Raycast form for default download path, bandwidth limits, BitTorrent settings, connection limits, User-Agent presets, and protocol defaults
- **Visual chunk progress**: live piece-map grid in the task detail view showing exact download chunk state as reported by aria2's bitfield API
- **Session persistence**: aria2 session file saved every 10 seconds; task queue survives daemon restarts and configuration changes
- **Dynamic Remove/Delete**: optional setting to delete the downloaded file from disk when removing a task from the queue
- **Daemon auto-start**: bundles `aria2c` binaries for arm64 and x64 macOS; auto-starts a local daemon with correct configuration on first use
- **Config mismatch detection**: detects when running daemon settings differ from current preferences and cleanly restarts the daemon to apply changes
- **SSL certificate toggle**: preference to disable HTTPS certificate verification for servers with self-signed or untrusted certificates
