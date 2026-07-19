# Security Policy

## Supported Versions

Security fixes are applied to the current production deployment and the latest
version of the `main` branch. Older commits, forks, and locally modified builds
are not actively supported.

## Reporting a Vulnerability

Please do not open a public issue with vulnerability details.

Use GitHub's private vulnerability reporting flow when it is available:

1. Open the repository's [Security Advisories](https://github.com/Daren9m/Encounterizer/security/advisories).
2. Select **Report a vulnerability**.
3. Include the affected page or component, reproduction steps, expected impact,
   and any suggested mitigation.

If private reporting is unavailable, open a public issue titled
`Security contact requested` without including sensitive details. A maintainer
will arrange a private channel for the report.

You can expect an acknowledgement within three business days and an initial
assessment within seven business days. Please allow time for a fix to be
developed and released before public disclosure.

## Scope

Security reports may include, but are not limited to:

- cross-site scripting or unsafe rendering of imported content;
- malicious monster, spell, map, or encounter import files;
- exposure of browser-local data outside the user's device;
- dependency or build-pipeline vulnerabilities that affect the deployed site;
- flaws that allow generated links or exported files to execute unintended code.

Encounterizer is a static, client-side application with no user accounts,
database, or application server. Rules accuracy, balance concerns, and ordinary
functional bugs should be reported through [GitHub Issues](https://github.com/Daren9m/Encounterizer/issues).

## Safe Harbor

Good-faith security research is welcome when it avoids privacy violations,
service disruption, data destruction, and access beyond what is necessary to
demonstrate the issue. We will work with reporters to understand and resolve
valid findings and will credit them if they wish.
