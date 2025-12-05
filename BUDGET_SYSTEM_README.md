# Budget System Implementation

This document describes the budget system implementation for Financify.

## Overview

The budget system allows users to:
- Set monthly budgets for categories
- Set an overall monthly budget limit
- Track spending against budgets
- View budget progress and remaining amounts
- See subcategory breakdowns for combined categories (e.g., Food → Groceries, Dining Out, Restaurants)
- Auto-suggest budgets based on historical spending patterns

## Database Schema

### Tables

1. **budget_periods**: One row per user per month
   - Stores the overall budget period information
   - Includes optional `total_limit` for overall monthly cap
   - Supports status: `draft`, `active`, `archived`

2. **budget_entries**: One row per budget line
   - Can be `overall`, `category`, or `group` scope
   - Links to `categories` table for category budgets
   - Stores `limit_amount` for each budget line

### Setup

1. Run the SQL migration in Supabase:
   ```bash
   # Copy the contents of supabase/migrations/create_budget_tables.sql
   # and run it in the Supabase SQL Editor
   ```

2. The migration will:
   - Create both tables with proper constraints
   - Set up indexes for performance
   - Enable Row Level Security (RLS)
   - Create RLS policies for user data isolation
   - Set up triggers for automatic `updated_at` timestamps

## Architecture

### Backend Services (`src/services/budgets.ts`)

Key functions:
- `getOrCreateCurrentBudgetPeriod()`: Gets or creates current month's budget
- `getBudgetEntriesForPeriod()`: Fetches all entries for a period
- `normalizeCategoryName()`: Combines related categories (Food, Groceries, Dining Out → Food)
- `suggestInitialBudgetEntries()`: Suggests budgets based on past spending (12-month lookback)
- `initializeBudgetForNewUserOrMonth()`: Auto-creates budget with suggestions (supports force re-initialization)
- `upsertBudgetEntry()`: Create or update a budget entry
- `getActualsForBudgetPeriod()`: Computes actual spending from transactions with subcategory tracking
- `getBudgetSummary()`: Complete budget data with actuals and subcategories

### Frontend Hook (`src/hooks/useBudget.ts`)

The `useBudget` hook provides:
- `budgetData`: Array of category budgets formatted for UI
- `totalBudget`: Total monthly budget (from `total_limit` or sum of entries)
- `totalSpent`: Actual spending from transactions
- `totalRemaining`: Remaining budget
- Actions: `updateCategoryBudget()`, `updateTotalLimit()`, `initializeBudget()`

### Components

- **SpendingSection**: Main container that toggles between spending and budget views
  - Includes reload button to force re-initialize budgets
  - Smooth animations when switching between views
- **BudgetView**: Displays budget overview with progress bars and category breakdown
  - Shows main categories with expandable subcategories
  - Dropdown arrow (filled triangle) to collapse/expand subcategories
  - Subcategories match main category style but smaller
  - Uses real budget data when available, falls back to inferred budgets

## Usage Flow

### First Time User

1. User opens Budget view
2. System detects no budget exists for current month
3. `initializeBudgetForNewUserOrMonth()` is called automatically
4. System:
   - Creates a `budget_periods` row (status: `draft`)
   - Analyzes last 12 months of transactions
   - Normalizes categories (combines related ones)
   - Tracks subcategories for combined categories
   - Creates suggested `budget_entries` (1.1x average monthly spend)
   - User can accept, modify, or start from scratch

### Existing User

1. User opens Budget view
2. System loads current month's budget from database
3. Displays budget with actual spending computed from transactions
4. User can edit budgets or set overall limit

### Budget Updates

- When user edits a category budget: `updateCategoryBudget()` is called
- When user sets overall limit: `updateTotalLimit()` is called
- Changes are persisted to Supabase immediately
- UI refreshes to show updated data

### Force Re-initialization

- User can click the reload button (refresh icon) in Budget view
- This calls `initializeBudget(true)` with `forceReinitialize=true`
- System:
  - Deletes all existing budget entries for current period
  - Recalculates suggestions from scratch using latest transaction data
  - Creates new budget entries with updated suggestions
  - Useful when transaction categorization changes or to get fresh suggestions

## Data Flow

```
User Action
  ↓
useBudget Hook
  ↓
budgets.ts Service
  ↓
Supabase (budget_periods, budget_entries)
  ↓
Compute Actuals (from transactions table)
  - Normalize categories
  - Track subcategories
  - Use historical data for subcategory structure
  ↓
Return BudgetSummary (with subcategories)
  ↓
Transform to BudgetData[] (with subcategories)
  ↓
BudgetView Component
  - Display main categories
  - Show expandable subcategories
  - Render progress bars and amounts
```

## Key Features

1. **Auto-suggestion**: New budgets are suggested based on past spending (12-month lookback)
2. **Category Normalization**: Automatically combines related categories:
   - Food: "Food", "Groceries", "Dining Out", "Restaurants", "Food & Dining"
   - Health: "Health", "Health & Fitness", "Medical"
3. **Subcategory Tracking**: Tracks and displays original categories that were combined
4. **Historical Data Integration**: Uses 12 months of historical data to determine subcategory structure
5. **Flexible totals**: Supports both overall limit and per-category budgets
6. **Real-time actuals**: Spending is computed from transactions on-the-fly
7. **Category matching**: Budgets link to categories via `category_id` FK
8. **RLS Security**: All data is isolated per user via Supabase RLS
9. **Force Re-initialization**: Can recalculate budgets by deleting old entries and regenerating suggestions

## Future Enhancements

- Support for weekly/custom periods (currently monthly only)
- Budget rollover modes (carry remaining/overspend to next month)
- Budget groups (combine multiple categories)
- Budget templates
- Budget history and trends

## Category Normalization

The system automatically combines related categories for better budget tracking:

### Food Category
Combines: "Food", "Groceries", "Dining Out", "Restaurants", "Food & Dining" → "Food"

### Health Category
Combines: "Health", "Health & Fitness", "Medical" → "Health"

### Category Selection Priority
1. `new_category` (user's manual override) - if set and not "INTERNAL_TRANSFER"
2. `top_category` (Plaid's categorization) - if `new_category` is null
3. "Other" - fallback

Normalization is case-insensitive and happens after category selection.

## Subcategory Display

When categories are combined, the UI shows:
- Main category with total budget and spending
- Small filled triangle dropdown arrow on the left (only if subcategories exist)
- Expandable subcategories showing individual breakdowns
- Each subcategory displays:
  - Icon (smaller than main category)
  - Name
  - Spent amount / Budget amount
  - Progress bar (thinner than main category)
  - Remaining/over budget text
- Subcategories are always visible by default (can be collapsed via dropdown arrow)
- Historical data (12 months) is used to determine which subcategories exist, even if they have $0 in current period
- Subcategories are styled identically to main category but with smaller sizes and more subtle colors

## Budget Calculation Logic

### Auto-Suggestion Algorithm
1. **Lookback Period**: 12 months from today (not from period start)
2. **Transaction Filtering**:
   - Only expenses (amount > 0)
   - Excludes INTERNAL_TRANSFER transactions
   - Uses `new_category` if available, otherwise `top_category`
3. **Category Normalization**: Applies normalization to combine related categories
4. **Month Calculation**: Counts unique months with transactions per category (not assumed 6 months)
5. **Average Calculation**: `total_spending / actual_months_with_data`
6. **Suggestion**: `average_monthly_spend * 1.1` (10% buffer)
7. **Subcategory Tracking**: Tracks original category names for display

### Actual Spending Calculation
- Computes spending from `transactions` table for the current budget period
- Tracks both normalized categories and original subcategories
- Uses historical data to initialize subcategory structure for Food/Health categories
- Ensures all subcategories are shown even if they have $0 in current period

## Logging

All budget-related operations are logged with `[BUDGET]` prefix for easy filtering:
- Budget initialization and re-initialization
- Transaction fetching and aggregation
- Category normalization and subcategory tracking
- Budget suggestions calculation
- Housing category has detailed debug logging with all transactions

Logs appear in:
- Metro bundler console (React Native development)
- Backend logger (if using server-side logging)

## UI/UX Features

- **Clean, minimal design**: Line-based layout without heavy boxes
- **Single scroll view**: No nested scroll views
- **Expandable subcategories**: Small filled triangle arrow toggles visibility
- **Consistent styling**: Subcategories match main category style but smaller
- **No modal on click**: Category cards don't open modals (removed for cleaner UX)
- **Reload button**: Force re-calculate budgets with fresh data
- **Always expanded by default**: Subcategories visible immediately

## Notes

- Budgets are created per calendar month
- Actual spending is computed from `transactions` table (excludes INTERNAL_TRANSFER)
- Category matching uses `category_id` when available, falls back to category name matching
- Budget entries with `scope_type='category'` link to `categories` table
- Budget entries with `scope_type='group'` use `group_key` for custom groupings
- All budget-related logs are prefixed with `[BUDGET]` for easy filtering
- Force re-initialization deletes existing entries and recalculates from scratch
- Category normalization happens automatically and is case-insensitive
- Subcategories are tracked separately from normalized categories for display purposes


