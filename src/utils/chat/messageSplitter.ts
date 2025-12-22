/**
 * Smart message splitter for chat responses
 * 
 * Detects good split points during streaming to create 3-4 balanced chunks
 * at natural boundaries (paragraph breaks, then sentence breaks)
 * Intelligently detects list blocks and avoids splitting within them
 */

/**
 * Detects list blocks by looking for repetitive structural patterns
 * (not keyword matching - detects structure, not symbols)
 * 
 * A list block is defined as 2+ consecutive lines that start with:
 * - Numbered markers (1. 2. 3.) or bullet markers (-, *, •)
 * - Indented continuations (2+ spaces) following a list marker
 * 
 * @param text - Text to analyze
 * @param startPos - Starting position in full text (for absolute positioning)
 * @returns Array of {start, end} positions for list blocks (absolute positions)
 */
function detectListBlocks(text: string, startPos: number = 0): Array<{start: number, end: number}> {
  const blocks: Array<{start: number, end: number}> = [];
  const lines = text.split('\n');
  let currentListStart: number | null = null;
  let listLineCount = 0;
  let currentPos = startPos;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isLastLine = i === lines.length - 1;
    
    // Calculate line boundaries in original text
    // Note: split('\n') removes newlines, so we need to account for them
    const lineStart = currentPos;
    const lineEnd = currentPos + line.length;

    // Detect list markers at line start (after any leading whitespace)
    const leadingWhitespace = line.length - trimmed.length;
    
    // Pattern 1: Numbered lists (1. 2. 3. etc) - must be at start of trimmed line
    const numberedPattern = /^\d+[.)]\s+/;
    // Pattern 2: Bullet markers (-, *, •) - must be at start of trimmed line, followed by space
    const bulletPattern = /^[-*•]\s+/;
    // Pattern 3: Indented content (2+ spaces) that looks like continuation of list item
    const isIndented = leadingWhitespace >= 2 && trimmed.length > 0;
    
    const isListLine = numberedPattern.test(trimmed) || bulletPattern.test(trimmed);
    
    // Check if this continues a list (indented after a list marker, or another list line)
    const continuesList = currentListStart !== null && (isIndented || isListLine);

    if (isListLine) {
      // Start or continue a list
      if (currentListStart === null) {
        currentListStart = lineStart;
        listLineCount = 1;
      } else {
        listLineCount++;
      }
    } else if (continuesList && trimmed.length > 0) {
      // Indented continuation of list item (multi-line list item)
      listLineCount++;
    } else {
      // Not a list line - check if we should close current list
      if (currentListStart !== null && listLineCount >= 2) {
        // We had a valid list (2+ items), close it
        // End at the start of this non-list line (before the newline that precedes it)
        // For last line, include the entire line; otherwise, end before the newline
        const blockEnd = isLastLine ? lineEnd : lineStart;
        blocks.push({
          start: currentListStart,
          end: blockEnd
        });
      }
      currentListStart = null;
      listLineCount = 0;
    }

    // Move position forward to next line start
    // Account for the newline character (except for last line if text doesn't end with \n)
    if (!isLastLine) {
      currentPos = lineEnd + 1; // +1 for the \n that was removed by split()
    } else {
      // Last line: if text ends with \n, the split would have given us an empty string
      // Otherwise, just end at the line end
      currentPos = lineEnd;
    }
  }

  // Close any remaining list at end of text
  if (currentListStart !== null && listLineCount >= 2) {
    blocks.push({
      start: currentListStart,
      end: currentPos
    });
  }

  return blocks;
}

/**
 * Checks if a position is inside any list block
 */
function isInsideListBlock(position: number, listBlocks: Array<{start: number, end: number}>): boolean {
  return listBlocks.some(block => position >= block.start && position < block.end);
}

/**
 * Finds the end of the list block containing this position, or returns position if not in a list
 */
function findListBlockEnd(position: number, listBlocks: Array<{start: number, end: number}>): number {
  const block = listBlocks.find(b => position >= b.start && position < b.end);
  return block ? block.end : position;
}

/**
 * Finds the best split point in text that has accumulated so far
 * Respects list boundaries - never splits inside a list block
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

  // Detect list blocks in the unprocessed text (with absolute positions)
  const listBlocks = detectListBlocks(unprocessedText, processedLength);
  const currentPos = processedLength;

  // Strategy 1: If we're currently inside a list, wait until it ends
  // This ensures we never split mid-list, even if there's a paragraph break
  if (isInsideListBlock(currentPos, listBlocks)) {
    const listEnd = findListBlockEnd(currentPos, listBlocks);
    // Only split after list if we have enough content (with some flexibility)
    if (listEnd - processedLength >= minChunkSize - 100) {
      return listEnd;
    }
    // Otherwise, don't split yet - wait for more content
    return -1;
  }

  // Strategy 2: Try splitting at paragraph boundaries (\n\n)
  // Paragraph breaks are natural split points, but we must ensure they're not inside lists
  const doubleNewlineIndex = unprocessedText.lastIndexOf('\n\n');
  if (doubleNewlineIndex >= minChunkSize - 100 && doubleNewlineIndex >= 300) {
    const splitPos = processedLength + doubleNewlineIndex + 2; // Include the \n\n
    
    // Check if this paragraph break is inside a list block
    // (This can happen if a list has blank lines between items, breaking the list detection)
    if (isInsideListBlock(splitPos, listBlocks)) {
      // Split point is inside a list - find the end of that list instead
      const listEnd = findListBlockEnd(splitPos, listBlocks);
      if (listEnd - processedLength >= minChunkSize - 100) {
        return listEnd;
      }
    } else {
      // Safe to split at paragraph break - not inside any list
      return splitPos;
    }
  }

  // Strategy 3: Look for sentence boundaries (but not inside lists)
  // This is a fallback when there are no paragraph breaks
  const sentenceEndRegex = /[.!?]\s+/g;
  let bestMatch = -1;
  let match;
  
  // Find sentence endings in a reasonable range (prefer middle-to-end of chunk)
  while ((match = sentenceEndRegex.exec(unprocessedText)) !== null) {
    const matchPos = match.index + match[0].length;
    const absolutePos = processedLength + matchPos;
    
    // Skip if inside a list block
    if (isInsideListBlock(absolutePos, listBlocks)) {
      continue;
    }
    
    // Prefer matches that are at least minChunkSize away, but not too far
    // This ensures we don't split too early or too late
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

