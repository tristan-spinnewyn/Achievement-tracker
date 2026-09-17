# 🏆 FFXIV Achievement Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-42.4-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Tests-59%20passed-green.svg)](https://vitest.dev/)
[![FFXIV Patch](https://img.shields.io/badge/FFXIV%20Patch-7.56%20Dawntrail-purple.svg)](https://na.finalfantasyxiv.com/)

A modern, fast, and **100% local** desktop application designed for **Final Fantasy XIV** players to track, prioritize, and manage achievements, item collections, daily/weekly routines, and the new **Beastmaster Bestiary (Patch 7.56)**.

Synchronize your progress directly from your public **Lodestone** profile, plan goals using priorities and a drag-and-drop **Focus** list, manage recurring resets, and never lose your data thanks to automatic mirror backup.

---

## 🌟 Key Features

### 🏆 Achievement Tracking & Smart Suggestions
- **Comprehensive Catalog**: Over 4,000 achievements updated with official XIVAPI v2 data.
- **One-Click Lodestone Sync**: Automatically import all unlocked achievements and completion timestamps from your Lodestone character profile.
- **Virtualized Master Table**: Instant fuzzy search (*FlexSearch*), multi-criteria filters (category, patch, status, points, obtainability), and high-performance scrolling across thousands of entries.
- **Intelligent Difficulty Scoring**: Automatic heuristic rating based on content type (Ultimates, Savages, Extremes, relic grinds, PvP ranks, seasonal events) with visual badges and custom sorting.
- **Smart Suggestions**: Adaptive recommendation engine highlighting accessible, high-reward achievements tailored to your preferences.

### 🦁 Beastmaster Bestiary (Patch 7.56) & Collections
- **Full Beastmaster Bestiary**: Track all 50 capturable beasts for the Beastmaster limited job, grouped by their 8 official families (*Beasts, Vilekin, Cloudkin, Seedkin, Wavekin, Scaleblades, Forgekin, Spoken* / *Thériens, Insectoïdes, Ptériens, Floréens, Hydrides, Cuirassiens, Animides, Nécroïdes*).
- **Capture Assistance**: Precise target monster names, required levels, zones, X/Y map coordinates, and quest requirements.
- **12 Integrated Collection Types**:
  - 🐎 Mounts & 🐾 Minions
  - 🎵 Orchestrion Rolls
  - 💃 Emotes & 💇 Hairstyles
  - 👗 Fashion Accessories & 👓 Glasses / Face Accessories
  - 🛡️ Chocobo Bardings & 🎖️ Titles
  - 🔮 Blue Mage Spells
  - 🃏 Triple Triad Cards
  - 🦁 Beastmaster Bestiary

### 📋 Productivity & In-Game Routines
- **Priorities & Focus List**: Drag-and-drop reordering for your current in-game goals.
- **Notes, Tags & Deadlines**: Add custom memos, strategy links, tags, and deadlines to any achievement.
- **Recurring Reset Checklist**:
  - Daily Reset (15:00 UTC): Roulettes, Beast Tribe / Allied Society quests, etc.
  - Weekly Reset (Tuesday 08:00 UTC): Raids, Faux Hollows, Wondrous Tails.
  - Grand Company Supply/Provisioning Reset (20:00 UTC).
  - Real-time countdowns, launch alerts, and **streak tracking**.

### 🛡️ Data Safety & Automatic Mirror Backup
- **100% Local & Private**: No cloud account, no telemetry, no tracking. Your data never leaves your computer.
- **Automatic Mirror Backup to "Documents"**: Every modification (checking an achievement, catching a beast, updating a note) is automatically written to `Documents\FFXIV Achievement Tracker\userdata-backup.json` using atomic file writes.
- **Cloud-Ready**: The Documents directory syncs effortlessly with OneDrive, Google Drive, Dropbox, or any backup solution.
- **Zero-Effort Auto-Recovery**: Moving to a new PC or reinstalling? Launch the app and it will automatically detect and restore your saved progress from your Documents folder.
- **Manual Import / Export**: Full JSON backups can be exported or imported anytime via Settings.

---

## 🚀 Installation (Windows)

Download the latest release from the [Releases](https://github.com/tristan-spinnewyn/Achievment-tracker/releases) tab or build it from source:

* **Setup Installer (Recommended)**: `FFXIV Achievement Tracker Setup x.y.z.exe` (includes Start Menu and desktop shortcuts).
* **Portable Version**: `FFXIV Achievement Tracker x.y.z.exe` (standalone single executable, no installation or admin rights required).

---

## ⚙️ Lodestone Synchronization Setup

1. Make your achievements public on the official [Lodestone](https://na.finalfantasyxiv.com/lodestone/) website:
   * Character Profile > **Achievement Privacy Settings** > Set to **Public**.
2. In the app, navigate to **Settings**:
   * Choose your region (EU, NA, JP, OC).
   * Enter your **Lodestone Character ID** (the numbers in your character URL `.../character/12345678/`).
3. Click **Synchronize** (or enable auto-sync on launch).

---

## 💻 Development

### Prerequisites
- [Node.js](https://nodejs.org/) (version 20+ recommended)
- npm or pnpm

### Common Commands

```bash
# Install dependencies
npm install

# Start development app with Hot-Reload (Vite + Electron)
npm run dev

# Run TypeScript typechecks (Main, Preload, Renderer)
npm run typecheck

# Run test suite (Vitest)
npm test

# Build data catalogs from XIVAPI & FFXIV Collect
npm run build:catalog        # Rebuild achievement catalog
npm run build:collections    # Rebuild collections & beastmaster bestiary

# Package production executables for Windows
npm run dist:dir             # Unpacked application (release/win-unpacked/)
npm run dist                 # NSIS installer + portable executable (release/)
```

---

## 🏗️ Tech Stack

- **Framework**: [Electron 42](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- **Frontend / UI**: [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Tables & Virtualization**: [@tanstack/react-table](https://tanstack.com/table) & [@tanstack/react-virtual](https://tanstack.com/virtual)
- **Drag and Drop**: [@dnd-kit](https://dndkit.com/)
- **Search Engine**: [FlexSearch](https://github.com/nextapps-de/flexsearch)
- **Unit Testing**: [Vitest](https://vitest.dev/)
- **Data Persistence**: Atomic local JSON files (`userData` + automatic `Documents` mirror)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

FINAL FANTASY XIV © 2010 - 2026 SQUARE ENIX CO., LTD. All Rights Reserved.
This project is an independent community tool and is not affiliated with Square Enix.
