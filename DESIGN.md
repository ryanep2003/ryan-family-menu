---
name: Ryan Family Menu
description: A calm household food concierge with the quiet material clarity of a working kitchen.
colors:
  ground: "#F5F1EA"
  paper: "#FFFFFF"
  ink: "#1A3A5C"
  muted: "#7A7A7A"
  rule: "#D9D4C8"
  primary-action: "#1A3A5C"
  focus: "#AFCBFF"
  memory: "#CFE8D5"
  attention: "#1A3A5C"
  success: "#3E6B52"
  danger: "#A33A35"
  navy: "#1A3A5C"
  sage: "#CFE8D5"
  soft-blue: "#AFCBFF"
typography:
  display:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(2.35rem, 9vw, 4.8rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(1.25rem, 4vw, 1.8rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
rounded:
  control: "8px"
  sheet: "16px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "32px"
  space-7: "48px"
  space-8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary-action}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "10px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "10px 14px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "10px 12px"
  navigation-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "6px"
    height: "48px"
---

# Design System: Family navy and sage

## Overview

**Creative North Star: a calm family kitchen board**

Ryan Family Menu is a smart household food concierge, not meal-planning software. It makes a family's food situation recognizable in the few seconds available between school pickup, a grocery aisle, and starting dinner: what the family is eating, what is still undecided, and what needs attention next. The interface absorbs planning complexity whenever it can; technical usefulness alone never earns a permanent control or concept in the experience.

The visual character is warm, practical, and easy to scan. Warm beige ground, white cards, navy actions, sage highlights, and soft-blue secondary controls keep common family tasks readable on a phone. Warmth comes from concise language, family context, and useful recommendations—not from explanation, fake texture, or decorative objects.

**Key Characteristics:**

- Recognition and scanning win over instruction, especially in the first 2–3 seconds.
- The current household food state is more important than planning mechanics.
- Sans-serif type and navy primary actions make ordinary family content feel clear.
- Progressive emphasis makes the next decision clear without falsifying the complete state.
- English and Spanish are one product experience, not separate workflows.
- Plan never hides Save after a long scroll; unsaved meal changes stay on a fixed navy bar.

## Colors

The system uses warm beige, white, navy, sage, and soft blue. Color supports hierarchy and a single primary action; it is not a category-navigation system.

### Primary

- **Navy action:** use `primary-action` / `--navy` for the single highest-value action in a task, including Plan Save while dirty. Do not make every useful action primary.
- **Soft-blue focus:** use `focus` / `--soft-blue` for secondary actions such as Add on a Plan day and Find a recipe.

### Secondary

- **Sage memory:** use `memory` / `--sage` for today’s Plan highlight and gentle household history.
- **Navy attention:** use `attention` for an unresolved decision that truly needs attention, including an open dinner. It may strengthen that meal, but must not remove it from the complete daily hierarchy.
- **Steady success:** use `success` for completed or reliable household state.
- **Clear danger:** use `danger` only for destructive or safety-relevant state.

### Neutral

- **Ground, paper, ink, muted, and rule:** use these for a nearly-flat mineral canvas, readable ceramic-paper content, secondary context, and structural separation. Texture is only implied through those surfaces; never use literal wood, stone, tile, or repeating/noise backgrounds behind content.

**The State-First Color Rule.** Color clarifies a real state or a broad reading chapter; it never substitutes for labels, hierarchy, or navigation.

## Typography

**Display Font:** the editorial reading stack in the frontmatter.

**Body Font:** the platform-aware UI stack in the frontmatter.

**Character:** Sans-serif type keeps meal names, recipe names, controls, labels, quantities, navigation, and status readable on a phone.

### Hierarchy

- **Display:** reserve for page-level titles and the most important household reading moment.
- **Headline:** use for day headings, recipe headings, and major sections.
- **Body:** use for recipes, meal content, lists, and contextual copy.
- **Label:** use for concise orientation such as meal labels, dates, quantities, and controls; sentence case is the default.

**The Three-Level Rule.** In planning, Day → Meal → Recipe must never collapse into equal visual weight. Day boundaries orient; meal headings group; recipe names read as the content belonging to that meal.

## Layout

The layout is mobile-first and task-first. Content sits within the established shell and spacing scale; desktop adds measure and breathing room but does not turn the product into a dashboard. Related content groups through proximity, typography, tonal fields, and rules before new containers are introduced.

Today is the operational household food home. Its first reading order is: tonight’s dinner, one Cook CTA, Plan & shop shortcuts, then breakfast and lunch under Also today. An unresolved dinner may receive the primary action without becoming a separate information category.

Plan uses Day → Meal → Recipe / dish / component. On phones, days stack vertically and must fit the page width with no horizontal overflow. While meal changes are unsaved, a navy Save bar stays fixed above the bottom nav. Never rely on a top-of-page Save after a long week scroll.

**The Busy-Moment Rule.** Every major screen must have a dominant answer to the question that caused the user to open it. Prefer recognition and direct state over explanatory copy or disconnected widgets.

**The Safe-Edge Rule.** Fixed navigation, status areas, and sticky actions reserve space using system safe-area insets. Scrollable content and focused controls must clear the bottom navigation and iOS status area without device-specific pixel assumptions.

## Elevation & Depth

Surfaces are flat at rest. Depth comes from paper, rules, tonal page washes, broad shaded chapters, and clear spacing. Shadows are reserved for temporary overlays such as menus, result popovers, or sheets that physically sit above the working document.

**The Flat-Working-Surface Rule.** Do not use resting shadows, nested cards, glass effects, or decorative side stripes to manufacture hierarchy. Use content order, type, spacing, rules, and tonal fields first.

## Shapes

Geometry is square and calm. Controls use the compact control radius; temporary sheets and media may use the larger sheet radius. Borders are quiet rules, not a substitute for hierarchy. Interactive controls maintain practical touch targets even when their visible label is compact.

## Components

### Buttons and contextual actions

- **Primary:** one clear high-value action per task where possible; it remains at least the documented control height.
- **Ghost:** a visible but secondary action on the paper/ground surface.
- **Text action:** a concise contextual action, especially for a single meal decision. Do not duplicate the same action in separate prominent regions.

### Meal periods

- **Canonical representation:** render Breakfast, Lunch, and Dinner together when representing a day.
- **Content:** planned recipes open naturally; empty states are concise and proportionate.
- **Emphasis:** a dinner that needs a decision may receive the primary CTA; other empty meals do not route incorrectly into dinner planning.

### Navigation and fixed controls

- The four core destinations—Today, Plan, Shop, and Library—remain stable and labeled. School Lunches opens from Plan and is not a fifth bottom-nav tab.
- Mobile navigation is fixed with safe-area-aware clearance; desktop may return it to the shell.
- While Plan has unsaved meal changes, a navy Save bar stays fixed above the bottom nav so a long week scroll cannot hide Save / Guardar cambios.

### School Lunches

- **Visual world:** School Lunches is an additive extension of the Honed / Living Almanac direction: a flat mineral wash with warm paper, sage, clay, and blue fields grouping content without becoming a category rainbow.
- **Lunchbox grammar:** every packed lunch uses five clear, independently interchangeable categories—Main, Fruit / veg, Crunch / side, Extra, and Drink—so one item can be swapped without rebuilding the lunch.
- **Hierarchy and imagery:** child and day context lead, the five foods read as the editorial body, and approval or the next packing action closes the sequence. Use quiet line-drawn food and tray geometry as supporting orientation, never as cartoon decoration.
- **Phone behavior:** present the school week as a vertical reading sequence on phones. Packing is a linear, one-handed checklist with reachable actions and controls at least 44px high.
- **State clarity:** approved means every required component is complete and safe. Incomplete slots and restriction conflicts remain explicit, cannot appear approved, and use labels plus restrained attention or danger color rather than color alone.
- **Guardrails:** do not use gradients, resting shadows, emoji, rainbow coding, cartoon styling, a wall of cards, or a chatbot metaphor. This is a direct lunch-building and packing workspace.
- **Language and access:** keep English and Spanish content in parity; preserve semantic controls, visible focus, readable contrast, concise safety language, and status meaning that does not depend on color or illustration.

### Language and localized content

- EN / ES represents one canonical app-language state across navigation, labels, explanatory copy, and supported recipe content.
- Recipe translations are alternate representations: preserve the original, use saved/cached translations when available, prepare a missing translation only for the recipe being read, and show a graceful fallback when it is temporarily unavailable.
- Never require a family member to understand interface localization, stored translation, or translation generation as separate product concepts.

### Canonical household state and recommendations

- Today, Plan, Recipes, and Shopping derive from the same household reality; presentation convenience must not create a duplicate meal-plan state.
- Prominent recommendations prioritize complete meals or mains, then useful planning actions. A side or component becomes prominent only when its context makes it a meaningful decision.

## Do's and Don'ts

### Do:

- **Do** foreground the family’s actual meals and next decision before planning mechanics or household administration.
- **Do** use hierarchy, grouping, labels, and sensible defaults before adding instructional prose or configuration.
- **Do** keep empty states subordinate to known meal content.
- **Do** adapt information architecture for narrow screens, not merely shrink desktop layouts.
- **Do** use warm editorial language only when it adds context without duplicating or replacing household state.
- **Do** preserve original content while treating Spanish and English as equally complete supported experiences.
- **Do** favor deletion, consolidation, and stronger defaults when a concept has not earned its cognitive cost.

### Don't:

- **Don't** expose implementation concepts, workflow terminology, or internal classifications unless the family truly needs to decide them.
- **Don't** make an empty dinner imply that nothing else is planned today.
- **Don't** flatten Day, Meal, and Recipe into equivalent typography or visual weight.
- **Don't** squeeze complete multi-day meal content into narrow mobile columns.
- **Don't** make users request a recipe-level translation after selecting the global language.
- **Don't** elevate sides or minor components as complete dinner recommendations without supporting context.
- **Don't** allow fixed navigation or device safe areas to obscure meaningful content or actions.
- **Don't** turn warmth into verbose self-instruction or turn planning into a generic dashboard.
