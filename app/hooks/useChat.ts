import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, Goal } from '../types/finny';
import finnyConstants from '../constants/finny';

export const useChat = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(finnyConstants.INITIAL_CHAT_MESSAGES);
  const [isTyping, setIsTyping] = useState(false);
  const [showNudges, setShowNudges] = useState(true);

  useEffect(() => {
    loadChatMessages();
  }, []);

  useEffect(() => {
    setShowNudges(chatMessages.length <= 1);
    saveChatMessages();
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
      console.error("Error loading chat messages:", error);
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      setShowNudges(true);
    }
  };

  const saveChatMessages = async () => {
    try {
      await AsyncStorage.setItem("chatMessages", JSON.stringify(chatMessages));
    } catch (error) {
      console.error("Error saving chat messages:", error);
    }
  };

  const clearChat = async () => {
    try {
      await AsyncStorage.removeItem("chatMessages");
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      console.log("Chat cleared and storage reset");
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  };

  const pushChat = (sender: "user" | "finny", text: string) => {
    const msg: ChatMessage = {
      id: `${sender}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender,
      text,
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, msg]);
  };

  const pushChatWithDelay = async (sender: "user" | "finny", messages: string[]) => {
    try {
      for (let i = 0; i < messages.length; i++) {
        if (sender === "finny") {
          setIsTyping(true);
          await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
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

      // Prepare complete financial context
      const financialContext = {
        accounts: parsed.accounts?.map((acc: any) => ({
          name: acc.name,
          type: acc.type,
          subtype: acc.subtype,
          balance: acc.balances.current,
          available: acc.balances.available,
          limit: acc.balances.limit,
          currency: acc.balances.iso_currency_code,
          institution: acc.institution_name
        })) || [],
        investments: parsed.investments?.map((inv: any) => ({
          name: inv.name,
          type: inv.type,
          balance: inv.balances.current,
          holdings: inv.holdings?.map((h: any) => ({
            name: h.name,
            quantity: h.quantity,
            value: h.institution_value,
            cost_basis: h.cost_basis,
            currency: h.iso_currency_code
          })) || []
        })) || [],
        liabilities: parsed.liabilities?.map((liab: any) => ({
          name: liab.name,
          type: liab.type,
          balance: liab.balances.current,
          limit: liab.balances.limit,
          apr: liab.apr,
          interest_rate: liab.interest_rate,
          minimum_payment: liab.minimum_payment_amount
        })) || [],
        transactions: parsed.transactions?.map((txn: any) => ({
          date: txn.date,
          amount: txn.amount,
          category: txn.category,
          merchant: txn.merchant_name,
          description: txn.name,
          account: txn.account_name
        })) || [],
        goals: goals.map((goal: any) => ({
          label: goal.label,
          target: goal.target,
          progress: goal.progress,
          timeline: goal.timeline,
          description: goal.description
        })),
        summary: {
          netWorth: parsed.netWorth || 0,
          monthlyIncome: parsed.monthlyIncome || 0,
          monthlyExpenses: parsed.monthlyExpenses || 0,
          totalAssets: parsed.accounts?.reduce((sum: number, acc: any) => 
            sum + (acc.balances.current || 0), 0) || 0,
          totalLiabilities: parsed.liabilities?.reduce((sum: number, liab: any) => 
            sum + (liab.balances.current || 0), 0) || 0,
          totalInvestments: parsed.investments?.reduce((sum: number, inv: any) => 
            sum + (inv.balances.current || 0), 0) || 0
        }
      };

      console.log("Sending request to Finny API with complete context...");
      const res = await fetch(`${BASE_URL}/api/finny/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          context: financialContext
        }),
      });

      console.log("Response:", res.status);
      const data = await res.json();
      console.log("Finny response:", data.nudges);
      
      const messages = data.nudges?.join("\n\n") || "Sorry, I wasn't able to generate advice just now.";
      const splitMessages = splitIntoMessages(messages);
      await pushChatWithDelay("finny", splitMessages);
    } catch (error) {
      console.error("AI error:", error);
      pushChat("finny", "Something went wrong. Try again later.");
    }
  };

  const splitIntoMessages = (text: string): string[] => {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const messages: string[] = [];
    let currentMessage = "";

    for (const sentence of sentences) {
      if (currentMessage && currentMessage.length + sentence.length > 250) {
        messages.push(currentMessage.trim());
        currentMessage = sentence;
      } else {
        currentMessage = currentMessage ? `${currentMessage} ${sentence}` : sentence;
      }
    }

    if (currentMessage) {
      messages.push(currentMessage.trim());
    }

    return messages;
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
export default useChat; 