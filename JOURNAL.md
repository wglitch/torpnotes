# TorpNotes PWA

Local-first property documentation that works independently of the TorpNotes server.

# Current Next Step

Publish the meter-based layer and object update, then field-test calibration and editing on a phone with real property drawings.

---

# Journal

## 2026-10-02

Done:
Built a shared meter coordinate system, floor-aware image layers, calibration, editable point/line/area objects, categories, photos, filtering, and mapped leveling points.

Learned:
Floor membership and measured height must remain separate, while every image and object uses the same property-local horizontal coordinates.

Next:
Field-test layer placement, calibration, and object editing with real maps and floor plans on a phone.

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
