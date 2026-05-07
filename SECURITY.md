# Security Policy

Please do not report vulnerabilities through public issues if the report
contains sensitive details.

Open a private security advisory on the repository host, or contact the
maintainer directly if private advisories are unavailable.

## Credentials

This repository does not include production credentials. Operators must provide
their own Firebase, Sanity, Expo/EAS, app store, signing, and deployment
credentials through ignored local env files or secret managers.

If a real credential is accidentally committed or published, rotate it at the
provider immediately. Removing it from the current tree is not enough if it
appeared in Git history.
