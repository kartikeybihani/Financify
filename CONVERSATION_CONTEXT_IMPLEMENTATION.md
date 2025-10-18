# Conversation Context Implementation

## Overview
Implemented a conversation context system to maintain state across messages, enabling better goal flow management and contextual responses.

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
  active_topic TEXT, -- 'rolex_affordability', 'stock_inquiry', etc.
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

#### Added Goal Detection Function
- `detectGoalIntent(message, conversationContext)` - Tightened goal classification
  - Explicit goal creation patterns
  - Context-aware confirmation detection
  - Goal inquiry vs. creation distinction
  - Non-goal query filtering

#### Router Override
- Checks `pending_action` before classification
- Routes confirmations directly to goal handler
- Prevents misclassification of "yes/no" responses

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

## How It Works

### Flow Example: "Can I afford a Rolex?" → "Yes" → Goal Created

1. **First Message: "Can I afford a Rolex?"**
   - Frontend sends: `{action: "classify", message: "Can I afford a Rolex?", chat_id: "chat_123..."}`
   - Backend detects: `ask_personalized` (affordability query, NOT goal)
   - Response: "Yes, you can afford it! Want to create a savings goal?"
   - Context saved: 
     ```json
     {
       "pending_action": "goal_creation_offer",
       "last_entity": {"type": "item", "value": "Rolex", "amount": 15000},
       "last_messages": [...]
     }
     ```

2. **Second Message: "Yes"**
   - Frontend sends: `{action: "classify", message: "Yes", chat_id: "chat_123..."}`
   - Backend loads context, sees `pending_action: "goal_creation_offer"`
   - **Router override** detects affirmative + pending action
   - Routes directly to `goal_conversation` (bypasses classification)
   - Goal creation starts with context from Rolex conversation

3. **Goal Flow**
   - Uses `last_entity` to pre-fill goal details
   - Asks for missing information
   - Creates goal when complete
   - Clears `pending_action` after completion

## Key Improvements

### Before
- ❌ "I want to see my goals" → Misclassified as `goal_conversation`
- ❌ "Can I afford X?" → Sometimes classified as goal creation
- ❌ "Yes" after any message → Unclear intent
- ❌ No conversation memory

### After
- ✅ "I want to see my goals" → Correctly routed to `ask_personalized`
- ✅ "Can I afford X?" → Never classified as goal creation
- ✅ "Yes" after goal offer → Correctly routed to goal creation
- ✅ 5 message history maintained per conversation
- ✅ 30-minute session TTL

## Goal Detection Patterns

### Routes to `goal_conversation`:
- "create a goal"
- "set a goal for..."
- "save $5000 for..."
- "target amount of..."
- "yes" (when pending_action = 'goal_creation_offer')

### Routes to `ask_personalized`:
- "what are my goals?"
- "show my goals"
- "am I on track with my goals?"
- "can I afford..."
- "should I buy..."
- "how much did I spend..."

## Testing

### Test Queries
```
1. "Can I afford a $15,000 Rolex?" 
   → ask_personalized (affordability check)
   → Response offers goal creation

2. "Yes" (after above)
   → goal_conversation (router override)
   → Goal creation flow starts

3. "What are my goals?"
   → ask_personalized (goal inquiry, NOT creation)
   → Lists existing goals

4. "I want to save $5000 for vacation by June 2026"
   → goal_conversation (explicit goal creation)
   → Goal creation flow starts

5. "Am I on track to complete my goals?"
   → ask_personalized (goal analysis, NOT creation)
   → Analyzes goal progress
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

