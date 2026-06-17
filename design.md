# Frontend Design System & Component Specification: SonoBreed 360 AI

This document establishes the UI design system, visual specifications, CSS tokens, and reusable component definitions for the **SonoBreed 360 AI** frontend interface. It serves as a comprehensive guide to building a premium, modern, and clinical diagnostic dashboard using HTML5, Vanilla CSS, and modular client-side JavaScript.

---

## 1. Design Token System

To ensure consistency and ease of maintenance, all styles are driven by a central design token system defined via CSS custom properties.

### A. Color Palette
The colors are curated to present a high-contrast, clean, and premium clinical aesthetic (utilizing tailored HSL tones instead of generic primary colors):

```css
:root {
  /* Surface Colors */
  --color-bg: #FCF8FA;                  /* Main background (soft light rose-grey) */
  --color-surface-card: #FFFFFF;        /* Cards and modal backgrounds */
  --color-surface-container: #F0EDEF;   /* Panel and section containers */
  --color-surface-dim: #DCD9DB;         /* Dimmed accents */
  --color-surface-high: #EAE7E9;        /* High-density container backgrounds */
  --color-surface-low: #F6F3F5;         /* Soft light-grey background panels */

  /* Text & Typography Colors */
  --color-text-primary: #1B1B1D;        /* Primary headers, body text, active state */
  --color-text-secondary: #45464D;      /* Secondary text, labels, metadata */
  --color-text-disabled: #76777D;       /* Subdued info and placeholders */

  /* Accent & Brand Colors */
  --color-primary: #000000;             /* Standard brand accent */
  --color-outline: #C6C6CD;             /* Borders and divider lines */
  --color-outline-variant: #E4E2E4;     /* Lighter border accent */

  /* Semantic Health Indicators */
  --color-success: #009668;             /* Positive pregnancy detections */
  --color-success-bg: #E6F6F1;          /* Background fill for positive badges */
  --color-error: #BA1A1A;               /* Non-pregnant / scan failed / disconnect */
  --color-error-bg: #FDF2F2;            /* Background fill for negative badges */
  --color-warning: #D97706;             /* Warning alerts / system sync delay */

  /* Interactive States */
  --color-hover-overlay: rgba(27, 27, 29, 0.04);
  --color-active-overlay: rgba(27, 27, 29, 0.08);
}
```

### B. Typography
The typography uses the **Inter** font family (loaded from Google Fonts) to provide highly readable numbers and labels in clinical views.

| Token | Font Size | Line Height | Weight | Letter Spacing | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `font-headline-lg` | `24px` | `32px` | `800` (ExtraBold) | `-0.02em` | App Bar title, main headings |
| `font-headline-md` | `20px` | `28px` | `600` (SemiBold) | `-0.01em` | Card titles, modal headers |
| `font-headline-sm` | `16px` | `24px` | `600` (SemiBold) | `0` | Sub-sections, sidebar titles |
| `font-body-md` | `14px` | `20px` | `400` (Regular) | `0` | General text, inputs, table rows |
| `font-body-sm` | `12px` | `18px` | `400` (Regular) | `0` | Explanations, sub-captions |
| `font-label-bold` | `12px` | `16px` | `700` (Bold) | `0.05em` (Caps) | Column headers, button text |
| `font-label-sm` | `10px` | `14px` | `500` (Medium) | `0.05em` (Caps) | Telemetry labels, system specs |
| `font-telemetry` | `36px` | `44px` | `600` (SemiBold) | `-0.02em` | Huge telemetry numbers |

### C. Spacing, Borders, and Shadows
*   **Spacing Units**:
    *   `--spacing-xs`: `4px`
    *   `--spacing-sm`: `8px`
    *   `--spacing-md`: `16px`
    *   `--spacing-lg`: `24px`
    *   `--spacing-xl`: `32px`
*   **Border Radii**:
    *   `--radius-sm`: `2px` (standard tables, badges)
    *   `--radius-md`: `4px` (buttons, text inputs, telemetry cards)
    *   `--radius-lg`: `8px` (layout cards, modal dialogs)
    *   `--radius-circle`: `50%` (status dots, user avatars)
*   **Shadows**:
    *   `--shadow-sm`: `0 1px 2px rgba(27, 27, 29, 0.05)`
    *   `--shadow-md`: `0 4px 6px -1px rgba(27, 27, 29, 0.1), 0 2px 4px -1px rgba(27, 27, 29, 0.06)`
    *   `--shadow-lg`: `0 20px 25px -5px rgba(27, 27, 29, 0.15), 0 10px 10px -5px rgba(27, 27, 29, 0.04)`

---

## 2. Reusable Layout Shell

The entire application viewport is locked at `100vh` and uses a split screen:
1.  **Sidebar Navigation (Left)**: Fixed width of `280px`. Occupies 100% height.
2.  **Workspace Content Area (Right)**: Fills remaining window width. Flow direction: vertical (Column).

### A. Sidebar Navigation (`<aside>`)
*   **Position**: Fixed (`position: fixed; left: 0; top: 0; bottom: 0`).
*   **Background**: `var(--color-bg)`.
*   **Border**: `1px solid var(--color-outline-variant)` on the right side.
*   **Internal Layout**: Flexbox container (`flex-direction: column`).
    *   *Brand Header (Top)*: `padding: 24px`. Contains brand title (`font-headline-md`) and subtitle (`font-label-sm`).
    *   *Navigation List (Middle)*: Spacing: `8px` gap between links. Buttons have flex layout with icon + text (`padding: 8px 16px`). Hover state uses `background-color: var(--color-surface-container-low)`. Active navigation buttons are styled with `font-weight: 700`, `color: var(--color-primary)`, background `var(--color-surface-container-high)`, and a `2px solid var(--color-primary)` vertical accent line on the right edge.
    *   *User Profile (Bottom)*: Flex container (`padding: 16px`, border-top: `1px solid var(--color-outline-variant)`). Displays user profile avatar (`40x40px`, `--radius-circle`) on the left, and name/role on the right.

### B. Top App Bar (`<header>`)
*   **Position**: Fixed to top-right (`margin-left: 280px`, `height: 64px`, `width: calc(100% - 280px)`).
*   **Border**: `1px solid var(--color-outline-variant)` on the bottom.
*   **Internal Layout**: Flex row with space-between positioning.
    *   *Left Side*: Headline (`font-headline-lg`) and a connection state indicator. State indicator consists of a status light (`8x8px`, pulsing) and text label (`font-label-sm`, color: `var(--color-text-secondary)`).
    *   *Right Side*: Quick-action diagnostic icon buttons (system sensors, antenna parameters, and help icons) with hover animations.

---

## 3. Screen Viewports & Content Layouts

The content canvas spans the remaining vertical space under the Top App Bar (`height: calc(100vh - 64px)`).

### A. TAB 1: Diagnostic Console (Dashboard)
This tab alternates between three distinct viewports based on the probe and connection state:

#### View 1: Connecting State (Initial Probe Offline prompt)
*   **Layout**: Center align container (`display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; position: relative;`).
*   **Connect Module Graphic**:
    *   An absolute center graphic composed of outer pulsing circular rings (`border: 1px solid var(--color-outline-variant)`, size: `256x256px`).
    *   An inner white card (`size: 192x192px`, `--radius-circle`, containing a local SVGs sheep vector logo and animated scanning sweep overlay).
*   **Interaction Controls**:
    *   A prompt text label (`font-headline-sm`, margin-top: `32px`).
    *   **"Connect Probe" Button**: Solid black (`height: 48px`, width: `100%`, max-width: `384px`, `--radius-md`, text: `font-label-bold`, hover opacity: `0.9`, active scale: `0.98`).
*   **Connecting Loading State (Simulated)**:
    *   When clicked, the button hides and shows a loading string: `"Establishing connection with ultrasound probe..."` alongside a progress bar (`width: 256px`, `height: 4px`, track color: `var(--color-surface-container-high)`, loading indicator: moving slider).
*   **System Diagnostics Footer**:
    *   Stretches across the bottom viewport (`position: absolute; bottom: 0; width: 100%; height: 80px; border-t: 1px solid var(--color-outline-variant);`).
    *   Uses a 3-column grid to list system specs: Processor (`CPU`), System RAM, and GPU diagnostics.

#### View 2: Ready State (RFID Registration Dashboard)
*   **Layout**: Centered card canvas (`padding: 24px`, flex layout, items-center).
*   **Scan Registration Panel**:
    *   A card split into two horizontal columns (Left: input form, Right: active NFC panel).
    *   *Left Column (Form)*: Input label (`font-label-bold`), RFID text input field (`height: 48px`, border: `1px solid var(--color-outline)`, focus: outline border changes to `var(--color-outline-focus)`). Start Scan button (`height: 48px`, background: `var(--color-primary)`, text color: `#FFFFFF`, hover state: `opacity: 0.9`).
    *   *Right Column (Sensor Graphic)*: Light grey container (`width: 320px`, background: `var(--color-surface-container)`). Renders a pulsing antenna icon with secondary text: `"Awaiting proximity to 134.2 kHz tag (ISO 11784/5)"`.
*   **Latest Diagnostic Log Table**:
    *   Fades in directly below the registration card if a previous record was saved during the browser session. Shows the Sheep ID, gestational stage badge, duration, and frame metrics.

#### View 3: Scanning State (Live Feed & Telemetry Grid)
*   **Layout**: Flex row, occupying 100% height and width.
*   *Left Side: Live Ultrasound Viewport* (Flex-grow):
    *   Background: `#000000`. Black borders.
    *   Contains the HTML5 Canvas (`id="canvas-feed"`, matches video aspect ratio).
    *   Translucent HUD overlays (`position: absolute; top: 16px; left: 16px;`) displaying frequency, gain, depth, and dynamic range details.
    *   A continuous green horizontal scanline scanning down the canvas loop.
*   *Right Side: Telemetry & Anatomy Sidebar* (`width: 320px`):
    *   Background: `var(--color-bg)`, border-left: `1px solid var(--color-outline-variant)`.
    *   **Telemetry Grid (Top)**: 2-column, 3-row grid. Contains 6 telemetry card blocks showing WS FPS, Inference duration, total frame counter, elapsed time (seconds), active detections count, and Model FPS.
    *   **Live Anatomy Table (Middle)**: Lists current frame classes. Height: flex-grow, overflow-y: scroll. Layout: 3 columns (`Class name`, `Confidence %`, `Bounding Box [x, y, w, h]`).
    *   **Footer Actions (Bottom)**: Contains the large red **"Stop Scan & Save"** button (`height: 64px`, background: `var(--color-error)`, text: `#FFFFFF`, hover: brightness overlay, font: `font-headline-sm`).

---

### B. TAB 2: History logs & Statistics
A high-density logging sheet to review saved sessions.

*   **Layout**: Flex column (`padding: 24px`, gap: `24px`).
*   **Filter Bar (Top)**:
    *   Contains a searching input card (`max-width: 448px`, height: `40px`) with search icons.
*   **Data Sheet Grid (Middle)**:
    *   An overflow-scroll viewport displaying the paginated logs in the High-Density History Table format (Scan ID, RFID Tag, Timestamp, Gestational Diagnosis badges, and Delete action buttons).
*   **Aggregated Analytics Grid (Bottom)**:
    *   A 3-column layout displaying:
        1.  *Pregnancy Rate Card*: Displays overall positive rate (`font-telemetry`) alongside a progress bar (`track: var(--color-surface-container)`, fill: `var(--color-success)`).
        2.  *Average Scan Duration Card*: Shows average time taken (`font-telemetry`) with a visual sparkline representing session distribution.
        3.  *Pregnancy Distribution Card*: Details count of total scans, pregnant count, and non-pregnant count.

---

### C. TAB 3: System Settings
*   **Layout**: Split grid panel (Left: config inputs, Right: telemetry hardware status widget).
*   *Left Column (Config inputs - 8 columns width)*:
    *   **Input Calibration Card**: Primary video source dropdown menu (`<select>`) and frame rate cap selector (15 FPS, 30 FPS, 60 FPS, Uncapped).
    *   **Neural Engine Card**: A range slider to adjust classification confidence thresholds (from 0.10 to 0.95), showing the active numeric threshold scale on the right.
*   *Right Column (Hardware Telemetry - 4 columns width)*:
    *   **System Health Card**: Lists CUDA GPU graphics card name, active system RAM load progress bar, and CUDA state details.

---

## 4. Modals & Dialogs

### A. Finalize Diagnosis Modal
Displays a scrim overlay once the "Stop Scan" button is clicked, forcing the operator to confirm or override the AI stage before database storage.

*   **Modal Scrim**: Absolute overlay (`position: fixed; inset: 0; bg: rgba(0,0,0,0.6); z-index: 50; display: flex; justify-content: center; align-items: center;`).
*   **Dialog Container**: Background: `var(--color-surface-card)`, width: `100%`, max-width: `448px`, padding: `24px`, `--radius-lg`, box-shadow: `var(--shadow-lg)`.
*   **AI Prediction Banner**:
    *   An informational box (`background: var(--color-surface-container)`, border: `1px solid var(--color-outline-variant)`) displaying: `"AI PREDICTION: [detected_stage]"` with a black "Auto-Selected" indicator badge.
*   **Gestational Radio Selection Stack**:
    *   Contains 4 radio button cards stacked vertically:
        1.  *Non-Pregnant*: Red border/accent on focus/selection.
        2.  *Pregnant (Early Stage)*: Green border/accent on selection.
        3.  *Pregnant (Mid Stage)*: Green border/accent on selection.
        4.  *Pregnant (Late Stage)*: Green border/accent on selection.
    *   Each card features a bold label (`font-label-bold`) and descriptive text (`font-body-sm`).
*   **Footer Action Buttons**:
    *   Horizontal flex row (`justify-content: flex-end`, gap: `12px`).
    *   *Cancel*: Transparent button (`border: 1px solid var(--color-outline)`, hover: `var(--color-hover-overlay)`).
    *   *Save Result*: Solid black button (`background: var(--color-primary)`, text: `#FFFFFF`, hover: `opacity: 0.9`).

---

## 5. CSS Keyframe Animations

### A. Transcendental Scanline Sweep
```css
@keyframes scanline-sweep {
  0% { top: 0%; opacity: 0; }
  5% { opacity: 1; }
  95% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}
```

### B. Hardware Sensor Pulse
```css
@keyframes sensor-pulse {
  0% { transform: scale(0.95); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}
```

### C. Live Recording Indicator
```css
@keyframes record-flash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```
