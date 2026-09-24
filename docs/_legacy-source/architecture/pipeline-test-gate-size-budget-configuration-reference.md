# Size-Budget Configuration Reference

Status: current

These fields are project-owned.
The provider has no provider-specific operator field.

## `format`

- Owner: project.
- Type: enum.
- Required: no.
- Default: `auto`.
- Allowed values: `auto`, `file`, `tar`, and `tar-gzip`.
- Meaning: selects input interpretation.
- Security effect: a mismatch fails before measurement.
- Failure: `SIZE_BUDGET_FORMAT_MISMATCH`.
- Example: `tar-gzip`.

## `maximumTotalBytes`

- Owner: project.
- Type: safe integer.
- Required: no.
- Default: none.
- Minimum: 0.
- Maximum: 9,007,199,254,740,991.
- Meaning: maximum expanded content bytes.
- Security effect: none.
- Failure: a breach fails the provider result.
- Example: 10485760.

## `maximumFileCount`

- Owner: project.
- Type: integer.
- Required: no.
- Default: none.
- Minimum: 0.
- Maximum: 100,000.
- Meaning: maximum number of regular files in the artifact.
- Security effect: none.
- Failure: a breach fails the provider result.
- Example: 5000.

## `matchingFiles`

- Owner: project.
- Type: array of rule objects.
- Required: no.
- Default: empty array.
- Maximum: 32 rules.
- Meaning: limits the byte sum for each matching file set.
- Security effect: pattern and result counts are bounded.
- Failure: an invalid rule fails configuration.
- Example: one JavaScript rule in the user guide.

## `matchingFiles[].id`

- Owner: project.
- Type: stable name.
- Required: yes for each rule.
- Default: none.
- Maximum: 128 characters.
- Meaning: identifies one finding and measurement.
- Security effect: duplicate identifiers are rejected.
- Failure: `SIZE_BUDGET_RULE_ID_INVALID`.
- Example: `javascript`.

## `matchingFiles[].pattern`

- Owner: project.
- Type: glob string.
- Required: yes for each rule.
- Default: none.
- Maximum: 512 characters.
- Meaning: selects artifact paths with `*`, `**`, and `?`.
- Security effect: the provider compiles a bounded regular expression.
- Failure: `SIZE_BUDGET_PATTERN_INVALID`.
- Example: `assets/**/*.js`.

## `matchingFiles[].maximumBytes`

- Owner: project.
- Type: safe integer.
- Required: yes for each rule.
- Default: none.
- Minimum: 0.
- Maximum: 9,007,199,254,740,991.
- Meaning: maximum byte sum for matching files.
- Security effect: none.
- Failure: a breach fails the provider result.
- Example: 5242880.

## `matchingFiles[].requireMatch`

- Owner: project.
- Type: boolean.
- Required: no.
- Default: true.
- Meaning: fails the rule when no file matches.
- Security effect: prevents a spelling error from creating a silent pass.
- Failure: no match fails the provider result.
- Example: true.

## `maximumGrowthBytes`

- Owner: project.
- Type: safe integer.
- Required: no.
- Default: none.
- Minimum: 0.
- Maximum: 9,007,199,254,740,991.
- Meaning: maximum total-size increase from the baseline.
- Security effect: requires a verified baseline artifact.
- Failure: a breach fails the provider result.
- Example: 262144.

## `maximumGrowthPercent`

- Owner: project.
- Type: finite number.
- Required: no.
- Default: none.
- Minimum: 0.
- Maximum: 1,000,000.
- Meaning: maximum percentage increase from the baseline.
- Security effect: requires a verified baseline artifact.
- Failure: a breach or unbounded zero baseline fails the result.
- Example: 5.

## `largestFiles`

- Owner: project.
- Type: integer.
- Required: no.
- Default: 10.
- Minimum: 1.
- Maximum: 100.
- Meaning: number of largest-file facts in provider details.
- Security effect: bounds result size.
- Failure: invalid values fail configuration.
- Example: 20.
