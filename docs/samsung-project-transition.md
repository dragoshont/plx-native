# Independent Samsung project transition

## Decision and current state

The product maintained here is the Samsung Tizen Web client. Its visual direction
was inspired by Gleb Linnik's PlxNative; retained source history and inherited
code are acknowledged, not recast as an unrelated clean-room implementation.
Use **Tizen-supported Web application stack**, not "native Rust application",
when describing the shipped package.

The current repository remains `dragoshont/plx-native` and GitHub still reports
it as a fork of `GLinnik21/plx-native`. This change establishes independent
documentation/support/release ownership **in place**. It does not rename the
remote, detach the fork, delete history or grant use of upstream trademarks.
The upstream author's latest message has not been reproduced or interpreted
as legal permission in this record.

## Compatibility during transition

Keep these stable until an explicit migration is designed and accepted:

- Repository URL, published tags, assets and checksums. Do not invalidate old
  installation commands or rewrite an already published release.
- Existing Samsung `PlxNative0.Plx` / package `PlxNative0` identity and author
  certificate continuity. Display branding and installation identity are
  different concerns; changing a package ID can create a separate installation.
- Existing acceleration, AVPlay and user preferences. The optional WebGL
  artwork mode remains off by default and is not promoted as a speedup.
- Copyright, GPL and third-party notices, historical grants and source offers.

The current **Plx** display name is an existing compatibility fact, not a
clearance of independent branding. Upstream reserves PlxNative and associated
brand artwork. Select an independently cleared name/artwork before declaring a
branding migration complete; do not borrow the upstream domain, sponsorship,
badges, support promises or screenshots as Samsung product claims.

## Repository ownership

Samsung app, tests, packaging and the Samsung workflow are the active product
surfaces. The LG source tree and records stay intact for provenance and source
obligations; no broad deletion or module restructure is part of this transition.

Root README and Samsung installation links lead to this project's releases and
issues. The root LG privacy/third-party/trademark documents retain explicit
scope. Samsung-specific data handling is documented separately. Do not send
Samsung support traffic to the upstream author's mailbox.

Inherited LG publishing automation must not be enabled to manufacture releases
under the upstream identity. At the time of this transition, GitHub reported
Nightly and Pages disabled manually; that observation is not a permanent guard.
A repository detachment/rename needs a separate review of scheduled workflows,
Pages custom domain, release identities, issue links and configured services
before enabling any automation. Samsung publication uses `samsung.yml`, not
`release.yml` or `rc.yml`.

## Repeatable Samsung release contract

1. Commit the exact product source and notes; require a clean tree.
2. Run `tools/tizen/test.sh` and the official Samsung CI on that source. A host
   pass is not a device pass; publish named-model acceptance and blocked cases.
3. Choose a new immutable `samsung-vX.Y.Z` prerelease. Keep `.wgt` version,
   application identity and author continuity explicit.
4. CI can publish with its configured release author secrets. If those are
   absent, use the existing repository-supported `samsung/release.py` with the
   private release author after CI passes; do not publish a throwaway CI author
   build as an update to an existing installation.
5. Supply reviewed notes, for example
   `python3 samsung/release.py X.Y.Z --notes-file docs/release-notes/samsung-vX.Y.Z.md`.
   `--no-publish` builds without publishing.
6. Independently download the public asset; verify checksum, manifest version,
   exact product payload, signature-reference digests and author continuity.
   Record source/tag and whether CI or the local canonical publisher signed it.
7. Install only on authorized identified TVs using their existing matching
   profile. Treat SDK acknowledgement and verified installed version as
   separate states. Never uninstall production to bypass an author mismatch.
8. Preserve dated results. Append corrections to published notes rather than
   replacing historical claims. New experimental features do not silently
   become on by default.

0.2.7 followed the CI-plus-local-author route. Its notes, exact artifact and
partial/follow-up deployment records are linked from
[the rollout record](samsung-0.2.7-rollout.md). This transition does not cut
another release.

## Benchmark ownership and licence boundary

The current Plx workload in `tools/tizen/graphics-benchmark/` stages the exact
0.2.7 release with inert Plex adapters, synthetic artwork and memory-only
settings. It is product-specific GPL code and stays here.

Tizen TV Builder is a separate MIT toolkit. Reusable benchmark orchestration,
bounded inspector collection, sample validation and statistics should live
there, consume an explicit application adapter and keep the same evidence
rules: original samples, labelled warmups, OFF/ON ordering, model/source
binding, absent counters never represented as zero, and no callback timing
reported as panel FPS.

The toolkit implementation is being delivered separately; until its tested
commit and commands are recorded here, a README link is not proof that the
benchmark is installed in the kit. Do not copy the GPL workload into an
MIT-only module or remove its provenance to claim reuse.

## Remaining external migration decisions

- Choose the long-term project name and independent visual identity.
- Decide whether to rename or detach the GitHub fork. Neither is performed by
  source edits; preserve redirects, tags, issues and Actions configuration.
- Integrate the reviewed transition and benchmark delivery into their respective
  default branches using the normal review/squash process. A feature-branch
  push is not a default-branch migration.

These decisions do not block truthful Samsung-first documentation or compatible
updates at the existing URL. They are recorded as pending, not silently guessed.
