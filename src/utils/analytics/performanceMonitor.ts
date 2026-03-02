// utils/performanceMonitor.ts

import logger from "@/src/utils/core/logger";

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private enabled: boolean = true;

  /**
   * Start tracking a performance metric
   */
  start(name: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata,
    };

    this.metrics.set(name, metric);
    logger.info(`⏱️ [PERF] Started: ${name}`, metadata);
  }

  /**
   * End tracking a performance metric
   */
  end(name: string, metadata?: Record<string, any>): number | undefined {
    if (!this.enabled) return undefined;

    const metric = this.metrics.get(name);
    if (!metric) {
      logger.warn(`⏱️ [PERF] No metric found for: ${name}`);
      return undefined;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    metric.endTime = endTime;
    metric.duration = duration;
    metric.metadata = { ...metric.metadata, ...metadata };

    logger.info(`✅ [PERF] Completed: ${name} (${duration.toFixed(2)}ms)`, metadata);
    
    return duration;
  }

  /**
   * Measure a function's execution time
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    this.start(name, metadata);
    try {
      const result = await fn();
      this.end(name, { success: true });
      return result;
    } catch (error) {
      this.end(name, { success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get a specific metric
   */
  getMetric(name: string): PerformanceMetric | undefined {
    return this.metrics.get(name);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get summary of all metrics
   */
  getSummary(): string {
    const metrics = this.getMetrics();
    if (metrics.length === 0) return "No metrics recorded";

    return metrics
      .map((m) => {
        const duration = m.duration?.toFixed(2) || "N/A";
        return `${m.name}: ${duration}ms`;
      })
      .join("\n");
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Convenience functions
export const startPerf = (name: string, metadata?: Record<string, any>) =>
  performanceMonitor.start(name, metadata);

export const endPerf = (name: string, metadata?: Record<string, any>) =>
  performanceMonitor.end(name, metadata);

export const measurePerf = async <T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
) => performanceMonitor.measure(name, fn, metadata);

export default performanceMonitor;



