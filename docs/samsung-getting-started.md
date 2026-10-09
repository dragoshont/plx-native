# Samsung Tizen getting started (prerequisites only)

Companion to [samsung-tizen-feasibility.md](samsung-tizen-feasibility.md). This is a checklist for
the feasibility spike. It was **not executed**: no Samsung television, SDK or certificate was
used in writing it. Follow Samsung's current pages where they differ.

## 1. Collect device facts

Full model code, region, firmware, Tizen version (2018 = 4.0), whether it is a The Frame
(test Art Mode separately), and which remote it uses.
Record them in a private note. Do not commit the TV's IP address, DUID or serial number.

## 2. Tooling

- Install Tizen Studio with the TV Extension: see Samsung's
  [SDK setup](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
  and [TV Extension downloads](https://developer.samsung.com/smarttv/develop/tools/tv-extension/download.html).
- Native Apple Silicon support was not established in the consulted documentation; check before
  installing, and do not change host tooling without agreeing it first.

## 3. Certificate

A retail TV requires a signing certificate whose distributor profile lists the TV's DUID
([creating certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)).
Create it with a Samsung account in Certificate Manager. Keep `.p12` files and passwords out of
the repository (they are private-file material, like `pkg/auth.json`).

## 4. Developer Mode on the TV

Enable Developer Mode in the TV's Apps panel, enter the development machine's IP, reboot, then
connect from Device Manager. Exact key sequence varies by year; use Samsung's documentation for
the model.

## 5. Minimal sideload test

1. Create a blank Tizen Web application for TV (a single `index.html` and `config.xml`).
2. Show `navigator.userAgent` and the screen size on the page.
3. Sign with the DUID certificate, install through Device Manager, launch, and read the output.

If this fails, resolve it before any Plex work. Expect Developer-Mode installs to be per-device
and to need re-signing when certificates expire.

## 6. Spike probes

Run the four probes from the feasibility study's "Spike gate" with lawful sample files and a
Plex Media Server that holds only test media. Use a guest or throwaway account, never a
household's real profile. Do not disable TLS verification as a shortcut; record the certificate
chain behaviour instead.

## 7. Reporting

Record each result with the model, firmware and date. Label support as one of: *documented
baseline*, *package produced*, *installed*, *playback tested*. Do not state broader support than
the label shows.
