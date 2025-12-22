/**
 * Smart message splitter for chat responses
 * 
 * Detects good split points during streaming to create 3-4 balanced chunks
 * at natural boundaries (paragraph breaks, then sentence breaks)
 */

/**
 * Finds the best split point in text that has accumulated so far
 * 
 * @param text - The accumulated text to analyze
 * @param processedLength - Length of text already processed into completed parts
 * @param minChunkSize - Minimum size before we consider splitting (chars)
 * @param maxMessages - Maximum number of message parts allowed
 * @param currentPartCount - Number of parts already created
 * @returns The position to split at, or -1 if we shouldn't split yet
 */
export function findSplitPoint(
  text: string,
  processedLength: number,
  minChunkSize: number = 400,
  maxMessages: number = 4,
  currentPartCount: number = 1
): number {
  // Don't split if we've reached max messages
  if (currentPartCount >= maxMessages) {
    return -1;
  }

  // Only look at the unprocessed portion
  const unprocessedText = text.substring(processedLength);
  const unprocessedLength = unprocessedText.length;

  // Don't split if unprocessed portion is too short
  if (unprocessedLength < minChunkSize) {
    return -1;
  }

  // Prefer splitting at double line breaks (paragraph boundaries)
  // Look for the last double newline in the unprocessed text
  const doubleNewlineIndex = unprocessedText.lastIndexOf('\n\n');
  if (doubleNewlineIndex >= minChunkSize - 100 && doubleNewlineIndex >= 300) {
    // Found a paragraph break at a good position
    return processedLength + doubleNewlineIndex + 2; // Include the \n\n
  }

  // If no paragraph break, look for sentence boundaries
  // Match sentence endings followed by space (., !, ?)
  const sentenceEndRegex = /[.!?]\s+/g;
  let bestMatch = -1;
  let match;
  
  // Find sentence endings in a reasonable range
  while ((match = sentenceEndRegex.exec(unprocessedText)) !== null) {
    const matchPos = match.index + match[0].length;
    // Prefer matches that are at least minChunkSize away, but not too far
    if (matchPos >= minChunkSize - 100 && matchPos <= unprocessedLength - 100) {
      bestMatch = matchPos;
    }
  }

  if (bestMatch >= minChunkSize) {
    return processedLength + bestMatch;
  }

  // No good split point found
  return -1;
}

/**
 * Processes accumulated text and returns completed parts + current streaming part
 * 
 * @param accumulatedText - All text received so far
 * @param completedParts - Array of text strings that are already completed
 * @param maxMessages - Maximum number of parts (3-4)
 * @returns Object with completedParts array and currentStreamingText string
 */
export function processStreamingText(
  accumulatedText: string,
  completedParts: string[],
  maxMessages: number = 4
): { completedParts: string[]; currentStreamingText: string } {
  if (!accumulatedText) {
    return { completedParts, currentStreamingText: '' };
  }

  const processedLength = completedParts.reduce((sum, part) => sum + part.length, 0);
  const remainingText = accumulatedText.substring(processedLength);

  // Check if we should split at this point
  const splitAt = findSplitPoint(
    accumulatedText,
    processedLength,
    400, // min chunk size
    maxMessages,
    completedParts.length
  );

  if (splitAt > processedLength && splitAt <= accumulatedText.length) {
    // We found a good split point
    const newPart = accumulatedText.substring(processedLength, splitAt).trim();
    if (newPart) {
      const updatedCompleted = [...completedParts, newPart];
      const newStreaming = accumulatedText.substring(splitAt);
      return {
        completedParts: updatedCompleted,
        currentStreamingText: newStreaming
      };
    }
  }

  // No split yet, just update streaming text
  return {
    completedParts,
    currentStreamingText: remainingText
  };
}

