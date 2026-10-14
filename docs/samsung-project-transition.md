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

The GitHub repository description now identifies an independently maintained
Samsung Web/AVPlay client and credits the design inspiration. A fresh API
read still reports `fork: true`, parent `GLinnik21/plx-native`, default branch
`main`; no external rename, detachment or branch rewrite was performed.

On 2026-10-14, own Issues were enabled, Discussions remained off, topics were
set to Samsung/Tizen/Plex/AVPlay/JavaScript, and the homepage field was cleared.
The retired active Cache cleanup, native CI, native Release and Simulator CI
workflows were disabled before their files were removed; Nightly/Pages were
already disabled. The Pages API returned 404 (no configured site). No release,
upstream setting or GitHub fork-network membership was changed.

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

Published 0.2.7 retains its historical **Plx** display name. Current source uses
the **Vemm** working brand and original vector-first artwork. Vemm is not a claim
of completed trademark clearance, and the repository remains
`dragoshont/plx-native`. Upstream reserves PlxNative and associated brand
artwork. Do not borrow the upstream domain, sponsorship, badges, support
promises or screenshots as Samsung product claims.

## Repository ownership

Samsung app, tests, packaging and the Samsung workflow are the active product
surfaces. The [approved independence plan](samsung-repository-independence-plan.md)
supersedes the initial retain-native-tree policy: unused LG implementation,
build/release/site tooling and active instructions are removed. History, release
tags/assets, inherited notices and complete-source obligations remain intact.

Root README and Samsung installation links lead to this project's releases and
issues. Root privacy/security/build/licensing documents describe Samsung.
The old native dependency inventory is preserved in
`licenses/native-history-NOTICES.md` with immutable source references. Do not send
Samsung support traffic to the upstream author's mailbox.

Inherited LG workflows, website/CNAME and sponsorship routing are retired,
not left as inactive publishing templates. Samsung publication uses
`samsung.yml`; its SDK/signing job runs only on an explicit `samsung-v*` tag.
All PR/main changes run host/source CI without signing secrets. GitHub network
detachment/rename remains a separate preservation review, not a source edit.

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
   `--no-publish` builds without publishing. The publisher also attaches a
   matching complete-source archive/checksum created from the clean committed
   tree by `samsung/source_bundle.py`; notices/license texts travel in the WGT.
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

The toolkit implementation is committed and pushed at
[`e09c9f345170c7ada8309fc9be95ae8ae38e85e8`](https://github.com/dragoshont/tizen-tv-builder/commit/e09c9f345170c7ada8309fc9be95ae8ae38e85e8)
on `dragoshont-reusable-tv-benchmark-toolkit`. Its real commands are
`tizen.py benchmark run`, `benchmark validate` and `benchmark summarize`.
This is feature-branch delivery, not a default-branch merge or plugin release.

It attaches only to an explicitly identified existing inspector page, verifies
the supplied adapter contract, takes the toolkit's canonical/target leases,
collects bounded ABBA requests and retains raw observations. The caller still
owns fixture deployment and inspector-forward/app cleanup. It never installs
or launches production Plx.

The app's GPL `toolkit-adapter.js` bridges its existing exact-release workload
to that protocol; the staged descriptor binds the public 0.2.7 package and
fixture source. All four product blocks and cancellation run in host tests.
The toolkit validator accepted the actual app descriptor. Independent parent
checks reran 16 benchmark tests plus the MIT fixture test and recomputed the
offline fixture summary: warmup excluded, n=16 per mode, median 2.5, P95 4;
unknown GPU counters remain null rather than zero. The child also reported its
full 448-test Python suite passing on the clean committed tree.

The original device performance results were not rerun through this newly
integrated toolkit interface. Do not describe host protocol/summary checks as
new TV acceptance. No GPL app implementation was relicensed as MIT.

## Remaining external migration decisions

- Complete legal/name clearance and decide whether the repository should adopt
  the Vemm name. The working display brand and original non-PLX artwork are
  already in the active source.
- Decide whether to rename or detach the GitHub fork. Neither is performed by
  source edits; preserve redirects, tags, issues and Actions configuration.
- Verify default-branch integration by the actual squash PR/source SHA and CI.
  A feature-branch push alone is not migration evidence; the independence plan
  names the application integration gate.

These decisions do not block truthful Samsung-first documentation or compatible
updates at the existing URL. They are recorded as pending, not silently guessed.
