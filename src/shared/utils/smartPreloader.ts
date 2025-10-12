import logger from '@/src/utils/logger';

export interface PreloadTask {
  id: string;
  priority: 'high' | 'medium' | 'low';
  execute: () => Promise<any>;
  dependencies?: string[];
  cacheKey?: string;
}

export class SmartPreloader {
  private static tasks = new Map<string, PreloadTask>();
  private static runningTasks = new Set<string>();
  private static completedTasks = new Set<string>();
  private static cache = new Map<string, { data: any; timestamp: number }>();
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Register a preload task
   */
  static registerTask(task: PreloadTask): void {
    this.tasks.set(task.id, task);
    logger.info(`📋 [PRELOADER] Registered task: ${task.id} (priority: ${task.priority})`);
  }

  /**
   * Execute a specific task
   */
  static async executeTask(taskId: string): Promise<any> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`⚠️ [PRELOADER] Task not found: ${taskId}`);
      return null;
    }

    if (this.runningTasks.has(taskId)) {
      logger.info(`⏳ [PRELOADER] Task already running: ${taskId}`);
      return null;
    }

    if (this.completedTasks.has(taskId)) {
      logger.info(`✅ [PRELOADER] Task already completed: ${taskId}`);
      return this.getCachedResult(taskId);
    }

    // Check cache first
    const cached = this.getCachedResult(taskId);
    if (cached) {
      logger.info(`📦 [PRELOADER] Using cached result for: ${taskId}`);
      return cached;
    }

    // Check dependencies
    if (task.dependencies) {
      const unmetDependencies = task.dependencies.filter(dep => !this.completedTasks.has(dep));
      if (unmetDependencies.length > 0) {
        logger.info(`⏸️ [PRELOADER] Waiting for dependencies: ${unmetDependencies.join(', ')}`);
        return null;
      }
    }

    this.runningTasks.add(taskId);
    logger.info(`🚀 [PRELOADER] Executing task: ${taskId}`);

    try {
      const result = await task.execute();
      this.completedTasks.add(taskId);
      this.cacheResult(taskId, result);
      logger.info(`✅ [PRELOADER] Completed task: ${taskId}`);
      return result;
    } catch (error) {
      logger.error(`❌ [PRELOADER] Failed task: ${taskId}`, error);
      return null;
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * Execute tasks by priority
   */
  static async executeByPriority(): Promise<void> {
    const highPriorityTasks = Array.from(this.tasks.values())
      .filter(task => task.priority === 'high' && !this.completedTasks.has(task.id));
    
    const mediumPriorityTasks = Array.from(this.tasks.values())
      .filter(task => task.priority === 'medium' && !this.completedTasks.has(task.id));
    
    const lowPriorityTasks = Array.from(this.tasks.values())
      .filter(task => task.priority === 'low' && !this.completedTasks.has(task.id));

    // Execute high priority tasks first
    await Promise.all(highPriorityTasks.map(task => this.executeTask(task.id)));
    
    // Then medium priority
    await Promise.all(mediumPriorityTasks.map(task => this.executeTask(task.id)));
    
    // Finally low priority
    await Promise.all(lowPriorityTasks.map(task => this.executeTask(task.id)));
  }

  /**
   * Preload data for likely next sections
   */
  static async preloadForSection(currentSection: string): Promise<void> {
    const sectionPreloadMap: Record<string, string[]> = {
      'spending': ['transactions', 'recurring'], // Users often check transactions after spending
      'transactions': ['recurring', 'investments'], // Users might check recurring patterns or investments
      'recurring': ['investments', 'cashflow'], // Users might check investments or cash flow
      'investments': ['cashflow', 'spending'], // Users might check cash flow or spending
      'cashflow': ['spending', 'transactions'], // Users might check spending or transactions
    };

    const tasksToPreload = sectionPreloadMap[currentSection] || [];
    
    logger.info(`🎯 [PRELOADER] Preloading for section: ${currentSection}`, tasksToPreload);
    
    await Promise.all(tasksToPreload.map(taskId => this.executeTask(taskId)));
  }

  /**
   * Get cached result
   */
  private static getCachedResult(taskId: string): any {
    const cached = this.cache.get(taskId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }

  /**
   * Cache result
   */
  private static cacheResult(taskId: string, data: any): void {
    this.cache.set(taskId, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  static clearCache(): void {
    this.cache.clear();
    this.completedTasks.clear();
    logger.info(`🗑️ [PRELOADER] Cleared cache and completed tasks`);
  }

  /**
   * Get preloader status
   */
  static getStatus(): {
    total: number;
    completed: number;
    running: number;
    pending: number;
  } {
    return {
      total: this.tasks.size,
      completed: this.completedTasks.size,
      running: this.runningTasks.size,
      pending: this.tasks.size - this.completedTasks.size - this.runningTasks.size
    };
  }

  /**
   * Reset preloader state
   */
  static reset(): void {
    this.tasks.clear();
    this.runningTasks.clear();
    this.completedTasks.clear();
    this.cache.clear();
    logger.info(`🔄 [PRELOADER] Reset preloader state`);
  }
}

// Default export for Expo Router compatibility
export default SmartPreloader;
