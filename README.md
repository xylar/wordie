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

## The name

Two readings, both intended.

The first is the obvious one: this is a Wordle-shaped game, and it wants a
Wordle-shaped name.

The second is that there is a **Wordie Ice Shelf**. It lay in Marguerite Bay on
the west coast of the Antarctic Peninsula, and it was named by the British
Graham Land Expedition of 1934–37 for Sir James Wordie, the geologist who ran
the scientific staff on Shackleton's *Endurance*.

It is gone. Wordie disintegrated over a series of events from the 1960s
onwards, the subject of Doake and Vaughan's 1991 paper [*Rapid disintegration
of the Wordie Ice Shelf in response to atmospheric
warming*](https://www.nature.com/articles/350328a0) — the first of the
Peninsula collapses, before Larsen A, Larsen B and Wilkins. By 2004 satellite
imagery showed the shelf had broken away entirely. The water it used to cover
is now called Wordie Bay.

In the dataset this game draws from, Wordie survives as five fragments
totalling 285 km². It is in the answer list. Every shelf in this game is a
shape someone measured, and at least one of them is a shape that no longer
exists.

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
file is committed here, and neither is fetched automatically: the pipeline
takes paths to files you have already downloaded. Only the small derived
outlines are tracked. Citing both datasets is a condition of using them, which
is why the citations above are in the README rather than in a footnote.

## Where the two datasets disagree

They describe the same shelves eight years apart, so they do not agree exactly.
98.4% of BedMachine's floating ice falls inside a named MEaSUREs polygon. What
matters is the rest, and connectivity sorts it out without a threshold to
argue over:

- A connected body of floating ice **overlapping a named polygon is that
  shelf**, leftover included. The front advanced or retreated between the two
  datasets; cropping it would draw a front that neither dataset asserts. This
  adopts 9,510 km².
- A connected body **overlapping no named polygon** is an iceberg or a patch of
  unnamed island ice, and is dropped — the game cannot ask about a shape with
  no name. This discards 873 bodies totalling 6,744 km², none larger than
  1,000 km².

The same intersection does the other necessary job. BedMachine has Filchner and
Ronne as a single connected body of 444,000 km², because they are; only the
MEaSUREs polygons say where the line between them runs.

One shelf does not survive the crossing. `Paternostro`, 6.5 km² in MEaSUREs,
has nothing floating in BedMachine at all, so the game has 164 shelves rather
than 165.

## Playing

Six guesses. Every wrong one reports how far the shelf you named is from the
answer, and an arrow pointing towards it.

The answer comes from an everyday pool of 52: the 50 largest shelves, plus
Wordie and Larsen A. Ranking by area turns out to be a good stand-in for fame —
the largest 50 hold Ross, the Filchner-Ronne, Amery, Larsen B through D, George
VI, Wilkins, Pine Island, Thwaites, Getz, Totten and the Dronning Maud Land
chain — and it misses in exactly one way, which is that it cannot see a shelf
famous for having gone. Wordie disintegrated by 2004 and Larsen A in 1995; both
are far too small to qualify on area and far too well known to leave out.

Guessing, though, is open across all 164 named shelves. A wrong guess is only
worth making if it can tell you where you are.

The puzzle is the same for everyone on a given UTC day — the players this is
for are spread across every longitude by profession — and every shelf in the
pool comes up once before any comes up twice.

## How a guess is scored

Distance is the true geodesic distance between shelf centroids on WGS 84, in km.

Direction, though, is the bearing *as it appears on a standard polar
stereographic map* (EPSG:3031), not the true initial bearing of the great
circle. On a continent draped over the pole those two disagree badly: the great
circle from Ross to Amery passes close to the South Pole, so its initial bearing
reads as "south" even though Amery lies at a lower latitude. The map-plane
bearing matches the mental map the player is working from.

## What the browser downloads

`web/public/data/shelves.geojson` holds all 164 outlines: 577 kB, and about
90 kB over the wire once the server compresses it. Two things make it that
small, and both follow from the same fact — every shelf is drawn alone and
scaled to fill the same box, so on screen Ross and Rydberg Peninsula are the
same size.

That makes anything measured in metres meaningless. A 500 m tolerance is a
twentieth of a pixel on Ross and a quarter of the whole shape on Rydberg, so
**simplification is relative to each shelf's own extent** — half a pixel at the
size the game draws.

Underneath sits a floor of one BedMachine cell, because an outline traced from
a raster runs along cell edges and carries a staircase that is quantisation
rather than coastline: no ice front is stepped at 500 m. The display tolerance
only exceeds a cell on shelves wider than 250 km, and 36 of the 52 shelves in
the answer pool are narrower than that, so without the floor most of the game
is drawn with the grid showing through. The floor is capped against each
*piece* rather than each shelf — Wordie's five fragments span 63 km but the
smallest is 3 km across, and a whole cell would swallow it.

Together these leave 30,770 vertices of the original 123,633, and move no
well-known shelf's area by more than half a percent.

The geometry is written in **EPSG:3031 metres rather than degrees**. RFC 7946
asks for WGS 84 and allows another system by prior arrangement, which this is:
the only consumer is the game, which draws in this projection, so degrees would
mean projecting 30,000 coordinates in the browser to undo work already done in
the pipeline. Whole metres are finer than the smallest shelf needs and compress
to a third of what the same shapes cost as decimal degrees. The file says which
projection it is in, and `--output` gives ordinary lon/lat GeoJSON if that is
what you want. Shelf centroids stay in degrees, in each feature's properties,
because that is what scoring a guess needs.

## Layout

| Path | What lives there |
| --- | --- |
| `src/wordie/` | The pipeline: BedMachine's mask in, named ice shelves out |
| `docs/shelf-names.md` | Every name the game can use, and how it was arrived at |
| `tests/` | Tests for the pipeline, over synthetic rasters |
| `web/` | The game itself: Vite + TypeScript, no framework |
| `web/src/scoring.ts` | Distance and bearing between two shelves |
| `web/src/game.ts` | The rules, with no reference to the page they are drawn on |
| `web/public/data/` | Derived outlines, committed, served as static assets |

## Running the pipeline

Download the two source files first — both need an Earthdata Login, and
neither is redistributed here:

1. [BedMachine Antarctica v4](https://nsidc.org/data/nsidc-0756/versions/4) —
   `NSIDC-0756_BedMachineAntarctica_19700101-20191001_V04.1.nc`
2. [Antarctic Boundaries v2](https://nsidc.org/data/nsidc-0709/versions/2) —
   the shapefile bundle containing `IceBoundaries_Antarctica_v02.shp`

Put both beside the repository rather than inside it, in a `data` directory
alongside the worktrees:

```
code/wordie/
├── data/        <- the downloads live here, outside every worktree
├── main/
└── <branch>/    <- one worktree per branch
```

That is where the commands look by default, so they can be run with no
arguments from the root of a worktree. `WORDIE_DATA_DIR` overrides it, and
`--bedmachine` and `--boundaries` override that.

```bash
pixi run wordie-data shelves --output shelves.geojson    # the whole pipeline
pixi run wordie-data outlines --output outlines.geojson  # just trace the mask
pixi run wordie-data names                               # just list the names
pixi run wordie-data names --format markdown             # docs/shelf-names.md
pixi run wordie-data logo                                # redraw the logo
```

`shelves` is the one that matters: it traces the mask, attaches the names, and
cuts the bodies that more than one shelf claims. It takes about ten seconds and
yields 164 named shelves. Simplifying them into something a browser should
download is the next stage and is not written yet.

## Developing

The toolchain is managed by [pixi](https://pixi.sh), which supplies Node as
well as Python, so a checkout needs pixi and nothing else.

```bash
pixi install          # the environment
pixi run web-install  # npm ci, inside web/
pixi run dev          # serve the game at localhost:5173
```

The checks, which are the same ones CI runs. Each verb covers both halves of
the project — `test` runs pytest and vitest, `typecheck` runs mypy and tsc:

```bash
pixi run check        # lint, format, typecheck, test, and a production build
pixi run fmt          # fix formatting rather than report it
```

Development happens in git worktrees alongside `main`, one per branch, and
reaches `main` only through a pull request. See `CLAUDE.md`.

## License and citation

The code is BSD 3-Clause. See `LICENSE`.

The datasets are separate works. Both are NASA MEaSUREs products distributed by
the NSIDC DAAC, and both state the same condition of use: **cite them**. NASA
claims no copyright in its Earth science data — "no copyright is claimed in the
United States under Title 17, U.S. Code to any U.S. Government created work" —
and its
[open data policy](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies)
commits to full and open sharing with no restriction on redistribution or on
preparing derivative works. NSIDC's own
[use policy](https://nsidc.org/about/data-use-and-copyright) asks for citation
and imposes no redistribution terms on data. The Earthdata Login that guards
the downloads is an access mechanism, not a licence condition.

So the derived outlines in `web/public/data/` are redistributable, and this
repository does three things to keep that honest:

- **Neither source file is committed or fetched automatically.** They are
  downloaded by hand and kept outside the repository.
- **The citations travel inside the derived file**, not only in this README,
  because that file is served on its own and saved by whoever wants it.
- **The derived file says it is derived.** The outlines are simplified
  per shelf, so they are not at a uniform resolution and are not suitable for
  measurement. Cite the sources, not this game.
