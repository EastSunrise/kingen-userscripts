# Kingen Userscripts

Tampermonkey userscripts for local study tools.

## Scripts

- [PotPlayer WebVideo Bridge](potplayer/potplayer.js)
  - Runs only on `127.*` and `192.*` local IPv4 addresses.
  - Adds PotPlayer links for HTML5 and Video.js video instances.
  - Install: <https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/potplayer/potplayer.js>
- [Sukebei Helper](sukebei/sukebei.js)
  - Runs only on local `127.*` and `192.*` IPv4 addresses under `/study/`.
  - Adds Sukebei search links on work list and detail pages.
  - Install: <https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/sukebei/sukebei.js>
- [DPlayer Enhancer](dplayer/dplayer.js)
  - Adds five-second rewind and forward buttons to DPlayer controls.
  - Install: <https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/dplayer/dplayer.js>

## PotPlayer protocol bridge

From the repository root, register the `potplayer://` protocol for the current user:

```text
py -3 potplayer\\potplayer_protocol.py register
```

To remove the registration:

```text
py -3 potplayer\\potplayer_protocol.py unregister
```

After changing a script, increase its `@version`, push to `master`, and Tampermonkey can detect the new version from its `@updateURL`.
