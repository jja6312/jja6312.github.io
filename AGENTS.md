# OCI CLI authoring rules

OCI CLI changes in this repository must follow these rules before implementation and before completion.

1. Verify the current OCI Console major category and submenu using current Oracle primary documentation. Do not infer placement from API namespaces or service similarity. Add a regression assertion for the exact `category > group > resource` path.
2. Search the existing catalog before creating a resource or category. Extend an existing scalable resource when the service or command already exists.
3. For every required OCID, investigate whether it can be derived from the selected profile, region, resource name, or a prerequisite LIST/GET call. Dynamic lookup is the default when derivation is safe. Direct-only input requires a concrete reason.
4. Reuse the root-tenancy lookup pattern for root compartment inputs: derive `data[0]."compartment-id"` from `oci iam availability-domain list` with the same profile and region, then validate that the result is a tenancy OCID.
5. Design the complete user workflow, not only the requested command. Trace `discover > select > execute > interpret`. If a command needs an ID, ensure its discovery command exists. Example: Subscription balance requires Subscription LIST, single-subscription balance, and consideration of an all-subscriptions workflow.
6. Put official single OCI commands in the normal Console-aligned catalog. Put multi-command operational workflows under the collapsed `Custom CLI` group.
7. Verify exact command paths, required versus optional fields, mutually exclusive inputs, and response query fields from current OCI CLI help and Oracle primary documentation.
8. Track execution verification per CRUD operation using `<resource>:<operation>` keys. Never treat one verified operation as verification of the entire resource.
9. Add protected-data regression assertions for menu placement, operation availability, required fields, default queries, dynamic lookup, and prerequisite/related commands. Validate generated Bash workflows with `bash -n`.
10. Run protected-data generation and verification, lint, and build. Deploy automatically and confirm the live JavaScript, CSS, and protected data match the local final artifacts.

## OCI CLI completion plan

1. Before any OCI CLI catalog, command, action, dynamic lookup, or builder UI work, read `OCI_CLI_COMPLETION_PLAN.md`.
2. Work in the plan's numbered order unless a user request explicitly changes priority. Do not expand the catalog broadly before the Phase 1 accuracy foundation is complete.
3. Mark an item complete only after its item-specific and common completion criteria pass, including deployment and live artifact verification.
4. In the same commit, update the item's checkbox, completion date, commit/evidence fields where possible, and the change-history table. Never mark partial work complete.
