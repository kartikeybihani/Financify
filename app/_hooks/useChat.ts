import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, Goal } from '../_types/finny';
import finnyConstants from '../_constants/finny';
import logger from '../_utils/logger';

// Utility to split messages for chat display
function splitIntoMessages(text: string): string[] {
  // If there are numbered points, group them together
  const numberedPointRegex = /\n?\d+\.\s/;
  if (numberedPointRegex.test(text)) {
    // Find where the first numbered point starts
    const match = text.match(/\n?\d+\.\s/);
    if (match) {
      const idx = text.indexOf(match[0]);
      const intro = text.slice(0, idx).trim();
      const points = text.slice(idx).trim();
      const result: string[] = [];
      if (intro) result.push(intro);
      if (points) result.push(points);
      return result;
    }
  }
  // Otherwise, split by paragraphs (double newlines)
  return text
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

export const useChat = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(finnyConstants.INITIAL_CHAT_MESSAGES);
  const [isTyping, setIsTyping] = useState(false);
  const [showNudges, setShowNudges] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadChatMessages();
  }, []);

  useEffect(() => {
    setShowNudges(chatMessages.length <= 1);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveChatMessages();
    }, 300);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [chatMessages]);

  const loadChatMessages = async () => {
    try {
      const savedMessages = await AsyncStorage.getItem("chatMessages");
      if (savedMessages) {
        const parsedMessages = JSON.parse(savedMessages);
        if (parsedMessages.length > 1) {
          setChatMessages(parsedMessages);
          setShowNudges(false);
        } else {
          setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
          setShowNudges(true);
        }
      }
    } catch (error) {
      logger.error("Error loading chat messages:", error);
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      setShowNudges(true);
    }
  };

  const saveChatMessages = async () => {
    try {
      await AsyncStorage.setItem("chatMessages", JSON.stringify(chatMessages));
    } catch (error) {
      logger.error("Error saving chat messages:", error);
    }
  };

  const clearChat = async () => {
    try {
      await AsyncStorage.removeItem("chatMessages");
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      // Chat cleared and storage reset
    } catch (error) {
      logger.error("Error clearing chat:", error);
    }
  };

  const pushChat = (
    senderOrMsg: "user" | "finny" | ChatMessage,
    text?: string,
    fullMsg?: ChatMessage
  ) => {
    let msg: ChatMessage;
    if (typeof senderOrMsg === "object") {
      msg = senderOrMsg;
    } else if (fullMsg) {
      msg = fullMsg;
    } else {
      msg = {
        id: `${senderOrMsg}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: senderOrMsg,
        text: text || "",
        timestamp: Date.now(),
      };
    }
    // Console logging for chat messages
    if (msg.sender === "user") {
      logger.info(`User: ${msg.text}`);
    } else if (msg.sender === "finny") {
      logger.info(`Finny: [${msg.text}]`);
    }
    setChatMessages((prev) => [...prev, msg]);
  };

  const pushChatWithDelay = async (sender: "user" | "finny", messages: string[]) => {
    try {
      for (let i = 0; i < messages.length; i++) {
        if (sender === "finny") {
          setIsTyping(true);
          await new Promise<void>((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
        }

        pushChat(sender, messages[i]);

        if (i === messages.length - 1) {
          setIsTyping(false);
        }
      }
    } finally {
      setIsTyping(false); // Ensure typing is turned off even if there's an error
    }
  };

  const handleUserMessage = async (messageText: string) => {
    setIsTyping(true); // Start typing indicator immediately
    await handleFinnyResponse(messageText);
    setIsTyping(false); // Stop typing indicator after response
  };

  const handleFinnyResponse = async (messageText: string) => {
    const BASE_URL = "https://financify-rose.vercel.app";
    try {
      // Get all financial data from storage
      const [stored, savedGoals] = await Promise.all([
        AsyncStorage.getItem("financialData"),
        AsyncStorage.getItem("goals")
      ]);
      
      const parsed = JSON.parse(stored || "{}");
      const goals = JSON.parse(savedGoals || "[]");

      // Prepare complete financial context with safe defaults
      const financialContext = {
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts.map((acc: any) => ({
          name: acc.name || 'Unknown Account',
          type: acc.type || 'unknown',
          subtype: acc.subtype || 'unknown',
          balance: acc.balances?.current || 0,
          available: acc.balances?.available || 0,
          limit: acc.balances?.limit || 0,
          currency: acc.balances?.iso_currency_code || 'USD',
          institution: acc.institution_name || 'Unknown Institution'
        })) : [],
        investments: Array.isArray(parsed.investments?.holdings) ? parsed.investments.holdings.map((h: any) => ({
          name: h.name || 'Unknown Investment',
          type: h.type || 'unknown',
          balance: h.institution_value || 0,
          quantity: h.quantity || 0,
          value: h.institution_value || 0,
          cost_basis: h.cost_basis || 0,
          currency: h.iso_currency_code || 'USD'
        })) : [],
        liabilities: Array.isArray(parsed.liabilities) ? parsed.liabilities.map((liab: any) => ({
          name: liab.name || 'Unknown Liability',
          type: liab.type || 'unknown',
          balance: liab.balances?.current || 0,
          limit: liab.balances?.limit || 0,
          apr: liab.apr || 0,
          interest_rate: liab.interest_rate || 0,
          minimum_payment: liab.minimum_payment_amount || 0
        })) : [],
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions.map((txn: any) => ({
          date: txn.date || new Date().toISOString(),
          amount: txn.amount || 0,
          category: Array.isArray(txn.category) ? txn.category : ['uncategorized'],
          merchant: txn.merchant_name || '',
          description: txn.name || 'Unknown Transaction',
          account: txn.account_name || 'Unknown Account'
        })) : [],
        goals: Array.isArray(goals) ? goals.map((goal: any) => ({
          label: goal.label || 'Unnamed Goal',
          target: goal.target || 0,
          progress: goal.progress || 0,
          timeline: goal.timeline || { month: 'Unknown', year: new Date().getFullYear() },
          description: goal.description || ''
        })) : [],
        summary: {
          netWorth: parsed.netWorth || 0,
          monthlyIncome: parsed.monthlyIncome || 0,
          monthlyExpenses: parsed.monthlyExpenses || 0,
          totalAssets: Array.isArray(parsed.accounts) ? parsed.accounts.reduce((sum: number, acc: any) => 
            sum + (acc.balances?.current || 0), 0) : 0,
          totalLiabilities: Array.isArray(parsed.liabilities) ? parsed.liabilities.reduce((sum: number, liab: any) => 
            sum + (liab.balances?.current || 0), 0) : 0,
          totalInvestments: Array.isArray(parsed.investments?.holdings) ? parsed.investments.holdings.reduce((sum: number, inv: any) => 
            sum + (inv.institution_value || 0), 0) : 0
        }
      };

      // Sending request to Finny API with complete context...
      const res = await fetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ask",
          message: messageText,
          context: financialContext
        }),
      });

      // Response status: ${res.status}
      const data = await res.json();
      // Finny response received
      logger.info("🤖 [CHAT] API Response:", data);
      
      const messages = data.message || "Sorry, I wasn't able to generate advice just now.";
      logger.info("messages", messages);
      const splitMessages = splitIntoMessages(messages);
      await pushChatWithDelay("finny", splitMessages);
    } catch (error) {
      logger.error("AI error:", error);
      pushChat("finny", "Something went wrong. Try again later.");
    }
  };

  return {
    chatMessages,
    isTyping,
    showNudges,
    clearChat,
    pushChat,
    pushChatWithDelay,
    handleUserMessage,
  };
};

// Export both as named and default export for compatibility
export { splitIntoMessages };
export default useChat;  