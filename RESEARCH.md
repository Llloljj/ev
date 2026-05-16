# Research: Energy Insights Dashboard

## 1. Objective
Create a premium, interactive dashboard for users to track their charging history, energy consumption (kWh), and cost savings (EV vs. Fuel).

## 2. Technology Selection: ApexCharts
- **Why**: 
  - Supports "Glassmorphic" styling via SVG filters.
  - Native Dark Mode support.
  - Built-in responsiveness for mobile.
  - Light footprint compared to Chart.js for vanilla environments.
- **Implementation**: Load via CDN: `https://cdn.jsdelivr.net/npm/apexcharts`.

## 3. Data Model (Proposed)
We need a new virtual view or endpoint: `GET /api/user/insights`.
The response should aggregate data from the `bookings` table:
```json
{
  "total_kwh": 450.5,
  "total_spent": 6300,
  "savings_vs_fuel": 12500,
  "history": [
    { "month": "Jan", "kwh": 45 },
    { "month": "Feb", "kwh": 52 }
  ],
  "battery_health": {
    "current_capacity": 28.5,
    "degradation": 2.3
  }
}
```

## 4. Visual Layout (Premium UI)
- **Top Row**: 3 KPI Cards (Total Energy, Money Saved, CO2 Reduction).
- **Middle Row**: Line Chart (Consumption over time).
- **Bottom Row**: Battery Health Progress Circle (Donut Chart).

## 5. Multi-Agent Handshake
- **Antigravity**: Create `public/dashboard.html` and `dashboard.js`. Handle ApexCharts initialization.
- **Claude**: Create the `/api/user/insights` endpoint in `server.js` using SQL aggregations.

---
*Status: Ready for Discussion*
