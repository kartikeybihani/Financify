# Conversation Context Implementation

## Overview
Implemented a comprehensive conversation context system with intelligent topic detection to maintain state across messages, enabling multi-topic financial conversations and contextual responses.

## What Was Implemented

### 1. SQL Schema (Run this in Supabase)
```sql
-- Create conversation_context table for active session management
CREATE TABLE IF NOT EXISTS public.conversation_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  
  -- Conversation state
  last_messages JSONB DEFAULT '[]'::jsonb,
  pending_action TEXT, -- 'goal_creation_offer', 'goal_confirmation', etc.
  pending_action_payload JSONB DEFAULT '{}'::jsonb,
  active_topic TEXT, -- 'investment_analysis', 'budget_planning', 'debt_management', etc.
  last_entity JSONB DEFAULT '{}'::jsonb, -- {type: 'item', value: 'Rolex', amount: 15000}
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes',
  
  -- Constraints
  CONSTRAINT conversation_context_chat_id_unique UNIQUE(chat_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_conversation_context_user_id 
  ON public.conversation_context(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_context_chat_id 
  ON public.conversation_context(chat_id);
CREATE INDEX IF NOT EXISTS idx_conversation_context_expires 
  ON public.conversation_context(expires_at);

-- Cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_conversation_context()
RETURNS void AS $$
BEGIN
  DELETE FROM public.conversation_context WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions
GRANT ALL ON public.conversation_context TO authenticated;
GRANT ALL ON public.conversation_context TO service_role;

-- RLS Policies
ALTER TABLE public.conversation_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversation context"
  ON public.conversation_context FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversation context"
  ON public.conversation_context FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversation context"
  ON public.conversation_context FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversation context"
  ON public.conversation_context FOR DELETE
  USING (auth.uid() = user_id);
```

### 2. Backend Changes (finny.js)

#### Added Conversation Context Functions
- `getConversationContext(userId, chatId)` - Load context from Supabase
- `saveConversationContext(userId, chatId, context)` - Save/update context
- `updateConversationContext(userId, chatId, userMessage, finnyResponse, metadata)` - Update after each exchange

#### Added Topic Detection Function
- `detectConversationTopic(message, conversationContext)` - Intelligent topic classification
  - Investment & stock analysis detection
  - Budget & spending planning detection
  - Debt management detection
  - Savings & goals detection
  - Income optimization detection
  - Tax planning detection
  - Continuation pattern detection for follow-ups

#### Added Goal Detection Function
- `detectGoalIntent(message, conversationContext)` - Tightened goal classification
  - Explicit goal creation patterns
  - Goal inquiry vs. creation distinction
  - Non-goal query filtering

#### Automatic Context Population
- Detects conversation topics automatically
- Extracts relevant entities (stocks, amounts, items)
- Sets pending actions based on user intent
- Maintains context continuity across messages

#### Updated Main Handler
- Loads `chat_id` from request
- Loads conversation context from Supabase
- Passes context to all handlers
- Updates context after responses

### 3. Frontend Changes (useChat.ts)

#### Added chat_id State
```typescript
const [chatId, setChatId] = useState<string>(() => 
  `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
);
```

#### Updated Functions
- `clearChat()` - Generates new chat_id
- `startNewSession()` - Generates new chat_id
- All API calls now send `chat_id`

## Topic Detection System

### 7 Core Financial Topics

| Topic | Gen Z Questions | Entity Extraction |
|-------|----------------|-------------------|
| **💰 Investment Analysis** | "Should I buy Apple stock?", "Is Bitcoin worth it?", "Add to portfolio?" | Symbol, amount, action |
| **💸 Budget Planning** | "Can I afford this?", "Where's my money going?", "Track expenses" | Item, amount, category |
| **💳 Debt Management** | "Should I pay off credit card?", "Debt free plan?", "Interest rates" | Amount, debt type, action |
| **🎯 Savings Planning** | "How much to save?", "Emergency fund?", "Goal amount" | Amount, goal type, timeframe |
| **💼 Income Optimization** | "Salary negotiation?", "Side hustle income?", "How much make?" | Amount, source, action |
| **🧾 Tax Planning** | "Tax deductions?", "W2 questions?", "Refund amount?" | Amount, tax type, action |
| **🔄 Continuation** | "What about it?", "Should I?", "Tell me more" | Inherits from context |

### Example: Apple Stock Conversation

**Before (Broken):**
```
User: "Tell me about Apple stock"
→ No topic detection
→ Context: {active_topic: null}

User: "Should I add it to my portfolio?"  
→ System doesn't know "it" = Apple stock
→ Poor continuity
```

**After (Fixed):**
```
User: "Tell me about Apple stock"
→ Topic: "investment_analysis"
→ Entity: {symbol: "AAPL", type: "investment"}
→ Context: {active_topic: "investment_analysis", last_entity: {symbol: "AAPL"}}

User: "Should I add it to my portfolio?"
→ Continuation pattern detected
→ Inherits: {active_topic: "investment_analysis", last_entity: {symbol: "AAPL"}}
→ Perfect continuity! 🎉
```

## How It Works

### Flow Example: Multi-Topic Financial Conversation

1. **Investment Discussion: "Tell me about Apple stock"**
   - Frontend sends: `{action: "classify", message: "Tell me about Apple stock", chat_id: "chat_123..."}`
   - Backend detects: `ask_personalized` + topic: "investment_analysis"
   - Response: "Apple (AAPL) is currently at $252.29..."
   - Context saved: 
     ```json
     {
       "active_topic": "investment_analysis",
       "last_entity": {"type": "investment", "symbol": "AAPL"},
       "last_messages": [...]
     }
     ```

2. **Follow-up: "Should I add it to my portfolio?"**
   - Frontend sends: `{action: "classify", message: "Should I add it to my portfolio?", chat_id: "chat_123..."}`
   - Backend loads context, detects continuation pattern "it"
   - Inherits: `active_topic: "investment_analysis", last_entity: {symbol: "AAPL"}`
   - Perfect continuity - knows "it" = Apple stock
   - Response: "Based on your portfolio, adding Apple could..."

3. **Budget Discussion: "Can I afford a $2000 MacBook?"**
   - New topic detected: "budget_planning"
   - Entity extracted: {item: "MacBook", amount: 2000}
   - Context updated with new topic and entity

## Key Improvements

### Before
- ❌ "Tell me about Apple stock" → No topic detection
- ❌ "Should I add it to my portfolio?" → Doesn't know "it" = Apple
- ❌ No conversation memory across topics
- ❌ Poor context continuity

### After
- ✅ "Tell me about Apple stock" → Topic: "investment_analysis", Entity: {symbol: "AAPL"}
- ✅ "Should I add it to my portfolio?" → Perfect continuity, knows "it" = Apple
- ✅ Multi-topic conversations work seamlessly
- ✅ 7 financial topics automatically detected
- ✅ Entity extraction for stocks, amounts, items, etc.
- ✅ 30-minute session TTL with context inheritance

## Topic Detection Patterns

### Investment Analysis:
- "Should I buy Apple stock?"
- "Is Bitcoin worth investing?"
- "Add Tesla to my portfolio?"
- "Robinhood vs Webull?"

### Budget Planning:
- "Can I afford this $500 jacket?"
- "Where's all my money going?"
- "Track my spending better"
- "Cut subscription costs"

### Debt Management:
- "Should I pay off my credit card?"
- "Debt free by 25?"
- "Interest rate too high?"

### Savings Planning:
- "How much emergency fund?"
- "Save for vacation?"
- "Goal amount realistic?"

### Income Optimization:
- "Salary negotiation tips?"
- "Side hustle income?"
- "How much should I make?"

### Tax Planning:
- "Tax deductions for freelancers?"
- "W2 vs 1099 questions?"
- "Refund amount estimate?"

### Continuation Patterns:
- "What about it?" (inherits context)
- "Should I?" (inherits context)
- "Tell me more" (inherits context)

## Testing

### Test Queries
```
1. "Tell me about Apple stock"
   → ask_personalized + topic: "investment_analysis"
   → Entity: {symbol: "AAPL", type: "investment"}

2. "Should I add it to my portfolio?" (after above)
   → Continuation pattern detected
   → Inherits: {active_topic: "investment_analysis", last_entity: {symbol: "AAPL"}}
   → Perfect continuity

3. "Can I afford a $2000 MacBook?"
   → ask_personalized + topic: "budget_planning"
   → Entity: {item: "MacBook", amount: 2000, type: "purchase"}

4. "Should I pay off my credit card?"
   → ask_personalized + topic: "debt_management"
   → Entity: {type: "debt", debt_type: "credit card"}

5. "How much should I save for emergency fund?"
   → ask_personalized + topic: "savings_planning"
   → Entity: {goal_type: "emergency", type: "savings_goal"}

6. "What about it?" (after any topic)
   → Continuation pattern
   → Inherits previous topic and entity
```

## Session Management

### In-Memory (Current)
- ✅ Fast (no DB calls)
- ✅ Simple implementation
- ✅ Works for V1 scale (<100 users)
- ⚠️ Lost on Vercel cold starts (acceptable for V1)

### Context Stored in Supabase
- ✅ Survives cold starts
- ✅ Works across multiple instances
- ✅ 30-minute rolling TTL
- ⚠️ ~20-30ms latency per request (acceptable)

## Future Enhancements

### When Needed (>100 users)
1. Add Redis for session state (if cold starts become issue)
2. Add conversation summary generation
3. Add entity extraction for better context
4. Add sentiment tracking

### V2 Features
1. Multi-turn goal refinement
2. Context-aware follow-up questions
3. Proactive suggestions based on history
4. Cross-session memory (long-term)

## Maintenance

### Cleanup
Run periodically (or set up pg_cron):
```sql
SELECT cleanup_expired_conversation_context();
```

### Monitoring
```sql
-- Check active conversations
SELECT COUNT(*) FROM conversation_context 
WHERE expires_at > NOW();

-- Check pending actions
SELECT pending_action, COUNT(*) 
FROM conversation_context 
WHERE expires_at > NOW() 
GROUP BY pending_action;
```

## Notes

- `chat_id` is generated client-side and persists for conversation lifetime
- New chat = new `chat_id` = fresh context
- Context expires after 30 minutes of inactivity
- Goal flow state still uses in-memory session (fast, simple)
- Conversation context is Supabase-backed (durable, shareable)

## Files Modified

1. `api/finny.js` - Added context functions, goal detection, router override
2. `src/hooks/useChat.ts` - Added chat_id generation and sending
3. Created: `conversation_context` table in Supabase

