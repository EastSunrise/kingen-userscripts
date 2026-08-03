# Kingen Userscripts

Tampermonkey userscripts for local study tools.

## Scripts

- [PotPlayer WebVideo Bridge](potplayer/potplayer.js)
  - Runs only on `kingen.my` local study host pages.
  - Adds PotPlayer links for HTML5 and Video.js video instances.
  - Install: <https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/potplayer/potplayer.js>
- [Sukebei Helper](sukebei/sukebei.js)
  - Runs only on `kingen.my` under `/study/`.
  - Adds Sukebei search links on work list and detail pages.
  - Install: <https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/sukebei/sukebei.js>
- [DPlayer Enhancer](dplayer/dplayer.js)
  - Adds five-second rewind and forward buttons to DPlayer controls.
  - Install: <https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/dplayer/dplayer.js>
- [Tag Helper](tag-helper/tag-helper.js)
  - Links recognized work tags in YouTube descriptions and comments to the local work resolver.
  - Saves marked channels in the `TARGET_CHANNELS` cookie and rescans dynamic content.
  - Install: <https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/tag-helper/tag-helper.js>

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
