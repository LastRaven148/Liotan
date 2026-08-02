# Security policy

Do not open a public issue for a suspected vulnerability and do not include
production credentials or private user content in a report.

Repository maintainers can create a draft security advisory in the repository's
**Security → Advisories → New draft advisory** page. GitHub Private
Vulnerability Reporting is enabled for external reporters. Use
**Security → Advisories → Report a vulnerability** to submit a private report
without opening a public issue.

A report should include the affected version, reproduction steps, impact, and
the smallest proof of concept that can be shared safely.

Only the newest released version receives security fixes. A release is
considered supported only when its source archive checksum and GitHub build
provenance verify successfully. Security-sensitive changes must pass the full
release gate, dependency review, and CodeQL analysis before deployment.
