---
name: Ryan Family Menu
description: A calm household food concierge with the quiet material clarity of a working kitchen.
colors:
  ground: "#F0EFEA"
  paper: "#FCFBF7"
  ink: "#272823"
  muted: "#666960"
  rule: "#D9D6CC"
  primary-action: "#476346"
  focus: "#2F58B8"
  memory: "#DCE2CC"
  attention: "#B5674A"
  success: "#3E6B52"
  danger: "#A33A35"
typography:
  display:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif"
    fontSize: "clamp(2.35rem, 9vw, 4.8rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif"
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

# Design System: The Honed Almanac

## Overview

**Creative North Star: "The Honed Almanac"**

Ryan Family Menu is a smart household food concierge, not meal-planning software. It makes a family's food situation recognizable in the few seconds available between school pickup, a grocery aisle, and starting dinner: what the family is eating, what is still undecided, and what needs attention next. The interface absorbs planning complexity whenever it can; technical usefulness alone never earns a permanent control or concept in the experience.

The visual character is warm, editorial, calm, and exact. Mineral canvas, ceramic-paper surfaces, herb actions, clay attention, and quiet seams borrow the calm material clarity of a working kitchen without becoming literal kitchen décor. It treats meals, recipes, handoffs, shopping, and household memory as a shared food record rather than administrative modules. Warmth comes from concise language, considered type, family context, and useful recommendations—not from explanation, fake texture, or decorative objects.

**Key Characteristics:**

- Recognition and scanning win over instruction, especially in the first 2–3 seconds.
- The current household food state is more important than planning mechanics.
- Editorial serif headings and quiet paper surfaces make ordinary family content feel considered.
- Progressive emphasis makes the next decision clear without falsifying the complete state.
- English and Spanish are one product experience, not separate workflows.

## Colors

The system uses honed limestone neutrals with deep herb action, cobalt functional focus, pale herb memory, and restrained clay attention. Tonal chapters and mineral rules create reading rhythm; color never becomes a separate category-navigation system.

### Primary

- **Herb action:** use `primary-action` for the single highest-value action in a task and for direct, text-level actions. Do not make every useful action primary.
- **Cobalt focus:** use `focus` for keyboard focus, selected-day state, and other functional selection that must remain distinct from household content state.

### Secondary

- **Memory sage:** use `memory` for factual household history, gentle morning emphasis, and broad quiet chapters.
- **Warm attention:** use `attention` for an unresolved decision that truly needs attention, including an open dinner. It may strengthen that meal, but must not remove it from the complete daily hierarchy.
- **Steady success:** use `success` for completed or reliable household state.
- **Clear danger:** use `danger` only for destructive or safety-relevant state.

### Neutral

- **Ground, paper, ink, muted, and rule:** use these for a nearly-flat mineral canvas, readable ceramic-paper content, secondary context, and structural separation. Texture is only implied through those surfaces; never use literal wood, stone, tile, or repeating/noise backgrounds behind content.

**The State-First Color Rule.** Color clarifies a real state or a broad reading chapter; it never substitutes for labels, hierarchy, or navigation.

## Typography

**Display Font:** the editorial reading stack in the frontmatter.

**Body Font:** the platform-aware UI stack in the frontmatter.

**Character:** Serif type makes dates, meal names, recipe names, and major view headings feel like a living household record. Sans-serif type keeps controls, labels, quantities, navigation, instructions, and status clear at a glance.

### Hierarchy

- **Display:** reserve for page-level titles and the most important household reading moment.
- **Headline:** use for day headings, recipe headings, and major sections.
- **Body:** use for recipes, meal content, lists, and contextual copy.
- **Label:** use for concise orientation such as meal labels, dates, quantities, and controls; sentence case is the default.

**The Three-Level Rule.** In planning, Day → Meal → Recipe must never collapse into equal visual weight. Day boundaries orient; meal headings group; recipe names read as the content belonging to that meal.

## Layout

The layout is mobile-first and task-first. Content sits within the established shell and spacing scale; desktop adds measure and breathing room but does not turn the product into a dashboard. Related content groups through proximity, typography, tonal fields, and rules before new containers are introduced.

Today is the operational household food home. Its first reading order is: the complete Breakfast → Lunch → Dinner state, the unresolved decision if any, then the most useful next household action. All three periods remain in one canonical daily representation. A quiet empty breakfast or lunch stays quiet; an unresolved dinner may receive the primary action without becoming a separate information category. Editorial language such as “Tonight is still open” is secondary to, and never contradicts, the actual plan.

Plan uses Day → Meal → Recipe / dish / component. On narrow screens, a compact horizontal date selector may control a full-width, vertical day editor. Never compress complete meal content into several narrow day columns that force titles to wrap, blur day boundaries, or require horizontal cognitive scanning. Meal periods may use restrained, distinct tonal chapters when that improves scanning; the treatment must remain a flat reading structure rather than a dashboard-card stack.

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

- The five core destinations—Today, Plan, Lunches, Shop, and Library—remain stable and labeled.
- Mobile navigation is fixed with safe-area-aware clearance; desktop may return it to the shell.
- Sticky save or action bars are reserved for a focused task and must not conceal its final content or controls.

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
