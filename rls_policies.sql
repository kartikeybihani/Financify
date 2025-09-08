-- Row Level Security (RLS) Policies for Financify
-- Execute these commands in your Supabase SQL editor

-- Enable RLS on all tables
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

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

-- recurring_streams policies
CREATE POLICY "Users can view their own recurring streams" ON public.recurring_streams
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recurring streams" ON public.recurring_streams
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring streams" ON public.recurring_streams
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring streams" ON public.recurring_streams
  FOR DELETE USING (auth.uid() = user_id);

-- goals policies
CREATE POLICY "Users can view their own goals" ON public.goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own goals" ON public.goals
  FOR INSERT WITH CHECK (
    auth.uid() = user_id 
    AND target_date > CURRENT_DATE -- Ensure target date is in the future
  );

CREATE POLICY "Users can update their own goals" ON public.goals
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (target_date > CURRENT_DATE OR status = 'completed') -- Allow past dates only for completed goals
  );

CREATE POLICY "Users can delete their own goals" ON public.goals
  FOR DELETE USING (auth.uid() = user_id);
