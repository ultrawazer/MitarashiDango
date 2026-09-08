# Mitarashi Dango

> An extensible, local-first anime media client and library manager.  
> **Lineage:** Forked and based on [Dango](https://github.com/serifpersia/dango) by [serifpersia](https://github.com/serifpersia).

---

## Overview

Mitarashi Dango extends the core Dango architecture with modularity, offline data performance, and self-hosted media server integration. It operates with a local-first philosophy: SQLite remains the single source of truth on your machine, with optional cloud replication and zero telemetry lock-in.

### Core Enhancements over Upstream
- **Mihon-Style Extensions:** Decoupled content scrapers loaded dynamically via remote or local repository manifests.
- **Shoko Server Integration:** Ingest and scrobble local collections mapped via AniDB and AniList IDs.
- **Offline Indexing Cache:** Embedded ID mapping layer allowing rapid MAL/AniList list imports without rate limits.
- **Theme Subsystem:** Runtime CSS variable generator with theme-aware SVG branding.
- **Enhanced Insights:** Extended progress analytics for local and tracked titles.

---

## Getting Started

### Requirements
- Node.js >= 22.5.0
- FFmpeg (optional, recommended for on-the-fly local audio/video remuxing)

### Setup
```bash
git clone https://github.com/ultrawazer/MitarashiDango.git
cd MitarashiDango
npm install
```

### Development & Execution
- **Dev Server:** `npm run dev` (orchestrates Vite frontend on :3000 and Express API on :3001)
- **Production Build:** `npm run build && npm start`
- **Helper Scripts:** Execute `./run.sh` (POSIX) or `run.bat` (Windows) for an interactive startup menu.

---

## Architecture & Workspaces

The repository is organized as an npm workspace:
- `client/` - Preact/React 19 single-page application bundled with Vite.
- `server/` - TypeScript Express server handling local SQLite data, Shoko connectivity, and extension lifecycles.
- `orchestrator.js` - Lightweight supervisor managing sub-processes and environment initialization.

### Storage Layout
Application databases and user settings persist outside the source tree:
- **Windows:** `%APPDATA%\dango`
- **Linux:** `~/.local/share/dango`
- **macOS:** `~/Library/Application Support/dango`

---

## Cloud Synchronization (Optional)

Local SQLite remains primary. Cloud replication options:
- **GitHub:** Device code OAuth storing private JSON snapshots.
- **Google Drive:** Application data directory storage.
- **Rclone:** User-configured cloud remotes (Dropbox, Mega, S3, WebDAV).

---

## Attribution & License

- Core codebase based on [Dango](https://github.com/serifpersia/dango) by [serifpersia](https://github.com/serifpersia).
- Extension architecture inspired by [Mihon](https://github.com/mihonapp/mihon).
- Distributed under the [MIT License](LICENSE).
