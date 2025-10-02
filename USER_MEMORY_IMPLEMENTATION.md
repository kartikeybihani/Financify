# User Memory Implementation Plan
## Making Finny Feel Alive with Persistent Memory

### **Overview**
Build a user memory system that makes Finny feel alive by remembering user preferences, traits, and future plans. Implement in one pass without slowing down Finny.

---

## **Database Schema**

### **1. user_memories table**
```sql
CREATE TABLE user_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  memory_type text NOT NULL CHECK (memory_type IN ('profile_trait', 'constraint', 'preference', 'future_plan')),
  key text NOT NULL,
  value text NOT NULL,
  confidence_score numeric DEFAULT 0.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, memory_type, key)
);

-- Indexes for performance
CREATE INDEX idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX idx_user_memories_type ON user_memories(memory_type);
CREATE INDEX idx_user_memories_expires ON user_memories(expires_at) WHERE expires_at IS NOT NULL;
```

### **2. memory_summary table**
```sql
CREATE TABLE memory_summary (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  summary_text text NOT NULL,
  last_updated timestamp with time zone DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_memory_summary_updated ON memory_summary(last_updated);
```

---

## **Memory Types & Examples**

### **profile_trait** - User characteristics
```json
{
  "student": "true",
  "school": "Stanford University", 
  "age_band": "25-30",
  "employer": "Google",
  "location": "San Francisco",
  "occupation": "Software Engineer"
}
```

### **constraint** - Financial limitations/obligations
```json
{
  "rent": "$2000/month",
  "loan_payment": "$500/month", 
  "employer_match": "6%",
  "debt_payment": "$300/month",
  "childcare": "$1200/month"
}
```

### **preference** - User preferences and style
```json
{
  "tone": "quick_take",
  "interests": "travel,tech,investing",
  "brand_affinity": "Apple",
  "communication_style": "detailed",
  "advice_style": "conservative"
}
```

### **future_plan** - Casual long-term intentions
```json
{
  "marriage": "next year",
  "buy_home": "around 5 years", 
  "career_change": "in 2 years",
  "travel_goal": "Europe next summer",
  "education": "MBA in 3 years"
}
```

---

## **Implementation Steps**

### **Phase 1: Database & Core Infrastructure** ⏱️ 2-3 hours

#### **Step 1A: Create Tables**
```sql
-- Run in Supabase SQL Editor
CREATE TABLE user_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  memory_type text NOT NULL CHECK (memory_type IN ('profile_trait', 'constraint', 'preference', 'future_plan')),
  key text NOT NULL,
  value text NOT NULL,
  confidence_score numeric DEFAULT 0.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, memory_type, key)
);

CREATE TABLE memory_summary (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  summary_text text NOT NULL,
  last_updated timestamp with time zone DEFAULT now()
);

-- Indexes
CREATE INDEX idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX idx_user_memories_type ON user_memories(memory_type);
CREATE INDEX idx_user_memories_expires ON user_memories(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_memory_summary_updated ON memory_summary(last_updated);
```

#### **Step 1B: Add Memory Reading to safeContext**
```javascript
// In api/finny.js, update the safeContext builder (around line 222)
const safeContext = {
  ...(context || {}),
  user_id: serverUserId || null,
  profile: userProfile,
  // NEW: Add memory reading
  memory: await loadUserMemory(serverUserId)
};

// Add this function to finny.js
async function loadUserMemory(userId) {
  if (!userId) return { summary: '', memories: [] };
  
  try {
    // Get memory summary
    const { data: summary } = await supabase
      .from('memory_summary')
      .select('summary_text')
      .eq('user_id', userId)
      .single();
    
    // Get top 3 freshest non-expired memories
    const { data: memories } = await supabase
      .from('user_memories')
      .select('memory_type, key, value, confidence_score')
      .eq('user_id', userId)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('updated_at', { ascending: false })
      .limit(3);
    
    return {
      summary: summary?.summary_text || '',
      memories: memories || []
    };
  } catch (error) {
    console.error('Memory load failed:', error);
    return { summary: '', memories: [] };
  }
}
```

#### **Step 1C: Update System Prompt**
```javascript
// In api/finny.js, update the system prompt (around line 438)
const system = [
  "You are Finny: a warm, encouraging, and empowering financial advisor who is blunt when needed.",
  "",
  "PERSONALITY & APPROACH:",
  "- Be warm and encouraging while maintaining professional expertise",
  "- Show enthusiasm for helping users achieve their financial goals",
  "- Be blunt and direct when users need to hear hard truths about their finances",
  "- Celebrate wins and progress, no matter how small",
  "- Use the user's name when available to create personal connection",
  "- Focus on financial empowerment and positive outcomes",
  "",
  // NEW: Add memory context
  ...(context.memory?.summary ? [`User context: ${context.memory.summary}`] : []),
  ...(context.memory?.memories?.length ? [
    `Traits: ${context.memory.memories.filter(m => m.memory_type === 'profile_trait').map(m => `${m.key}: ${m.value}`).join(', ')}`,
    `Constraints: ${context.memory.memories.filter(m => m.memory_type === 'constraint').map(m => `${m.key}: ${m.value}`).join(', ')}`,
    `Preferences: ${context.memory.memories.filter(m => m.memory_type === 'preference').map(m => `${m.key}: ${m.value}`).join(', ')}`,
    `Future plans: ${context.memory.memories.filter(m => m.memory_type === 'future_plan').map(m => `${m.key}: ${m.value}`).join(', ')}`
  ] : []),
  "",
  // ... rest of existing system prompt
].join("\n");
```

#### **Step 1D: Add Memory Extraction to LLM Call**
```javascript
// In api/finny.js, update the LLM call (around line 616)
const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: OPENROUTER_MODEL,
    temperature: 0.6,
    max_tokens: 650,
    stream: false,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `User: ${message}\n\nContext:\n${contextNote}\n\nIMPORTANT: Also return memory_candidates as JSON array with type, key, value, and confidence_score for any user traits, preferences, constraints, or future plans you detect.`,
      },
    ],
  }),
});

// After getting response, extract memory candidates
const data = await resp.json();
const text = data.choices?.[0]?.message?.content ?? "I'm not sure yet. Ask me again?";

// NEW: Extract memory candidates from response
const memoryCandidates = extractMemoryCandidates(text);
if (memoryCandidates.length > 0) {
  await saveMemoryCandidates(userId, memoryCandidates);
}

// Add these helper functions
function extractMemoryCandidates(text) {
  const candidates = [];
  
  // Look for memory_candidates JSON in response
  const jsonMatch = text.match(/memory_candidates[:\s]*\[(.*?)\]/s);
  if (jsonMatch) {
    try {
      const candidatesText = `[${jsonMatch[1]}]`;
      const parsed = JSON.parse(candidatesText);
      return parsed.filter(c => c.confidence_score >= 0.85);
    } catch (e) {
      console.log('Memory extraction failed:', e);
    }
  }
  
  return candidates;
}

async function saveMemoryCandidates(userId, candidates) {
  if (!userId || !candidates.length) return;
  
  try {
    for (const candidate of candidates) {
      // Redact sensitive data
      const redactedValue = redactPII(candidate.value);
      
      // Skip if redacted or sensitive
      if (redactedValue !== candidate.value || isSensitiveData(candidate.value)) {
        continue;
      }
      
      // Upsert memory
      await supabase
        .from('user_memories')
        .upsert({
          user_id: userId,
          memory_type: candidate.type,
          key: candidate.key,
          value: redactedValue,
          confidence_score: candidate.confidence_score,
          expires_at: getExpiryDate(candidate.type)
        }, {
          onConflict: 'user_id,memory_type,key'
        });
    }
    
    // Update memory summary
    await updateMemorySummary(userId);
  } catch (error) {
    console.error('Memory save failed:', error);
  }
}

function isSensitiveData(value) {
  const sensitivePatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
    /\b\d{9,}\b/, // Long numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/ // Email
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(value));
}

function getExpiryDate(memoryType) {
  const now = new Date();
  const expiryDays = {
    'profile_trait': 365, // 1 year
    'constraint': 180, // 6 months  
    'preference': 90, // 3 months
    'future_plan': 180 // 6 months
  };
  
  const days = expiryDays[memoryType] || 90;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

async function updateMemorySummary(userId) {
  try {
    const { data: memories } = await supabase
      .from('user_memories')
      .select('memory_type, key, value')
      .eq('user_id', userId)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('updated_at', { ascending: false })
      .limit(10);
    
    if (!memories?.length) return;
    
    const summary = generateMemorySummary(memories);
    
    await supabase
      .from('memory_summary')
      .upsert({
        user_id: userId,
        summary_text: summary,
        last_updated: new Date().toISOString()
      });
  } catch (error) {
    console.error('Memory summary update failed:', error);
  }
}

function generateMemorySummary(memories) {
  const traits = memories.filter(m => m.memory_type === 'profile_trait');
  const constraints = memories.filter(m => m.memory_type === 'constraint');
  const preferences = memories.filter(m => m.memory_type === 'preference');
  const futurePlans = memories.filter(m => m.memory_type === 'future_plan');
  
  const parts = [];
  
  if (traits.length) {
    parts.push(`Profile: ${traits.map(t => `${t.key} (${t.value})`).join(', ')}`);
  }
  
  if (constraints.length) {
    parts.push(`Constraints: ${constraints.map(c => `${c.key} (${c.value})`).join(', ')}`);
  }
  
  if (preferences.length) {
    parts.push(`Preferences: ${preferences.map(p => `${p.key} (${p.value})`).join(', ')}`);
  }
  
  if (futurePlans.length) {
    parts.push(`Future plans: ${futurePlans.map(f => `${f.key} (${f.value})`).join(', ')}`);
  }
  
  return parts.join('. ');
}
```

### **Phase 2: Signup Integration** ⏱️ 1-2 hours

#### **Step 2A: Add Memory Seeding to Signup Process**
Update the signup flow to seed memories from collected profile data.

#### **Step 2B: Update Signup Handler**
```javascript
// In app/(auth)/signup.tsx, update the handleSignUp function
const handleSignUp = async () => {
  if (!validateStep3()) return;

  setLoading(true);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: `${firstName} ${lastName}`.trim(),
        age,
        phone_number: phone,
        onboarding_complete: false,
      },
    },
  });

  logger.info("Signup data: ", data);

  if (error) {
    if (error.message.includes("already registered")) {
      setFormError("User with this email already exists. Please login.");
      return;
    }
    return;
  }

  // NEW: Seed memories from signup data
  if (data.user) {
    await seedMemoriesFromSignup(data.user.id, {
      firstName,
      lastName,
      age,
      phone
    });
  }

  // ✅ Save onboarding progress so we can resume if app is closed
  await AsyncStorage.setItem("onboarding_started", "true");

  // ✅ Move to intent screen
  router.replace("/(onboarding)/intent");
};

// Add this new function to signup.tsx
async function seedMemoriesFromSignup(userId, signupData) {
  const memories = [];
  
  // Profile traits from signup
  if (signupData.firstName && signupData.lastName) {
    memories.push({
      memory_type: 'profile_trait',
      key: 'name',
      value: `${signupData.firstName} ${signupData.lastName}`,
      confidence_score: 0.95
    });
  }
  
  if (signupData.age) {
    const ageNum = parseInt(signupData.age);
    if (ageNum >= 18 && ageNum <= 100) {
      // Determine age band
      let ageBand = '';
      if (ageNum >= 18 && ageNum <= 25) ageBand = '18-25';
      else if (ageNum >= 26 && ageNum <= 35) ageBand = '26-35';
      else if (ageNum >= 36 && ageNum <= 45) ageBand = '36-45';
      else if (ageNum >= 46 && ageNum <= 55) ageBand = '46-55';
      else if (ageNum >= 56) ageBand = '56+';
      
      memories.push({
        memory_type: 'profile_trait',
        key: 'age_band',
        value: ageBand,
        confidence_score: 0.95
      });
    }
  }
  
  // Save memories
  if (memories.length > 0) {
    try {
      await supabase
        .from('user_memories')
        .insert(memories.map(m => ({
          ...m,
          user_id: userId,
          expires_at: getExpiryDate(m.memory_type)
        })));
      
      // Update memory summary
      await updateMemorySummary(userId);
      
      logger.info(`✅ Seeded ${memories.length} memories from signup`);
    } catch (error) {
      logger.error('Memory seeding failed:', error);
    }
  }
}
```

#### **Step 2C: Add Memory Seeding to Intent Screen**
```javascript
// In app/(onboarding)/intent.tsx, update the handleContinue function
const handleContinue = async () => {
  if (selected.length === 0) return;

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      logger.info("Error - Could not get user in the intent screen.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        intents: selected,
      },
    });

    if (updateError) {
      logger.info(
        "Error - Could not save your intents in the intent screen."
      );
      return;
    }

    // NEW: Seed memories from intent selections
    await seedMemoriesFromIntent(user.id, selected);

    // Navigate to account connection with including selected intents in user metadata
    router.replace("/(onboarding)/accountconnection");
  } catch (err) {
    logger.error("Intent update failed:", err);
    Alert.alert("Something went wrong. Try again.");
  }
};

// Add this new function to intent.tsx
async function seedMemoriesFromIntent(userId, selectedIntents) {
  const memories = [];
  
  // Map intent selections to memories
  const intentMappings = {
    'behind': { type: 'preference', key: 'financial_goal', value: 'get_back_on_track' },
    'save': { type: 'preference', key: 'financial_goal', value: 'build_wealth' },
    'overview': { type: 'preference', key: 'financial_goal', value: 'see_everything' },
    'invest': { type: 'preference', key: 'financial_goal', value: 'learn_investing' },
    'curious': { type: 'preference', key: 'financial_goal', value: 'explore_possibilities' }
  };
  
  selectedIntents.forEach(intent => {
    const mapping = intentMappings[intent];
    if (mapping) {
      memories.push({
        memory_type: mapping.type,
        key: mapping.key,
        value: mapping.value,
        confidence_score: 0.9
      });
    }
  });
  
  // Add tone preference based on selections
  if (selectedIntents.includes('behind') || selectedIntents.includes('save')) {
    memories.push({
      memory_type: 'preference',
      key: 'tone',
      value: 'action_oriented',
      confidence_score: 0.85
    });
  } else if (selectedIntents.includes('curious')) {
    memories.push({
      memory_type: 'preference',
      key: 'tone',
      value: 'educational',
      confidence_score: 0.85
    });
  }
  
  // Save memories
  if (memories.length > 0) {
    try {
      await supabase
        .from('user_memories')
        .insert(memories.map(m => ({
          ...m,
          user_id: userId,
          expires_at: getExpiryDate(m.memory_type)
        })));
      
      // Update memory summary
      await updateMemorySummary(userId);
      
      logger.info(`✅ Seeded ${memories.length} memories from intent`);
    } catch (error) {
      logger.error('Intent memory seeding failed:', error);
    }
  }
}

// Add these helper functions to both signup.tsx and intent.tsx
function getExpiryDate(memoryType) {
  const now = new Date();
  const expiryDays = {
    'profile_trait': 365, // 1 year
    'constraint': 180, // 6 months  
    'preference': 90, // 3 months
    'future_plan': 180 // 6 months
  };
  
  const days = expiryDays[memoryType] || 90;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

async function updateMemorySummary(userId) {
  try {
    const { data: memories } = await supabase
      .from('user_memories')
      .select('memory_type, key, value')
      .eq('user_id', userId)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('updated_at', { ascending: false })
      .limit(10);
    
    if (!memories?.length) return;
    
    const summary = generateMemorySummary(memories);
    
    await supabase
      .from('memory_summary')
      .upsert({
        user_id: userId,
        summary_text: summary,
        last_updated: new Date().toISOString()
      });
  } catch (error) {
    console.error('Memory summary update failed:', error);
  }
}

function generateMemorySummary(memories) {
  const traits = memories.filter(m => m.memory_type === 'profile_trait');
  const constraints = memories.filter(m => m.memory_type === 'constraint');
  const preferences = memories.filter(m => m.memory_type === 'preference');
  const futurePlans = memories.filter(m => m.memory_type === 'future_plan');
  
  const parts = [];
  
  if (traits.length) {
    parts.push(`Profile: ${traits.map(t => `${t.key} (${t.value})`).join(', ')}`);
  }
  
  if (constraints.length) {
    parts.push(`Constraints: ${constraints.map(c => `${c.key} (${c.value})`).join(', ')}`);
  }
  
  if (preferences.length) {
    parts.push(`Preferences: ${preferences.map(p => `${p.key} (${p.value})`).join(', ')}`);
  }
  
  if (futurePlans.length) {
    parts.push(`Future plans: ${futurePlans.map(f => `${f.key} (${f.value})`).join(', ')}`);
  }
  
  return parts.join('. ');
}
```

### **Phase 3: Optimization** ⏱️ 1 hour

#### **Step 3A: Add Memory Limits**
```javascript
// Add to saveMemoryCandidates function
async function saveMemoryCandidates(userId, candidates) {
  // ... existing code ...
  
  // NEW: Enforce memory limits
  await enforceMemoryLimits(userId);
}

async function enforceMemoryLimits(userId) {
  const MAX_MEMORIES = 50;
  
  const { data: memories } = await supabase
    .from('user_memories')
    .select('id, confidence_score, created_at')
    .eq('user_id', userId)
    .order('confidence_score', { ascending: true })
    .order('created_at', { ascending: true });
  
  if (memories && memories.length > MAX_MEMORIES) {
    const toDelete = memories.slice(0, memories.length - MAX_MEMORIES);
    const idsToDelete = toDelete.map(m => m.id);
    
    await supabase
      .from('user_memories')
      .delete()
      .in('id', idsToDelete);
  }
}
```

#### **Step 3B: Add Nightly Cleanup Job**
```javascript
// Create api/cleanup-memories.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Delete expired memories
    const { error: deleteError } = await supabase
      .from('user_memories')
      .delete()
      .lt('expires_at', new Date().toISOString());
    
    if (deleteError) throw deleteError;
    
    // Regenerate summaries for users with expired memories
    const { data: affectedUsers } = await supabase
      .from('user_memories')
      .select('user_id')
      .lt('expires_at', new Date().toISOString())
      .limit(100);
    
    if (affectedUsers) {
      const uniqueUsers = [...new Set(affectedUsers.map(u => u.user_id))];
      for (const userId of uniqueUsers) {
        await updateMemorySummary(userId);
      }
    }
    
    res.json({ success: true, cleaned: affectedUsers?.length || 0 });
  } catch (error) {
    console.error('Memory cleanup failed:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
}
```

---

## **Testing Strategy**

### **Test Cases**
1. **Signup Flow**: Intent selections → Memory creation → First conversation personalization
2. **Memory Extraction**: User mentions preferences → Memory saved → Next conversation reflects it
3. **Memory Limits**: 50+ memories → Oldest/lowest confidence evicted
4. **Sensitive Data**: SSN/credit card mentioned → Redacted/not saved
5. **Expiry**: Old memories → Automatically cleaned up

### **Success Metrics**
- ✅ First conversation feels personalized
- ✅ No latency increase (< 100ms overhead)
- ✅ Memories persist across sessions
- ✅ User feels "remembered" in follow-up conversations

---

## **Rollout Plan**

### **Day 1**: Database + Core Infrastructure
- Create tables
- Add memory reading to safeContext
- Update system prompt
- Test with manual memory insertion

### **Day 2**: Memory Extraction
- Add dual output to LLM call
- Implement memory extraction and saving
- Test memory creation from conversations

### **Day 3**: Signup Integration
- Seed memories from intent screen
- Test first conversation personalization
- Deploy to staging

### **Day 4**: Optimization
- Add memory limits and cleanup
- Deploy to production
- Monitor memory creation and usage

---

## **Future Enhancements**

### **Phase 4: Advanced Memory (Post-Launch)**
- **Memory Categories**: Add subcategories for better organization
- **Memory Confidence**: Learn from user feedback to improve confidence scores
- **Memory Sharing**: Allow users to see and edit their memories
- **Memory Analytics**: Track which memories are most useful

### **Phase 5: RAG Integration**
- **Conversation Memory**: Store and retrieve past conversations
- **Semantic Search**: Find relevant past discussions
- **Context Compression**: Summarize long conversation histories

---

## **Files to Modify**

### **New Files**
- `api/cleanup-memories.js` - Nightly cleanup job
- `USER_MEMORY_IMPLEMENTATION.md` - This documentation

### **Modified Files**
- `api/finny.js` - Add memory reading, extraction, and saving
- `app/(auth)/signup.tsx` - Add memory seeding from profile data
- `app/(onboarding)/intent.tsx` - Add memory seeding from intent selections
- Database schema - Add new tables

### **Dependencies**
- No new dependencies required
- Uses existing Supabase client
- Leverages existing redactPII function

---

## **Success Criteria**

### **Technical**
- [ ] Memory system adds < 100ms latency
- [ ] 95%+ memory extraction accuracy
- [ ] Zero sensitive data stored
- [ ] Memory limits enforced

### **User Experience**
- [ ] First conversation feels personalized
- [ ] User preferences remembered across sessions
- [ ] No UX interruption or toasts
- [ ] Feels like talking to someone who knows you

### **Business**
- [ ] Increased user engagement
- [ ] Higher conversation completion rates
- [ ] Better user satisfaction scores
- [ ] Foundation for RAG implementation

---

**Ready to ship memory and make Finny feel alive! 🚀**
