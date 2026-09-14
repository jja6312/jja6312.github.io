# Resource inventory implementation

Accepted 2026-09-14: all config profiles and READY regions, root and accessible compartments, daily 11:30 with missed-run catch-up, immutable dated JSON/Excel, browser-only customer data under Knowledge / inventory (lock level 3).

- [ ] Reviewed read API allowlist, Search plus native inventories, pagination, coverage journal and resume.
- [ ] Versioned normalized snapshot, parent relationships, per-resource meaningful properties, baseline rules, coverage-aware field diffs.
- [ ] Excel renderer: overview, changes, deviations, compartment tables, Console-numbered service tables, raw IDs on right.
- [ ] Browser UI: local JSON/IndexedDB, timeline, filters, details, configuration comparison, editable baseline rules.
- [ ] Loopback-only Postman bridge and native daily Python scheduling.
- [ ] Unit/contract tests, archived-data migration, live read-only pilot, workbook/browser verification, build/deploy.

LIST hashes are not authoritative configuration change tokens. Mutable GET-only fields and child collections are refreshed daily. Explicitly reviewed immutable resource details may be reused for at most seven days. No claim of universal OCI completeness: unsupported types, inaccessible scopes, partial pages, and unverified coverage remain visible.

Raw configuration is retained with credentials and content payloads excluded; OCIDs, IPs, emails and tags are not masked. Customer snapshots never enter the public site repository or deployment bundle. IndexedDB stores snapshots; localStorage stores presentation preferences. GitHub Pages has no POST endpoint, so Postman ingestion uses an optional localhost bridge.
