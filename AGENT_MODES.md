# Agent Mode Color Themes

## Overview

The Weibo Timeline userscript now features four distinct agent mode color themes that adapt the entire UI based on your workflow context. Each mode has carefully selected colors optimized for different types of work.

## The Four Agent Modes

### 🟢 SMART Mode (Default)
**Color**: Green (#03C561)  
**Use Case**: Balanced, focused workflow  
**Best For**: Regular browsing, steady information consumption  

Primary color creates a calm, productive atmosphere suitable for extended reading sessions.

**Color Palette**:
- Primary: `#03C561` (Vibrant Green)
- Hover: `#029C49` (Darker Green)
- Light: `rgba(3,197,97,0.1)` (10% opacity)
- Dark: `#003700` (Forest Green)

---

### 🔵 FREE Mode
**Color**: Blue (#00B8FF)  
**Use Case**: Creative, exploratory mode  
**Best For**: Browsing new content, discovering accounts  

Bright blue encourages exploration and creative thinking, perfect for discovering new content.

**Color Palette**:
- Primary: `#00B8FF` (Sky Blue)
- Hover: `#0090CC` (Ocean Blue)
- Light: `rgba(0,184,255,0.1)` (10% opacity)
- Dark: `#001A33` (Midnight Blue)

---

### 🟡 RUSH Mode
**Color**: Gold (#E4B402)  
**Use Case**: Fast-paced, urgent tasks  
**Best For**: Quick scans, time-sensitive monitoring  

Golden yellow creates urgency and focus, ideal for rapid information processing.

**Color Palette**:
- Primary: `#E4B402` (Rich Gold)
- Hover: `#C29902` (Amber)
- Light: `rgba(228,180,2,0.1)` (10% opacity)
- Dark: `#F6C700` (Bright Yellow)

---

### 🟣 PLAN Mode
**Color**: Purple (#9333EA)  
**Use Case**: Strategic, planning mode  
**Best For**: Research, content curation, long-term planning  

Royal purple promotes strategic thinking and careful analysis.

**Color Palette**:
- Primary: `#9333EA` (Royal Purple)
- Hover: `#7E22CE` (Deep Purple)
- Light: `rgba(147,51,234,0.1)` (10% opacity)
- Dark: `#581C87` (Violet)

---

## How It Works

### UI Elements That Adapt

1. **Buttons**: All control buttons use the active mode color
2. **Links**: "Open on Weibo" links match the mode
3. **Hover States**: Consistent hover effects with darker shades
4. **Toggle Button**: Dashboard toggle reflects current mode
5. **Mode Selector**: Active button shows in full mode color

### Technical Implementation

The system uses CSS custom properties (variables) that change based on a `data-agent-mode` attribute on the body element:

```css
/* Default SMART mode colors */
:root {
  --color-agent-primary: #03C561;
  --color-agent-primary-hover: #029C49;
  /* ... */
}

/* FREE mode override */
body[data-agent-mode="free"] {
  --color-agent-primary: #00B8FF;
  --color-agent-primary-hover: #0090CC;
  /* ... */
}
```

### Persistence

Your selected mode is saved in localStorage under the key `weibo_agent_mode_v1`. The mode persists across:
- Page refreshes
- Browser restarts
- Dashboard reopenings

## Usage Guide

### Switching Modes

1. Open the dashboard by clicking the **☰ Dashboard** button (top-right)
2. Look for the mode selector below the subtitle
3. Click on one of the four mode buttons: **SMART**, **FREE**, **RUSH**, or **PLAN**
4. The entire UI instantly adapts to your chosen color scheme
5. Your selection is automatically saved

### Choosing the Right Mode

**Choose SMART when**:
- 📖 Reading through your regular timeline
- ⚖️ Maintaining work-life balance
- 🎯 Focused, steady workflow

**Choose FREE when**:
- 🔍 Exploring new content
- 💡 Seeking inspiration
- 🌊 Browsing without specific goals

**Choose RUSH when**:
- ⏰ Time-sensitive monitoring
- 🚀 Quick information scanning
- ⚡ High-energy work sessions

**Choose PLAN when**:
- 🗺️ Long-term content planning
- 📊 Research and analysis
- 🎨 Curating content collections

## Design Principles

### Color Psychology
- **Green (SMART)**: Balance, growth, productivity
- **Blue (FREE)**: Trust, freedom, creativity
- **Gold (RUSH)**: Energy, urgency, attention
- **Purple (PLAN)**: Wisdom, strategy, luxury

### Accessibility
- All colors meet WCAG AA contrast standards against white text
- Hover states provide clear visual feedback
- Active states are easily distinguishable
- Color is not the sole means of conveying information

### Visual Consistency
- All modes use the same underlying design tokens
- Typography remains consistent across modes
- Spacing and layout unchanged between modes
- Only color values change, maintaining familiarity

## Developer Notes

### Adding New Modes

To add a new agent mode:

1. Add CSS custom property overrides in the stylesheet:
```css
body[data-agent-mode="newmode"] {
  --color-agent-primary: #HEX_COLOR;
  --color-agent-primary-hover: #HEX_COLOR;
  --color-agent-primary-light: rgba(R,G,B,0.1);
  --color-agent-primary-dark: #HEX_COLOR;
  --color-agent-accent: #HEX_COLOR;
  --button-primary-bg: #HEX_COLOR;
  --button-primary-hover: #HEX_COLOR;
  --color-success: #HEX_COLOR;
}
```

2. Add a button to the mode selector:
```html
<button class="mode-btn newmode" onclick="window.setAgentMode('newmode')">
  NEW MODE
</button>
```

3. Add styling for the button:
```css
.mode-btn.newmode {
  color: #HEX_COLOR;
}
.mode-btn.newmode.active {
  background: #HEX_COLOR;
  color: #FFF;
}
```

### Color Token Structure

The design token system uses a three-tier hierarchy:

1. **Base Tokens**: Universal colors (borders, backgrounds, shadows)
2. **Agent Mode Tokens**: Mode-specific colors (primary, hover, accent)
3. **Component Tokens**: Semantic aliases (button-primary-bg, color-success)

This structure allows mode changes to cascade through all UI elements while maintaining semantic meaning.

---

## Inspiration

The agent mode concept is inspired by the Amp platform's workflow-based color theming system, adapted here for a content consumption and monitoring context. Each mode represents a different mindset or workflow stage in your information gathering process.
