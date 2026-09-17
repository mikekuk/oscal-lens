# OSCAL Lens

A browser-based OSCAL JSON explorer for catalogues, profile selections and control mappings. Inspect nested groups, controls, enhancements, inline parameters and **grey matter**: group-level prose and guidance, document metadata, properties, links, roles, parties and back-matter resources.

## Run

Requires Node.js 20 or later. There are no installation steps or runtime package downloads.

```sh
npm start
```

Open http://localhost:3000. Run `npm test` for the schema-validation and profile-selection tests. Deploy `dist/` to any static host; serve through HTTP rather than opening `index.html` as a file.

## Use

1. Start with the illustrative example workspace, or choose **Open files**.
2. Select an OSCAL profile and all of its source catalogue/profile JSON files. Use **Open folder** to select a downloaded/cloned `oscal-content` directory, or **Open files** to select individual JSON documents. Use the small **×** beside any file to remove it from the browser workspace (the original file is unchanged). Profiles and mappings refresh immediately; missing sources are reported, and opening a removed source again restores dependent views. Multiple uploads accumulate in the workspace; a matching relative path replaces its previous document. Same-named files in different folders remain separate. Each file is limited to 20 MB.
3. Choose a document in the sidebar. Filter controls by group or search their content.
4. Expand controls to read requirements with effective ODP values rendered inline. Unset parameters show assignment or selection prompts, including nested choices. **Grey matter** retains document and group context; control-specific supporting material appears within the control.
5. Open **Validation** for schema errors and processing notices, or **Source** for the original JSON.

## Unresolved NIST profiles

1. Download or clone [usnistgov/oscal-content](https://github.com/usnistgov/oscal-content).
2. Choose **Open folder** and select the common parent folder containing both the profile and its imported catalogues. Selecting the repository root preserves references between subdirectories.
3. Select a JSON `*_profile.json` document in the workspace, for example `NIST_SP-800-53_rev5_LOW-baseline_profile.json`. No pre-resolution step is needed to view its selected controls.
4. The viewer follows JSON catalogue/profile imports and preserves source groups and grey matter. It reports missing files or unsupported operations explicitly.

The NIST Rev. 5 LOW unresolved profile was checked against its full source catalogue: all 149 listed controls were selected across 18 groups. This verifies that baseline's imports and selection, not general resolver conformance. Mapping collections are also loaded; JSON files for other OSCAL models and non-JSON files are skipped during folder loading. Invalid JSON is reported. Current NIST documents still carry the version warning described below.

## Validation scope

Bundled, unmodified NIST JSON Schemas are selected using each document's `metadata.oscal-version` and checked using Ajv 8.17.1:

| Model | Bundled OSCAL versions |
| --- | --- |
| Catalogue and profile | 1.0.0–1.0.6, 1.1.0–1.1.3, 1.2.0–1.2.3 |
| Mapping collection | 1.2.0–1.2.3 |

NIST marks 1.0.5 as a pre-release; it is included for documents declaring that version. Its published schema has known overly restrictive property-name constraints, corrected upstream in 1.0.6. The exact schema for the declared release is used, including its original constraints and upstream limitations. Missing or malformed version declarations produce an error. Unbundled versions produce a **Schema not checked** notice; another release is never silently substituted. Future releases require adding their official schema assets and entries to `dist/schemas/manifest.json`.

The Validation tab identifies the selected schema version. Missing fields, types, patterns, prohibited properties and duplicate identifiers are reported. URI, URI-reference, email and date-time formats use lightweight application checks; they are not exhaustive RFC validators. XML and YAML are not accepted.

All schemas are served from the same static site; uploaded content is never sent to NIST or a validation service. Validators compile on first use and are cached separately by model and version. The manifest records source URLs and SHA-256 checksums; source schemas are kept unmodified.

Schema validity is distinct from profile processing and does not prove referential integrity, parameter constraint satisfaction or security compliance. This is an inspection tool, not a certification validator.

## Profile selection scope

Supported: multiple catalogue imports, recursive profile imports, `include-all`, explicit `with-ids`, wildcard `matching`, `with-child-controls`, exclusions, cycle detection, missing-selection errors, original group context and `alters` additions/removals and `set-parameters` across catalogue, group, parent-control and control parameter scopes. Folder imports resolve paths relative to the containing profile, including `../` segments and chained profiles. Internal `#resource` imports select JSON-compatible back-matter `rlinks` regardless of XML/YAML link order. Available JSON alternatives are checked by full path first. Loose file uploads and absolute URL references can bind by an unambiguous filename; directory imports never silently substitute a same-named file in the wrong folder. For an incomplete folder upload you can explicitly add a missing JSON source through Open files. Sources are never fetched automatically. Load external sources yourself. Embedded base64 imports are not supported. URL queries/fragments do not identify separate local files, and remote URLs are not fetched. The folder picker requires a browser with directory-upload support; use Open files as a fallback.

The result is deliberately labelled a **selection preview**, not a resolved OSCAL catalogue. `merge.custom`, merge combine policies, flattening, final metadata/back-matter reconciliation are not implemented. These operations produce notices when encountered; duplicates remain visible. Source groups and original grey matter are retained for inspection, including groups with no selected controls. For complete standards-oriented profile resolution, use [NIST OSCAL CLI](https://github.com/usnistgov/oscal-cli) and load its resulting catalogue here.

## Privacy and security

Loaded documents stay in memory in your browser. There is no document upload service, analytics or persistent document storage. Refreshing clears loaded files. Content is escaped and shown as text; embedded HTML, OSCAL prose markup and links are not executed. External links in documents are shown as text. Very large or deeply nested documents can exceed browser resources despite the per-file limit.

## Profile additions and removals

`modify.alters` targets selected controls by `control-id`. For each alteration, removals are applied before additions; alterations follow their document order. Imported profile alterations run before those in an outer profile. Effective parameter settings are applied after alterations so added parameters can be set in the same profile.

- **Adds:** title, parameters, properties, links and parts; implicit control targets or explicit descendant `by-id`; `starting`, `ending`, `before` and `after` positions. When omitted, position defaults to `ending`. JSON keeps ordering within each content array.
- **Removes:** `by-id`, `by-name`, `by-class`, `by-ns` and singular `by-item-name` (such as `part` or `prop`). Every supplied criterion must match. Nested content and selected child controls are supported. An empty removal selector matches all control contents.
- Missing addition/control targets and unmatched removals produce notices. Ambiguous targets and unsupported selector/content keys are reported instead of silently applying a guessed operation.
- Added custom sections appear automatically in the control view and sidebar. Assessment sections retain the existing hidden-by-default setting. Added/removed parameters update the inline ODP scope.

Source documents remain unchanged. This remains a selection/tailoring viewer rather than a complete OSCAL resolver: cross-type XML element ordering, full result-schema conformance and the merge/reconciliation limitations above are not certified by this implementation.

## Reading controls

ODP insertions such as `{{ insert: param, frequency }}` are replaced by effective values from the loaded profile chain. Outer profile settings override imported settings. Unset values show `[Assignment: frequency]` or `[Selection (one or more): choice A; choice B]` using the parameter definition. NIST RMF `aggregates` properties (and unnamespaced `aggregates` properties) are followed recursively, combining referenced ODP results in declared order with semicolons. Explicit values on the aggregate itself take precedence. Unset members keep their prompts rather than disappearing. Choices and values can reference other parameters; missing definitions and cycles produce explicit prompts. No values are invented.

Statement items appear on separate lines with their original labels (a., b., 1., 2., etc.). Internal part IDs and label-property tables remain available in Source. Enable **Parameters** in the sidebar to inspect the effective parameter definitions and values, including inherited and profile-tailored parameters. This section is hidden by default; inline substitution remains active regardless of the toggle.

The sidebar's **Control sections** checkboxes show or hide each part type. Assessment sections and control metadata are hidden by default. Preferences apply across documents during the current session and reset on refresh; original source content is never removed. Nested items follow their containing section's visibility.

## Project layout

- `dist/index.html`, `styles.css`: accessible responsive layout and styling.
- `dist/app.mjs`: application state, event handlers and startup.
- `dist/views.mjs`: escaped HTML rendering and control-section preferences.
- `dist/examples.mjs`: synthetic example workspace.
- `dist/alterations.mjs`: additions, removals and effective selected-control tree updates.
- `dist/parameters.mjs`: inline ODP substitution, scope inheritance and unset-value prompts.
- `dist/engine.mjs`: schema validation and profile-selection logic.
- `dist/imports.mjs`: folder loading, JSON resource selection and relative import resolution.
- `dist/mappings.mjs`: mapping resource resolution and bidirectional control index.
- `dist/provenance.mjs`: catalogue-to-profile comparison helpers.
- `dist/schemas/`: versioned official NIST schemas and their source/checksum manifest.
- `dist/ajv.js`: vendored Ajv browser bundle.
- `server.cjs`: dependency-free local HTTP server.
- `tests/*.cjs`: processing, validation, folder and NIST profile regression tests.

## Source conventions

Application code uses two-space indentation and named helpers. Comments explain OSCAL processing boundaries, browser-local import matching, cache invalidation and escaping. Keep the published assets under `dist/`: this is a build-free app, so edits there are the source changes. Vendored `ajv.js` and NIST schemas are kept unmodified; test fixtures represent external data rather than application logic.

## GitHub

Source repository: https://github.com/mikekuk/oscal-lens

## References and third-party notices

- [NIST OSCAL](https://pages.nist.gov/OSCAL/)
- [Profile processing specification](https://pages.nist.gov/OSCAL/learn/concepts/processing/profile-resolution/)
- [NIST OSCAL schema releases](https://github.com/usnistgov/OSCAL/releases)
- [Ajv 8.17.1 bundle](https://github.com/ajv-validator/ajv-dist/tree/v8.17.1), MIT; see `THIRD_PARTY_NOTICES.md`.

The example catalogue is synthetic and is not an official NIST baseline. No assertion of full OSCAL resolver conformance is made.

## Control mappings and profile provenance

Open a common parent folder containing your catalogues, profiles and OSCAL mapping collections. Mapping files may be anywhere in that folder; the loader recognises the `mapping-collection` root, not a special filename or directory. It resolves each mapping's `source-resource.href` and `target-resource.href` relative to the mapping file, including JSON back-matter links, and builds a browser-local index after every file load or replacement.

Select a referenced catalogue or profile to see **Mappings** within its controls. Each collapsed mapping shows the other resource, the target type (control or section/statement), the identifier and relationship. Expand it to read the remarks, mapped statement and full containing control. Repeated mapping provenance is omitted from control views and remains available in Source. Subsections have spacing and smaller title headings; visibility filters apply to the containing section. Both browsing directions are supported; subset/superset labels reverse with direction. Many-to-many entries retain their complete source and target sets and are labelled collective. Unknown/custom relationships retain their original direction and namespace. There is no recursive mapping expansion inside mapped controls.

Only OSCAL `control` and `statement` target types are supported. Mapping collections are checked against the bundled NIST schema matching their declared version (1.2.0–1.2.3); invalid collections and collections without a matching schema are reported and excluded from the control view. Catalogue/profile validation supports the versions listed above. Missing or ambiguous files and identifiers produce notices rather than guessed matches. Referenced profiles retain the existing selection-preview limitations.

Mappings carry forward to selected controls in profiles importing the referenced catalogue or profile, including nested profiles. All loaded mapping files contribute: for example, NATO-to-NIST and ISO-to-NIST mappings both appear on the same NIST control. Direct profile mappings appear alongside inherited mappings. Inherited entries identify their source and describe the original content; tailoring, including removing mapped statements, does not reassess the recorded relationship. Excluded controls and unrelated documents with matching control IDs do not receive mappings. No recorded mapping is not evidence of non-compliance or absence of a relationship.

Profile views use lavender text and a dotted underline for effective changes from the original catalogue: modified titles/prose/metadata, added parts and changed parameter substitutions (including aggregate dependencies). Unchanged catalogue text retains its normal colour. The legend and hover text explain the distinction. Optional parameter details show changed definitions, and a **Profile removals** expander preserves removed catalogue content for inspection. Changes made by imported profile layers are included. Uploaded source JSON remains unchanged.

The example workspace now includes an assurance catalogue and mapping collection. Everything remains within `dist/` for Azure Static Web Apps: no API, database, automatic source fetching or server-side processing is required.
