# Engineering Passport

Engineering Passport is a GitHub-native, evidence-first repository report. It answers what a repository can actually prove from its files and GitHub-provided metadata.

It is not a rating, quality score, ranking, or developer assessment.

## Quick start

Add this workflow to any repository:

    name: Engineering Passport
    on: [push, workflow_dispatch]
    permissions:
      contents: read
      actions: read
    jobs:
      passport:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: mahboubi-younes/engineering-passport@main
            env:
              GITHUB_TOKEN: ${{ github.token }}
              GITHUB_REPOSITORY: ${{ github.repository }}
              GITHUB_STEP_SUMMARY: ${{ github.step_summary }}

The action writes engineering-passport.json, engineering-passport.md and engineering-passport.svg.

## Evidence model

The report detects README, license, source, build configuration, tests, CI workflows, deployment signals, documentation, assets, live demo URLs and technologies derived from actual files. When the Actions API is available it records workflow state and GitHub Pages metadata.

Statuses:

- VERIFIED: observed from available GitHub/API execution evidence
- DETECTED: a repository file or metadata signal exists
- UNKNOWN: evidence was not available; no claim is made

Unknown stays unknown. A detected test file is not the same as a passing test run.

## Privacy and security

The tool runs in the repository GitHub runner. It does not upload source code, use external telemetry, print secrets, or persist tokens. The token is only used for GitHub API calls when supplied by Actions. The action itself only needs contents: read and actions: read. This repository workflow additionally uses contents: write solely to commit the three generated evidence files; remove that commit step and use read-only permissions if artifacts should remain workflow-only.

## Self-validation

This repository runs the action on itself. Generated files are committed so visitors can inspect the exact evidence output.

## Limitations

GitHub API availability, workflow naming, private-repository permissions and local project conventions affect what can be verified. Browser behavior, business correctness, security, and unexecuted tests remain unknown unless explicit evidence exists.

## License

MIT.
