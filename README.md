# lemon microdata refinement

A Severance-style Macrodata Refinement
terminal for your Claude Code agent sessions — a parody skin (original art, no Lumon marks)
that turns your work into a drifting field of numbers, "scary" clusters that gather and
pour into five **refinement boxes**, all on a muted-cyan CRT, with the Lumon **reward
economy** as the payoff.

```sh
npx lemon-mdr
```

That's it — it reads your `~/.claude` transcripts, opens the terminal in your browser, and
refines your sessions in real time. **Fully self-contained**: its own watcher + server, two
small deps (`chokidar`, `ws`), no setup.

## The mapping

| Severance MDR | Agent observer |
| --- | --- |
| A **file** ("Cold Harbor") | The **project** — all its sessions aggregated; the header codename is hashed from the founding session |
| The drifting **number field** | The live work stream (ambient over real counts) |
| A **"scary" cluster** gathering above a box and pouring in | A turn just landed — its work flows into one of the five boxes |
| The five **boxes** (`01`–`05`) | Five buckets; each turn drops into `hash(turn.id) % 5` |
| The four **tempers** (WO·FC·DR·MA) inside each box | Woe = loss · Frolic = creation · Dread = uncertainty · Malice = friction |
| **Completing the file** → Waffle Party | Filling all five boxes → a Waffle Party, then the boxes reset |
| Switching **files** | Switching projects (the tabs are sessions within the project) |

## The five-box cycle

Five boxes, `01`–`05`. Every turn's four temper signals drop into one box
(`hash(turn.id) % 5` — stable, arbitrary, like the show). Each box holds all four tempers,
and a box **completes a cycle only when all four reach their sub-capacity** `TC`
(`= BOX_CAPACITY / 4`) — one temper maxing out can't carry the box alone.

- **Box %** = the average of its four capped temper fills.
- **CYCLE %** (the headline, bottom-left) = the mean of the five box %s — it *cycles*
  0 → 100 → reset rather than pegging at 100 the way a context-fill bar would.
- **A full cycle** (all five boxes) fires the **Waffle Party** and **resets** the boxes.
  **PARTIES** counts cycles completed — it's read straight from `cyclesCompleted` (derived
  from the full turn history), so it's stable across refreshes.
- **BALANCE** = how even the four tempers are across the cycle (`1 − spread`); a balanced
  full cycle earns the **gold** "Refiner of the Quarter" waffle, an unbalanced one the
  plain waffle.

Hover or click a box to open it and inspect its four temper bars; hover a bar for a
tooltip on what that temper reads off real work (kept off the page surface otherwise — the
show stays mysterious).

## The rewards (two tracks)

| Track | Earned by | Reward |
| --- | --- | --- |
| **Overlay** (full-screen) | CYCLE % crosses 10 / 25 / 50 / 75 | eraser · finger trap · melon bar · Music Dance Experience |
| **Overlay** | a full cycle (all 5 boxes) | **Waffle Party** (gold if balanced) → reset |
| **Shelf** (quiet tick) | a box completes | that box's dominant-temper **mask**: Woe → Gaunt Bride · Frolic → Jester · Dread → Crone · Malice → Ram |

The 10% / 25% overlays are deliberately underwhelming "dud" celebrations that also drop a
collectible **prize token** (the eraser, the finger trap). The footer shelf is **split:
prizes on the left, masks on the right**, with a gap between. Each overlay is a one-time
hand-drawn cyan wireframe celebration with procedural confetti + a Web-Audio fanfare (the
kazoo dud · the MDE drumline · the Waffle horn). Cold/reconnect snapshots roll the standing
up silently; only live crossings animate, and milestones reset each cycle so they can fire
again. The Waffle Party is a multi-stage sequence (waffles → the founder's bed → the four
tempers).

## The temper signals

The tempers are ambient *moods* read off a turn's real counts — interpretive, never
fabricated work. They're **reweighted to comparable per-turn magnitudes** so a box fills on
all four, not just the smallest (`src/temper.ts`):

| Temper | Reads off |
| --- | --- |
| **WO** Woe (loss) | `linesRemoved` — the reference scale |
| **FC** Frolic (creation) | `linesAdded × 0.3` + commits |
| **DR** Dread (uncertainty) | `reads`, long grinding turns (`durationMs`), heavy context (`tokens`), stalls (`hung`) |
| **MA** Malice (friction) | a grinding high-action turn (baseline), interrupts (`blocked`), error recoveries (`defended`) |

Every count comes straight from what the reader parses out of the transcript (a passive
visualizer — nothing fabricated). The reweight exists because the raw signals are wildly
scale-mismatched on real data (`linesAdded` runs ~30× bigger than `reads`), which otherwise
pins every box on Dread.

**Tuning** — add **`?debug`** to the URL for an on-page panel (top-left) showing live
per-box temper totals, an **`avg/turn`** balance line, and each box's bottleneck temper +
distance to its next cycle. `window.__mdr` holds the same data for the console. The two
dials: `BOX_CAPACITY` in `src/mdr.ts` (party cadence) and the per-temper weights in
`src/temper.ts` (balance).

A Lemon **boot sequence** plays on load; the number field reacts to your cursor; heavier
CRT (bloom, roll bar, chromatic fringe) throughout. The **LEMON** wordmark (`src/logo.ts`)
and the celebration icons (`src/art.ts`) are TS-const SVGs so they hot-reload reliably.

## Run it

```sh
npx lemon-mdr                        # watch THIS project (the cwd), open the browser
npx lemon-mdr --project <path>       # watch a specific repo's sessions
npx lemon-mdr --all                  # every project (recent + auto-pruned)
npx lemon-mdr --demo                 # synthetic feed, no transcripts needed
npx lemon-mdr --port 5180 --no-open  # pick a port / don't auto-open
```

It reads Claude Code's transcripts under `~/.claude/projects`, builds the snapshots itself,
serves the UI + the `/colony` WebSocket, and opens your browser. **Read-only** — it
never writes to your transcripts. Closing the window exits the server. Continuation chains
(`--continue`d / replayed conversations) are de-duped, and subagents fold into the project's
work without cluttering the session tabs.

**Develop the UI:** `npm run dev` (Vite + HMR on :5180) falls back to the embedded demo
feed; force it with `?demo`, add `?debug` for the live temper/balance panel. For real data
in dev: `npm run build && node dist/cli.js`.

## Status

Standalone and `npx`-able: its own transcript reader (`server/`), the five-box cycle model
live on real data, the two reward tracks (quiet masks + loud overlays), persistent PARTIES,
CRT curvature, keyboard nav, and the LEMON wordmark. Temper weights are calibrated so all
four fill comparably; `?debug` shows the live balance. Dials: `BOX_CAPACITY` for party
cadence (`src/mdr.ts`) and the temper weights (`src/temper.ts`).
