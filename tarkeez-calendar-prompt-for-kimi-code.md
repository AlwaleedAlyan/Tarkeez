# Kimi Code Implementation Prompt: Tarkeez Study Calendar Feature

## Project Context
**Tarkeez** is a study-tracking app for students. It records study sessions, tracks focus quality, pages read, and allows users to share their progress. The app has an existing web version and mobile app (React-based). The existing design uses a dark green theme that must be preserved exactly.

> **CRITICAL NOTE:** The web version uses the existing top-right navigation bar from the current Tarkeez web app. Do NOT build a new navigation bar. The calendar page should integrate into the existing layout and reuse the current nav component. Only the mobile version should show the bottom tab bar (if needed). This prompt is for the **page content only** — the calendar view itself, not the app shell.

---

## Goal
Implement the **Study Calendar** page — a month-view calendar where users can see their study habits via a heat map, select any day to view its sessions, and see motivational stats (streaks, monthly totals, etc.).

---

## Design Source of Truth

Reference these files in the workspace for exact visual guidance:
- **Desktop mockup:** `tarkeez-calendar-desktop.png` — layout, proportions, and full desktop view
- **Mobile mockup:** `tarkeez-calendar-mobile.png` — mobile layout and component stacking
- **Interactive prototype:** `tarkeez-calendar-ui.html` — open in browser to see behavior, hover states, and responsive breakpoints
- **Design spec:** `tarkeez-calendar-design-spec.md` — full design system, tokens, and interaction notes

Build the UI to match these mockups **pixel-for-pixel** in spirit. Use the exact colors and spacing provided below.

---

## Design System (Exact Tokens)

### Colors
```css
:root {
  --bg-primary: #111611;
  --bg-secondary: #1a1f1a;
  --bg-card: #242b24;
  --bg-card-hover: #2a332a;
  --bg-cell: #1e241e;
  --accent: #7cb87c;
  --accent-light: #9dd49d;
  --accent-dark: #5a9e5a;
  --accent-dim: rgba(124, 184, 124, 0.15);
  --text-primary: #ffffff;
  --text-secondary: #a0b0a0;
  --text-muted: #6a7a6a;
  --border: rgba(124, 184, 124, 0.1);
  --streak-gold: #ffaa44;
}
```

### Heat Map Colors (6 tiers — based on minutes studied that day)
```css
.heat-0 { background: #1e241e; color: #ffffff; }          /* 0 minutes */
.heat-1 { background: #233023; color: #ffffff; }        /* 1–29 min */
.heat-2 { background: #304430; color: #ffffff; }        /* 30–59 min */
.heat-3 { background: #415f41; color: #ffffff; }        /* 60–89 min */
.heat-4 { background: #557d55; color: #ffffff; }          /* 90–149 min */
.heat-5 { background: #699b69; color: #111611; }          /* 150+ min — dark text for contrast */
```

### Typography
- **Font:** Inter (Google Fonts) or system sans-serif stack
- **Page Title:** 28px / weight 700 / color: `--text-primary`
- **Subtitle:** 14px / weight 400 / color: `--text-secondary`
- **Section Title:** 16px / weight 600 / color: `--text-primary`
- **Stat Value:** 22–24px / weight 700 / color: `--accent`
- **Stat Label:** 12px / weight 500 / uppercase / color: `--text-muted` / letter-spacing: 0.5px
- **Body:** 14px / weight 400 / color: `--text-primary`
- **Meta:** 12px / weight 400 / color: `--text-secondary`
- **Tiny:** 10–11px / weight 500 / color: `--text-muted`

### Spacing & Radius
```css
--radius-lg: 20px;   /* Page-level cards */
--radius-md: 16px;   /* Calendar card, panels */
--radius-sm: 12px;    /* Stats cards */
--radius-xs: 8px;     /* Buttons, small elements */
```

### Layout Grid
- **Desktop (≥900px):** Two-column grid — `1fr 380px` (calendar left, side panel right)
- **Mobile (<900px):** Single column, stacked. Bottom nav is part of the app shell — do NOT rebuild it.
- **Max container width:** 1200px, centered
- **Page padding:** 24px desktop, 16px mobile
- **Gap between columns:** 24px
- **Gap between cards:** 16px

---

## Page Structure

The page should be rendered as a **page component** (e.g., `/calendar` route) that fits into the existing Tarkeez app shell. The nav bar is already there — you are building the **content area only**.

```
[EXISTING TOP NAV — do not build this]
─────────────────────────────────────────
| Study Calendar                        |
| Track your study habits and ...       |
| [Stats Row]                           |
| [Month Selector]                      |
| [Calendar Card]              | [Side]  |
|                              | [Panel] |
─────────────────────────────────────────
[EXISTING BOTTOM NAV (mobile) — do not build this]
```

---

## Components to Build

### 1. Stats Row (4 cards desktop, 2×2 grid on mobile <600px)

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│   42h    │ │   1.8h   │ │    12    │ │   5.2h   │
│ This Month│ │ Daily Avg│ │Day Streak│ │ Best Day │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

- Cards: `background: --bg-card`, `border-radius: --radius-sm`, `border: 1px solid --border`
- Value: stat font, green color
- Label: tiny font, muted, uppercase
- Hover: background shifts to `--bg-card-hover` (200ms transition)
- Stats are **computed from the current month's data** passed as props

### 2. Month Selector

```
┌────────────────────────────────────────────────────┐
│  ‹        July 2026          ›            [Today]  │
└────────────────────────────────────────────────────┘
```

- Card container with same styling as stats
- Left/right arrow buttons (`<` `>`): 36×36, rounded, `--bg-cell` background, hover shows `--accent-dim` with `--accent` text
- Month label centered: 18px semibold
- Today button: small pill on right, bordered, hover turns `--accent` border
- Behavior: Clicking arrows changes month (with smooth cross-fade animation on the calendar grid, 300ms)
- Today button: snaps to current month and selects today

### 3. Calendar Card (The Core Feature)

```
┌────────────────────────────────────────────────────┐
│  Sun  Mon  Tue  Wed  Thu  Fri  Sat                 │
│       28   29   30   1    2    3                   │
│  4    5    6    7    [8]   9    10                 │
│  ...                                               │
│                                                    │
│  Less  ■ ■ ■ ■ ■ ■  More                          │
└────────────────────────────────────────────────────┘
```

**Grid specs:**
- 7 columns, 6 rows max
- Cell aspect ratio: 1:1 (square)
- Cell gap: 4px
- Cells: `border-radius: --radius-xs`
- Day label row (Sun–Sat): 10px uppercase, `--text-muted`, letter-spacing 0.5px

**Cell states:**
- **Other month days:** 30% opacity, dimmed gray text
- **Today:** 2px border `--accent`, plus subtle glow `box-shadow: 0 0 0 1px var(--accent)`
- **Selected day:** 2px outer ring `--accent-light`
- **Has data:** Small green dot (4px) at bottom center
- **Streak days:** 🔥 badge in top-right corner (9px)
- **Heat level:** Apply background color from the 6-tier heat map above
- **Cell content:** Day number (top), duration string like "1h30m" or "45m" (bottom, 10px)

**Heat level calculation:**
```javascript
function getHeatLevel(minutes) {
  if (minutes === 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 90) return 3;
  if (minutes < 150) return 4;
  return 5;
}

function formatDuration(minutes) {
  if (minutes === 0) return '';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
```

**Interactions:**
- **Hover (desktop):** Scale 1.05×, `border: 2px solid --accent`, z-index boost, tooltip appears showing exact duration
- **Click:** Selects the day, updates the Day Detail Panel (if on desktop, right panel updates; if mobile, scrolls to detail section)
- **Tooltip:** Fixed position, follows cursor. Content: "July 8: 2h 30m studied" or "July 8: No study session"

**Legend (bottom of calendar card):**
```
Less  [■] [■] [■] [■] [■] [■]  More
```
- 6 small boxes showing the heat scale colors
- Labels "Less" / "More" in 10px muted text

### 4. Streak Card (Side Panel — desktop only, or stacked on mobile)

```
┌────────────────────────────────────┐
│  🔥 Streak                          │
│                                     │
│     12          |          28       │
│   Current              Best       │
│                                     │
│  [ weekly mini bar chart ]         │
│    M  T  W  T  F  S  S           │
└────────────────────────────────────┘
```

- Card background: `--bg-card` with subtle gradient border: `linear-gradient(135deg, rgba(124,184,124,0.1), rgba(255,170,68,0.05))`
- Border: `1px solid rgba(124,184,124,0.2)`
- Streak numbers: 36px bold, `--accent`
- Divider: 1px vertical line `--border`
- Weekly mini chart: 7 bars, heights from last 7 days of data. Bars: 32px wide, `--accent`, `border-radius: 4px 4px 0 0`, gap 16px between groups
- Labels: M T W T F S S below bars, 10px muted

### 5. Day Detail Panel (Side Panel — desktop; stacked below calendar on mobile)

```
┌────────────────────────────────────┐
│  Study Sessions          July 8    │
│                                    │
│  [2.5h ring]  Wednesday            │
│               4 sessions · 92%     │
│               🔥 Part of 12-day     │
│                                    │
│  📄 Machine Learning Notes    45m │
│     9:00 AM · 12 pages        95%  │
│                                    │
│  📊 Statistics Problem Set  1h 20m │
│     11:30 AM · 8 pages        88%   │
│  ...                               │
└────────────────────────────────────┘
```

**Header:**
- Title "Study Sessions" left, date "July 8" right (muted)

**Day Summary:**
- Circular progress ring (64px diameter): 
  - Background track: 4px `--bg-card` border
  - Progress arc: 4px `--accent` border (arc length = % of daily goal, e.g. 2.5h / 3h = 75%)
  - Center text: duration, e.g. "2.5h", 14px bold `--accent`
- Next to ring: Day name, session count + avg focus, streak badge if applicable

**Session List:**
- Each item: horizontal flex row, padding 12px, `--bg-cell` background, `border-radius: --radius-sm`
- Icon: 40×40 square, `--accent-dim` background, `border-radius: --radius-xs`, centered emoji/icon
- Title: 14px semibold, truncated with ellipsis
- Meta: time + pages, 12px muted
- Duration: right-aligned, 14px bold `--accent`
- Focus %: right-aligned below duration, 11px muted
- Hover: background shifts to `--bg-card-hover` (150ms)

**Empty State:**
When selected day has 0 minutes:
```
📭
No sessions
No study sessions recorded for this day
```
- Centered, 32px padding, muted text

---

## Data Structure

The component receives a `studyData` prop shaped like:

```typescript
interface StudyData {
  [dateKey: string]: number; // dateKey = "YYYY-MM-DD", value = minutes studied
}

interface Session {
  id: string;
  title: string;
  topic: string; // for icon mapping
  startTime: string; // e.g. "09:00"
  duration: number; // minutes
  pagesRead?: number;
  focusScore: number; // 0-100
}

interface CalendarProps {
  studyData: StudyData;           // All study minutes by date
  sessions: Session[];            // All sessions (filtered by selected day)
  currentStreak: number;
  bestStreak: number;
  weeklyActivity: number[];       // 7 values, last 7 days in minutes
  dailyGoal?: number;             // Minutes, default 180 (3h)
}
```

### Mock Data (for development)
Use this exact dataset for the July 2026 mock:
```javascript
const studyData = {
  "2026-07-01": 0, "2026-07-02": 30, "2026-07-03": 90, "2026-07-04": 120,
  "2026-07-05": 45, "2026-07-06": 0, "2026-07-07": 60, "2026-07-08": 150,
  "2026-07-09": 80, "2026-07-10": 0, "2026-07-11": 180, "2026-07-12": 120,
  "2026-07-13": 90, "2026-07-14": 0, "2026-07-15": 60, "2026-07-16": 200,
  "2026-07-17": 150, "2026-07-18": 0, "2026-07-19": 45, "2026-07-20": 120,
  "2026-07-21": 90, "2026-07-22": 0, "2026-07-23": 30, "2026-07-24": 180,
  "2026-07-25": 210, "2026-07-26": 60, "2026-07-27": 0, "2026-07-28": 120,
  "2026-07-29": 90, "2026-07-30": 150, "2026-07-31": 45
};

const sessionsForJuly8 = [
  { id: "1", title: "Machine Learning Notes", topic: "notes", startTime: "09:00", duration: 45, pagesRead: 12, focusScore: 95 },
  { id: "2", title: "Statistics Problem Set", topic: "math", startTime: "11:30", duration: 80, pagesRead: 8, focusScore: 88 },
  { id: "3", title: "Research Paper Review", topic: "reading", startTime: "15:00", duration: 30, focusScore: 92 },
  { id: "4", title: "Programming Assignment", topic: "coding", startTime: "17:00", duration: 15, focusScore: 100 }
];
```

---

## Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| **≥1200px** | Full layout, 1400px max-width, side panel fixed at 380px |
| **900–1199px** | Side panel shrinks to 340px, main content flexes |
| **<900px** | Single column. Side panel moves below calendar. Calendar cell durations hidden. Stats become 2×2. |
| **<600px** | Same as above + calendar cell duration text hidden, only day number + dot + heat color |

Use CSS Grid with `grid-template-columns: 1fr 380px` on desktop, media query to `grid-template-columns: 1fr` below 900px.

---

## Animation Requirements

```css
/* Calendar grid month transition */
.calendar-grid {
  transition: opacity 0.3s ease;
}
.calendar-grid.switching {
  opacity: 0;
}

/* Cell hover */
.calendar-cell {
  transition: transform 0.15s ease, border-color 0.15s ease, background-color 0.2s ease;
}
.calendar-cell:hover {
  transform: scale(1.05);
  z-index: 2;
}

/* Session item hover */
.session-item {
  transition: background-color 0.15s ease;
}

/* Day panel content animation */
.day-panel {
  animation: fadeIn 0.4s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

---

## Accessibility Requirements

- All interactive cells must be keyboard-navigable (arrow keys move between days, Enter selects)
- `aria-label` on each calendar cell: `"July 8, 2 hours 30 minutes studied"` or `"July 8, no study session"`
- `aria-selected` on selected day
- `aria-live="polite"` on the day detail panel so screen readers announce updates
- Tooltips should be `role="tooltip"` and linked via `aria-describedby`
- Respect `prefers-reduced-motion`: disable scale and slide animations, keep instant transitions

---

## Tech Stack

Assume the existing Tarkeez web app uses **React + TypeScript + Tailwind CSS** (or plain CSS modules). Build the calendar as:

- A single page component: `CalendarPage.tsx`
- Reusable sub-components:
  - `MonthSelector.tsx`
  - `CalendarGrid.tsx`
  - `CalendarCell.tsx`
  - `DayDetailPanel.tsx`
  - `SessionItem.tsx`
  - `StreakCard.tsx`
  - `StatsRow.tsx`
  - `ProgressRing.tsx`

If using Tailwind, map the CSS variables above to Tailwind config or use inline styles for the heat colors (since they are dynamic based on data).

---

## File Deliverables

1. `CalendarPage.tsx` — Main page component
2. `calendar.css` or `CalendarPage.module.css` — All custom styles (especially heat map colors, grid, animations)
3. `calendarUtils.ts` — Helper functions: `getHeatLevel`, `formatDuration`, `getMonthData`, `calculateStreak`, etc.
4. `mockData.ts` — The mock study data provided above

---

## Acceptance Criteria

- [ ] Calendar renders a full 6×7 grid with correct prev/current/next month days
- [ ] Each cell shows the correct heat color based on study minutes
- [ ] Today is highlighted with a green border ring
- [ ] Selected day has a light green outer ring
- [ ] Days with data show a small green dot
- [ ] Streak days (consecutive days with data) show a 🔥 badge
- [ ] Clicking a day updates the detail panel with that day's sessions
- [ ] Month navigation arrows work with smooth transition
- [ ] Today button snaps to current month and selects today
- [ ] Stats row correctly computes monthly total, daily average, streak, and best day
- [ ] Streak card shows current streak, best streak, and weekly mini bar chart
- [ ] Day detail panel shows progress ring, session list, and empty state when no data
- [ ] Hovering a cell shows a tooltip with exact duration
- [ ] Layout is fully responsive: desktop two-column, mobile single-column
- [ ] On mobile, cell durations are hidden and the layout stacks vertically
- [ ] All colors, spacing, and typography match the design tokens exactly
- [ ] Does NOT include a navigation bar — uses the existing app nav

---

## Visual Reference Quick Check

Before marking complete, compare your implementation to these exact positions and proportions from the mockups:

**Desktop:**
- Stats cards are 4 in a row, equal width, gap 12px
- Month selector is full width of left column, height ~50px
- Calendar card is full width of left column, 7 equal columns, ~6 rows
- Side panel is 380px wide, fixed position
- Progress ring in day panel is 64px, left-aligned with text to its right

**Mobile:**
- Single column, padding 20px on sides
- Stats are 2 cards side by side
- Calendar is a 7-column grid with smaller cells (no duration text)
- Day detail panel stacks below with progress ring + session list
- Bottom area leaves space for existing app tab bar (do NOT render one)

---

**Start implementation. Match the mockups exactly. Do not improvise colors, spacing, or layout.**
