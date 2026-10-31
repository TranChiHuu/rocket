# Rocket · Falcon 9 & Starship 3D

Static site, no build step. Three.js r170 and GSAP 3 (ScrollTrigger, ScrollToPlugin) are vendored in `vendor/`.

- **Languages:** en (default), vi, ja, ko in `locales/*.json`. The language comes from `?lang=`, then a saved choice in localStorage, otherwise English. The browser language is never used.
- **Start mode:** Mission by default; use `?mode=anatomy` or `?mode=mission`.
- **Anatomy mode:** Falcon 9-style and Starship-style models with explode, x-ray, cutaway, CG/CP and part info.
- **Mission mode:** a flight-video style HUD with engine dots, phase track, T+, speed and altitude. There are 4 cameras plus chase, and scenarios for F9 (ASDS / RTLS) and Starship (ship splashdown, booster splash / tower catch).
- **Tuning:** `CFG` at the top of `js/main.js` covers bloom, HUD, particles and quality.
- **Branding:** these are generic, unbranded models; there are no SpaceX logos or trademarks.

## Earth & sky imagery (NASA, public domain)

All in `assets/earth/` as WebP: 4096×2048 for *High* quality and 2048×1024 for *Low* / mobile. The loader counts them in its progress.

| File | Source | Licence |
|---|---|---|
| `day_*` | NASA Visible Earth — Blue Marble Next Generation, Dec 2004 (`eoimages.gsfc.nasa.gov/.../74218/world.200412.3x5400x2700.jpg`) | Public domain (NASA Earth Observatory) |
| `night_*` | NASA Visible Earth — Black Marble 2016 (`.../144898/BlackMarble_2016_3km.jpg`) | Public domain (NASA Earth Observatory / NOAA) |
| `clouds_*` | NASA Visible Earth — Blue Marble clouds (`.../57747/cloud_combined_8192.tif`) | Public domain (NASA) |
| `topo_*` | NASA Visible Earth — Topography (GEBCO elevation, `.../73934/gebco_08_rev_elev_21600x10800.png`). R = elevation for bump, G = ocean mask (elevation ≤ 0, checked against Blue Marble colour) | Public domain (NASA; GEBCO data) |
| `stars_*` | Yale Bright Star Catalog, 5th ed. (BSC5, 9,096 stars), from NASA HEASARC (`heasarc.gsfc.nasa.gov/.../heasarc_bsc5p.tdat.gz`), rendered to an equirectangular map with B-V colour plus a faint procedural Milky Way glow. *The NASA SVS Deep Star Maps were not reachable from the build machine.* | Public domain catalog |

The site footer carries the "Imagery: NASA" credit.

Run locally: `python3 -m http.server 8000`, then open http://localhost:8000

Deploy: `npx wrangler pages deploy . --project-name rocket --branch main`
