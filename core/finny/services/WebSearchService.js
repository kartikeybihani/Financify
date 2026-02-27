// core/finny/services/WebSearchService.js

import { braveSearch } from "../../../lib/websearch/brave.js";
import { withTimeout } from "../utils/timeout.js";

export class WebSearchService {
  constructor({
    rateLimits = {
      maxConcurrent: 3,
      delayBetweenRequests: 1000,
      timeout: 10000,
      maxRetries: 2,
    },
  } = {}) {
    this.rateLimits = rateLimits;
    this.requestQueue = [];
    this.activeRequests = 0;
    this.pendingRequests = new Map();
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async search(query, { timeoutMs = 10000, signal } = {}) {
    if (!query || typeof query !== "string") return [];
    const controller = new AbortController();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const promise = braveSearch(query, { signal: controller.signal, timeoutMs });
    return withTimeout(promise, timeoutMs, [], () => controller.abort());
  }

  async runNextQueued() {
    if (this.activeRequests >= this.rateLimits.maxConcurrent) return;
    const next = this.requestQueue.shift();
    if (!next) return;
    this.activeRequests++;
    try {
      const result = await next.task();
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      this.activeRequests--;
      setTimeout(() => this.runNextQueued(), this.rateLimits.delayBetweenRequests);
    }
  }

  enqueueTask(task) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ task, resolve, reject });
      this.runNextQueued();
    });
  }

  async limitedSearch(query) {
    const key = `brave:${query}`;
    if (this.pendingRequests.has(key)) return this.pendingRequests.get(key);

    const job = this.enqueueTask(async () => {
      let lastErr = null;
      for (let attempt = 0; attempt <= this.rateLimits.maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const p = this.search(query, {
            signal: controller.signal,
            timeoutMs: this.rateLimits.timeout,
          });
          const result = await withTimeout(
            p,
            this.rateLimits.timeout,
            null,
            () => controller.abort(),
          );
          if (result === null) throw new Error("webSearch timeout");
          return result;
        } catch (error) {
          lastErr = error;
          if (attempt < this.rateLimits.maxRetries) {
            await this.delay(300 * (attempt + 1));
            continue;
          }
          throw lastErr;
        }
      }
      return [];
    });

    this.pendingRequests.set(key, job);
    try {
      return await job;
    } finally {
      this.pendingRequests.delete(key);
    }
  }
}
