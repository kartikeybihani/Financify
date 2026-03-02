// agent.ts
import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// Flux message size limit (characters, not tokens)
const MAX_MESSAGE_SIZE = 5000;

// Initialize the model via OpenRouter
const llm = new ChatOpenAI({
  modelName: "meta-llama/llama-4-scout",
  apiKey: "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",
  maxTokens: 1500, // Reduced for SMS/iMessage - roughly ~1000-1200 chars
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

export default {
  async invoke({ message }: { message: string }) {
    const response = await llm.invoke([
      new SystemMessage(
        "You are Finny, a helpful money coach living in iMessage. " +
        "Keep responses concise and conversational. For complex topics, provide key points rather than exhaustive details. " +
        "Bigger responses should be under 4000 characters to fit within message limits."
      ),
      new HumanMessage(message),
    ]);

    let content = response.content as string;
    
    // Truncate if still too long (safety check)
    if (content.length > MAX_MESSAGE_SIZE) {
      content = content.substring(0, MAX_MESSAGE_SIZE - 50) + "\n\n[Response truncated due to length limit]";
    }

    return content;
  },
};

