# OSCAL Lens

A browser-based OSCAL JSON explorer for catalogues and profile selections. Inspect nested groups, controls, enhancements, parameters and **grey matter**: group-level prose and guidance, document metadata, properties, links, roles, parties and back-matter resources.

## Run

Requires Node.js 20 or later. There are no installation steps or runtime package downloads.

```sh
npm start
```

Open http://localhost:3000. Run `npm test` for the schema-validation and profile-selection tests. Deploy `dist/` to any static host; serve through HTTP rather than opening `index.html` as a file.

## Use

1. Start with the illustrative example workspace, or choose **Open files**.
2. Select an OSCAL profile and all of its source catalogue/profile JSON files. Multiple uploads accumulate in the workspace; a matching filename replaces its previous document. Each file is limited to 20 MB.
3. Choose a document in the sidebar. Filter controls by group or search their content.
4. Expand controls to read requirements and parameters. **Grey matter** retains document and group context; control-specific supporting material appears within the control.
5. Open **Validation** for schema errors and processing notices, or **Source** for the original JSON.

## Validation scope

Bundled, unmodified NIST **OSCAL 1.0.4** catalogue and profile JSON Schemas are checked using Ajv 8.17.1. Missing fields, types, patterns, prohibited properties and duplicate identifiers are reported. URI, URI-reference, email and date-time formats use lightweight application checks; they are not exhaustive RFC validators. Newer OSCAL declarations produce a version warning: passing the old schema does **not** establish conformance with a newer release. XML and YAML are not accepted.

Schema validity is distinct from profile processing and does not prove referential integrity, parameter constraint satisfaction or security compliance. This is an inspection tool, not a certification validator.

## Profile selection scope

Supported: multiple catalogue imports, recursive profile imports, `include-all`, explicit `with-ids`, wildcard `matching`, `with-child-controls`, exclusions, cycle detection, missing-selection errors, original group context and control-level `set-parameters`. Local filenames bind imports, first by exact name then by an unambiguous final path segment. Internal `#resource` imports use their first back-matter `rlinks` file reference. Sources are never fetched automatically. Load external sources yourself. Base64 imports and full URI-resolution semantics are not supported.

The result is deliberately labelled a **selection preview**, not a resolved OSCAL catalogue. `merge.custom`, merge combine policies, flattening, `modify.alters`, document/group parameter tailoring and final metadata/back-matter reconciliation are not implemented. These operations produce notices when encountered; duplicates remain visible. Source groups and original grey matter are retained for inspection, including groups with no selected controls. For complete standards-oriented profile resolution, use [NIST OSCAL CLI](https://github.com/usnistgov/oscal-cli) and load its resulting catalogue here.

## Privacy and security

Loaded documents stay in memory in your browser. There is no document upload service, analytics or persistent document storage. Refreshing clears loaded files. Content is escaped and shown as text; embedded HTML, OSCAL prose markup and links are not executed. External links in documents are shown as text. Very large or deeply nested documents can exceed browser resources despite the per-file limit.

## Project layout

- `dist/index.html`, `styles.css`, `app.mjs`: accessible responsive interface and example workspace.
- `dist/engine.mjs`: schema validation and profile-selection logic.
- `dist/oscal_*_schema.json`: official NIST 1.0.4 schemas.
- `dist/ajv.js`: vendored Ajv browser bundle.
- `server.cjs`: dependency-free local HTTP server.
- `tests/engine.cjs`: processing and validation regression tests.

## GitHub

Source repository: https://github.com/mikekuk/oscal-lens

## References and third-party notices

- [NIST OSCAL](https://pages.nist.gov/OSCAL/)
- [Profile processing specification](https://pages.nist.gov/OSCAL/learn/concepts/processing/profile-resolution/)
- [NIST 1.0.4 schema source](https://github.com/usnistgov/OSCAL/tree/v1.0.4/json/schema)
- [Ajv 8.17.1 bundle](https://github.com/ajv-validator/ajv-dist/tree/v8.17.1), MIT; see `THIRD_PARTY_NOTICES.md`.

The example catalogue is synthetic and is not an official NIST baseline. No assertion of full OSCAL resolver conformance is made.
