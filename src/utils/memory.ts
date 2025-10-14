// npm i @supermemory/tools ai supermemory
import { supermemoryTools } from "@supermemory/tools/ai-sdk";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Supermemory } from "supermemory";

/**
 * Configuration for Supermemory
 */
interface MemoryConfig {
  supermemoryApiKey: string;
  openaiApiKey: string;
  userId: string;
}

/**
 * Query user memories using Supermemory and AI
 */
export async function queryUserMemory(
  query: string,
  config: MemoryConfig
) {
  const openai = createOpenAI({
    apiKey: config.openaiApiKey,
  });
  
  const result = await generateText({
    model: openai("gpt-5"),
    messages: [
      { 
        role: "user", 
        content: query 
      },
    ],
    tools: {
      ...supermemoryTools("sm_qCVxTPU3rydaSushnrMase_FntVFeCDBNjZgZbIiFdpByXYFthaMEgNfFFeUjZNkbYgmzwCKxNmJxemIyChZGWI", {
        containerTags: [`user_kartik_life`],
      }),
    },
  });

  return result;
}

/**
 * Example: Query user preferences
 */
export async function getUserPreferences(config: MemoryConfig) {
  return queryUserMemory(
    "What do you remember about my preferences?",
    config
  );
}

/**
 * Example: Query financial habits
 */
export async function getFinancialHabits(config: MemoryConfig) {
  return queryUserMemory(
    "What do you know about my spending habits and financial goals?",
    config
  );
}

/**
 * Example: Query conversation history
 */
export async function getConversationContext(
  topic: string,
  config: MemoryConfig
) {
  return queryUserMemory(
    `What have we discussed about ${topic}?`,
    config
  );
}

/**
 * Create Supermemory client instance
 */
export function createSupermemoryClient(apiKey: string) {
  return new Supermemory({
    apiKey,
  });
}

/**
 * Add a memory to Supermemory
 */
export async function addMemory(
  content: string,
  apiKey: string,
  metadata?: Record<string, any>
) {
  const client = createSupermemoryClient(apiKey);
  
  return await client.memories.add({
    content,
    ...metadata,
  });
}

/**
 * Add a user-specific memory
 */
export async function addUserMemory(
  content: string,
  userId: string,
  apiKey: string
) {
  const client = createSupermemoryClient(apiKey);
  
  // Note: Tags are managed via containerTags in the query functions
  return await client.memories.add({
    content: `[user_${userId}] ${content}`,
  });
}

