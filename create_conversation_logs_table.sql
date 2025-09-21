-- Create conversation_logs table for storing Finny conversations
CREATE TABLE public.conversation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_message text NOT NULL,
  finny_response text NOT NULL,
  timestamp timestamptz NOT NULL,
  intent text,
  entities jsonb DEFAULT '[]'::jsonb,
  confidence numeric DEFAULT 0.0,
  response_time_ms integer DEFAULT 0,
  sources_used jsonb DEFAULT '[]'::jsonb,
  cached boolean DEFAULT false,
  enhanced_data boolean DEFAULT false,
  market_data boolean DEFAULT false,
  web_research boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_conversation_logs_user_id ON public.conversation_logs(user_id);
CREATE INDEX idx_conversation_logs_timestamp ON public.conversation_logs(timestamp DESC);
CREATE INDEX idx_conversation_logs_intent ON public.conversation_logs(intent);

-- Enable RLS (Row Level Security)
ALTER TABLE public.conversation_logs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to only see their own conversations
CREATE POLICY "Users can view their own conversations" ON public.conversation_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow service role to insert conversations
CREATE POLICY "Service role can insert conversations" ON public.conversation_logs
  FOR INSERT WITH CHECK (true);
