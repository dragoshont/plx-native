# Install Plx on a Samsung TV

## 1. Turn on Developer Mode on the TV

1. Open **Apps** on the TV.
2. Press **1 2 3 4 5** on the remote.
3. Set **Developer Mode** to **On**.
4. Enter this computer's IP address as **Host PC IP**.
5. Hold the remote's power button until the TV restarts.

## 2. Install Tizen Studio on your computer (once)

Download it from <https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html> and install it in your home folder.

## 3. Install Plx on the TV

On macOS or Linux, run:

```sh
curl -fsSLO https://raw.githubusercontent.com/dragoshont/plx-native/dragoshont-samsung-tizen-feasibility/samsung/install.sh
bash install.sh TV_IP
```

Replace `TV_IP` with the TV's IP address. You can find it in **Settings → General → Network → Network Status → IP Settings**.

The script downloads the latest `Plx-VERSION.wgt` from [Releases](https://github.com/dragoshont/plx-native/releases), sends it to the TV and installs it. To pick a version, run `bash install.sh TV_IP 0.2.1`.

On the TV, open **Plx** from **Apps**, then go to **plex.tv/link** on your phone and enter the code shown on the TV.

---

If something goes wrong, see the [developer guide](samsung-getting-started.md).
