# wordie

A browser game in the spirit of [worldl](https://worldl.io/country), but for
Antarctic ice shelves. You are shown the outline of one ice shelf — its shape,
but not its scale or its position on the continent. You pick a name from the
list of candidates; a wrong guess tells you how far your guess is from the
answer and which way to go.

The intended audience is the Antarctic research community, who will recognise a
badly drawn Amery from across the room. So the outlines are not
hand-traced — they are derived from the same datasets the community publishes
with, and the pipeline that derives them lives in this repository.

## Where the shapes come from

Two datasets, doing two different jobs.

**Geometry** comes from [MEaSUREs BedMachine Antarctica, Version
4](https://nsidc.org/data/nsidc-0756/versions/4) (Morlighem, 2025;
doi:10.5067/POJQI54A45HX). BedMachine's `mask` field distinguishes floating ice
(value `3`) from grounded ice, ice-free land and ocean on a 500 m grid in
Antarctic Polar Stereographic (EPSG:3031), and tracing the boundary of the
floating-ice mask gives ice shelf outlines that are consistent with the bed and
thickness fields everyone is already using.

**Names** come from [MEaSUREs Antarctic Boundaries for IPY 2007-2009 from
Satellite Radar, Version 2](https://nsidc.org/data/nsidc-0709/versions/2)
(Mouginot, Scheuchl & Rignot, 2017), whose `IceBoundaries_Antarctica_v02`
polygons carry the 147 ice shelf names. Each traced BedMachine polygon is
labelled by spatial join against those named polygons.

The split is deliberate. BedMachine v4 is the more current geometry, but its
mask is unnamed; the MEaSUREs boundaries are named but describe fronts as they
stood during the IPY. Taking geometry from one and names from the other keeps
the shapes modern without hand-maintaining a name list.

Both are NASA MEaSUREs products distributed by NSIDC and require a free
[Earthdata Login](https://urs.earthdata.nasa.gov/) to download. Neither source
file is committed here — the pipeline fetches them on demand, and only the
small derived outlines are tracked.

## How a guess is scored

Distance is the true geodesic distance between shelf centroids on WGS 84, in km.

Direction, though, is the bearing *as it appears on a standard polar
stereographic map* (EPSG:3031), not the true initial bearing of the great
circle. On a continent draped over the pole those two disagree badly: the great
circle from Ross to Amery passes close to the South Pole, so its initial bearing
reads as "south" even though Amery lies at a lower latitude. The map-plane
bearing matches the mental map the player is working from.

## Layout

| Path | What lives there |
| --- | --- |
| `web/` | The game itself: Vite + TypeScript, no framework |
| `web/src/scoring.ts` | Distance and bearing between two shelves |
| `web/public/data/` | Derived outlines, committed, served as static assets |

The pipeline that derives the outlines is not written yet; it will arrive as
`src/wordie/`, with its own pixi environment.

## Developing

The toolchain is managed by [pixi](https://pixi.sh), which supplies Node as
well, so a checkout needs pixi and nothing else.

```bash
pixi install      # the environment
pixi run install  # npm ci, inside web/
pixi run dev      # serve the game at localhost:5173
```

The checks, which are the same ones CI runs:

```bash
pixi run check    # prettier, tsc, vitest and a production build
pixi run fmt      # fix formatting rather than report it
```

Development happens in git worktrees alongside `main`, one per branch, and
reaches `main` only through a pull request. See `CLAUDE.md`.

## License

BSD 3-Clause. See `LICENSE`.

The datasets above are separate works with their own terms; the citations in
this README are a condition of using them and should travel with anything
derived from them.
