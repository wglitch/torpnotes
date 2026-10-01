# TorpNotes PWA

TorpNotes is a local-first property notebook for maps, plans, measurements, tasks, and technical documentation.

## Purpose

The app should remain useful at the property even when the home server is unavailable. The public web app contains no property data; each browser stores its own data locally in IndexedDB.

## Current Status

Active development. The first milestone is a static mobile-first PWA published on GitHub Pages.

## Initial Scope

- Name a local property dataset.
- Import an owned or appropriately licensed image as the map background.
- Pan and zoom deeply into the image.
- Add local points with notes and status.
- Record leveling sessions from a reference fix and raw staff readings.
- Export and import the complete local dataset.
- Work offline after the first successful load.

The app does not yet provide multi-device synchronization, user accounts, or server-side image storage.

## Architecture

- Static HTML, CSS, and JavaScript.
- Leaflet with a simple image coordinate system.
- IndexedDB for property data and imported images.
- Service worker and web app manifest for offline use.
- GitHub Pages for public hosting of the empty application shell.

Property coordinates, map images, plans, notes, and exports must never be committed to this repository.

## Development

Serve the project directory over HTTP rather than opening `index.html` directly, because service workers and IndexedDB require a web origin.

## Current Priority

See `JOURNAL.md`.

## Future Ideas

See `IDEAS.md`.
