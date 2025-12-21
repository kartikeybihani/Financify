# Deep Personalization Strategy for Finny
## Comprehensive Analysis & Implementation Roadmap

**Date:** January 2025  
**Status:** Analysis Complete - Ready for Implementation  
**Goal:** Transform Finny from a reactive chatbot into a proactive, deeply personalized financial companion

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Tags Currently Stored in Supermemory](#tags-currently-stored-in-supermemory)
3. [Deep Personalization Opportunities](#deep-personalization-opportunities)
4. [Implementation Strategy](#implementation-strategy)
5. [Product Principles](#product-principles)
6. [Expected Outcomes](#expected-outcomes)
7. [Step-by-Step Implementation Plan](#step-by-step-implementation-plan)

---

## Current State Analysis

### What's Working
- ✅ Basic memory storage for conversations
- ✅ Semantic search for retrieving relevant memories
- ✅ Financial tag extraction from messages
- ✅ Onboarding data storage
- ✅ Memory display UI (memories screen)

### What's Missing
- ❌ Message feedback (like/dislike) not connected to Supermemory
- ❌ Goal creation not automatically stored in Supermemory
- ❌ Transaction behaviors not learned
- ❌ Cross-feature memory linking
- ❌ Preference learning from user interactions
- ❌ Proactive memory recall in responses

### Current Feedback Flow
- **Like Button:** Stores to `reports` table with `report_type: "love_it"` → **NOT in Supermemory**
- **Dislike Button:** Opens report modal → **NOT in Supermemory**
- **Goal Creation:** Stored in `goals` table → **NOT in Supermemory**
- **Transaction Actions:** Stored in database → **NOT in Supermemory**

---

## Tags Currently Stored in Supermemory

### Financial Topic Tags (from `extractSupermemoryFinancialTags`)
These tags are automatically extracted from user messages:

| Tag | Trigger Keywords | Use Case |
|-----|-----------------|----------|
| `goal_mentioned` | want, wanna, tryna, goal, plan, dream, target, save for, manifest | User expresses desire for something |
| `travel_interest` | travel, trip, vacation, vacay, getaway, japan, europe, visit, holiday, roadtrip | Travel-related discussions |
| `purchase_interest` | buy, purchase, cop, grab, upgrade, afford, macbook, laptop, phone, car, tesla, house, apartment, down payment | Purchase intentions |
| `debt_concern` | debt, loan, loans, student debt, credit card, cc debt, owe, pay off, collections, interest payments | Debt-related concerns |
| `savings_discussion` | save, saving up, savings, stacking, stash, rainy day fund, emergency fund, safety net, cushion | Savings conversations |
| `investment_discussion` | invest, investment, stocks, stock market, etf, index fund, portfolio, brokerage, retirement, 401k, ira, crypto, bitcoin | Investment topics |
| `budget_discussion` | budget, budgeting, spending, expense, spend, broke, burning cash, living paycheck to paycheck, cut back | Budgeting conversations |
| `income_discussion` | salary, income, earn, paycheck, payday, wage, raise, bonus, side hustle, freelance, overtime | Income-related topics |

### Onboarding/Profile Tags (from `buildOnboardingMetadata`)
Stored during user onboarding:

| Tag Category | Values | Description |
|-------------|--------|------------|
| **Base Tags** | `onboarding`, `profile`, `intent_answers` | Core onboarding identifiers |
| **Money Mindset** | `money_mindset_freedom`, `money_mindset_stress`, `money_mindset_ignore`, `money_mindset_disciplined` | User's relationship with money |
| **Stress Level** | `stress_level_chill`, `stress_level_tense`, `stress_level_stressed`, `stress_level_overwhelmed` | Financial stress indicators |
| **Emergency Readiness** | `emergency_yes`, `emergency_maybe`, `emergency_no`, `emergency_unsure` | Emergency fund status |
| **Referral Source** | `referral_tiktok`, `referral_instagram`, `referral_twitter`, `referral_email`, `referral_friend`, `referral_appstore`, `referral_reddit`, `referral_founder` | How user found Finny |
| **Age Groups** | `age_18_24`, `age_25_34`, `age_35_44`, `age_45_54`, `age_55_plus` | User age demographics |

### Context Metadata (from `buildSupermemoryMetadata`)
Rich context stored with each memory:

| Field | Values | Purpose |
|-------|--------|---------|
| `context_type` | `goal`, `constraint`, `preference`, `life_event`, `decision`, `general` | Categorizes the conversation type |
| `financial_relevance` | `high`, `medium`, `low` | How financially relevant the conversation is |
| `emotional_state` | `anxious`, `excited`, `confused`, `confident`, `neutral` | User's emotional state during conversation |
| `financial_impact` | `high`, `medium`, `low` | Potential financial impact of the discussion |

---

## Deep Personalization Opportunities

### 1. Message Feedback → Preference Learning ⭐ **HIGH PRIORITY**

**Current State:**
- Like/dislike buttons exist on every Finny message
- Feedback stored in `reports` table only
- No connection to Supermemory
- No learning from feedback patterns

**Opportunity:**
Transform every like/dislike into a learning opportunity about user preferences.

**What to Learn:**
- **Response Style Preferences:** Does user prefer conversational, direct, empathetic, or analytical responses?
- **Topic Preferences:** What topics resonate most with the user?
- **Tone Preferences:** Encouraging vs. matter-of-fact, supportive vs. challenging
- **Format Preferences:** Lists vs. paragraphs, examples vs. theory, short vs. detailed
- **Action Preferences:** Does user prefer actionable advice or exploratory discussions?

**Implementation Approach:**
```javascript
// When user likes a message, store in Supermemory:
{
  content: "User liked Finny's response about [topic]. The response was: [message content]. User's original question was: [user message]",
  metadata: {
    feedback_type: "positive",
    response_style: "conversational|direct|empathetic|analytical",
    topic: "savings|debt|investment|goal_planning|budgeting",
    message_length: "short|medium|long",
    has_examples: true|false,
    has_action_items: true|false,
    has_numbers: true|false,
    emotional_tone: "encouraging|matter_of_fact|supportive|challenging",
    message_type: "text|action|goal_offer",
    tags: ["response_preference", "style_learning", "topic_preference", topic]
  }
}

// When user dislikes a message, store:
{
  content: "User disliked Finny's response about [topic]. The response was: [message content]. User reported: [report text if provided]",
  metadata: {
    feedback_type: "negative",
    topic: "savings|debt|investment|etc",
    reported_issue: "inaccurate|unhelpful|too_long|wrong_tone|etc",
    tags: ["response_preference", "style_learning", "topic_preference", "negative_feedback"]
  }
}
```

**Product Impact:**
- Finny adapts response style based on what users actually like
- Over time, responses become more personalized
- Creates sense that Finny "gets" the user
- Reduces negative feedback through learning

**Retrieval Strategy:**
Before generating response, search for:
- `response_preference` + `topic` (what style worked for this topic before?)
- `style_learning` (what general style does user prefer?)
- Recent positive feedback patterns

---

### 2. Goal Creation → Rich Context Memory ⭐ **HIGH PRIORITY**

**Current State:**
- Goals stored in `goals` table
- Not automatically stored in Supermemory
- No connection to conversation context that led to goal creation
- No emotional context preserved

**Opportunity:**
When a goal is created, store the full story behind it.

**What to Store:**
- **Conversation Context:** What led to this goal? What was the user asking about?
- **Emotional State:** Excited? Anxious? Determined?
- **Financial Context:** What constraints/opportunities exist?
- **Related Memories:** Link to previous conversations about this goal
- **Timeline Urgency:** Is this urgent? Long-term? Dream goal?

**Implementation Approach:**
```javascript
// When goal is created (from chat or goals screen):
{
  content: "User created goal: [label] for $[amount] by [date]. Context: [what led to this goal, user's situation, emotional state, financial constraints]. Category: [category]",
  metadata: {
    memory_type: "goal_creation",
    goal_id: "[uuid]",
    goal_category: "vacation|car|house_down_payment|emergency_fund|education|retirement|wedding|debt_payoff|investment|other",
    goal_amount: 5000,
    goal_timeline_days: 180,
    goal_timeline_category: "short_term|medium_term|long_term",
    emotional_state: "excited|anxious|determined|uncertain",
    financial_context: "has_constraints|has_opportunity|stable|tight",
    related_conversations: ["chat_id_1", "chat_id_2"],
    created_via: "chat|goals_screen|affordability_check",
    tags: ["goal", "goal_created", goal_category, "financial_planning"]
  }
}
```

**Product Impact:**
- Finny can reference goal creation context later
- Proactive goal progress check-ins with full context
- Better goal-related advice (knows why goal was created)
- Can suggest related goals based on context

**Retrieval Strategy:**
When user asks about goals or savings:
- Search for `goal_created` + `goal_category`
- Include goal creation context in response
- Reference original conversation that led to goal

---

### 3. Transaction Interactions → Spending Pattern Learning

**Current State:**
- Transactions exist but not connected to memory
- No learning from user transaction behaviors
- No pattern recognition

**Opportunity:**
Learn from how users interact with transactions.

**What to Learn:**
- **Category Adjustment Patterns:** What categories do users frequently change?
- **Goal Allocation Patterns:** What goals get the most allocations?
- **Recurring Transaction Setup:** What do users set as recurring?
- **Spending vs. Saving Behaviors:** Patterns in financial priorities
- **Transaction Review Frequency:** How often do they review transactions?

**Implementation Approach:**
```javascript
// When user assigns transaction to goal:
{
  content: "User allocated $[amount] from [category] transaction to [goal_name]. This shows [priority/preference insight]. Transaction date: [date]",
  metadata: {
    memory_type: "transaction_behavior",
    action_type: "goal_allocation|category_change|recurring_setup|transaction_review",
    category: "food|shopping|entertainment|transportation|etc",
    goal_id: "[uuid]",
    goal_priority: "high|medium|low",
    spending_pattern: "consistent|variable|increasing|decreasing",
    amount: 50.00,
    tags: ["transaction_behavior", "spending_pattern", "goal_priority", category]
  }
}

// When user sets recurring transaction:
{
  content: "User set [merchant] transaction as recurring. Amount: $[amount], frequency: [monthly|weekly]. Category: [category]",
  metadata: {
    memory_type: "transaction_behavior",
    action_type: "recurring_setup",
    merchant: "Netflix|Spotify|etc",
    category: "subscription|entertainment|etc",
    amount: 15.99,
    frequency: "monthly|weekly",
    tags: ["transaction_behavior", "recurring_pattern", "spending_habit"]
  }
}
```

**Product Impact:**
- Understand user's spending priorities
- Suggest better category assignments
- Proactive goal allocation suggestions
- Identify spending patterns for budgeting advice

---

### 4. Goal Progress Updates → Motivation Patterns

**Current State:**
- Goals track progress but don't learn from it
- No understanding of what motivates users

**Opportunity:**
Learn from progress patterns to understand motivation.

**What to Learn:**
- **Update Frequency:** How often do users update goals?
- **Progress Patterns:** Consistent vs. sporadic progress
- **Milestone Celebrations:** What milestones matter to users?
- **Goal Completion Patterns:** What types of goals get completed?
- **Abandonment Patterns:** What causes goal abandonment?

**Implementation Approach:**
```javascript
// When user updates goal progress:
{
  content: "User updated [goal_name] progress from $[old] to $[new]. [Context: was this manual, automatic, milestone reached?]. Progress: [percentage]% complete",
  metadata: {
    memory_type: "goal_progress",
    goal_id: "[uuid]",
    goal_category: "vacation|car|etc",
    progress_change: "positive|negative|milestone",
    progress_percentage: 45,
    update_frequency: "daily|weekly|monthly|rare",
    update_type: "manual|automatic|milestone",
    motivation_level: "high|medium|low",
    milestone_reached: true|false,
    tags: ["goal_progress", "motivation_pattern", "engagement", goal_category]
  }
}

// When goal is completed:
{
  content: "User completed goal: [goal_name] for $[amount]. Time taken: [days] days. [Context: how they achieved it, what they did]",
  metadata: {
    memory_type: "goal_completion",
    goal_id: "[uuid]",
    goal_category: "vacation|car|etc",
    completion_time_days: 120,
    completion_method: "consistent_saving|windfall|combination",
    celebration_level: "high|medium|low",
    tags: ["goal_completion", "achievement", "success_pattern", goal_category]
  }
}
```

**Product Impact:**
- Understand what motivates users
- Proactive encouragement at right times
- Celebrate milestones appropriately
- Identify at-risk goals early

---

### 5. Chat Interaction Patterns → Communication Preferences

**Current State:**
- No learning from how users interact with chat
- No understanding of communication style preferences

**Opportunity:**
Learn from interaction patterns to adapt communication.

**What to Learn:**
- **Response Time Preferences:** Quick answers vs. thoughtful responses
- **Question Patterns:** What types of questions do they ask?
- **Action Button Usage:** What actions do they take?
- **Conversation Length:** Prefer short or long conversations?
- **Follow-up Patterns:** Do they ask follow-ups? What about?

**Implementation Approach:**
```javascript
// Track interaction patterns over time:
{
  content: "User interaction pattern: [description of how they use chat - quick questions, deep dives, action-oriented, exploratory, etc.]. Average message length: [chars], average response time: [seconds]",
  metadata: {
    memory_type: "interaction_pattern",
    chat_style: "quick_questions|deep_dives|action_oriented|exploratory|mixed",
    preferred_response_length: "short|medium|long",
    action_taking_tendency: "high|medium|low",
    engagement_level: "high|medium|low",
    question_types: ["how_to", "should_i", "what_is", "why"],
    tags: ["interaction_pattern", "communication_preference"]
  }
}
```

**Product Impact:**
- Adapt response length to user preference
- Match communication style
- Provide appropriate level of detail
- Optimize for user's engagement style

---

### 6. Insights Page Interactions → Financial Interest Areas

**Current State:**
- Insights exist but no learning from engagement
- No understanding of what users find valuable

**Opportunity:**
Learn from insights engagement to understand interests.

**What to Learn:**
- **Valuable Insights:** Which insights do users engage with most?
- **Financial Interest Areas:** What areas are they curious about?
- **Visualization Preferences:** What visualizations resonate?
- **Action Triggers:** What insights prompt action?

**Implementation Approach:**
```javascript
// When user views/engages with insights:
{
  content: "User engaged with [insight_type] showing [data]. [What they did: viewed, explored, shared, acted on]. Insight category: [spending|saving|investing|planning]",
  metadata: {
    memory_type: "insight_engagement",
    insight_type: "spending_trend|category_breakdown|goal_progress|income_vs_expenses|savings_rate|etc",
    engagement_level: "viewed|explored|acted_on|shared",
    financial_interest: "spending|saving|investing|planning|debt_management",
    visualization_type: "chart|list|comparison|timeline",
    tags: ["insight_preference", "financial_interest", insight_type]
  }
}
```

**Product Impact:**
- Show more relevant insights
- Understand user's financial priorities
- Personalize insights page
- Trigger relevant conversations

---

### 7. Finny Style Settings → Personality Adaptation

**Current State:**
- Finny style can be set but not learned from usage
- No adaptation based on actual preferences

**Opportunity:**
Learn from style preferences to adapt personality.

**What to Learn:**
- **Effective Styles:** What style do users actually prefer (vs. what they set)?
- **Context-Dependent Styles:** Do preferences change by context?
- **Style Effectiveness:** Do users like responses more with certain styles?
- **Style Changes:** When and why do users change styles?

**Implementation Approach:**
```javascript
// Learn from style interactions:
{
  content: "User's Finny style preference: [style]. [Evidence: they like responses more when style is X, or they change style when discussing Y]. Current setting: [style]",
  metadata: {
    memory_type: "style_preference",
    preferred_style: "conversational|professional|friendly|direct",
    current_setting: "conversational|professional|friendly|direct",
    context_dependent: true|false,
    effectiveness: "high|medium|low",
    style_changes: ["conversational_to_professional", "when_discussing_investments"],
    tags: ["style_preference", "personality_adaptation"]
  }
}
```

**Product Impact:**
- Adapt style based on what actually works
- Context-aware style switching
- Better user experience through style matching

---

### 8. Cross-Feature Memory Linking 🔗 **CRITICAL**

**Current State:**
- Memories exist in silos
- No connection between chat, goals, transactions, insights

**Opportunity:**
Create a unified financial narrative by linking memories across features.

**Link Types:**
1. **Chat → Goal:** Link goal mentions in chat to actual goal creation
2. **Transaction → Goal:** Link transaction allocations to goals
3. **Insights → Chat:** Link insights engagement to chat questions
4. **Goal → Progress:** Link goal creation to progress updates
5. **Feedback → Response:** Link message feedback to response generation

**Implementation Approach:**
```javascript
// When linking memories:
{
  content: "Memory link: [source_memory] is related to [target_memory]. Connection type: [mention_to_creation|allocation_to_goal|engagement_to_question]",
  metadata: {
    memory_type: "memory_link",
    source_memory_id: "[uuid]",
    target_memory_id: "[uuid]",
    link_type: "chat_to_goal|transaction_to_goal|insight_to_chat|goal_to_progress|feedback_to_response",
    relationship_strength: "strong|medium|weak",
    tags: ["memory_link", link_type]
  }
}
```

**Example Flow:**
```
1. User mentions "I want to save for Japan trip" in chat
   → Memory stored: goal_mentioned, travel_interest

2. User creates goal: "Japan Trip $3000"
   → Memory stored: goal_creation
   → Link created: chat_memory → goal_creation

3. User allocates transaction to Japan Trip goal
   → Memory stored: transaction_behavior
   → Link created: transaction → goal

4. Later: User asks "How's my Japan trip goal?"
   → Search finds: goal_creation + transaction_behavior + chat_memory
   → Finny responds with full context: "Remember when you mentioned wanting to go to Japan? I see you created the goal and have been allocating transactions to it. You're at $500/$3000..."
```

**Product Impact:**
- Unified understanding of user's financial journey
- Contextual responses that reference full picture
- Proactive suggestions based on cross-feature patterns
- Seamless experience across features

---

## Implementation Strategy

### Phase 1: Foundation (Week 1-2) ⭐ **START HERE**

**Goal:** Establish core personalization infrastructure

#### 1.1 Message Feedback → Supermemory
- [ ] Create `storeMessageFeedback()` function in `lib/memoryUtils.js`
- [ ] Extract response characteristics (style, tone, format, length)
- [ ] Store positive feedback with rich metadata
- [ ] Store negative feedback with issue categorization
- [ ] Update `handleThumbUp` in `app/(tabs)/chat/index.tsx` to call Supermemory
- [ ] Update `handleThumbDown` to store negative feedback
- [ ] Test: Like a message, verify it's stored in Supermemory

**Files to Modify:**
- `lib/memoryUtils.js` - Add `storeMessageFeedback()`
- `app/(tabs)/chat/index.tsx` - Update feedback handlers
- `src/utils/analytics/reports.ts` - Keep existing, add Supermemory call

**Success Criteria:**
- Every like/dislike stores to Supermemory
- Feedback includes response characteristics
- Can retrieve feedback patterns for response generation

---

#### 1.2 Goal Creation → Supermemory
- [ ] Create `storeGoalCreationMemory()` function
- [ ] Hook into goal creation flow (chat + goals screen)
- [ ] Extract conversation context if created via chat
- [ ] Store emotional state, financial context, related conversations
- [ ] Link to previous goal mentions in chat
- [ ] Test: Create goal via chat, verify memory stored

**Files to Modify:**
- `lib/memoryUtils.js` - Add `storeGoalCreationMemory()`
- `api/goals.js` - Call Supermemory after goal creation
- `src/hooks/useGoals.ts` - Call Supermemory after goal creation

**Success Criteria:**
- Every goal creation stores to Supermemory
- Rich context preserved (conversation, emotions, constraints)
- Can link goals to previous conversations

---

#### 1.3 Basic Memory Retrieval in Responses
- [ ] Update `loadUserMemory()` to search for feedback patterns
- [ ] Include feedback preferences in context building
- [ ] Test: Generate response, verify feedback patterns influence style

**Files to Modify:**
- `lib/memoryUtils.js` - Update `loadUserMemory()`
- `api/finny.js` - Include feedback preferences in prompt

**Success Criteria:**
- Responses adapt based on feedback patterns
- Style preferences influence response generation

---

### Phase 2: Behavior Learning (Week 3-4)

**Goal:** Learn from user behaviors across features

#### 2.1 Transaction Behavior Learning
- [ ] Create `storeTransactionBehavior()` function
- [ ] Hook into transaction actions (goal allocation, category change, recurring setup)
- [ ] Extract spending patterns and priorities
- [ ] Store in Supermemory with rich context
- [ ] Test: Allocate transaction to goal, verify memory stored

**Files to Modify:**
- `lib/memoryUtils.js` - Add `storeTransactionBehavior()`
- Transaction action handlers - Call Supermemory

**Success Criteria:**
- Transaction behaviors stored in Supermemory
- Spending patterns learned
- Can suggest behaviors based on patterns

---

#### 2.2 Goal Progress Pattern Learning
- [ ] Create `storeGoalProgressMemory()` function
- [ ] Hook into goal progress updates
- [ ] Track update frequency, progress patterns, milestones
- [ ] Store motivation indicators
- [ ] Test: Update goal progress, verify memory stored

**Files to Modify:**
- `lib/memoryUtils.js` - Add `storeGoalProgressMemory()`
- Goal update handlers - Call Supermemory

**Success Criteria:**
- Progress updates stored in Supermemory
- Motivation patterns learned
- Can provide timely encouragement

---

#### 2.3 Cross-Feature Memory Linking
- [ ] Create `linkMemories()` function
- [ ] Implement link detection (chat → goal, transaction → goal, etc.)
- [ ] Store relationship metadata
- [ ] Update retrieval to include linked memories
- [ ] Test: Create goal after mentioning in chat, verify link created

**Files to Modify:**
- `lib/memoryUtils.js` - Add `linkMemories()`
- Goal creation handlers - Detect and create links
- Memory retrieval - Include linked memories

**Success Criteria:**
- Memories linked across features
- Unified financial narrative
- Contextual responses with full picture

---

### Phase 3: Advanced Personalization (Week 5-6)

**Goal:** Refine and optimize personalization

#### 3.1 Chat Interaction Pattern Learning
- [ ] Create `storeInteractionPattern()` function
- [ ] Track chat usage patterns over time
- [ ] Learn communication preferences
- [ ] Adapt responses based on patterns
- [ ] Test: Use chat, verify patterns learned

**Files to Modify:**
- `lib/memoryUtils.js` - Add `storeInteractionPattern()`
- Chat handlers - Track and store patterns

**Success Criteria:**
- Interaction patterns learned
- Responses adapt to communication style

---

#### 3.2 Insights Engagement Learning
- [ ] Create `storeInsightEngagement()` function
- [ ] Track insights page interactions
- [ ] Learn financial interest areas
- [ ] Personalize insights display
- [ ] Test: View insights, verify engagement stored

**Files to Modify:**
- `lib/memoryUtils.js` - Add `storeInsightEngagement()`
- Insights components - Track engagement

**Success Criteria:**
- Insights engagement learned
- Personalized insights display

---

#### 3.3 Style Preference Adaptation
- [ ] Create `storeStylePreference()` function
- [ ] Learn from style effectiveness
- [ ] Adapt style based on context
- [ ] Test: Change style, verify adaptation

**Files to Modify:**
- `lib/memoryUtils.js` - Add `storeStylePreference()`
- Style handlers - Track effectiveness

**Success Criteria:**
- Style preferences learned
- Context-aware style adaptation

---

## Product Principles

### 1. Invisible Learning
- **Principle:** Learn from behavior, not explicit input
- **Implementation:** Every interaction is a learning opportunity
- **User Experience:** Personalization feels natural, not intrusive

### 2. Progressive Enhancement
- **Principle:** Start with basic memory, add layers over time
- **Implementation:** Each interaction improves the next
- **User Experience:** Finny gets better with use

### 3. Contextual Relevance
- **Principle:** Use memory when it adds value
- **Implementation:** Semantic search finds relevant memories naturally
- **User Experience:** References feel natural, not forced

### 4. User Control
- **Principle:** Users should understand and control their data
- **Implementation:** Memory screen shows what's remembered, allows editing
- **User Experience:** Transparency and control build trust

### 5. Emotional Intelligence
- **Principle:** Remember emotional states, not just facts
- **Implementation:** Store emotional context with every memory
- **User Experience:** Finny understands how user feels, not just what they say

---

## Expected Outcomes

### Short-Term (1-2 months)
1. **Finny remembers what users like**
   - Adapts response style based on feedback
   - Repeats what works, avoids what doesn't

2. **Finny understands goal context**
   - Knows why goals were created
   - Provides goal-aware advice

3. **Basic behavior learning**
   - Understands spending patterns
   - Recognizes goal priorities

### Medium-Term (3-4 months)
4. **Finny sees the full financial picture**
   - Connects chat discussions to actual behaviors
   - Sees patterns across features

5. **Proactive suggestions**
   - Suggests relevant actions based on history
   - Checks in on goals at appropriate times

6. **Personalized communication**
   - Adapts to user's communication style
   - Matches preferred response length and format

### Long-Term (6+ months)
7. **Finny feels like a trusted advisor**
   - Deep understanding of user's financial journey
   - Anticipates needs based on patterns

8. **Seamless cross-feature experience**
   - Unified financial narrative
   - Contextual responses with full picture

9. **World-class personalization**
   - Every interaction is personalized
   - Finny feels like it truly knows the user

---

## Technical Implementation Details

### New Functions to Add to `lib/memoryUtils.js`

```javascript
// Message feedback storage
async function storeMessageFeedback(userId, messageId, feedbackType, messageContent, userMessage, metadata)

// Goal creation memory
async function storeGoalCreationMemory(userId, goalData, conversationContext, emotionalState)

// Transaction behavior learning
async function storeTransactionBehavior(userId, transactionAction, metadata)

// Goal progress tracking
async function storeGoalProgressMemory(userId, goalId, progressData, metadata)

// Memory linking
async function linkMemories(userId, sourceMemoryId, targetMemoryId, linkType, relationshipStrength)

// Interaction pattern learning
async function storeInteractionPattern(userId, interactionData, metadata)

// Insights engagement
async function storeInsightEngagement(userId, insightType, engagementLevel, metadata)

// Style preference learning
async function storeStylePreference(userId, styleData, effectiveness, metadata)
```

### Metadata Schema Standards

**Consistent Fields:**
- `user_id`: User identifier
- `timestamp`: ISO 8601 timestamp
- `memory_type`: Type of memory (feedback, goal_creation, transaction_behavior, etc.)
- `tags`: Array of relevant tags
- `source`: Where the memory came from (chat, goals_screen, transactions, etc.)

**Context Fields:**
- `emotional_state`: User's emotional state
- `financial_context`: Financial situation context
- `related_memories`: Array of related memory IDs
- `link_type`: Type of cross-feature link

---

## Success Metrics

### Engagement Metrics
- **Memory Recall Rate:** % of responses that reference past memories
- **Feedback Learning Rate:** % improvement in response ratings over time
- **Cross-Feature Link Rate:** % of memories that are linked across features

### Personalization Metrics
- **Style Match Rate:** % of responses that match user's preferred style
- **Context Relevance:** Average relevance score of retrieved memories
- **Proactive Suggestion Rate:** % of suggestions that are acted upon

### User Satisfaction Metrics
- **Response Rating:** Average rating of Finny responses
- **Memory Accuracy:** User-reported accuracy of memory references
- **Personalization Perception:** User survey: "Does Finny understand me?"

---

## Next Steps

1. **Review this document** - Ensure alignment on strategy
2. **Start Phase 1.1** - Message feedback → Supermemory
3. **Test incrementally** - Verify each feature before moving to next
4. **Iterate based on results** - Adjust approach based on what works

---

## SuperMemory Extraction Prompt

**Current Prompt Used in SuperMemory Settings:**

```
You are extracting long-term and short-term memory for a personal finance assistant called "Finny".

Your goal is to capture stable, human-level information that improves future conversations of Finny with the user, not volatile financial state.

Only extract information that is likely to remain relevant across time and sessions.

DO NOT extract or store
Exact dollar amounts (balances, debts, spending, forecasts)
Transaction-level or account-level details
Time-sensitive financial snapshots or calculations
Anything that would quickly become outdated as finances change

DO extract and store
User intents or plans
(e.g. considering a trip, major purchase, relocation, lifestyle change)

User preferences about money and advice style
(risk tolerance, conservatism, desire for realism vs optimism, tone preferences)

Financial constraints expressed or implied
(e.g. discomfort with debt, need for more slack before spending, avoidance of pressure)

Abstracted financial judgments derived from analysis
(e.g. "would be financially stretching right now",
"requires meaningfully higher income or savings",
"not comfortably affordable without planning")

Emotionally expressed reactions related to finances, captured descriptively
(e.g. "feels stressed when planning large discretionary expenses",
"expresses concern about financial security",
"values reassurance and clarity in money decisions")

Guidelines
When numerical reasoning is involved, summarize conclusions qualitatively or conditionally, never with raw figures.

Each memory should be:
Clearly useful in future conversations

If information is very ambiguous or very low confidence, prefer not extracting it.
```

**Analysis & Recommendations:**

✅ **Strengths:**
- Excellent focus on stable, long-term information
- Clear distinction between volatile vs. stable data
- Emphasis on qualitative over quantitative
- Good guidelines for emotional context

⚠️ **Potential Enhancements (for future consideration):**
- As we add goal creation and feedback storage, we may want to add:
  - Response style preferences (from feedback)
  - Communication pattern preferences
  - Goal-related context and motivations
- But keep it simple for now - current prompt is solid for Phase 1.1

**Recommendation:** Keep current prompt for Phase 1.1. We can refine it incrementally as we add new memory types (goals, feedback, etc.) in later phases.

---

## Enhanced SuperMemory Extraction Prompt (Phase 1.3 - User-Focused Deep Understanding)

**Optimized prompt focusing primarily on extracting USER information, using Finny's response only as context:**

```
You are extracting long-term and short-term memory for a personal finance assistant called "Finny".

Your goal: Capture stable, human-level information about the USER that improves future conversations, not volatile financial state.

CRITICAL: Focus 75%+ on extracting what the USER said, asked, expressed, or revealed about themselves. Finny's response should only be used as context to understand feedback preferences or what the user was responding to.

PRIMARY FOCUS: Extract information about the USER:
- What the user said about their situation, plans, preferences, values
- What the user asked about (reveals interests, concerns, knowledge gaps)
- What the user expressed emotionally or in their communication style
- Patterns in how the user thinks, makes decisions, communicates

SECONDARY USE: Finny's response context (25%):
- Only use Finny's response to understand WHAT the user liked/disliked in feedback scenarios
- Use it as reference to understand what worked/didn't work, then extract USER preferences
- Don't summarize Finny's response itself - only extract what it reveals about the USER

DO NOT extract:
- Exact dollar amounts, balances, debts, spending, forecasts
- Transaction-level or account-level details
- Time-sensitive financial snapshots or calculations
- If user is just asking for their net worth or accounts data or goals they have
- Anything that quickly becomes outdated
- Summaries of Finny's advice or explanations (unless needed to understand user feedback)

DO extract (FOCUS ON USER):

1. User intents or plans (from what user said)
   - Trips, purchases, relocation, lifestyle changes the USER mentioned
   - Goals or desires the USER expressed
   - What the USER is considering or thinking about

2. User preferences about money and advice style (from what user said/expressed)
   - Risk tolerance, conservatism level (how user describes their approach)
   - Tone preferences (how user communicates, what resonates with them)
   - Response format preferences (learned from feedback: what user liked/disliked about format)
   - Communication style learned from how user interacts

3. Financial constraints (from what user said)
   - Discomfort with debt (if user expressed this)
   - Need for slack (if user mentioned needing buffer)
   - Avoidance of pressure (if user expressed this)

4. Abstracted financial judgments (from what user said or implied)
   - How user perceives their situation ("financially stretching", "requires higher income")
   - User's assessment of affordability or feasibility
   - User's thinking about what's needed to achieve goals

5. Emotional reactions (from what user expressed)
   - How user feels about financial planning ("feels stressed when planning expenses")
   - What user values in money decisions ("values reassurance")
   - Emotional state user expressed during conversation

6. Response preferences from feedback (extract USER preferences, use Finny response as context)
   - When user likes/dislikes: What about Finny's response did user react to?
   - Extract USER preference: "User prefers short responses" not "Finny gave a short response"
   - Topic-specific preferences: What topics does user engage with positively?
   - **DEEP INSIGHT**: Why user liked/disliked (underlying reason, not surface complaint)
   - **DEEP INSIGHT**: What feedback reveals about USER's thinking, values, communication needs
   - **DEEP INSIGHT**: Patterns in USER feedback (e.g. "always prefers actionable" = user values practicality)

7. Thinking patterns (from how user communicates and makes decisions)
   - How user approaches decisions (analytical, emotional, practical - from their statements)
   - What user prioritizes (speed, depth, reassurance, actionability - from their questions/concerns)
   - Communication preferences (quick answers, detailed explanations - from how they interact)
   - Learning style (examples, numbers, stories - from what resonates with them)

Guidelines:
- Focus extraction on USER statements, questions, expressions, and patterns
- When extracting feedback preferences: Use Finny's response to understand WHAT user reacted to, then extract USER preference
- Summarize numerical conclusions qualitatively, never raw figures
- Extract "why" behind feedback - what does this reveal about how USER thinks?
- Look for patterns across feedback instances, not one-off reactions
- Capture what USER said/expressed about values, communication needs, thinking style
- Focus on stable information about the USER that will guide future responses
- Don't extract summaries of conversations or Finny's advice - extract USER information

Each memory should be: 
- About the USER (what they said, expressed, prefer, value)
- Useful in future conversations
- Stable across time
- Actionable for understanding the user better
- Revealing about user's deeper thinking and preferences

If ambiguous or low confidence, prefer not extracting.
```

**Key improvements:**
1. ✅ **User-focused extraction** - 75%+ focus on USER information, Finny response only as context
2. ✅ **Primary vs Secondary clarity** - Clear distinction: extract USER info primarily, use Finny response contextually
3. ✅ **Deep understanding focus** - Prioritizes "why" and patterns about the USER
4. ✅ **Clear structure** - Easy to scan and understand what to extract
5. ✅ **Prevents conversation summaries** - Explicitly avoids summarizing Finny's advice/responses
6. ✅ **Actionable** - Clear guidelines without overwhelming detail

**Why this version:**
- Focuses SuperMemory on learning about the USER, not logging conversations
- Prevents redundant extraction of Finny's responses
- Captures deep understanding of user thinking, values, and preferences
- Easier for SuperMemory to process and follow
- Builds a rich USER profile over time

---

## Enhanced SuperMemory Prompt (Recommended for Phase 1.1+)

**User-focused extraction prompt (focuses on USER information, uses Finny's response only as context):**

```
You are extracting long-term and short-term memory for a personal finance assistant called "Finny".

Your goal: Capture stable, human-level information about the USER that improves future conversations, not volatile financial state.

CRITICAL: Focus 75%+ on extracting what the USER said, asked, expressed, or revealed about themselves. Finny's response should only be used as context to understand feedback preferences or what the user was responding to.

PRIMARY FOCUS: Extract information about the USER:
- What the user said about their situation, plans, preferences, values
- What the user asked about (reveals interests, concerns, knowledge gaps)
- What the user expressed emotionally or in their communication style
- Patterns in how the user thinks, makes decisions, communicates

SECONDARY USE: Finny's response context (25%):
- Only use Finny's response to understand WHAT the user liked/disliked in feedback scenarios
- Use it as reference to understand what worked/didn't work, then extract USER preferences
- Don't summarize Finny's response itself - only extract what it reveals about the USER

DO NOT extract or store:
- Exact dollar amounts (balances, debts, spending, forecasts)
- Transaction-level or account-level details
- Time-sensitive financial snapshots or calculations
- If user is just asking for their net worth or accounts data or goals they have
- Anything that would quickly become outdated as finances change
- Summaries of Finny's advice or explanations (unless needed to understand user feedback)

DO extract and store (FOCUS ON USER):

1. User intents or plans (from what user said)
   (e.g. considering a trip, major purchase, relocation, lifestyle change)

2. User preferences about money and advice style (from what user said/expressed)
   - Risk tolerance and conservatism level (how user describes their approach)
   - Desire for realism vs optimism (from user's statements)
   - Tone preferences (how user communicates, what resonates with them)
   - Response format preferences (learned from feedback: what user liked/disliked about format)
   - Communication style preferences learned from how user interacts

3. Financial constraints expressed or implied (from what user said)
   (e.g. discomfort with debt, need for more slack before spending, avoidance of pressure)

4. Abstracted financial judgments (from what user said or implied)
   (e.g. "would be financially stretching right now",
   "requires meaningfully higher income or savings",
   "not comfortably affordable without planning")

5. Emotionally expressed reactions related to finances (from what user expressed)
   (e.g. "feels stressed when planning large discretionary expenses",
   "expresses concern about financial security",
   "values reassurance and clarity in money decisions")

6. Response preferences from user feedback (extract USER preferences, use Finny response as context)
   - When user likes/dislikes: What about Finny's response did user react to?
   - Extract USER preference: "User prefers short responses" not "Finny gave a short response"
   - Topic-specific preferences (e.g. "user likes detailed investment advice but short savings advice")
   - Format preferences (e.g. "user prefers responses with numbered steps")

Guidelines:
- Focus extraction on USER statements, questions, expressions, and patterns
- When extracting feedback preferences: Use Finny's response to understand WHAT user reacted to, then extract USER preference
- When numerical reasoning is involved, summarize conclusions qualitatively or conditionally, never with raw figures
- Extract response preferences from feedback patterns, not individual feedback instances
- Focus on stable preferences about the USER that will guide future responses, not one-off reactions
- When user reports disliking a response, extract what specifically they disliked (tone, length, format, accuracy) and store as USER preference to avoid
- Don't extract summaries of conversations or Finny's advice - extract USER information

Each memory should be:
- About the USER (what they said, expressed, prefer, value)
- Clearly useful in future conversations
- Stable across time (won't become outdated quickly)
- Actionable for understanding the user better and improving Finny's responses

If information is very ambiguous or very low confidence, prefer not extracting it.
```

**Key improvements for user-focused extraction:**
1. ✅ **75/25 Focus Split** - 75%+ on USER information, 25% on Finny response context (only for feedback)
2. ✅ **Primary focus on USER** - Extract what user said, asked, expressed, revealed - not conversation summaries
3. ✅ **Finny response as context only** - Use Finny's response to understand what user liked/disliked, then extract USER preference
4. ✅ **Response preferences from user perspective** - Extract "User prefers short responses" not "Finny gave a short response"
5. ✅ **Explicit instructions** - Don't summarize Finny's advice, extract USER information
6. ✅ **Feedback pattern extraction** - Focus on USER patterns, not individual instances

**Why these changes help:**
- Ensures SuperMemory learns about the USER, not about conversations
- Prevents extraction of redundant information about Finny's responses
- Focuses on stable USER preferences, values, thinking patterns
- Makes feedback extraction user-centric: what does feedback reveal about the USER?
- Builds a rich profile of the user over time, not a log of conversations

---

## How Adaptation Works (Phase 1.1)

### Question: "How would feedback storage adapt future responses?"

**Answer:** Here's how the adaptation flow works:

### 1. **Storage Phase** (What We Just Built)
When a user likes/dislikes a message:
- We extract response characteristics (style, tone, length, format, topics)
- We store this in Supermemory with tags like `response_preference`, `style_learning`, `topic_savings`, etc.
- Each feedback creates a memory that says: "User liked/disliked this type of response"

### 2. **Retrieval Phase** (How It's Used)
Before generating each Finny response:
- We search Supermemory for `response_preference` + current topic
- We find memories like: "User liked responses about savings that were conversational, short, with examples"
- We include these preferences in the system prompt

### 3. **Adaptation Phase** (The Magic)
The LLM receives context like:
```
## User's Response Preferences (from past feedback):
- User prefers conversational style responses
- User likes short responses (under 200 words) with examples
- User appreciates action items in responses
- User dislikes responses that are too long or lack examples
- For savings topics, user prefers encouraging tone

## Current Request:
User is asking about savings...

## Instructions:
Adjust your response style based on the preferences above.
```

### 4. **Learning Over Time**
- More feedback = more accurate preferences
- Patterns emerge: "User always likes short responses" → prioritize brevity
- Topic-specific preferences: "User likes detailed investment advice but short savings advice"

### Example Flow:

**Session 1:**
- User asks: "How much should I save?"
- Finny responds: [Long, detailed response with lots of numbers]
- User: 👎 (dislikes)
- **Stored:** "User disliked long response about savings with many numbers"

**Session 2:**
- User asks: "What about emergency funds?"
- **Retrieved:** "User disliked long responses about savings"
- Finny responds: [Short, concise response with one clear action]
- User: 👍 (likes)
- **Stored:** "User liked short response about savings with action items"

**Session 3:**
- User asks: "How do I start investing?"
- **Retrieved:** "User prefers short responses for savings topics"
- Finny responds: [Short response, adapting style from savings preference]
- User: 👍 (likes)
- **Pattern learned:** User prefers concise responses

**Future Sessions:**
- All responses adapt to learned preferences
- Finny becomes more personalized over time
- User experience improves with each interaction

### Technical Implementation:

The adaptation happens in `api/finny.js` in the `handleAsk()` function:

1. **Memory Retrieval** (already exists):
```javascript
const userMemory = await loadUserMemory(userId, message);
// This searches Supermemory for relevant memories
```

2. **Feedback Pattern Extraction** (to be added in Phase 1.3):
```javascript
// Search for response_preference memories
const feedbackMemories = userMemory.memories.filter(
  m => m.metadata?.tags?.includes('response_preference')
);

// Extract patterns:
// - Preferred response length
// - Preferred style (conversational/direct/witty)
// - Preferred format (with examples, action items, etc.)
// - Topic-specific preferences
```

3. **Prompt Enhancement** (to be added in Phase 1.3):
```javascript
// Add to system prompt:
if (feedbackMemories.length > 0) {
  promptParts.push("## User's Response Preferences:");
  promptParts.push(buildFeedbackContext(feedbackMemories));
}
```

**Note:** Phase 1.1 focuses on **storage**. Phase 1.3 will add **retrieval and adaptation**. This incremental approach ensures we:
- ✅ Get feedback storage working first
- ✅ Build up a database of preferences
- ✅ Then use those preferences to adapt responses

This is the "baby steps" approach - we're building the foundation now, and the adaptation will come next!

---

## Questions to Consider

1. **Privacy:** How much detail should we store? Should users be able to delete memories?
2. **Performance:** How do we balance memory retrieval speed with relevance?
3. **Storage Costs:** How do we manage Supermemory API costs as memory grows?
4. **Memory Expiration:** Should memories expire? Which ones?
5. **Memory Accuracy:** How do we handle incorrect memories or outdated information?

---

**Document Status:** Ready for Implementation  
**Last Updated:** January 2025  
**Next Review:** After Phase 1 completion
