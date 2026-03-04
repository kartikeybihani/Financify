// core/finny/utils/formatting.js
// Extracted from api/finny.js lines 804-829, 4407-4464
// Utilities for redacting PII and cleaning response formatting

/**
 * Redacts personally identifiable information (PII) from text
 * Handles: emails, phone numbers, SSNs, long numbers, addresses
 * @param {string} text - Text to redact
 * @returns {string} Text with PII redacted
 */
export function redactPII(text) {
  if (!text || typeof text !== "string") return text;
  const combined =
    /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-])[A-Za-z0-9.-]*(\.[A-Za-z]{2,})|(?:\+?1[-.\s]?)?(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})|\b\d{3}-\d{2}-(\d{4})\b|\b(\d{8,})\b|\b(\d{2,})\s+([A-Za-z])/g;
  return text.replace(
    combined,
    (match, e1, e2, e3, p1, p2, p3, ssn4, longNum, addrNum, addrChar) => {
      if (e1 !== undefined && e2 !== undefined && e3 !== undefined) {
        return `${e1}*****@${e2}*****${e3}`;
      }
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
        return `***-***-${p3}`;
      }
      if (ssn4 !== undefined) {
        return `***-**-${ssn4}`;
      }
      if (longNum !== undefined) {
        return `****${String(longNum).slice(-4)}`;
      }
      if (addrNum !== undefined && addrChar !== undefined) {
        return `#### ${addrChar}`;
      }
      return match;
    },
  );
}

/**
 * Clean markdown and formatting from responses to ensure chat-friendly format
 * Removes: headers, bold/italic markdown, code blocks, tables, horizontal rules
 * @param {string} response - Response text to clean
 * @returns {string} Cleaned response text
 */
export function cleanResponseFormatting(response) {
  if (!response || typeof response !== "string") {
    return response;
  }

  const insertReadableParagraphBreaks = (text) => {
    const value = String(text || "");
    if (!value) return value;
    if (value.includes("\n")) return value;
    if (value.length < 360) return value;
    if (/^\s*[-*]\s/m.test(value)) return value;

    const sentences = value
      .split(/(?<=[.!?])\s+(?=[A-Z$])/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentences.length < 4) return value;

    const chunks = [];
    for (let index = 0; index < sentences.length; index += 2) {
      chunks.push(sentences.slice(index, index + 2).join(" "));
    }
    return chunks.join("\n\n");
  };

  let cleaned = response;

  // Remove markdown headers (### Header, ## Header, # Header)
  cleaned = cleaned.replace(/^#{1,6}\s*/gm, "");

  // Remove markdown headers with emojis (### 1️⃣ Header)
  cleaned = cleaned.replace(
    /^#{1,6}\s*[\d\w]*[\u{1F300}-\u{1F9FF}]+\s*/gmu,
    "",
  );

  // Remove double underscore bold markdown (__text__) but keep double asterisks for your chat system
  cleaned = cleaned.replace(/__(.*?)__/g, "$1");

  // Remove single underscore italic markdown (_text_) but keep asterisks
  cleaned = cleaned.replace(/_(.*?)_/g, "$1");

  // Remove code blocks (```code``` or `code`)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // Convert markdown tables to plain text format (preserve content, remove table formatting)
  // Process table rows line by line to preserve content
  cleaned = cleaned
    .split("\n")
    .map((line) => {
      // If line contains table separators (|), convert to readable format
      if (line.includes("|") && line.trim().startsWith("|")) {
        // Extract cells from table row
        const cells = line
          .split("|")
          .map((cell) => cell.trim())
          .filter((cell) => cell && !cell.match(/^[-:]+$/)); // Remove separator rows
        if (cells.length > 0) {
          return cells.join(" | ");
        }
      }
      return line;
    })
    .join("\n");

  // Remove horizontal rules (--- or ***)
  cleaned = cleaned.replace(/^[-*]{3,}$/gm, "");

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/[ \t]+$/gm, "");

  cleaned = insertReadableParagraphBreaks(cleaned);

  // Remove standalone hashtags
  cleaned = cleaned.replace(/^#+\s*$/gm, "");

  return cleaned.trim();
}
