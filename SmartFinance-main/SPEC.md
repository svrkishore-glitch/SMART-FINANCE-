# SmartFinance - Specification Document

## 1. Project Overview

**Project Name:** SmartFinance
**Project Type:** Full-stack Web Application (SQL-first Personal Finance Tracker)
**Core Functionality:** A personal finance tracker for Indian college students and young professionals to track expenses, income, and budgets with all data operations handled in SQL.
**Target Users:** Indian college students (₹5k–₹15k/month), first-job professionals (₹20k–₹50k/month), freelancers, hostel residents.

---

## 2. DBMS Syllabus Coverage

This project intentionally showcases all 10 DBMS modules:

| Module | Concept | Implementation |
|--------|---------|----------------|
| I | Database Fundamentals | SQLite database with normalized schema |
| I | ER Model | ER diagrams in docs, entity definitions |
| II | SQL Basics (DDL/DML) | CREATE, INSERT, UPDATE, DELETE, SELECT |
| III | Operators | WHERE with AND/OR/LIKE/BETWEEN/IN |
| IV | Filtering, Sorting, Pagination | ORDER BY, LIMIT, OFFSET |
| V | Aggregations & Grouping | SUM, COUNT, AVG with GROUP BY, HAVING |
| VI | Expressions & Functions | CASE, strftime, CAST, arithmetic |
| VII | Case Clause & Set Operations | CASE statements, UNION |
| VIII | ER Model Relationships | One-to-many (user→transactions), many-to-many (categories↔tags) |
| IX | Joins | INNER JOIN, LEFT JOIN, Self JOIN |
| X | Views, Subqueries, Indexes | monthly_summary view, subqueries, INDEX on date/category |

---

## 3. Technical Architecture

### Technology Stack
- **Frontend:** Plain HTML/CSS + Vanilla JavaScript + Chart.js
- **Backend:** Node.js + Express
- **Database:** SQLite (file-based, easy to reset)

### Database Schema (3NF Normalized)

**Tables:**
1. `users` — id, name, email, created_at
2. `categories` — id, name, type (income/expense), icon, color
3. `transactions` — id, user_id, category_id, amount, description, date, created_at
4. `budgets` — id, user_id, category_id, amount, month, created_at
5. `recurring_transactions` — id, user_id, category_id, amount, description, frequency, next_due_date

**Views:**
- `monthly_summary` — month-wise income, expense, savings
- `budget_health` — budget vs actual spending per category
- `top_categories` — top spending categories per month

**Indexes:**
- idx_transactions_date ON transactions(date)
- idx_transactions_category ON transactions(category_id)
- idx_transactions_user ON transactions(user_id)

---

## 4. UI/UX Specification

### Layout Structure
- **Header:** Logo (SmartFinance), navigation tabs, current month display
- **Main Content:** Tab-based navigation (Dashboard, Transactions, Budgets, Analytics)
- **Modal:** Add/Edit transaction form

### Visual Design

**Color Palette:**
- Background: `#0D1117` (dark charcoal)
- Card Background: `#161B22` (slightly lighter)
- Primary Accent: `#58A6FF` (bright blue)
- Success/Income: `#3FB950` (green)
- Danger/Expense: `#F85149` (red)
- Text Primary: `#E6EDF3` (off-white)
- Text Secondary: `#8B949E` (muted gray)
- Border: `#30363D`

**Typography:**
- Font Family: 'DM Sans', sans-serif (headings), 'IBM Plex Mono', monospace (numbers)
- Headings: 24px (h1), 18px (h2), 14px (h3)
- Body: 14px
- Numbers/Amounts: 16px (bold)

**Spacing:**
- Card padding: 20px
- Gap between cards: 16px
- Border radius: 12px

**Visual Effects:**
- Subtle box-shadow on cards: `0 4px 12px rgba(0,0,0,0.3)`
- Hover transitions: 0.2s ease
- Chart animations on load

### Components

1. **Summary Cards** — Income, Expense, Savings with trend indicators
2. **Transaction List** — Date-grouped list with category icons, amounts, swipe actions
3. **Category Pills** — Colored badges with icons for categories
4. **Budget Progress Bars** — Green (>80%) / Yellow (50-80%) / Red (<50%)
5. **Charts:**
   - Doughnut chart for category breakdown
   - Line chart for 6-month trend
6. **Form Inputs** — Dark themed with blue focus border
7. **Buttons** — Primary (blue), Danger (red), Ghost (transparent)

---

## 5. API Endpoints

### Transactions
- `GET /api/transactions?month=YYYY-MM` — List transactions with pagination
- `POST /api/transactions` — Add new transaction
- `PUT /api/transactions/:id` — Update transaction
- `DELETE /api/transactions/:id` — Delete transaction

### Dashboard
- `GET /api/summary?month=YYYY-MM` — Income, expense, savings
- `GET /api/categories` — List all categories

### Budgets
- `GET /api/budgets?month=YYYY-MM` — Get budgets with spending
- `POST /api/budgets` — Create/update budget
- `GET /api/budget-health?month=YYYY-MM` — Budget vs actual

### Analytics
- `GET /api/trend?months=6` — 6-month trend data
- `GET /api/category-breakdown?month=YYYY-MM` — Category pie data

---

## 6. Functionality Specification

### Core Features (P0 - MVP)

1. **Add Transaction** — Amount, category, description, date (default today)
2. **Edit Transaction** — Modify any field
3. **Delete Transaction** — Remove with confirmation
4. **Dashboard Summary** — Total income, expense, savings for current month
5. **Category Breakdown** — Doughnut chart showing expense distribution
6. **6-Month Trend** — Line chart showing income/expense over time

### India-First Categories (Default)
- UPI Payment
- Mess / Food
- Tea / Snacks
- Transport (Auto/Bus)
- Mobile Recharge
- Entertainment
- Shopping
- Fees / Subscription
- Rent
- Other

### User Interactions
- Click "Add" button → Opens modal form
- Click transaction → Opens edit modal
- Swipe left on mobile → Delete button appears
- Click category filter → Shows only that category
- Click month → Opens month picker

---

## 7. Acceptance Criteria

1. ✅ Can add, edit, delete transactions
2. ✅ Dashboard shows correct income/expense/savings
3. ✅ Category breakdown chart renders correctly
4. ✅ 6-month trend chart renders correctly
5. ✅ All SQL operations work (CRUD on all tables)
6. ✅ Views return correct aggregated data
7. ✅ Pagination works on transaction list
8. ✅ Search/filter by category works
9. ✅ Date filtering works
10. ✅ Responsive on mobile and desktop

---

## 8. File Structure

```
SmartFinance/
├── server.js              # Express backend
├── database.js            # SQLite setup + queries
├── public/
│   ├── index.html         # Main HTML
│   ├── styles.css        # All styles
│   ├── app.js            # Frontend logic
│   └── charts.js         # Chart.js config
├── schema.sql            # Database schema
├── seed.sql              # Sample data
└── package.json          # Dependencies
```