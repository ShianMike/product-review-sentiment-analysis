# UI Design System — Agent Instructions

Use this document when building any new frontend project to replicate this design system. This defines the visual language, component patterns, layout architecture, and interaction design. Apply these rules regardless of the project's domain — adapt the content but keep the aesthetic.

---

## Tech Stack

- **Framework**: React 18 + Vite
- **Styling**: Plain CSS with CSS custom properties (no Tailwind, no CSS-in-JS)
- **Icons**: `lucide-react` (tree-shakeable, consistent 24px stroke icons)
- **Fonts**: Google Fonts — `Inter` (UI) + `JetBrains Mono` (data/code)
- **Charts** (if needed): `recharts` or `d3`

Load fonts in `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

---

## CSS Custom Properties (Design Tokens)

Define ALL tokens in `:root` inside `index.css`. Every color, radius, shadow, and font MUST use a variable. Never hardcode colors in component CSS.

### Dark Theme (Default)

```css
:root {
  /* Backgrounds — darkest to lightest */
  --bg-primary:    #0a0a0a;
  --bg-secondary:  #111111;
  --bg-tertiary:   #1a1a1a;
  --bg-card:       #141414;
  --bg-hover:      #1f1f1f;
  --bg-input:      #0f0f0f;

  /* Borders */
  --border:        #2a2a2a;
  --border-focus:  #444;
  --border-accent: #3b82f6;

  /* Text — brightest to dimmest */
  --text-primary:   #f0f0f0;
  --text-secondary: #a0a0a0;
  --text-muted:     #666;
  --text-accent:    #60a5fa;

  /* Accent (blue) */
  --accent:        #3b82f6;
  --accent-hover:  #2563eb;
  --accent-muted:  rgba(59, 130, 246, 0.1);

  /* Semantic colors */
  --red:    #ef4444;
  --orange: #f97316;
  --yellow: #eab308;
  --green:  #22c55e;
  --cyan:   #06b6d4;

  /* Radii */
  --radius-sm: 6px;
  --radius:    8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
  --shadow:    0 4px 12px rgba(0,0,0,0.5);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.6);
}
```

### Light Theme

Override with `[data-theme="light"]` on `<html>`:

```css
[data-theme="light"] {
  --bg-primary:    #f8f9fa;
  --bg-secondary:  #ffffff;
  --bg-tertiary:   #f0f1f3;
  --bg-card:       #ffffff;
  --bg-hover:      #e9ecef;
  --bg-input:      #ffffff;

  --border:        #d1d5db;
  --border-focus:  #9ca3af;
  --border-accent: #2563eb;

  --text-primary:   #111827;
  --text-secondary: #4b5563;
  --text-muted:     #9ca3af;
  --text-accent:    #2563eb;

  --accent:        #2563eb;
  --accent-hover:  #1d4ed8;
  --accent-muted:  rgba(37, 99, 235, 0.08);

  --red:    #dc2626;
  --orange: #ea580c;
  --yellow: #ca8a04;
  --green:  #16a34a;
  --cyan:   #0891b2;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --shadow:    0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
}
```

### Color-Blind Mode (Optional)

```css
[data-cb="true"] {
  --red:    #D55E00;
  --orange: #E69F00;
  --yellow: #F0E442;
  --green:  #009E73;
  --cyan:   #56B4E9;
}
```

### Theme Implementation

Store theme in `localStorage`. Apply via `data-theme` attribute on `<html>`. Toggle with a Sun/Moon icon button.

```jsx
const [theme, setTheme] = useState(() => localStorage.getItem("app_theme") || "dark");
useEffect(() => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("app_theme", theme);
}, [theme]);
```

---

## Global Resets (index.css)

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  scroll-behavior: smooth;
}

body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
  min-height: 100vh;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
```

---

## Layout Architecture

### Sidebar + Main Content

The primary layout is a **fixed sidebar** (left, 320px) with a **scrollable main content area**.

```css
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: row;
}

.sidebar {
  width: 320px;
  flex-shrink: 0;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  overflow: hidden;
  z-index: 100;
}

.main-content {
  flex: 1;
  min-width: 0;
  margin-left: 320px;
  padding: 24px 24px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-x: hidden;
}
```

### Responsive Breakpoints

| Breakpoint | Behavior |
|-----------|----------|
| `≤ 1024px` | Sidebar collapses to top. Main stacks vertically. Padding reduces to 16px. |
| `≤ 768px` | Multi-column grids become single-column. Font sizes shrink 1–2px. |
| `≤ 480px` | Maximum 2 grid columns. Padding 6–8px. Touch-friendly sizing (min 44px targets). |

```css
@media (max-width: 1024px) {
  .app { flex-direction: column; }
  .sidebar { position: relative; width: 100%; height: auto; border-right: none; border-bottom: 1px solid var(--border); }
  .main-content { margin-left: 0; padding: 16px 16px 32px; }
}
```

---

## Spacing Scale

Use consistent spacing everywhere. The scale is based on 4px increments:

| Token | Value | Usage |
|-------|-------|-------|
| `4px` | Micro gaps, inline spacing |
| `6px` | Between grid items, tight groups |
| `8px` | Section padding, button gaps |
| `10px` | Input padding, card internal |
| `12px` | Section gaps, card padding |
| `16px` | Section separation, panel padding |
| `24px` | Major section separation |
| `32px` | Page-level spacing |

---

## Typography

### Scale

| Size | Weight | Usage |
|------|--------|-------|
| `9px` | 600 | Micro labels, badge text |
| `10px` | 600–700 | Uppercase section labels, chip text |
| `11px` | 500–700 | Form labels, button text, table headers |
| `12px` | 500–600 | Secondary text, small buttons |
| `13px` | 600–700 | Body text, primary labels, card titles |
| `14px` | 700 | Panel headers |
| `15px` | 600–700 | Section titles, state headings |

### Conventions

- **Section labels**: `font-size: 10–11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);`
- **Data values**: Use `var(--font-mono)` for numbers, IDs, codes, timestamps
- **Monospace badges**: `font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.04em;`
- **Body/descriptions**: `font-size: 13px; color: var(--text-secondary); line-height: 1.5;`

---

## Component Patterns

### Cards / Panel Sections

```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.card-header h3 {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.card-body {
  padding: 12px 16px;
}
```

### Buttons

**Common base pattern** — all buttons share this:
```css
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: var(--radius);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Primary button:**
```css
.btn-primary {
  padding: 10px 16px;
  font-size: 13px;
  background: var(--accent);
  color: white;
  border: none;
}
.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}
```

**Secondary / ghost button:**
```css
.btn-secondary {
  padding: 8px 10px;
  font-size: 11px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.btn-secondary:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-focus);
}
.btn-secondary.active {
  background: var(--accent-muted);
  color: var(--text-accent);
  border-color: var(--accent);
}
```

**Icon-only button (toolbar):**
```css
.btn-icon {
  width: 32px;
  height: 32px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}
.btn-icon:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-focus);
}
.btn-icon.active {
  background: var(--accent-muted);
  border-color: var(--accent);
  color: var(--text-accent);
}
```

**Grid of toggle buttons** (e.g., source selector, model picker):
```css
.btn-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
```

### Inputs & Form Controls

**Text input:**
```css
.input {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 0.15s ease;
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-muted);
}
.input::placeholder {
  color: var(--text-muted);
}
```

**Input with icon prefix:**
```css
.input-wrap {
  position: relative;
}
.input-wrap svg {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}
.input-wrap .input {
  padding-left: 32px;
}
```

**Select dropdown:**
```css
.select {
  width: 100%;
  padding: 8px 12px;
  font-size: 12px;
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  cursor: pointer;
  appearance: none;
}
```

**Range slider:**
```css
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  border: 1px solid var(--border);
  outline: none;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg-primary);
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  cursor: pointer;
  transition: transform 0.1s ease;
}
.slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}
```

**Textarea:**
```css
.textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  resize: none;
  outline: none;
  transition: border-color 0.15s ease;
  min-height: 80px;
}
.textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-muted);
}
```

### Form Section Pattern

Wrap every form group in a section container with an uppercase label:
```css
.form-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}
```

---

## Sidebar Design

### Structure

The sidebar has these zones, top to bottom:

1. **Brand bar** (fixed height) — App name + icon buttons (theme toggle, links)
2. **Tab navigation** — Horizontal tabs with bottom-border active indicator
3. **Scrollable content area** — Forms, lists, controls (flex: 1, overflow-y: auto)
4. **Footer bar** (fixed height) — Settings toggles, utility links

### Brand Bar
```css
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.brand-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}
.brand-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
```

### Tab Navigation
```css
.tab-nav {
  display: flex;
  gap: 2px;
  padding: 8px 12px;
  flex-shrink: 0;
}
.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab:hover { color: var(--text-secondary); background: var(--bg-hover); }
.tab.active { color: var(--text-accent); border-bottom-color: var(--accent); }
```

### Scrollable Content
```css
.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
```

### Section Groups
Use uppercase labels above groups of related controls:
```css
.group-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 0 2px;
  margin-bottom: 2px;
}
```

---

## Chip / Badge Patterns

**Data chip (metadata):**
```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.chip-value {
  color: var(--text-secondary);
  font-weight: 500;
  text-transform: none;
}
```

**Accent badge (ID/code):**
```css
.badge-accent {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--text-accent);
  background: var(--accent-muted);
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(59, 130, 246, 0.2);
}
```

**Severity badge (risk/status):**
```css
.badge-high { color: var(--red); background: rgba(239, 68, 68, 0.12); }
.badge-med  { color: var(--yellow); background: rgba(234, 179, 8, 0.12); }
.badge-low  { color: var(--green); background: rgba(34, 197, 94, 0.1); }
```

**Count badge:**
```css
.count-badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  border-radius: 10px;
  padding: 1px 7px;
  font-weight: 500;
}
```

---

## Modal / Overlay Pattern

```css
.overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  animation: fadeIn 0.15s ease;
}

.modal {
  width: 420px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05);
  padding: 24px;
  animation: slideUp 0.2s ease;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal-header h3 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}
.modal-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Close modal on overlay click with `e.stopPropagation()` on the modal itself. Use `createPortal` to render modals at `document.body`.

---

## Dropdown Menu Pattern

```css
.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 240px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 4px;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}
.dropdown-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

---

## State Screens (Loading / Error / Empty)

### Loading State
```jsx
<div className="state state-loading">
  <Loader2 size={20} className="spin" />
  <div>
    <h3>Loading…</h3>
    <p>Fetching data from the server</p>
  </div>
</div>
```
```css
.state {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 32px 24px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-card);
}
.state h3 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.state p  { font-size: 13px; color: var(--text-secondary); line-height: 1.5; max-width: 480px; }

.state-loading { color: var(--text-accent); }
.state-loading h3 { color: var(--text-accent); }
```

### Error State
```css
.state-error {
  color: var(--red);
  border-color: rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.04);
}
.state-error h3 { color: var(--red); }
```

### Empty State
```css
.state-empty {
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 80px 24px;
  color: var(--text-muted);
}
.state-empty h3 { color: var(--text-secondary); }
```

### Skeleton Loading
```css
.skeleton-bar {
  height: 10px;
  border-radius: 5px;
  background: var(--border);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}
.skeleton-bar:nth-child(2) { animation-delay: 0.15s; }
.skeleton-bar:nth-child(3) { animation-delay: 0.3s; }
.skeleton-bar:nth-child(4) { animation-delay: 0.45s; }

@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.7; }
}
```

---

## Data Table Pattern

```css
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.data-table thead { position: sticky; top: 0; z-index: 1; }
.data-table th {
  background: var(--bg-tertiary);
  padding: 8px 10px;
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.data-table td {
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  color: var(--text-secondary);
  white-space: nowrap;
}
.data-table tbody tr:hover { background: var(--bg-hover); }
.data-table .col-mono {
  font-family: var(--font-mono);
  font-size: 12px;
}
```

---

## List Item Pattern (e.g., History, Search Results)

```css
.list-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  color: inherit;
  width: 100%;
}
.list-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-focus);
}
```

---

## Animations

### Standard Transitions
All interactive elements use `transition: all 0.15s ease;`. Never exceed `0.2s` for UI feedback.

### Spin (loading)
```css
.spin { animation: spin 1s linear infinite; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

### Pulse (live indicators)
```css
.pulse { animation: pulse 2s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Hover Lift
```css
.lift:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow);
}
```

---

## Scrollbar Styling

Apply thin scrollbars globally and in scrollable containers:
```css
.scrollable {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.scrollable::-webkit-scrollbar { width: 5px; }
.scrollable::-webkit-scrollbar-track { background: transparent; }
.scrollable::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.scrollable::-webkit-scrollbar-thumb:hover { background: var(--border-focus); }
```

---

## CSS Naming Convention

Use **BEM-like prefix naming**. Each component gets a 2–3 letter prefix:
- `cp-` for ControlPanel (sidebar)
- `rv-` for ResultsView (main content)
- `hp-` for HistoryPanel
- etc.

Examples: `.cp-brand`, `.cp-nav-tab`, `.rv-meta-bar`, `.rv-btn`, `.hp-item`

---

## Icon Usage (lucide-react)

- Import only the icons you need (tree-shaking)
- Default size: `size={14}` for buttons, `size={16}` for standalone, `size={20}` for state screens
- Color inherited from parent via `color: currentColor`
- Common icons: `Loader2` (loading), `X` (close), `ChevronDown` (expand), `Search`, `Sun`/`Moon` (theme), `Star` (favorites), `AlertTriangle` (warning)

```jsx
import { Search, Loader2, X, ChevronDown, Sun, Moon } from "lucide-react";
```

---

## Keyboard Shortcuts Modal (Optional)

Display a grid of key bindings in a modal:
```css
.shortcuts-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 16px;
  align-items: center;
}
.shortcuts-grid kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
}
```

---

## Lazy Loading & Code Splitting

Use React `lazy()` + `<Suspense>` for heavy or secondary views:
```jsx
const HeavyComponent = lazy(() => import("./components/HeavyComponent"));

// In render:
<Suspense fallback={<div className="state state-loading"><Loader2 className="spin" /> Loading…</div>}>
  <HeavyComponent />
</Suspense>
```

---

## Print Styles

Hide navigation, sidebar, and toolbars. Full-width content. Force color printing for charts:
```css
@media print {
  .sidebar, .header, .toolbar { display: none !important; }
  .app { display: block; }
  .main-content { margin-left: 0; padding: 0; }
}
```

---

## Summary of Visual Identity

| Aspect | Rule |
|--------|------|
| **Mood** | Professional, data-dense, technical |
| **Default theme** | Dark (#0a0a0a background) |
| **Accent** | Blue (#3b82f6 / #60a5fa) |
| **Corners** | Rounded (6–12px), never sharp |
| **Borders** | Always 1px solid, subtle |
| **Shadows** | Minimal on dark theme, more visible on light |
| **Spacing** | Tight but breathable (4–8px gaps) |
| **Typography** | Small (11–13px), heavy weights, monospace for data |
| **Animations** | Subtle, fast (0.15s), functional not decorative |
| **Interactivity** | Hover = lighter bg + border change, Active = accent tint |
