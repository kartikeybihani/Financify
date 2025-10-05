// Helper functions for working with recurring transactions
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

// Get recurring stream details for a transaction
export const getRecurringStreamDetails = async (streamId: string) => {
  const { data, error } = await supabase
    .from('recurring_streams')
    .select('*')
    .eq('stream_id', streamId)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching recurring stream details:', error);
    return null;
  }

  return data;
};

// Check if a transaction is recurring and get its stream details
export const isTransactionRecurring = async (transactionId: string) => {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      recurring_stream_id,
      recurring_streams (
        stream_id,
        stream_type,
        frequency,
        merchant_name,
        description
      )
    `)
    .eq('id', transactionId)
    .single();

  if (error || !data?.recurring_stream_id) {
    return null;
  }

  return {
    isRecurring: true,
    streamId: data.recurring_stream_id,
    streamType: data.recurring_streams?.[0]?.stream_type,
    frequency: data.recurring_streams?.[0]?.frequency,
    merchantName: data.recurring_streams?.[0]?.merchant_name,
    description: data.recurring_streams?.[0]?.description,
  };
};

// Get all recurring transactions for a user
export const getRecurringTransactions = async (userId: string) => {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      recurring_streams (
        stream_id,
        stream_type,
        frequency,
        merchant_name,
        description,
        average_amount
      )
    `)
    .eq('user_id', userId)
    .not('recurring_stream_id', 'is', null)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching recurring transactions:', error);
    return [];
  }

  return data;
};

// Get recurring transactions grouped by stream
export const getRecurringTransactionsByStream = async (userId: string) => {
  const { data, error } = await supabase
    .from('recurring_streams')
    .select(`
      *,
      transactions (
        id,
        date,
        amount,
        name,
        merchant_name
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching recurring streams with transactions:', error);
    return [];
  }

  return data;
};

// Format recurring frequency for display
export const formatRecurringFrequency = (frequency: string): string => {
  switch (frequency?.toUpperCase()) {
    case 'MONTHLY':
      return 'Monthly';
    case 'WEEKLY':
      return 'Weekly';
    case 'DAILY':
      return 'Daily';
    case 'YEARLY':
      return 'Yearly';
    case 'BIWEEKLY':
      return 'Bi-weekly';
    case 'SEMIMONTHLY':
      return 'Semi-monthly';
    default:
      return frequency || 'Unknown';
  }
};

// Format recurring stream type for display
export const formatRecurringStreamType = (streamType: string): string => {
  switch (streamType) {
    case 'subscription':
      return 'Subscription';
    case 'income':
      return 'Income';
    case 'bill':
      return 'Bill';
    case 'other':
      return 'Other';
    default:
      return streamType || 'Unknown';
  }
};
