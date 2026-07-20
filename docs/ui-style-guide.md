# Encounterizer UI style guide

This guide defines the interaction and visual language for every DM tool. It is
the contract for new pages and the migration target for existing pages.

## Product principles

1. **Make the next decision obvious.** Each decision surface has one visually
   dominant action. Alternate paths are secondary; utilities are quiet or live
   in a menu.
2. **Separate setup, output, and execution.** Controls that shape a result do
   not share a toolbar with actions that save, export, simulate, or run it.
3. **Status is never styled like a control.** Difficulty, readiness, risk, and
   other readouts have no button height, border, hover, or pressed state.
4. **Progressive disclosure beats action walls.** Optional or technical
   controls stay behind a named disclosure and appear next to the setting they
   depend on.
5. **Design for table use.** Important labels remain readable at a glance,
   controls keep a 44px minimum target, and mobile layouts preserve action
   order instead of merely wrapping.

## Interaction vocabulary

| Intent | Treatment | Typical use |
| --- | --- | --- |
| Advance the current workflow | `btn-primary` | Generate, Run forecast, Start combat |
| Configure or choose an alternate path | `btn-secondary` | Edit, Configure party, Build manually |
| Utility with no workflow impact | `btn-ghost` | Reset, Cancel, Close |
| Low-frequency group | `action-menu` + `menu-action` | Export, print, data formats |
| Reveal optional controls | `option-card` or `disclosure-panel` | Filters, recipes, map settings |
| Select from comparable choices | `selection-card`, `segmented-control` | Recipe, view mode, density |
| Communicate state | `difficulty-status`, metadata text | Extreme, Ready, Stale |

Rules:

- Use one primary action per card, panel, or choice card.
- Button text starts with a verb and names the destination when useful:
  “Open battle organizer,” not “Run Battle.”
- Do not place status between buttons or inside an action group.
- Icon-only buttons require an `aria-label` and a minimum 44×44px target.
- Destructive actions use danger color and must not be adjacent to the primary
  action without separation.

## Workflow composition

Complex generators use three explicit regions:

1. **Set up** — essential fields first, optional tools second, generation last.
2. **Review** — title, narrative, labeled status, metrics, and content editing.
3. **Act** — clearly separated choices such as forecast, open another tool, or
   export.

Use these shared classes:

- `workflow-shell`, `workflow-header`, `workflow-title`, `workflow-step`
- `setup-grid`, `setup-group`, `setup-group-heading`
- `optional-controls`, `optional-controls-grid`, `option-card`
- `disclosure-panel`, `optional-panel`, `selection-card`
- `workflow-action-bar`, `workflow-primary-action`
- `workflow-review-card`, `workflow-review-header`, `workflow-review-overview`
- `workflow-review-actions`, `metric-grid`, `metric-item`
- `next-step-shell`, `next-step-grid`, `next-step-card`
- `content-panel`, `content-panel-heading` for flat sections inside a review or
  live-workflow surface
- `action-menu-flow` when a wide utility menu is inside a narrow or left-aligned
  card and must expand in the document flow instead of floating

The numbered step marker communicates reading order; it is never interactive.
The three regions describe responsibilities, not a mandatory page count. A live
tool can use **Set up → Run → Finish** when its review happens inside setup.
Finish contains closure, summary, export, or reset actions; it must not compete
with the action that advances the live workflow.

### Puzzles and challenges

1. **Set up** — choose the scene kind, target difficulty, table time, and party.
   Theme, tone, format browsing, and recent scenes are optional controls.
2. **Review** — show the generated title, visibly labeled difficulty, party and
   duration metrics, followed by the DM brief and flat content sections.
3. **Present or run** — make the player view the primary presentation action.
   Group share, Markdown, JSON, and print utilities in one menu. Keep staged
   checks, hints, and the solution next to the moment when the DM needs them,
   with spoilers behind disclosures.

Kind cards either select a kind or immediately generate one; they never do both.
When cards are selections, use `selection-card` and a single Generate action.

### Battles

1. **Set up and review** — name the battle, build the roster through clearly
   labeled manual and bestiary paths, then review sorted initiative. Starting
   the battle is the region's only primary action.
2. **Run** — prioritize round, acting combatant, next up, and on deck, followed
   by HP and condition controls. Preparation controls collapse or become a
   secondary “Edit roster” path while combat is live.
3. **Finish** — show an end-state summary and place export, print, clear, and
   new-battle utilities away from the live turn controls.

The compact initiative tracker embedded in the DM screen mirrors the same
phases but omits participant building and finish utilities such as export,
delete, and starting a replacement battle.

## Typography roles

- Display headings: Spectral, sentence case, `text-1`. Use for page and major
  section titles only.
- Body and controls: IBM Plex Sans.
- `eyebrow`: branded page context such as “DM toolkit.”
- `micro-label`: section overline only. Do not use it for ordinary form labels.
- `field-label`: visible, title-case field name.
- `field-hint`: short constraint or consequence directly below a field.
- `field-error`: validation message with `role="alert"` when introduced.
- `meta-label`: compact label for a readout or metric.

Avoid all-caps for sentences, buttons, or field labels. Do not encode meaning by
color alone.

## Surfaces and elevation

Semantic tokens are the preferred interface:

- `--surface-panel`: major page region
- `--surface-subtle`: grouped or inset content
- `--surface-interactive`: hovered or secondary interactive surface
- `--border-subtle`, `--border-default`, `--border-interactive`
- `--radius-control`, `--radius-panel`
- `--shadow-card`, `--shadow-float`

Use one raised surface for a major region. Nested content should generally be
flat or inset, not another fully shadowed `card`. Reserve floating shadow for a
temporary menu or an interactive home-page card.

## Forms

- Put the visible label before the control and optional help after it.
- Group related fields in a `setup-group`; do not rely on a four-column field
  wall as the only hierarchy.
- Dependent settings appear immediately after their trigger. For example, the
  map toggle precedes the “Customize battle map” disclosure.
- Name the desired input versus the calculated output explicitly: “Target
  difficulty” and “Calculated challenge.”
- Validation keeps the typed value, identifies the permitted range, sets
  `aria-invalid`, and moves focus to the first invalid field on submit.
- Checkboxes and radios remain visually present unless a complete accessible
  custom-control treatment is supplied.

## Status, badges, and chips

These are different objects:

- **Status:** noninteractive readout with a visible label. Encounter challenge
  uses `difficulty-status` plus a colored dot. Other tools use
  `status-readout`, `status-readout-dot`, and a neutral, success, warning, or
  danger modifier.
- **Chip:** compact selected filter with an obvious selected/unselected state.
- **Toggle:** changes a Boolean setting and contains a real checkbox or switch.
- **Button:** performs an action and has hover, focus, and pressed feedback.

For encounter difficulty, always distinguish:

- **Target difficulty** — what generation was asked to create.
- **Calculated challenge** — current rules-XP classification for the active
  party.
- **Forecast risk** — simulation result. It is approximate and must stay
  hedged.

Do not show “Extreme” as an isolated filled pill in an action row.

## Action menus and disclosures

- Keep the frequent action visible; move formats and technical outputs into an
  `action-menu`.
- Menu items pair a short noun with a one-line consequence (“Foundry data —
  Virtual tabletop import”).
- Native `details`/`summary` is preferred for an in-flow disclosure when its
  browser behavior is sufficient.
- Custom disclosure buttons use `aria-expanded`, `aria-controls`, and a stable
  panel ID.
- Opening a disclosure must not reorder unrelated primary actions.

## Responsive behavior

- Validate at 360, 640, 768, 1024, and 1280px.
- Below 640px, the primary workflow action becomes full width and stays first.
- Two-choice next-step regions stack on small screens.
- Metrics use two columns on small screens and may grow to four when labels
  remain readable.
- Menus render in flow on small screens and may float on larger screens.
- Do not use `nowrap` on groups of actions. Apply it only to the text inside a
  single control when the container can still fit.
- No page may introduce horizontal document scrolling at 320px.

## Theme, focus, motion, and print

- Build from semantic tokens so dark and light themes stay equivalent.
- Every interactive element must expose the global `:focus-visible` ring.
- Never remove focus outlines without an equally visible replacement.
- Honor `prefers-reduced-motion`; motion must not be required to understand a
  state change.
- Print views remove setup and interactive actions, remap tokens to a light
  palette, and preserve semantic status text even when color is unavailable.

## Do / do not

| Do | Do not |
| --- | --- |
| Label “Calculated challenge” next to `Extreme` | Place `Extreme` between action buttons |
| Show Generate as the setup panel’s single primary action | Give filters, reset, export, and generate equal weight |
| Put map settings after the map toggle | Reveal settings before the control that enables them |
| Group JSON, Markdown, print, and handout actions in a menu | Wrap eight export buttons across multiple rows |
| Offer “Forecast the outcome” and “Start live combat” as distinct choices | Use “Run Battle” for both simulation and initiative tracking |
| Use `field-label` for “Target difficulty” | Use tiny uppercase text for every field |

## Review checklist

- [ ] One primary action per decision surface
- [ ] Status outside action groups and visibly labeled
- [ ] Setup, review, and execution actions are separated
- [ ] Optional controls use progressive disclosure
- [ ] All fields have visible labels and helpful errors
- [ ] Keyboard focus follows opened/closed editing surfaces
- [ ] Touch targets are at least 44×44px
- [ ] Layout works at the documented widths in both themes
- [ ] Print output omits controls and remains readable without color
- [ ] Copy names the action and destination precisely
