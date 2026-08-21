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
pixi install     # the environment
pixi run install # npm ci, inside web/
pixi run dev     # serve the game at localhost:5173
pixi run check   # everything CI runs: prettier, tsc, vitest, vite build
```

Run `pixi run check` before pushing. `pixi run fmt` fixes formatting rather
than reporting it.

## Layout

| Path | What lives there |
| --- | --- |
| `web/` | The game: Vite and TypeScript, no framework |
| `web/src/` | Game source, including `scoring.ts` |
| `web/public/data/` | Derived ice shelf outlines, committed, served as static assets |
| `.github/workflows/ci.yml` | Checks, and the deploy to GitHub Pages from `main` |

The Python pipeline that derives the outlines is not here yet; it will arrive
as `src/wordie/` with its own pixi feature and environment.

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

Comments explain why a thing is the way it is, not what the line does. If a
choice took thought — a formula that has a plausible wrong variant, a
dependency that exists for one reason — the comment records the reason.
