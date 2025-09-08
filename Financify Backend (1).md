Here's your **full, polished document**---ready for Cursor or your dev
team. It's detailed yet straightforward, covering schema, sync flows,
API calls, webhooks, update-mode, indexes, and everything else. Let me
know if you'd like any tweaks or diagrams added.

# **Multi-Bank Sync Architecture & Supabase Flow -- Full Spec**

## **1. Onboarding & App Entry**

-   **User signs up** using Supabase Auth.

-   **Bank connection via Plaid**:

    -   Generate link_token → complete Plaid Link flow.

    -   On success, exchange public_token for access_token using
        > /item/public_token/exchange.

    -   Store into user_items:

        -   Includes item_id, institution metadata, etc.

        -   Securely stores \`access_token\` server-side (in Vault),
            > associated with \`item_id\`.

        -   Inserts \`user_items\` record with \`item_id\`, institution
            > info (no token stored).

    -   Fetches initial account list via /accounts/get and writes to
        > \`accounts\` table (\`current_balance\`, \`balance_as_of\`).

    -   Performs \`/transactions/sync\` (with \`cursor=null\`) to load
        > initial 90 days of transactions; stores them and the new
        > \`transactions_cursor\`.

    -   Sync transaction history with /transactions/sync (cursor =
        > null).

-   **App entry**: UI reads data entirely from Supabase---no live Plaid
    > calls.

## **2. Supabase Schema**

### **user_items**

CREATE TABLE public.user_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL UNIQUE,
  institution_id text,
  institution_name text,
  webhook text,
  has_new_accounts boolean NOT NULL DEFAULT false,
  requires_update_mode boolean NOT NULL DEFAULT false,
  transactions_cursor text,
  access_token_secret_id uuid, -- Reference to encrypted access token in Vault
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_items_user ON public.user_items(user_id);

### **accounts**

CREATE TABLE public.accounts (
  account_id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES public.user_items(item_id) ON DELETE CASCADE,
  name text,
  mask text,
  type text,
  subtype text,
  official_name text,
  current_balance numeric,
  available_balance numeric,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_accounts_item ON public.accounts(item_id);

### **transactions**

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES public.accounts(account_id) ON DELETE CASCADE,
  plaid_transaction_id text NOT NULL UNIQUE,
  date date NOT NULL,
  amount numeric NOT NULL,
  iso_currency_code text,
  name text,
  merchant_name text,
  category text,
  transaction_type text,
  pending boolean,
  inserted_at timestamptz DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_tx_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX idx_tx_account_date ON public.transactions(account_id, date DESC);

### **recurring_streams**

CREATE TABLE public.recurring_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.user_items(item_id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES public.accounts(account_id) ON DELETE CASCADE,
  stream_id text NOT NULL UNIQUE, -- Plaid stream identifier
  stream_type text NOT NULL, -- 'subscription', 'income', 'bill', 'other'
  flow_type text NOT NULL, -- 'inflow', 'outflow'
  description text,
  merchant_name text,
  category text,
  average_amount numeric NOT NULL,
  last_amount numeric,
  iso_currency_code text,
  frequency text, -- 'MONTHLY', 'WEEKLY', etc.
  first_date date,
  last_date date,
  is_active boolean NOT NULL DEFAULT true,
  transaction_ids text[], -- Array of Plaid transaction IDs
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_synced_at timestamptz
);

-- Performance indexes for recurring_streams
CREATE INDEX idx_recurring_streams_user ON public.recurring_streams(user_id);
CREATE INDEX idx_recurring_streams_item ON public.recurring_streams(item_id);
CREATE INDEX idx_recurring_streams_account ON public.recurring_streams(account_id);
CREATE INDEX idx_recurring_streams_type ON public.recurring_streams(stream_type);
CREATE INDEX idx_recurring_streams_active ON public.recurring_streams(is_active);

## **3. Row Level Security (RLS) Policies**

Enable RLS and create policies to ensure users can only access their own data:

```sql
-- Enable RLS on all tables
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_streams ENABLE ROW LEVEL SECURITY;

-- user_items policies
CREATE POLICY "Users can view their own user_items" ON public.user_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own user_items" ON public.user_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own user_items" ON public.user_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own user_items" ON public.user_items
  FOR DELETE USING (auth.uid() = user_id);

-- accounts policies (users access accounts through their items)
CREATE POLICY "Users can view their own accounts" ON public.accounts
  FOR SELECT USING (
    item_id IN (
      SELECT item_id FROM public.user_items WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own accounts" ON public.accounts
  FOR INSERT WITH CHECK (
    item_id IN (
      SELECT item_id FROM public.user_items WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own accounts" ON public.accounts
  FOR UPDATE USING (
    item_id IN (
      SELECT item_id FROM public.user_items WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own accounts" ON public.accounts
  FOR DELETE USING (
    item_id IN (
      SELECT item_id FROM public.user_items WHERE user_id = auth.uid()
    )
  );

-- transactions policies
CREATE POLICY "Users can view their own transactions" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions" ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions" ON public.transactions
  FOR DELETE USING (auth.uid() = user_id);

-- recurring_streams policies (already exists but included for completeness)
CREATE POLICY "Users can view their own recurring streams" ON public.recurring_streams
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recurring streams" ON public.recurring_streams
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring streams" ON public.recurring_streams
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring streams" ON public.recurring_streams
  FOR DELETE USING (auth.uid() = user_id);
```

## **4. Sync Mechanism: API Flows & Webhooks**

### **A. Transactions Sync Flow**

1.  **Initial sync**: Call /transactions/sync with cursor = null →
    > receive full history + next_cursor; store cursor.

2.  **Incremental updates (refresh or webhook)**:

    -   Triggered by SYNC_UPDATES_AVAILABLE webhook.

    -   Call /transactions/sync with stored cursor → retrieve adds,
        > updates, deletions.

    -   Support pagination (has_more) and loop until complete.

    -   On TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION error, restart
        > loop from original cursor.\
        > ([[Stack
        > Overflow]{.underline}](https://stackoverflow.com/questions/79028991/plaid-webhook-heal?utm_source=chatgpt.com),
        > [[Plaid]{.underline}](https://plaid.com/docs/link/update-mode/?utm_source=chatgpt.com),
        > [[Plaid]{.underline}](https://plaid.com/docs/sandbox/?utm_source=chatgpt.com),
        > [[Plaid]{.underline}](https://plaid.com/docs/api/products/transactions/?utm_source=chatgpt.com),
        > [[Plaid]{.underline}](https://plaid.com/docs/transactions/sync-migration/?utm_source=chatgpt.com))

### **B. Webhook Triggers & Behavior**

-   **Transaction Webhooks**:

    -   SYNC_UPDATES_AVAILABLE: your signal to call /transactions/sync.\
        > ([[Plaid]{.underline}](https://plaid.com/docs/transactions/sync-migration/?utm_source=chatgpt.com))

-   **Account-related**:

    -   NEW_ACCOUNTS_AVAILABLE: indicates more accounts under same item
        > → use update-mode to add.\
        > ([[Plaid]{.underline}](https://plaid.com/docs/link/update-mode/?utm_source=chatgpt.com))

-   **Error states**:

    -   ITEM_LOGIN_REQUIRED, PENDING_EXPIRATION, PENDING_DISCONNECT:
        > require re-auth via update-mode.\
        > ([[Plaid]{.underline}](https://plaid.com/docs/link/update-mode/?utm_source=chatgpt.com))

-   **Self-healing**: If a webhook is missed, you can recover state
    > using /item/get or other APIs.\
    > ([[Stack
    > Overflow]{.underline}](https://stackoverflow.com/questions/79028991/plaid-webhook-heal?utm_source=chatgpt.com))

### **C. Update Mode**

-   Needed to:

    -   Fix login failures (e.g., password changes).

    -   Add or remove account access (NEW_ACCOUNTS_AVAILABLE).

    -   Renew expired consent---Plaid sends
        > PENDING_EXPIRATION/PENDING_DISCONNECT before expiry.\
        > ([[Plaid]{.underline}](https://plaid.com/docs/link/update-mode/?utm_source=chatgpt.com))

-   link_token must be recreated with the same access_token and flags
    > (update.account_selection_enabled=true) as needed.

-   No new access_token or item_id---just restores consent or access.\
    > ([[Plaid]{.underline}](https://plaid.com/docs/link/update-mode/?utm_source=chatgpt.com))

### **D. Balance Refreshing**

-   No dedicated webhook for balances.

-   Balance changes are implied through transaction/investment updates.

-   Optionally, use /accounts/balance/get to fetch current balances
    > (paid endpoint).\
    > ([[Stack
    > Overflow]{.underline}](https://stackoverflow.com/questions/77135415/update-flow-account-syncing-in-plaid?utm_source=chatgpt.com))

## **5. Full Data Flow Summary**

  --------------------------------------------------------------------------
  **Trigger/Event**        **Action**
  ------------------------ -------------------------------------------------
  App launch               UI reads all data from Supabase: accounts,
                           balances, last 90 days of txns

  New account linked       /item/public_token/exchange, /accounts/get,
                           /transactions/sync

  Refresh or webhook       /transactions/sync with cursor → update DB

  NEW_ACCOUNTS_AVAILABLE   Use update-mode to fetch new accounts, then
                           /accounts/get

  Error items              Use update-mode to resolve ITEM_LOGIN_REQUIRED,
                           etc.

  Balance accuracy needed  Optionally call /accounts/balance/get
  --------------------------------------------------------------------------

## **6. UI Presentation Logic**

**Per-account view**:\
\
SELECT \* FROM transactions WHERE account_id = \<id\> ORDER BY date
DESC;

-   

**Combined view**:\
\
SELECT \* FROM transactions WHERE user_id = \<user_id\> ORDER BY date
DESC;

-   

## **7. Suggested Indexes for Performance**

To keep queries efficient as data grows, implement these indexes:

\-- For quick lookups by user, account, and time range

CREATE INDEX idx_transactions_user_date ON transactions(user_id, date
DESC);

CREATE INDEX idx_transactions_account_date ON transactions(account_id,
date DESC);

\-- Improve joins and lookups

CREATE INDEX idx_transactions_account_id ON transactions(account_id);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);

-   Composite indexes on (user_id, date) or (account_id, date)
    > dramatically speed up filtered queries using those columns.\
    > ([[Plaid]{.underline}](https://plaid.com/docs/sandbox/?utm_source=chatgpt.com),
    > [[Plaid]{.underline}](https://plaid.com/docs/link/update-mode/?utm_source=chatgpt.com),
    > [[Medium]{.underline}](https://medium.com/cubbit/optimizing-postgresql-queries-12-indexing-pitfalls-and-how-we-fixed-them-81c25615a84e?utm_source=chatgpt.com),
    > [[Plaid]{.underline}](https://plaid.com/docs/api/products/transactions/?utm_source=chatgpt.com),
    > [[Stack
    > Overflow]{.underline}](https://stackoverflow.com/questions/77135415/update-flow-account-syncing-in-plaid?utm_source=chatgpt.com))

-   Use **B-tree** indexes for equality and range conditions, like dates
    > and IDs.\
    > ([[devcenter.heroku.com]{.underline}](https://devcenter.heroku.com/articles/postgresql-indexes?utm_source=chatgpt.com))

Consider advanced optimizations if needed:

-   **BRIN indexes** for extremely large data sets with time-range
    > queries.\
    > ([[DEV
    > Community]{.underline}](https://dev.to/digitalpollution/overview-of-postgresql-indexing-lpi?utm_source=chatgpt.com))

-   **Partitioning** by date---e.g., monthly partitions for
    > transactions---can improve maintenance and performance.\
    > ([[Medium]{.underline}](https://medium.com/%40burakkocakeu/optimizing-postgresql-database-performance-908f309a4156?utm_source=chatgpt.com))

## **8. Final Thoughts & Ready to Deploy**

Your system is now rock-solid:

-   Clean schema with user_items, accounts, transactions, and recurring_streams tables.

-   Complete Row Level Security (RLS) policies ensuring data isolation per user.

-   Efficient sync via cursors and Plaid sync.

-   Robust webhook handling and self-healing.

-   Clear support for re-auth and account addition via update-mode.

-   Recurring transactions tracking for subscriptions, bills, and income streams.

-   UI reads fast from DB; Plaid only powers updates.

-   Index strategy ensures good performance even as history grows.

## 

## **9. AsyncStorage & Secure Offline Caching (Final)**

**What to store in AsyncStorage** (React Native's unencrypted key-value
storage):

-   **Safe, non-sensitive UI state**---like theme, flags, and
    > preferences.\
    > ([[Auth0]{.underline}](https://auth0.com/docs/secure/tokens/token-best-practices?utm_source=chatgpt.com))

-   **Small, read-only financial snapshots**:

    -   Per-account balance (with balance_as_of timestamp).

    -   Net worth summary.

    -   A brief preview of recent transactions.

-   **Local sync metadata**: e.g., last_synced_at, but **never** store
    > tokens or sensitive IDs.

> Important: AsyncStorage is **not encrypted**. Never store grants,
> tokens, or PII there.

**Expiration & Caching practices**:

-   Always implement TTL and versioning for cached data. Clear expired
    > data on
    > startup.([[Medium]{.underline}](https://medium.com/%40tusharkumar27864/best-practices-of-using-data-caching-redis-local-storage-in-react-native-projects-e151c76b2df0?utm_source=chatgpt.com))

-   For larger or structured offline needs, consider SQLite, but keep
    > AsyncStorage for only lightweight, read-only
    > state.([[CodingCops]{.underline}](https://codingcops.com/react-native-asyncstorage/?utm_source=chatgpt.com))

**Key Summary of Storage Layers**:

-   **AsyncStorage** --- UI-only cache, fast and offline-friendly.

-   **SecureStore / Encrypted Storage** --- use exclusively for secrets
    > or highly sensitive data.

-   **Supabase DB** --- authoritative source for all financial data and
    > business logic.
