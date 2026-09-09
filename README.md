# OSCAL Lens

A browser-based OSCAL JSON explorer for catalogues and profile selections. Inspect nested groups, controls, enhancements, inline parameters and **grey matter**: group-level prose and guidance, document metadata, properties, links, roles, parties and back-matter resources.

## Run

Requires Node.js 20 or later. There are no installation steps or runtime package downloads.

```sh
npm start
```

Open http://localhost:3000. Run `npm test` for the schema-validation and profile-selection tests. Deploy `dist/` to any static host; serve through HTTP rather than opening `index.html` as a file.

## Use

1. Start with the illustrative example workspace, or choose **Open files**.
2. Select an OSCAL profile and all of its source catalogue/profile JSON files. Use **Open folder** to select a downloaded/cloned `oscal-content` directory, or **Open files** to select individual JSON documents. Multiple uploads accumulate in the workspace; a matching relative path replaces its previous document. Same-named files in different folders remain separate. Each file is limited to 20 MB.
3. Choose a document in the sidebar. Filter controls by group or search their content.
4. Expand controls to read requirements with effective ODP values rendered inline. Unset parameters show assignment or selection prompts, including nested choices. **Grey matter** retains document and group context; control-specific supporting material appears within the control.
5. Open **Validation** for schema errors and processing notices, or **Source** for the original JSON.

## Unresolved NIST profiles

1. Download or clone [usnistgov/oscal-content](https://github.com/usnistgov/oscal-content).
2. Choose **Open folder** and select the common parent folder containing both the profile and its imported catalogues. Selecting the repository root preserves references between subdirectories.
3. Select a JSON `*_profile.json` document in the workspace, for example `NIST_SP-800-53_rev5_LOW-baseline_profile.json`. No pre-resolution step is needed to view its selected controls.
4. The viewer follows JSON catalogue/profile imports and preserves source groups and grey matter. It reports missing files or unsupported operations explicitly.

The NIST Rev. 5 LOW unresolved profile was checked against its full source catalogue: all 149 listed controls were selected across 18 groups. This verifies that baseline's imports and selection, not general resolver conformance. JSON files for other OSCAL models and non-JSON files are skipped during folder loading. Invalid JSON is reported. Current NIST documents still carry the version warning described below.

## Validation scope

Bundled, unmodified NIST **OSCAL 1.0.4** catalogue and profile JSON Schemas are checked using Ajv 8.17.1. Missing fields, types, patterns, prohibited properties and duplicate identifiers are reported. URI, URI-reference, email and date-time formats use lightweight application checks; they are not exhaustive RFC validators. Newer OSCAL declarations produce a version warning: passing the old schema does **not** establish conformance with a newer release. XML and YAML are not accepted.

Schema validity is distinct from profile processing and does not prove referential integrity, parameter constraint satisfaction or security compliance. This is an inspection tool, not a certification validator.

## Profile selection scope

Supported: multiple catalogue imports, recursive profile imports, `include-all`, explicit `with-ids`, wildcard `matching`, `with-child-controls`, exclusions, cycle detection, missing-selection errors, original group context and `set-parameters` across catalogue, group, parent-control and control parameter scopes. Folder imports resolve paths relative to the containing profile, including `../` segments and chained profiles. Internal `#resource` imports select JSON-compatible back-matter `rlinks` regardless of XML/YAML link order. Available JSON alternatives are checked by full path first. Loose file uploads and absolute URL references can bind by an unambiguous filename; directory imports never silently substitute a same-named file in the wrong folder. For an incomplete folder upload you can explicitly add a missing JSON source through Open files. Sources are never fetched automatically. Load external sources yourself. Embedded base64 imports are not supported. URL queries/fragments do not identify separate local files, and remote URLs are not fetched. The folder picker requires a browser with directory-upload support; use Open files as a fallback.

The result is deliberately labelled a **selection preview**, not a resolved OSCAL catalogue. `merge.custom`, merge combine policies, flattening, `modify.alters`, final metadata/back-matter reconciliation are not implemented. These operations produce notices when encountered; duplicates remain visible. Source groups and original grey matter are retained for inspection, including groups with no selected controls. For complete standards-oriented profile resolution, use [NIST OSCAL CLI](https://github.com/usnistgov/oscal-cli) and load its resulting catalogue here.

## Privacy and security

Loaded documents stay in memory in your browser. There is no document upload service, analytics or persistent document storage. Refreshing clears loaded files. Content is escaped and shown as text; embedded HTML, OSCAL prose markup and links are not executed. External links in documents are shown as text. Very large or deeply nested documents can exceed browser resources despite the per-file limit.

## Reading controls

ODP insertions such as `{{ insert: param, frequency }}` are replaced by effective values from the loaded profile chain. Outer profile settings override imported settings. Unset values show `[Assignment: frequency]` or `[Selection (one or more): choice A; choice B]` using the parameter definition. Choices and values can reference other parameters; missing definitions and cycles produce explicit prompts. No values are invented.

Statement items appear as continuous prose with their original labels (a., b., 1., 2., etc.). Internal part IDs and label-property tables remain available in Source. There is no separate Parameters block within a control.

The sidebar's **Control sections** checkboxes show or hide each part type. Assessment sections and control metadata are hidden by default. Preferences apply across documents during the current session and reset on refresh; original source content is never removed. Nested items follow their containing section's visibility.

## Project layout

- `dist/index.html`, `styles.css`: accessible responsive layout and styling.
- `dist/app.mjs`: application state, event handlers and startup.
- `dist/views.mjs`: escaped HTML rendering and control-section preferences.
- `dist/examples.mjs`: synthetic example workspace.
- `dist/parameters.mjs`: inline ODP substitution, scope inheritance and unset-value prompts.
- `dist/engine.mjs`: schema validation and profile-selection logic.
- `dist/imports.mjs`: folder loading, JSON resource selection and relative import resolution.
- `dist/oscal_*_schema.json`: official NIST 1.0.4 schemas.
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
- [NIST 1.0.4 schema source](https://github.com/usnistgov/OSCAL/tree/v1.0.4/json/schema)
- [Ajv 8.17.1 bundle](https://github.com/ajv-validator/ajv-dist/tree/v8.17.1), MIT; see `THIRD_PARTY_NOTICES.md`.

The example catalogue is synthetic and is not an official NIST baseline. No assertion of full OSCAL resolver conformance is made.
