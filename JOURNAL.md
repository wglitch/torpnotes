# TorpNotes PWA

Local-first property documentation that works independently of the TorpNotes server.

# Current Next Step

Field-test transparent floor plans, zoom-triggered ground-floor context, and dimension annotations with real property drawings.

---

# Journal

## 2026-10-02

Done:
Built a shared meter coordinate system, floor-aware image layers, calibration, editable point/line/area objects, categories, photos, filtering, mapped leveling points, and a map-first mobile workspace.

Refined the map workspace with offline Lucide icons, a compact app menu, one add-object control, visible draft vertices, transactional layer dragging, layer locate/recovery controls, collapsed technical settings, a one-click status cycle with undo, and a dedicated factual height-point view.

Replaced mobile-unsafe layer blending with generated transparent previews that preserve the originals, added zoom-dependent floor-plan context on the site map, and introduced dimension objects with calculated or manually entered values and measurement provenance.

Learned:
Floor membership and measured height must remain separate, while every image and object uses the same property-local horizontal coordinates.

Next:
Field-test white-threshold adjustment, contextual floor visibility, and dimensions with real maps and floor plans on a phone.

Open Questions:
How should a future GPS anchor and multi-device synchronization expose uncertainty and conflicts?

## 2026-10-01

Done:
Created a clean project root for the public local-first TorpNotes application.

Learned:
The application shell can be public while all property data remains local to each browser.

Next:
Implement image-map import, local map objects, leveling sessions, and complete export/import.

Open Questions:
How should manual exports from two devices be merged before automatic synchronization exists?
