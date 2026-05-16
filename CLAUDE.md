# EV PATH Collaboration Guide

## Project Context
This is a premium EV Charging Station platform. Antigravity (AI Assistant) and Claude Code are collaborating on this project.

## Current Progress
- **Antigravity**: Added a "Live Pulse" widget to the Hero section (index.html, style.css, app.js).
- **Status**: The widget is functional but needs a code quality and performance review.

## GSD Parallel Execution Phase 2
### 🟢 Antigravity is executing:
- **Plan 2.1**: Energy Insights Dashboard (UI & Animation)
- **Files**: `dashboard.html`, `dashboard.js`, `style.css`

### 🔵 Claude Code is assigned to:
- **Plan 2.2**: Insights API & Aggregations
- **Files**: `server.js`
- **Action**: Open `.gsd/phases/1/04-insights-api.md` and implement the `/api/user/insights` endpoint.

## Coordination Notes
- Antigravity will handle the UI and animations.
- Claude Code will handle the Backend API and Data Aggregations.
- **Shared Memory**: Use `chatlog.md` for all inter-agent handoffs.
- **GSD Plans**: Follow files in `.gsd/phases/1/`.
- If you need to update `app.js` for favorites sync, coordinate with the `toggleFavorite` function.

## Coding Rules
- Maintain the premium, dark-mode aesthetic.
- Use Lucide icons for any new UI elements.
- Keep the vanilla JS structure clean.
