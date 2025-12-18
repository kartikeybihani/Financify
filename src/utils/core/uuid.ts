/**
 * Centralized UUID generation utility
 * Uses expo-crypto for React Native compatibility
 * Falls back to uuid package or simple generator if expo-crypto is unavailable
 */

import * as Crypto from "expo-crypto";
import { v4 as uuidv4 } from "uuid";

/**
 * Generate a UUID v4
 * Uses expo-crypto for React Native compatibility, falls back to uuid package
 * @returns A UUID v4 string
 */
export function generateUUID(): string {
  try {
    // Try expo-crypto first (works in React Native)
    if (Crypto && typeof Crypto.randomUUID === "function") {
      return Crypto.randomUUID();
    }
  } catch (error) {
    // Continue to fallback
  }

  try {
    // Fallback to uuid package (requires react-native-get-random-values polyfill)
    return uuidv4();
  } catch (error) {
    // Final fallback: simple UUID v4-like generator
    // This is a lightweight generator that works everywhere
    const s4 = () =>
      Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    return `${s4()}${s4()}-${s4()}-4${s4().substring(1)}-${((Math.random() * 0x3fff) | 0x8000).toString(16)}-${s4()}${s4()}${s4()}`;
  }
}
