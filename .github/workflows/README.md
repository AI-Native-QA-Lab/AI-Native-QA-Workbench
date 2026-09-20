# CI Workflows

Recommended workflows:

## ci.yml

`Install → Lint → Typecheck → Architecture Check → Unit → Contract → Integration → Build → i18n → Docs → Golden Path E2E`

No live LLM API is required.

## provider-compatibility.yml

Manual/scheduled/release-only compatibility checks against real
providers.

## release.yml

Version, changelog, package/build verification, release artifacts and
release notes.
