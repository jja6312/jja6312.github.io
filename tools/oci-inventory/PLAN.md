# Resource inventory implementation

Accepted 2026-09-14: all config profiles and READY regions, root and accessible compartments, daily 11:30 with missed-run catch-up, immutable dated JSON/Excel, browser-only customer data under Knowledge / inventory (lock level 3).

- [x] Reviewed read API allowlist, Search plus native inventories, pagination, coverage journal and resume.
- [x] Versioned normalized snapshot, parent relationships, per-resource meaningful properties, baseline rules, coverage-aware field diffs.
- [x] Excel renderer: overview, changes, deviations, compartment tables, Console-numbered service tables, raw IDs on right.
- [x] Browser UI: local JSON/IndexedDB, timeline, filters, details, configuration comparison, editable baseline rules.
- [x] Loopback-only Postman bridge and native daily Python scheduling.
- [x] Unit/contract tests, archived-data migration, live read-only pilot, workbook/browser verification, production build.

Release checks: push the scoped code changes, verify the Pages workflow, then compare live JS/CSS and protected assets with the build. No customer snapshot or QA harness is a production artifact.

LIST hashes are not authoritative configuration change tokens. Mutable GET-only fields and child collections are refreshed daily. Explicitly reviewed immutable resource details may be reused for at most seven days. No claim of universal OCI completeness: unsupported types, inaccessible scopes, partial pages, and unverified coverage remain visible.

Raw configuration is retained with credentials and content payloads excluded; OCIDs, IPs, emails and tags are not masked. Customer snapshots never enter the public site repository or deployment bundle. IndexedDB stores snapshots; localStorage stores presentation preferences. GitHub Pages has no POST endpoint, so Postman ingestion uses an optional localhost bridge.
