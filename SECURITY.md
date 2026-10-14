# Security policy

Vemm Samsung client reports belong to **dragoshont/vemm**, not the upstream
LG maintainer. Use this repository's
[Security page](https://github.com/dragoshont/vemm/security) for available
private reporting options. If none is offered, open a minimal
[issue](https://github.com/dragoshont/vemm/issues/new) requesting a private
channel **without exploit details, credentials, personal data or raw logs**.
There is no inherited bounty or response-time promise.

## Scope

The maintained scope is `samsung/Vemm/`, authentication/network/storage,
AVPlay integration, WGT/source packaging and the app-specific host tools.
Report a concrete failure and affected source/release, model, firmware and
runtime when known. Include a synthetic reproduction where possible.

Tokens in unencrypted Web storage are a documented limitation, not a claim of
encrypted credential storage. Token/redirect isolation, bounded requests,
explicit viewing-state writes, lifecycle cleanup, package contents and
signature/source continuity are important boundaries. See
[data handling](PRIVACY.md).

This app has no maintainer-operated backend, analytics or crash-upload service.
Do not use the former native client's Sentry/PostHog policies or mailboxes for
this Samsung implementation. Historical LG code and its policies remain in Git
history, not in the active product. The separate
[Tizen toolkit](https://github.com/dragoshont/tizen-tv-builder) has its own
reporting process. Samsung firmware and Plex services are owned by their
respective providers; their operation is not guaranteed by this project.

Never attach signing certificates, passwords, DUIDs, account tokens, private
server locations, household library data or unredacted inspector records to a
public issue.
