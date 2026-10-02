# TorpNotes PWA

TorpNotes is a local-first property notebook for maps, plans, measurements, tasks, and technical documentation.

## Purpose

The app should remain useful at the property even when the home server is unavailable. The public web app contains no property data; each browser stores its own data locally in IndexedDB.

## Current Status

The static mobile-first PWA is published on GitHub Pages and uses a property-local coordinate system measured in meters.

## Current Scope

- Organize image layers by site, basement, ground floor, or upper floor.
- Position, rotate, fade, lock, directly drag, and calibrate layers against a known distance.
- Visually suppress white drawing backgrounds when plans are placed over other layers.
- Create and later edit points, lines, and polygon areas.
- Assign direct status, multiple categories, optional height, notes, color, and photos.
- Filter the map by status and category.
- Use a map-first mobile workspace with compact tool rails and an on-demand object drawer.
- Distinguish point systems by color and status by shape.
- Record leveling sessions from raw staff readings and place calculated height points on the map.
- Export and import the complete local dataset, including images.
- Migrate data saved by the first application version.
- Work offline after the first successful load.

The app does not yet provide multi-device synchronization, user accounts, server-side image storage, geographic GPS anchoring, or a logical installation schematic.

## Architecture

- Static HTML, CSS, and JavaScript.
- Leaflet with a property-local coordinate system in meters and affine image layers.
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
