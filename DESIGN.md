---
name: Ryan Family Menu
description: A warm, fast shared home food system for families and caretakers.
colors:
  ink: "#28221d"
  muted: "#6d6258"
  paper: "#f4ecdf"
  surface: "#fffaf2"
  line: "#d7c8b5"
  tomato: "#aa3b2e"
  tomato-deep: "#7f2b22"
  sage: "#3f664f"
  sage-deep: "#294738"
  gold: "#d6a53c"
  peach: "#efb59b"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Iowan Old Style, Baskerville, Times New Roman, serif"
    fontSize: "2.4rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0"
  headline:
    fontFamily: "Iowan Old Style, Baskerville, Times New Roman, serif"
    fontSize: "1.65rem"
    fontWeight: 700
    lineHeight: 1.08
  title:
    fontFamily: "Iowan Old Style, Baskerville, Times New Roman, serif"
    fontSize: "1rem"
    fontWeight: 700
  body:
    fontFamily: "Avenir Next, Avenir, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.48
  label:
    fontFamily: "Avenir Next, Avenir, Segoe UI, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 800
    letterSpacing: "0.08em"
rounded:
  compact: "6px"
  control: "8px"
  panel: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.tomato-deep}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.sage}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "38px"
---

# Design System: Ryan Family Menu

## Overview

**Creative North Star: "The Shared Kitchen Table"**

Ryan Family Menu should feel like the dependable center of a busy household: warm enough to feel personal, structured enough to keep everyone coordinated, and direct enough to use with one hand in a kitchen or grocery aisle. The interface is a task-focused product, so familiar controls, concise language, and immediate feedback take priority over decoration.

The visual system combines practical density with food-rooted color. Tomato marks consequential actions, sage organizes categories and successful states, and pantry neutrals keep long recipes and lists readable. English and Spanish must receive equal layout consideration; controls grow or wrap instead of truncating translated text.

The product must never feel corporate, stodgy, or old. It rejects enterprise SaaS dashboard styling, stiff admin-tool density, and dated family-organizer ornament. Mobile is the primary operating environment, while desktop provides more breathing room without changing the interaction vocabulary.

**Key Characteristics:**

- Warm, capable, and household-centered.
- Fast, familiar controls with strong 44-48px touch targets.
- Restrained color reserved for action, organization, and status.
- Bilingual and mobile-first by construction.
- Compact 8px geometry with clear, purposeful hierarchy.

## Colors

The Tomato & Sage palette takes its cues from food and the home without becoming rustic or decorative.

### Primary

- **Action Tomato** (`colors.tomato`): Primary calls to action, current-day emphasis, and high-value links.
- **Deep Tomato** (`colors.tomato-deep`): Hover states, low-stock overlap warnings, and stronger action emphasis.

### Secondary

- **Organizing Sage** (`colors.sage`): Section labels, selected inventory filters, category cues, and successful status text.
- **Provision Gold** (`colors.gold`): Favorites, low-stock states, and calendar exceptions that require attention without signaling danger.

### Neutral

- **Espresso Ink** (`colors.ink`): Primary text, active navigation, and the strongest structural rules.
- **Pantry Muted** (`colors.muted`): Secondary descriptions, metadata, inactive controls, and supporting labels.
- **Pantry Paper** (`colors.paper`): The application background.
- **Counter Surface** (`colors.surface`): Controls, cards, and working panels.
- **Cupboard Line** (`colors.line`): Borders, dividers, and field boundaries.
- **Clean White** (`colors.white`): Input interiors and text on saturated controls.

### Semantic States

The CSS token layer keeps repeated workflow states consistent. Use these roles instead of introducing new one-off colors:

- `surface-success` / `line-success`: inventory and sync confirmation.
- `surface-attention` / `line-attention` / `attention-ink`: low-stock, favorite, and review-needed states.
- `surface-danger` / `danger-ink` / `danger-strong`: safety warnings, errors, and destructive actions.
- `surface-notice` / `surface-muted` / `surface-elevated`: update notices, quiet controls, and elevated working surfaces.
- `on-accent`: readable text on tomato, sage, or dark navigation surfaces.

A new value should be added here only when it represents a reusable semantic role.

**The One Tomato Rule.** Tomato is functional, never decorative. Use it for the primary action or the most important active state, not as ambient page color.

**The Semantic Pantry Rule.** Sage means organization or success, gold means attention, and tomato-deep means urgency. Never swap these roles for visual variety.

## Typography

**Display Font:** Iowan Old Style with Baskerville and Times fallbacks
**Body Font:** Avenir Next with Avenir and Segoe UI fallbacks

**Character:** Editorial serif headings make the interface feel like a family recipe book, while a clear humanist sans-serif keeps planning, shopping, and form controls fast. The contrast is purposeful: family memory for orientation, utility for action.

### Hierarchy

- **Display** (`typography.display`): The app title only; reduce to 1.85rem on narrow screens.
- **Headline** (`typography.headline`): View and recipe headings; reduce to 1.4rem on narrow screens.
- **Title** (`typography.title`): Card titles, group headings, and compact content labels.
- **Body** (`typography.body`): Recipes, list content, help text, and form values; cap prose near 70 characters when layout permits.
- **Label** (`typography.label`): Short section labels and category cues. Uppercase is allowed only for brief navigational or organizational labels, never paragraphs.

**The Two-Voice Rule.** Use the editorial serif only for brand, view, recipe, and grouping headings. Keep labels, controls, data, navigation, and recipe instructions in the humanist sans-serif. Never introduce script or novelty fonts.

**The Translation-Fit Rule.** Never reduce type below the documented scale to force Spanish text into an English-sized control. Wrap or expand the component instead.

## Elevation

The system is flat by default and uses tonal layering plus borders for structure. Shadows are reserved for elements that genuinely sit above the page: the featured meal image, update notice, open inventory tools, favorite marker, and selected recipe detail. Elevation communicates hierarchy or temporary overlap, never generic polish.

### Shadow Vocabulary

- **Featured lift** (`0 16px 36px rgba(61, 43, 27, 0.12)`): Featured meal imagery and floating inventory tools only.
- **Detail lift** (`0 8px 24px rgba(61, 43, 27, 0.08)`): The selected recipe detail when it must separate from the library.
- **Control lift** (`0 1px 5px rgba(61, 43, 27, 0.12)`): Selected segmented controls only.
- **Marker lift** (`0 2px 8px rgba(37, 33, 29, 0.18)`): Small floating markers such as favorites.

**The Purposeful Lift Rule.** A resting card or form section stays flat. Add elevation only when the element is featured, selected, sticky, or temporarily overlapping other content.

## Components

Components should feel tactile and direct: obvious targets, compact corners, plain-language labels, and no ornamental complexity.

### Buttons

- **Shape:** Compact rounded rectangle (`rounded.control`) with a minimum 44px touch height; mobile primary and secondary actions expand to full width when stacked.
- **Primary:** Action Tomato background, Clean White text, heavy label weight, and horizontal `spacing.lg` padding.
- **Hover / Focus:** Hover deepens to Deep Tomato. Keyboard focus must remain visibly distinct and may not rely on color alone.
- **Secondary / Ghost:** Counter Surface background, Cupboard Line border, and Espresso Ink text.
- **Text action:** Transparent background with Action Tomato or Pantry Muted text; use only when the action is clearly secondary.

### Chips

- **Style:** Full-pill geometry for compact categories and filters only. Category chips use a pale sage field; warning chips use a pale tomato field.
- **State:** Selected inventory filters use Organizing Sage with Clean White text. Unselected filters remain transparent with a Cupboard Line border.

### Cards / Containers

- **Corner Style:** Compact 8px corners for standard cards and 12px only for the recipe edit panel and photo previews.
- **Background:** Counter Surface over Pantry Paper.
- **Shadow Strategy:** Flat by default; follow the Purposeful Lift Rule.
- **Border:** One Cupboard Line boundary. Do not combine a standard card border with a broad decorative shadow.
- **Internal Padding:** Usually 14-18px, increasing to 26px only for the featured meal band.

### Inputs / Fields

- **Style:** Clean White field, Cupboard Line stroke, 8px corners, Espresso Ink value text, and a minimum 44px height.
- **Focus:** Provide an unmistakable keyboard focus indicator with sufficient contrast; never remove the browser outline without replacing it.
- **Error / Disabled:** Errors use dark tomato text with a pale tomato field. Disabled actions remain legible and clearly unavailable; loading controls may use reduced opacity while retaining their label.

### Navigation

- **Desktop:** Four equal-width bordered tabs with Counter Surface backgrounds; the active tab uses Espresso Ink with Clean White text. Add recipe is a persistent tomato action in the app header rather than a hidden secondary route.
- **Mobile:** The same four core destinations become a fixed bottom navigation with safe-area padding and 48px minimum targets. Add recipe remains a persistent header action, and labels stay short or wrap safely in both English and Spanish.
- **Language:** EN/ES uses a two-option segmented control in the header and selected recipe detail. The active language uses the same Espresso Ink selected-state vocabulary as navigation.

### Recipe Card and Detail

Recipe cards use image-led, compact summaries in an auto-fitting library grid. Selecting a recipe opens one focused detail surface with its language control and actions in immediate reach. Edit fields remain hidden until edit mode is explicitly entered; browsing and editing must never look like the same state.

## Do's and Don'ts

### Do:

- **Do** preserve the Shared Kitchen Table character: warm, capable, direct, and useful in a real kitchen or store.
- **Do** maintain minimum 44px controls and 48px mobile navigation targets.
- **Do** design English and Spanish together, allowing translated labels to wrap or expand.
- **Do** use Action Tomato for the highest-value action, Organizing Sage for organization or success, and Provision Gold for non-danger attention.
- **Do** keep common controls visually consistent across Today, Week, Groceries, Recipes, and Add.
- **Do** collapse multi-column forms and detail layouts to one column at the 780px mobile breakpoint.
- **Do** use imagery for real recipes and featured meals, not as generic decoration.

### Don't:

- **Don't** make the product feel corporate, stodgy, or old.
- **Don't** imitate enterprise SaaS dashboards, stiff admin tools, or dated family organizer software.
- **Don't** introduce ornamental cards, glassmorphism, gradient text, decorative grid backgrounds, or broad soft shadows on every container.
- **Don't** use display fonts in labels, buttons, recipe data, or navigation.
- **Don't** truncate Spanish or shrink it below the established type scale to match English.
- **Don't** invent different button, field, card, or selected-state styles for individual views.
- **Don't** hide core household workflows behind modals when inline or progressive disclosure works.
- **Don't** use colored side-stripe borders as a decorative accent; safety messaging must use a complete border and clear semantic background.
