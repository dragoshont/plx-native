# Samsung Tizen TV: getting started (for beginners)

Part of the [Samsung feasibility study](samsung-tizen-feasibility.md). This is a plain-language
checklist for preparing a Samsung TV and a computer for the
[proof of concept](samsung-tizen-poc.md). **It has not been run**: no Samsung TV, SDK or certificate
was used to write it, and nothing here is installed or authorised. Steps follow Samsung's published
pages; where a page changes, Samsung's wins. Ask the owner before installing anything.

## What you are building

A Samsung TV app is a small website packaged as a `.wgt` file. You sign it with a certificate that
names your TV, install it over your home network, and run it. No rooting or jailbreaking is involved,
and none is proposed. This is different from the existing LG app, which stays untouched.

## 1. Find out exactly which TV you have

Write down, in a private note (not in git):

- Full model code from the label or Settings (for example `QN55Q60RAFXZA`), region, and model year (the 5th letter of the code on most models).
- Software version: Settings > Support > About This TV.
- The Frame: note that it is The Frame; Art Mode and standby are tested separately.
- The TV's Unique Device ID (DUID): Menu > Support > Contact Samsung > Unique Device ID [samsung].

Why: Samsung's support depends on model group and firmware, not only the year. Never put the DUID,
serial number, IP address or account name in a commit, issue or screenshot.

## 2. Computer

- Same Wi-Fi/LAN as the TV, with no client isolation.
- Install **Tizen Studio** and the **TV Extension** from Samsung's SDK pages (needs a free Samsung
  account). Only do this with the owner's go-ahead. Apple Silicon support was not established in the
  pages read; check Samsung's page for your Mac first.
- The Samsung simulator uses a different engine from the TV, so final tests always use the real TV [samsung].

## 3. Signing certificate

1. In Tizen Studio open Tools > Certificate Manager and add a profile, type Samsung > TV.
2. Create an **author** certificate, then a **distributor** certificate. Enter the TV's DUID in the distributor step [samsung].
3. Keep the `.p12` files and passwords outside the repository (treat them like the repo's other private files).

A certificate is tied to named devices; installing on a new TV means a new distributor certificate.

## 4. Turn on Developer Mode on the TV

On the TV, open the Apps panel, enter Developer Mode, enable it and type the computer's IP address.
Restart the TV. The exact keys differ by year, so follow Samsung's page for your model. Then connect
from Tizen Studio's Device Manager.

## 5. First app: "hello TV"

1. Create a Web application for TV with the blank template (an `index.html` and a `config.xml`).
2. Show `navigator.userAgent`, `window.innerWidth`/`innerHeight`, and the result of
   `webapis.productinfo.isUdPanelSupported()`.
3. Build, sign with the certificate profile, install to the TV, run it.
4. Copy the output into the private notes with the date. This is the first real data point for the model.

If this does not work, stop and fix it first. Do not start any Plex work.

## 6. Rules for the proof of concept

- Use a throwaway test server with lawful sample media. Use a guest or test account, never a household's real profile or watch history.
- Do not disable TLS verification as a shortcut. Record what happens instead.
- Do not publish tokens, addresses, certificates, or DUIDs.
- Label results with model, firmware and date; claim only what was observed.

## Glossary

- **`.wgt`**: Samsung's packaged web app.
- **DUID**: the TV's unique ID, used in the certificate.
- **AVPlay**: Samsung's video API; needed for UHD on 2018 TVs (2017 limits not yet verified).
- **MSE**: the browser video interface; FHD-only on 2018 TVs.
- **Distributor certificate**: the certificate that lists which TVs may install your app.
