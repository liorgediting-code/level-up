# Night Mode — Design

**Date:** 2026-05-26
**Status:** Approved (pending spec review)

## Goal

Add a manual light/dark ("night") mode to the app. Dark mode composes
independently with the existing orange/blue accent theme: the user can run any
accent in either light or dark.

## Decisions (from brainstorming)

- **Trigger:** manual toggle only. Defaults to light until the user flips it.
- **Toggle location:** a sun/moon icon button in the sidebar (`AppShell`).
- **Attribute:** `data-mode="dark"` on `<html>` (kept separate from the
  `data-theme` orange/blue axis). Absence of the attribute = light.
- **Persistence:** `localStorage` key `astral-mode` (`"dark"` | absent).
- **Semantic soft colors** (`good-soft`, `bad-soft`, `accent-soft`) get dark
  variants so pills don't glow on dark surfaces.

## Approach: CSS-variable token swap

This mirrors the existing `--accent` system exactly. The accent colors already
flip via CSS variables under a selector on `<html>`; night mode does the same
for the **neutral and semantic** tokens.

Rejected alternatives:
- **Tailwind `dark:` variants** (`darkMode: 'class'` + `dark:` on every
  element): a large, brittle diff across dozens of TSX files. The token system
  already in place makes this unnecessary.
- **Duplicate token sets**: more surface area, no benefit over variables.

## Changes

### 1. `tailwind.config.ts` — tokenize neutrals + semantics

Convert the fixed `oklch` literals to `var(--token)` references so a single
selector flips the whole palette:

```
bg            -> var(--bg)
surface       -> var(--surface)
elevated      -> var(--elevated)
border        -> var(--border)
border-strong -> var(--border-strong)
muted         -> var(--muted)
muted-soft    -> var(--muted-soft)
fg            -> var(--fg)
good          -> var(--good)
good-soft     -> var(--good-soft)
bad           -> var(--bad)
bad-soft      -> var(--bad-soft)
warn          -> var(--warn)
```

`accent*` already use `var(--accent*)` — leave as-is.

Box-shadow tokens currently use `oklch(0.5 0.02 250 / …)`. Keep them but make
them slightly stronger/darker-tuned via a `--shadow-color` variable so cards
still read on dark (shadows are subtle on dark UIs; acceptable to keep simple).

### 2. `globals.css` — define variable values + fix stray literals

- Add the light token values to `:root` (the current literals).
- Add a `[data-mode="dark"]` block overriding every neutral/semantic token with
  dark values (dark bg/surface/elevated, lighter fg/muted, darker-desaturated
  `*-soft`, lightness-lifted `good`/`bad`/`warn` for contrast).
- Add a `[data-mode="dark"]` accent override that lifts `--accent` lightness a
  touch per accent so it pops on dark (covers both default orange and
  `[data-theme="blue"]` via `[data-mode="dark"][data-theme="blue"]`).
- Replace the 3 stray neutral literals with the matching `var(--…)`:
  - `body { background; color }`
  - `tbody tr:hover > .table-td { background }` → a `--row-hover` var
  - `.nav-item:hover { background; color }` → `--nav-hover` var + `var(--fg)`
- Whites layered on accent (`.nav-item-active`, `oklch(1 0 0)`) stay literal.

### 3. `bg-white` modals/drawers → `bg-surface`

Replace `bg-white` with `bg-surface` in modal/drawer containers so they flip:
`new-client-form.tsx`, `tasks-shared.tsx`, `sales-client.tsx` (2),
`journeys-client.tsx`, `crm-client.tsx`, `list-client.tsx`,
`whatsapp-summary-modal.tsx`. Leave `bg-white/15` and `bg-white/20` overlays
(they sit on accent-colored backgrounds and are intentional).

### 4. `AppShell` — the toggle

Add a sun/moon icon button in the sidebar footer (near the "tip" box). On click:
toggle `data-mode` on `document.documentElement`, write/remove `astral-mode` in
`localStorage`, and track state in `useState` for the icon. Mirrors the existing
accent-toggle logic in `settings-client.tsx`. Hebrew `aria-label`/`title`
("מצב לילה" / "מצב יום"). Icon reflects current mode.

### 5. `layout.tsx` — FOUC prevention

Extend the existing pre-paint `<script>` to also read `astral-mode` and set
`data-mode="dark"` before first paint, in the same `try{}` block as the accent
read.

### 6. Categorical dot colors — review only

The `oklch` literals in `page.tsx` and `stat-card.tsx` are decorative
category dots/rings (red/blue/violet/pink/amber, saturated mids) that read on
both backgrounds — leave as-is. Exception: the two spots in `page.tsx`
(~lines 403–404) that use a category color as **text** get a contrast check on
dark; lift lightness only if unreadable.

## Out of scope

- System `prefers-color-scheme` auto-switching.
- Animated theme transitions beyond default CSS color changes.
- Per-page or per-component theme overrides.
- Persisting mode server-side (localStorage only, single-user app).

## Verification

- Toggle flips the whole app light↔dark with no unstyled flash on reload
  (FOUC script works).
- Orange and blue accents both look correct in dark mode.
- Modals/drawers, tables, pills, nav, cards all flip; no `bg-white` islands.
- `pnpm typecheck` passes.
