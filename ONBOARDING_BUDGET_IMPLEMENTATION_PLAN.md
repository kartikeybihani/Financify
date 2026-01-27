# Onboarding & Budget System Implementation Plan

## Overview
Replace seeded budget categories with LLM-driven budget creation and add onboarding progress tracking.

---

## 1. Remove FinnyNudge Component

**Action:**
- Remove `<FinnyNudge />` from `app/(tabs)/index.tsx` (line 757)
- Keep `NUDGE_MESSAGES` array in `FinnyNudge.tsx` (lines 13-27) for future use

**Files:**
- `app/(tabs)/index.tsx` - Remove import and component usage

---

## 2. Onboarding Progress Box & Modal

### 2.1 Database Schema

**New Table: `onboarding_progress`**
```sql
CREATE TABLE onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  accounts_connected boolean DEFAULT false,
  budget_setup boolean DEFAULT false,
  finny_asked boolean DEFAULT false,
  dismissed boolean DEFAULT false,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
```

**Progress Calculation:**
- 0% = No steps complete
- 33% = Accounts connected only
- 66% = Accounts + (Budget Setup OR Finny asked)
- 100% = All 3 steps complete

### 2.2 Component Structure

**New Component: `OnboardingProgressBox.tsx`**
- Location: `src/components/home/OnboardingProgressBox.tsx`
- Shows below FinancialCards
- Displays: "Onboarding" text + percentage (right side) + close button (X)
- Click opens modal
- Hidden if dismissed (check `dismissed` flag per session)
- Make it super premium and gradient and super nice looking inside it as well

**New Component: `OnboardingTimelineModal.tsx`**
- Location: `src/components/modals/OnboardingTimelineModal.tsx`
- 3-step timeline:
  1. ✅ Connect your accounts (auto-checked if user has `user_items`)
  2. ⏳ Set up a budget (links to BudgetSection)
  3. ⏳ Ask Finny anything (links to chat tab)

**Step 3 Detection:**
- Check `conversation_logs` table: `SELECT COUNT(*) WHERE user_id = ? AND user_message IS NOT NULL`
- If count > 0, mark as complete
- **Decision:** Use `conversation_logs` table (confirmed)

### 2.3 Integration Points

**Home Screen (`app/(tabs)/index.tsx`):**
- Add `<OnboardingProgressBox />` after `<FinancialCards />`
- Check onboarding status on mount
- Show/hide based on completion and dismissal state

**Navigation:**
- Step 2 click → Navigate to Insights tab, scroll to BudgetSection
- Step 3 click → Navigate to Chat tab (`/chat`)

---

## 3. Budget System Overhaul

### 3.1 Remove Seeded Categories

**Action:**
- Stop calling `seedDefaultCategories()` during signup
- Remove automatic category creation logic
- Keep existing categories table structure (users may have existing categories)

**Files to Update:**
- `src/utils/categories/seedDefaultCategories.ts` - Comment out or remove signup calls
- `app/(auth)/signup.tsx` - Remove seedDefaultCategories call
- `app/onboarding-connect.tsx` - Remove any category seeding

### 3.2 Empty Budget State

**Update `BudgetSection.tsx`:**
- Check if user has any `budget_periods` with `status = 'active'`
- If no active budget, show empty state:
  - Title: "Create Your Budget"
  - Two options:
    1. **"Create with Finny"** button → Opens income/savings modal
    2. **"Create Manually"** button → Opens manual budget creation flow

### 3.2.1 Manual Budget Creation Flow

**New Component: `ManualBudgetCreationModal.tsx`**
- Location: `src/components/modals/ManualBudgetCreationModal.tsx`
- Display 10-12 common categories in a horizontal scrollable row
- Each category shows:
  - Category name
  - Icon/emoji
  - **Plus (+) button** on the left side of category name
- When user clicks plus button:
  - Opens input modal/dialog for that category
  - User enters monthly budget limit
  - Saves to database (creates category if needed, creates budget_entry)
- Common categories to show:
  - Groceries 🛒
  - Food & Dining 🍔
  - Housing 🏠
  - Transportation 🚗
  - Shopping 🛍️
  - Entertainment 🎬
  - Health 💪
  - Travel ✈️
  - Personal Care 💄
  - Savings 💎
  - Utilities ⚡
  - Other 📦
- User can add multiple categories by clicking plus on each
- "Done" button to finish and close modal

### 3.3 Finny Budget Creation Flow

**New Component: `BudgetCreationModal.tsx`**
- Location: `src/components/modals/BudgetCreationModal.tsx`
- Step 1: Input form
  - Income (required, monthly)
  - Savings amount (optional, monthly)
  - "Continue" button
- Step 2: Loading state
  - "Finny is analyzing your spending..."
  - Show spinner
- Step 3: Review & Confirm
  - Display LLM-generated categories with emojis and limits
  - "Create Budget" button
  - "Edit" option (future)

**API Endpoint: `api/create_budget_with_finny.js`**
- Input: `{ userId, income, savingsAmount, transactions }`
- Fetch:
  - User profile (age, occupation, location)
  - Last 6 months transactions
  - Existing categories (if any)
- LLM Prompt:
  ```
  Analyze user's financial profile and spending patterns.
  User profile: {age, occupation, location}
  Monthly income: ${income}
  Monthly savings goal: ${savingsAmount || 'not specified'}
  Transaction history: [last 6 months]
  
  Create a personalized monthly budget with:
  - Categories relevant to user's lifestyle (student, professional, etc.)
  - Realistic limits based on spending patterns but optimistic
  - Include: Housing, Transportation, Food, Entertainment, Health, Savings, etc.
  - Use appropriate emojis for each category
  
  Return JSON:
  {
    categories: [
      {
        name: "Groceries",
        icon: "🛒",
        limit: 500
      },
      ...
    ]
  }
  ```
- Store in database:
  - Create `budget_period` (monthly, current month)
  - Create `budget_entries` for each category
  - Create `categories` if they don't exist

### 3.4 Database Cleanup

**Decision:** Keep existing users' budgets unchanged. Only new users (after this update) will get LLM-driven budgets.

**Tables to Keep:**
- `budget_entries` - Keep all existing data
- `budget_periods` - Keep all existing data
- `category_groupings` - Keep all existing data
- `category_groupings_view` - View, no changes needed

**No cleanup needed** - Existing users continue with their current budgets. New users will use the new LLM-driven system.

---

## 4. Implementation Phases

### Phase 1: Database Setup & Onboarding Tracking
**Goal:** Set up database infrastructure for onboarding progress tracking

**Tasks:**
1. Create `onboarding_progress` table migration
2. Add RLS policies for `onboarding_progress` table
3. Create helper functions to check onboarding status:
   - Check if accounts connected (`user_items` table)
   - Check if budget setup (`budget_periods` with active status)
   - Check if Finny asked (`conversation_logs` count > 0)
4. Create API endpoint or utility functions to update onboarding progress

**Files:**
- `supabase/migrations/create_onboarding_progress.sql`
- `src/utils/onboarding/onboardingProgress.ts` (new utility file)

**Deliverable:** Database ready, progress tracking functions working

---

### Phase 2: Onboarding UI Components
**Goal:** Build premium-looking onboarding progress box and timeline modal

**Tasks:**
1. Create `OnboardingProgressBox` component
   - Premium gradient design
   - Shows "Onboarding" text + percentage on right
   - Close button (X) on right side
   - Click opens modal
   - Handles dismissal (database flag)
2. Create `OnboardingTimelineModal` component
   - 3-step timeline with checkmarks
   - Step 1: Connect accounts (auto-checked if connected)
   - Step 2: Set up budget (clickable, navigates to budget)
   - Step 3: Ask Finny (clickable, navigates to chat)
   - Shows completion status for each step
3. Integrate into home screen
   - Add after `<FinancialCards />`
   - Check onboarding status on mount
   - Show/hide based on completion and dismissal

**Files:**
- `src/components/home/OnboardingProgressBox.tsx` (new)
- `src/components/modals/OnboardingTimelineModal.tsx` (new)
- `app/(tabs)/index.tsx` (modify)

**Deliverable:** Onboarding box and modal working, navigation functional

---

### Phase 3: Remove FinnyNudge & Category Seeding
**Goal:** Clean up old nudge component and stop seeding categories

**Tasks:**
1. Remove `<FinnyNudge />` from home screen
   - Remove import
   - Remove component usage
   - Keep `NUDGE_MESSAGES` array in file
2. Remove category seeding from signup flow
   - Remove `seedDefaultCategories()` call from signup
   - Remove from onboarding-connect if present
   - Keep function file for reference

**Files:**
- `app/(tabs)/index.tsx` (modify)
- `app/(auth)/signup.tsx` (modify)
- `app/onboarding-connect.tsx` (check and modify if needed)

**Deliverable:** FinnyNudge removed, category seeding stopped

---

### Phase 4: Budget Empty State & Manual Creation
**Goal:** Show empty state when no budget exists and enable manual budget creation

**Tasks:**
1. Update `BudgetSection` to detect empty state
   - Check for active `budget_periods`
   - Show empty state if none exists
2. Create empty state UI
   - Title: "Create Your Budget"
   - Two buttons:
     - "Create with Finny" (opens Finny modal - Phase 5)
     - "Create Manually" (opens manual modal)
3. Create `ManualBudgetCreationModal` component
   - Horizontal scrollable row of 10-12 common categories
   - Each category: name, icon, plus button on left
   - Click plus → input modal for budget amount
   - Save creates category (if needed) and budget_entry
   - "Done" button to finish

**Files:**
- `src/components/insights/components/BudgetSection.tsx` (modify)
- `src/components/modals/ManualBudgetCreationModal.tsx` (new)
- `src/components/modals/CategoryBudgetInputModal.tsx` (new - for individual category input)

**Deliverable:** Empty state shows, manual budget creation works

---

### Phase 5: Finny Budget Creation (LLM-Driven)
**Goal:** Implement AI-powered budget creation with Finny

**Tasks:**
1. Create `BudgetCreationModal` component
   - Step 1: Income (required) + Savings (optional) input
   - Step 2: Loading state with "Finny is analyzing..." message
   - Step 3: Review generated categories with emojis and limits
   - "Create Budget" button to save
2. Create `api/create_budget_with_finny.js` endpoint
   - Fetch user profile (age, occupation, location)
   - Fetch last 6 months transactions
   - Call LLM with comprehensive prompt
   - Parse JSON response
   - Create budget_period, categories, and budget_entries
3. Design and test LLM prompt
   - Include user profile context
   - Analyze spending patterns
   - Generate realistic but optimistic budgets
   - Return structured JSON with categories

**Files:**
- `src/components/modals/BudgetCreationModal.tsx` (new)
- `api/create_budget_with_finny.js` (new)
- `lib/budgetPrompt.js` (new - LLM prompt logic)

**Deliverable:** Finny can create personalized budgets from user data

---

### Phase 6: Testing & Polish
**Goal:** End-to-end testing and refinement

**Tasks:**
1. Test onboarding flow
   - Progress updates correctly
   - Dismissal works and shows again next session
   - Navigation works for all steps
2. Test budget creation flows
   - Empty state appears correctly
   - Manual creation works
   - Finny creation works
   - Budgets save correctly
3. Test edge cases
   - Existing users unaffected
   - New users get new flow
   - No budget data errors
4. Polish UI/UX
   - Animations
   - Loading states
   - Error handling

**Deliverable:** Fully tested, polished feature ready for production

---

## 5. Decisions Made

### ✅ Step 3 Detection
**Decision:** Use `conversation_logs` table
- Check: `SELECT COUNT(*) WHERE user_id = ? AND user_message IS NOT NULL`
- If count > 0, mark `finny_asked = true`

### ✅ Budget Cleanup Strategy
**Decision:** Keep existing users' budgets unchanged
- Only new users (after deployment) get LLM-driven budgets
- Existing users continue with their current budget setup
- No database cleanup needed

### ✅ Manual Budget Creation
**Decision:** Show 10-12 common categories in horizontal row
- Each category has plus (+) button on left side
- Click plus → input modal to set budget amount
- User can add multiple categories
- Categories: Groceries, Food & Dining, Housing, Transportation, Shopping, Entertainment, Health, Travel, Personal Care, Savings, Utilities, Other

### ✅ Onboarding Dismissal Persistence
**Decision:** Use database flag (`dismissed`)
- If dismissed but incomplete, show again on next app session
- Check `dismissed` flag on app launch
- Reset dismissal if user hasn't completed all steps

---

## 6. Testing Checklist

- [ ] Onboarding box appears for new users
- [ ] Progress updates correctly (33%, 66%, 100%)
- [ ] Dismissal works and shows again on next session
- [ ] Step 1 auto-checks if accounts connected
- [ ] Step 2 navigates to budget section
- [ ] Step 3 navigates to chat
- [ ] Step 3 detection works (conversation_logs check)
- [ ] Empty budget state shows when no budget exists
- [ ] "Create with Finny" opens modal
- [ ] Income/savings input works
- [ ] LLM generates appropriate categories
- [ ] Budget saves correctly to database
- [ ] Manual budget creation still works
- [ ] Existing users' budgets unaffected

---

## 7. Files to Create/Modify

### New Files:
- `src/components/home/OnboardingProgressBox.tsx`
- `src/components/modals/OnboardingTimelineModal.tsx`
- `src/components/modals/BudgetCreationModal.tsx`
- `src/components/modals/ManualBudgetCreationModal.tsx`
- `src/components/modals/CategoryBudgetInputModal.tsx`
- `api/create_budget_with_finny.js`
- `lib/budgetPrompt.js`
- `src/utils/onboarding/onboardingProgress.ts`
- `supabase/migrations/create_onboarding_progress.sql`

### Modified Files:
- `app/(tabs)/index.tsx` - Remove FinnyNudge, add OnboardingProgressBox
- `src/components/insights/components/BudgetSection.tsx` - Add empty state
- `src/utils/categories/seedDefaultCategories.ts` - Remove/comment signup calls
- `app/(auth)/signup.tsx` - Remove seedDefaultCategories call

---

## Notes

- Keep `NUDGE_MESSAGES` array for potential future use
- Don't break existing users' budgets (confirmed: keep existing data)
- Make Finny budget creation feel magical but simple
- Ensure LLM prompt is well-tested for various user profiles
- Consider rate limiting for budget creation API
- Onboarding box should be premium-looking with gradients
- Manual budget: 10-12 categories in horizontal scrollable row
- Each category has plus button on left side for budget input

---

## Implementation Order

**Start with Phase 1** → Database setup and tracking functions
**Then Phase 2** → Onboarding UI components
**Then Phase 3** → Remove old components
**Then Phase 4** → Budget empty state and manual creation
**Then Phase 5** → Finny LLM budget creation
**Finally Phase 6** → Testing and polish

Each phase builds on the previous one. We can start implementing Phase 1 now.
