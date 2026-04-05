# Design System Specification: The Architectural Minimalist

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Architect."** 

We are moving beyond the generic SaaS "box-and-line" aesthetic. Inspired by the precision of Linear and the fluid sophistication of Stripe, this system treats the interface as a physical workspace defined by light, depth, and intentionality. We reject the "template" look by embracing a high-contrast editorial hierarchy and an obsession with white space. This system doesn't just display data; it curates it. We prioritize breathing room over density, and tonal depth over structural borders.

---

## 2. Colors: Tonal Atmosphere
Our palette is rooted in a "High-Value Gray" scale, punctuated by a surgical application of `primary` blue.

### The "No-Line" Rule
**Explicit Instruction:** You are prohibited from using 1px solid borders to define major sections. Structural containment is achieved exclusively through background color shifts. For instance, a side panel in `surface-container-low` (#f3f4f5) against a `surface` (#f8f9fa) main stage provides all the definition a user needs.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, premium materials.
- **Base Layer:** `surface` (#f8f9fa)
- **Nested Sections:** `surface-container-low` (#f3f4f5) for subtle groupings.
- **Actionable Surfaces:** `surface-container-lowest` (#ffffff) for primary content cards and input focus areas.
- **Elevated Contexts:** `surface-container-high` (#e7e8e9) for secondary navigation or utility bars.

### The "Glass & Gradient" Rule
To inject "soul" into the professional blue:
- **Primary CTAs:** Use a subtle linear gradient from `primary` (#0058be) to `primary-container` (#2170e4) at a 135° angle.
- **Floating Overlays:** Use `surface-container-lowest` with an 80% opacity and a `24px` backdrop-blur to create a "frosted glass" effect.

---

## 3. Typography: Editorial Authority
We use **Inter** not just for legibility, but as a structural element.

- **Display & Headline (The Statement):** Use `display-md` (2.75rem) and `headline-sm` (1.5rem) with tight letter-spacing (-0.02em) to create an authoritative, "editorial" feel. This commands attention in empty states or hero dashboards.
- **Title (The Navigator):** `title-md` (1.125rem) should be used for card headers. Bold weights are reserved for `title-sm` to ensure hierarchy without visual bulk.
- **Body & Label (The Workhorse):** `body-md` (0.875rem) is our standard. Use `label-md` (0.75rem) in Medium weight for metadata to keep the interface feeling precise and engineered.

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are a crutch. In this system, depth is earned through logic.

- **The Layering Principle:** Place a `surface-container-lowest` (#ffffff) card on a `surface-container-low` (#f3f4f5) background. This creates a "lift" that feels organic to the light source.
- **Ambient Shadows:** For floating elements (Modals, Popovers), use a multi-layered shadow: `0px 4px 20px rgba(25, 28, 29, 0.04), 0px 2px 8px rgba(25, 28, 29, 0.02)`. The shadow color must be a tint of `on-surface`, never pure black.
- **The "Ghost Border":** If a separator is required for accessibility, use the `outline-variant` token at **15% opacity**. This creates a hint of a boundary without breaking the "No-Line" rule.
- **Glassmorphism:** Use for persistent floating navigation bars. The bleed-through of background colors ensures the UI feels like a single cohesive ecosystem rather than disconnected modules.

---

## 5. Components: Precision Primitives

### Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`), `md` (0.75rem) roundedness. Text: `label-md` White.
- **Secondary:** Surface-container-lowest background with a 1px "Ghost Border".
- **Tertiary:** No background. `primary` text. Use for low-emphasis actions like "Cancel".

### Cards & Lists
- **Rule:** Absolute prohibition of divider lines between list items. Use `16px` of vertical white space or a hover-state background shift to `surface-container-high`.
- **Radius:** Standardize on `md` (0.75rem) for cards; `lg` (1rem) for major dashboard containers.

### Input Fields
- **State:** Default is `surface-container-lowest` with a `Ghost Border`.
- **Focus:** Transitions to a 1.5px `primary` border with a subtle 4px `primary_fixed` outer glow.

### Signature Component: The "Status Pill"
Instead of standard chips, use `secondary_container` with `on_secondary_container` text. Apply a `full` (9999px) radius and `label-sm` typography. This provides a high-end, "engineered" look to metadata.

---

## 6. Do's and Don'ts

### Do
- **Do** use intentional asymmetry. Align a large headline to the left and leave 30% of the horizontal space empty to create an editorial feel.
- **Do** lean into `surface-dim` for empty states to create a sense of "waiting for data."
- **Do** use `primary_fixed_dim` for subtle background highlights on selected navigation items.

### Don't
- **Don't** use 100% black text. Always use `on_surface` (#191c1d) to maintain tonal softness.
- **Don't** use "Drop Shadows" on buttons. Use color contrast and gradients to define clickability.
- **Don't** crowd the interface. If a screen feels busy, increase the spacing grid from 8px increments to 16px. Space is a luxury; use it.