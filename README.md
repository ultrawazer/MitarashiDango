# Mitarashi Dango

> An extensible, local-first anime media client, library manager, and self-hosted streaming hub.  
> **Lineage:** Forked and evolved from [Dango](https://github.com/serifpersia/dango) by [serifpersia](https://github.com/serifpersia).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.5.0-brightgreen.svg)](https://nodejs.org/)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io%2Fultrawazer%2Fmitarashidango-blue.svg)](https://github.com/ultrawazer/Dando_Docker)

---

## Overview

**Mitarashi Dango** extends the core Dango architecture with true modularity, high-performance offline indexing, self-hosted media server integration, and automated anti-bot clearance. It is designed around a **local-first philosophy**: your local SQLite database is the single source of truth on your machine, backed by optional cloud replication and zero telemetry.

Unlike traditional monolithic clients that bake scraping logic into their core servers, Mitarashi Dango decouples content providers into a dynamic, repository-driven extension ecosystem inspired by [Mihon](https://github.com/mihonapp/mihon).

### Core Enhancements & Additions
- **Mihon-Style Modular Extensions**: Decoupled content scrapers loaded dynamically via remote repository manifests or local file drops, complete with an in-app extension manager and 1-click updates.
- **Automated Anti-Bot Clearance (FlareSolverr)**: Automated background solving of Cloudflare anti-bot challenges and clearance cookie (`cf_clearance` + User-Agent) caching for transparent streaming without 403 blocks.
- **Shoko Server Integration**: Stream self-hosted anime libraries via Shoko's Virtual File System (VFS), with AniDB-AniList cross-referencing, dynamic dual-audio and subtitle switching, and two-way watch status scrobbling.
- **Hardware-Accelerated Remuxing (FFmpeg)**: Instant, zero-CPU stream-copy remuxing (MKV &rarr; fMP4) with Intel QuickSync (`vaapi`), AMD GPU, and NVIDIA (`nvenc`) acceleration.
- **Offline Indexing Cache**: Embedded AniDB, AniList, and MAL cross-reference database allowing massive library imports in seconds with zero third-party rate limits.
- **Docker & Unraid Ecosystem**: Official Unraid templates, `su-exec` PUID/PGID user mapping, GPU passthrough (`/dev/dri`), and companion FlareSolverr stack via [`MitarashiDango_Docker`](https://github.com/ultrawazer/MitarashiDango_Docker).
- **Dynamic Theme Engine**: Runtime CSS variable generator, theme-aware dynamic SVG branding and logo generation, and AniPredict theme styling.
- **Enhanced Insights & Analytics**: Extended watch analytics and progress metrics for both streaming and local library titles.

---

## Core Features

### Mihon-Style Modular Extensions
Scrapers and content providers no longer live in the core server codebase. Instead, they operate as dynamic modules:
- **Repository-Driven**: Add community or custom extension repositories by URL (manifest-based via `index.min.json`).
- **In-App Management**: Search, install, uninstall, enable/disable, and configure extension-specific settings in **Settings &rarr; Extensions**.
- **Update Notifications & 1-Click Upgrades**: Automatically detects when a newer extension version is released in a configured repository and allows updating with a single click.
- **Local Development**: Drop local `.js` extension bundles into the persistent extensions folder for custom testing.

### Automated FlareSolverr Integration
Bypass Cloudflare anti-bot checks and extract clearance cookies automatically:
- **Background Challenge Solving**: When an extension encounters a 403 `AUTH_REQUIRED` block, Mitarashi Dango invokes FlareSolverr to solve the challenge, caches the `cf_clearance` cookie and matching `User-Agent` for 2 hours, and retries the request transparently.
- **UI & Environment Configurable**: Easily toggle on/off, configure host URL and port in **Settings &rarr; General**, or configure via environment variables (`FLARESOLVERR_ENABLED`, `FLARESOLVERR_URL`, `FLARESOLVERR_PORT`).
- **Live Diagnostics**: Includes a "Test Connection" tool in the WebUI with real-time latency and version reporting.
- **Graceful Fallback**: If FlareSolverr is disabled, the standard manual browser verification modal functions as normal.

### Shoko Server Integration (Local Media Playback)
Turn your self-hosted anime archive into a personal streaming platform:
- **VFS Streaming**: Stream local MKV and MP4 files directly from your Shoko Server instance.
- **Audio & Subtitle Switching**: Dynamically switch between Japanese/English dual-audio and subtitle streams during playback.
- **Two-Way Scrobbling**: Watched episode status automatically scrobbles back to your Shoko Server and updates AniDB.
- **AniDB &harr; AniList Mapping**: Seamlessly cross-references local files with AniList metadata.

### Offline Metadata Database & Instant Imports
- An integrated offline cross-reference database links AniDB, AniList, and MyAnimeList IDs locally.
- Import thousands of anime from your MyAnimeList or AniList profile in seconds rather than waiting minutes for rate-limited external API calls.
- Automated weekly database updates ensure new seasonal releases map instantly.

### Hardware-Accelerated Remuxing
- Built-in FFmpeg integration remuxes MKV containers to fragmented MP4 (fMP4) on the fly with zero quality loss.
- GPU acceleration via Intel QuickSync (VAAPI), AMD GPUs, and NVIDIA NVENC avoids CPU spikes during playback.

### Dynamic Theme Engine
- Includes modern curated color palettes and full AniPredict theme styling.
- Dynamically generates CSS variables and theme-aware SVG logos and branding in real time.

---

## Deployment & Installation

### Option A: Docker & Unraid (Recommended for Servers & NAS)

A complete Docker packaging solution and Unraid template is available at [**Dando_Docker**](https://github.com/ultrawazer/Dando_Docker).

#### Docker Compose

Save the following as `docker-compose.yml`:

```yaml
services:
  mitarashidango:
    image: ghcr.io/ultrawazer/mitarashidango:latest
    container_name: mitarashidango
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PUID=99
      - PGID=100
      - UMASK=022
      - TZ=UTC
      - SHOKO_URL=http://192.168.1.100
      - SHOKO_PORT=8111
      - SHOKO_API_KEY=
      - HW_ACCEL=auto
      - FLARESOLVERR_ENABLED=false
      - FLARESOLVERR_URL=http://flaresolverr
      - FLARESOLVERR_PORT=8191
    devices:
      - /dev/dri:/dev/dri # GPU passthrough for Intel VAAPI / AMD
    volumes:
      - ./appdata:/config
      - /tmp/dango-transcode:/transcode
    depends_on:
      - flaresolverr

  flaresolverr:
    image: ghcr.io/flaresolverr/flaresolverr:latest
    container_name: flaresolverr
    environment:
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - LOG_HTML=${LOG_HTML:-false}
      - CAPTCHA_SOLVER=${CAPTCHA_SOLVER:-none}
      - TZ=UTC
    ports:
      - "8191:8191"
    restart: unless-stopped
```

Run:
```bash
docker compose up -d
```

#### Unraid Installation
1. In Unraid WebGUI &rarr; **Docker** &rarr; **Add Container**.
2. Template URL:
   ```text
   https://raw.githubusercontent.com/ultrawazer/Dando_Docker/main/mitarashidango.xml
   ```
3. Map your appdata path (`/mnt/user/appdata/dango` &rarr; `/config`) and GPU device (`/dev/dri`), then click **Apply**.

---

### Option B: Bare Metal / Local Development

#### Prerequisites
- **Node.js**: Version `>= 22.5.0` (uses Node's native built-in `node:sqlite`).
- **FFmpeg**: (Optional, recommended for on-the-fly local video remuxing and hardware acceleration).

#### Setup
```bash
git clone https://github.com/ultrawazer/MitarashiDango.git
cd MitarashiDango
npm install
```

#### Running
- **Development Mode** (Vite frontend on `:3000`, Express API on `:3001`):
  ```bash
  npm run dev
  ```
- **Production Build & Start**:
  ```bash
  npm run build
  npm start
  ```
- **Interactive Script**:
  - Windows: `run.bat`
  - Linux/macOS: `./run.sh`

---

## Workspace Architecture & Storage

This project is organized as an **npm workspace**:
- `client/` - React 19 / Preact frontend built with Vite, TypeScript, and Vanilla CSS.
- `server/` - Express backend with native `node:sqlite`, Shoko VFS client, FlareSolverr service, and dynamic extension runner.
- `orchestrator.js` - Process supervisor managing ports, environments, and graceful shutdown.

### Persistent Storage Locations
All persistent data (SQLite databases, installed extensions, sync manifests, settings) is stored outside the repository directory:
- **Windows:** `%APPDATA%\dango`
- **Linux:** `~/.local/share/dango` (or `$XDG_DATA_HOME/dango`)
- **macOS:** `~/Library/Application Support/dango`
- **Docker:** `/config/dango`

---

## Cloud Synchronization & Trackers

The local SQLite database remains the master record. Optional synchronization services include:
- **GitHub**: Device code OAuth saving encrypted snapshots to a private `dango-sync-data` repository.
- **Google Drive**: Application data folder backup.
- **Rclone**: Custom cloud remotes (Dropbox, Mega, Nextcloud, S3, WebDAV).
- **AniList Sync**: Bidirectional sync between your local watchlist and your AniList profile.
- **Shoko Sync**: Two-way watch state scrobbling to local media servers.

---

## Disclaimer

Mitarashi Dango is a local-first media client and library manager. It does not host, upload, or distribute copyrighted video content.

Users are responsible for configuring and using the application in compliance with applicable laws in their jurisdiction. All trademarks, titles, artwork, and metadata belong to their respective owners.

---

## Attribution & License

- Forked from and based on [Dango](https://github.com/serifpersia/dango) by [serifpersia](https://github.com/serifpersia).
- Extension architecture inspired by [Mihon](https://github.com/mihonapp/mihon).
- Distributed under the [MIT License](LICENSE).
