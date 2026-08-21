# Working in this repository

## What wordie is

A browser game: the player is shown the outline of one Antarctic ice shelf —
its shape, but not its scale or its position — and picks the name from a list.
A wrong guess reports the distance to the answer and an arrow pointing towards
it.

The audience is the Antarctic research community, which sets the standard for
the geometry. Outlines are derived from published datasets by a pipeline in
this repository, never traced or adjusted by hand, and the derivation is
reproducible from the sources named in `README.md`.

## Branches and worktrees

`main` is protected: no direct pushes, no force pushes, and every change
arrives through a pull request. Work happens in a git worktree alongside
`main`, one per branch:

```bash
git -C /home/xylar/code/wordie/main worktree add ../my-branch -b my-branch
cd /home/xylar/code/wordie/my-branch
```

Pull requests merge as merge commits — squash and rebase merging are both
disabled — and the branch is deleted automatically on merge. Auto-merge is
enabled, so a pull request can be queued to land once CI is green. Afterwards,
prune the worktree:

```bash
git -C /home/xylar/code/wordie/main worktree remove ../my-branch
```

## The toolchain

Everything is managed by [pixi](https://pixi.sh), including Node, so a
checkout needs pixi and nothing else.

```bash
pixi install          # the environment
pixi run web-install  # npm ci, inside web/
pixi run dev          # serve the game at localhost:5173
pixi run check        # everything CI runs, both halves
```

Task names are verbs and each covers both halves: `test` runs pytest and
vitest, `typecheck` runs mypy and tsc, `fmt-check` runs ruff and prettier. The
`py-` and `web-` tasks underneath them are worth running directly only when
iterating on one half.

Run `pixi run check` before pushing. `pixi run fmt` fixes formatting rather
than reporting it.

## Layout

| Path | What lives there |
| --- | --- |
| `src/wordie/` | The pipeline: BedMachine's mask in, ice shelf outlines out |
| `tests/` | Tests for the pipeline |
| `web/` | The game: Vite and TypeScript, no framework |
| `web/src/` | Game source, including `scoring.ts` |
| `web/public/data/` | Derived ice shelf outlines, committed, served as static assets |
| `.github/workflows/ci.yml` | Checks, and the deploy to GitHub Pages from `main` |

Both halves share one pixi environment. They were kept apart at first on the
principle that a Node upgrade should not perturb the GDAL solve, but with both
in daily use the isolation bought less than the `-e web` on every command
cost.

## Conventions

Geometry is checked against a reference implementation rather than against
itself. `web/src/scoring.test.ts` pins the polar stereographic projection and
the geodesic to values produced with pyproj and PROJ 9.8.1; anything else
touching projections or distances should be pinned the same way. This audience
will notice.

Distance is a true geodesic on WGS 84. Direction is a bearing in the EPSG:3031
map plane, *not* the true initial bearing — near the pole those differ by
enough to send a player the wrong way, and the reasoning is written out in
`web/src/scoring.ts`.

Source data is never committed and never fetched automatically. BedMachine and
the MEaSUREs boundaries both sit behind an Earthdata Login and are hundreds of
megabytes; the pipeline takes paths to files that have already been downloaded,
and only the small derived outlines are tracked.

Where a derived quantity can be checked against the literature, check it, and
claim only what was actually checked. Polygonising the v3 mask gives 1,551,000
km2 of floating ice, against the more than 1.5 million km2 of Rignot et al.
(2013); the largest bodies fall where Ross, Filchner-Ronne, Amery and Getz
should be and at the right magnitudes. Per-shelf areas have not been compared
against a published table yet, and the code says so rather than implying
otherwise. That is the kind of evidence this audience will want before it
trusts a shape.

Comments explain why a thing is the way it is, not what the line does. If a
choice took thought — a formula that has a plausible wrong variant, a
dependency that exists for one reason — the comment records the reason.
