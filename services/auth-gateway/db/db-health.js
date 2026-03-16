/**
 * Database Health Monitor with Fallback Switchover
 * 
 * Monitors primary Supabase database health and switches to Neon fallback
 * after consecutive failures. Handles queue-based writes during fallback mode.
 * 
 * @module db/db-health
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { env } from '../config/env.js';

// Configuration constants
const HEALTH_CHECK_INTERVAL_MS = 30_000;  // 30 seconds
const FAILURE_THRESHOLD = 3;               // Switch after 3 consecutive failures
const RECOVERY_CHECK_DELAY_MS = 60_000;    // Wait 1 minute before checking recovery
const QUEUE_DRAIN_BATCH_SIZE = 100;        // Process 100 records at a time

/**
 * Database connection states
 */
export const DBState = {
  PRIMARY: 'primary',
  FALLBACK: 'fallback',
  RECOVERING: 'recovering',
};

/**
 * Database Health Manager
 * Extends EventEmitter for state change notifications
 */
class DatabaseHealthManager extends EventEmitter {
  constructor() {
    super();
    
    this.state = DBState.PRIMARY;
    this.consecutiveFailures = 0;
    this.healthCheckTimer = null;
    this.isMonitoring = false;
    
    // Connection pools
    this.primaryPool = null;
    this.fallbackPool = null;
    this.activePool = null;
    
    // Local failover queue (for writes during fallback)
    this.failoverQueue = [];
    this.isDrainingQueue = false;
    
    // Statistics
    this.stats = {
      totalChecks: 0,
      totalFailures: 0,
      totalSwitches: 0,
      lastSwitchAt: null,
      lastRecoveryAt: null,
      queueSize: 0,
    };
  }

  /**
   * Initialize database pools and start health monitoring
   */
  async initialize() {
    console.log('[DB-Health] Initializing database health monitor...');
    
    // Create primary pool (Supabase)
    this.primaryPool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    // Create fallback pool (Neon) if configured
    const fallbackUrl = env.FALLBACK_DATABASE_URL;
    if (fallbackUrl) {
      this.fallbackPool = new Pool({
        connectionString: fallbackUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      });
      console.log('[DB-Health] Fallback pool configured (Neon)');
    } else {
      console.warn('[DB-Health] No FALLBACK_DATABASE_URL configured - fallback disabled');
    }

    // Set active pool to primary initially
    this.activePool = this.primaryPool;

    // Start health monitoring
    this.startMonitoring();
    
    console.log('[DB-Health] Health monitor initialized, state:', this.state);
  }

  /**
   * Start periodic health checks
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    console.log('[DB-Health] Starting health monitoring (interval: 30s)');

    // Initial check
    this.performHealthCheck();

    // Periodic checks
    this.healthCheckTimer = setInterval(
      () => this.performHealthCheck(),
      HEALTH_CHECK_INTERVAL_MS
    );
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform a single health check
   */
  async performHealthCheck() {
    this.stats.totalChecks++;
    
    try {
      const latency = await this.checkDatabaseLatency(this.primaryPool);
      
      if (latency.success) {
        this.handleHealthCheckSuccess(latency.latencyMs);
      } else {
        this.handleHealthCheckFailure('Primary database unreachable');
      }
    } catch (error) {
      console.error('[DB-Health] Health check error:', error.message);
      this.handleHealthCheckFailure(error.message);
    }
  }

  /**
   * Check database latency with a simple query
   */
  async checkDatabaseLatency(pool) {
    const startTime = Date.now();
    
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      const latencyMs = Date.now() - startTime;
      return { success: true, latencyMs };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle successful health check
   */
  async handleHealthCheckSuccess(latencyMs) {
    const wasInFallback = this.state === DBState.FALLBACK;
    
    // Reset failure counter
    this.consecutiveFailures = 0;
    
    // If we were in fallback mode, attempt recovery
    if (wasInFallback) {
      await this.attemptRecovery();
    }
    
    // Log latency if high
    if (latencyMs > 1000) {
      console.warn(`[DB-Health] High latency detected: ${latencyMs}ms`);
    }
  }

  /**
   * Handle failed health check
   */
  async handleHealthCheckFailure(reason) {
    this.consecutiveFailures++;
    this.stats.totalFailures++;
    
    console.error(
      `[DB-Health] Health check failed (${this.consecutiveFailures}/${FAILURE_THRESHOLD}): ${reason}`
    );
    
    // Check if we should switch to fallback
    if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
      await this.switchToFallback();
    }
  }

  /**
   * Switch to fallback database
   */
  async switchToFallback() {
    if (!this.fallbackPool) {
      console.error('[DB-Health] Cannot switch to fallback - no fallback pool configured');
      return;
    }

    if (this.state === DBState.FALLBACK) {
      return; // Already in fallback
    }

    console.warn('[DB-Health] SWITCHING TO FALLBACK DATABASE');
    
    const previousState = this.state;
    this.state = DBState.FALLBACK;
    this.activePool = this.fallbackPool;
    this.stats.totalSwitches++;
    this.stats.lastSwitchAt = new Date().toISOString();
    
    // Emit state change event
    this.emit('stateChange', {
      from: previousState,
      to: DBState.FALLBACK,
      reason: `Primary database failed ${this.consecutiveFailures} consecutive health checks`,
    });
  }

  /**
   * Attempt to recover and switch back to primary
   */
  async attemptRecovery() {
    if (this.state !== DBState.FALLBACK) {
      return;
    }

    console.log('[DB-Health] Attempting recovery to primary database...');
    this.state = DBState.RECOVERING;

    // Wait before attempting recovery
    await new Promise(resolve => setTimeout(resolve, RECOVERY_CHECK_DELAY_MS));

    try {
      const result = await this.checkDatabaseLatency(this.primaryPool);
      
      if (result.success) {
        await this.switchToPrimary();
      } else {
        // Recovery failed, stay in fallback
        this.state = DBState.FALLBACK;
        console.warn('[DB-Health] Recovery failed, staying in fallback mode');
      }
    } catch (error) {
      this.state = DBState.FALLBACK;
      console.error('[DB-Health] Recovery error:', error.message);
    }
  }

  /**
   * Switch back to primary database
   */
  async switchToPrimary() {
    console.log('[DB-Health] SWITCHING BACK TO PRIMARY DATABASE');
    
    const previousState = this.state;
    this.state = DBState.PRIMARY;
    this.activePool = this.primaryPool;
    this.stats.lastRecoveryAt = new Date().toISOString();
    
    // Emit state change event
    this.emit('stateChange', {
      from: previousState,
      to: DBState.PRIMARY,
      reason: 'Primary database recovered',
    });

    // Drain the failover queue
    await this.drainFailoverQueue();
  }

  /**
   * Get the active database pool for reads
   * During fallback, reads go directly to Neon
   */
  getReadPool() {
    return this.activePool;
  }

  /**
   * Get the appropriate pool for writes
   * During fallback, writes go to local queue instead
   */
  async getWritePool() {
    if (this.state === DBState.FALLBACK) {
      // Return null to indicate writes should be queued
      return null;
    }
    return this.activePool;
  }

  /**
   * Queue a write operation during fallback mode
   */
  async queueWrite(operation) {
    if (this.state !== DBState.FALLBACK) {
      throw new Error('queueWrite should only be called during fallback mode');
    }

    this.failoverQueue.push({
      ...operation,
      queuedAt: Date.now(),
    });
    this.stats.queueSize = this.failoverQueue.length;
    
    console.log(
      `[DB-Health] Write queued (queue size: ${this.failoverQueue.length})`
    );
  }

  /**
   * Drain the failover queue back to primary database
   */
  async drainFailoverQueue() {
    if (this.isDrainingQueue || this.failoverQueue.length === 0) {
      return;
    }

    this.isDrainingQueue = true;
    console.log(`[DB-Health] Draining failover queue (${this.failoverQueue.length} items)`);

    let processed = 0;
    let failed = 0;

    while (this.failoverQueue.length > 0) {
      const batch = this.failoverQueue.splice(0, QUEUE_DRAIN_BATCH_SIZE);
      
      for (const operation of batch) {
        try {
          await this.executeQueuedOperation(operation);
          processed++;
        } catch (error) {
          console.error('[DB-Health] Failed to drain queued operation:', error);
          failed++;
          // Re-queue failed operations
          this.failoverQueue.push(operation);
        }
      }
      
      this.stats.queueSize = this.failoverQueue.length;
    }

    this.isDrainingQueue = false;
    
    console.log(
      `[DB-Health] Queue drain complete: ${processed} processed, ${failed} failed`
    );
    
    this.emit('queueDrained', { processed, failed });
  }

  /**
   * Execute a single queued operation
   */
  async executeQueuedOperation(operation) {
    const client = await this.primaryPool.connect();
    
    try {
      await client.query(operation.sql, operation.params);
    } finally {
      client.release();
    }
  }

  /**
   * Get current health status
   */
  getStatus() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: FAILURE_THRESHOLD,
      isMonitoring: this.isMonitoring,
      queueSize: this.failoverQueue.length,
      stats: this.stats,
    };
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    console.log('[DB-Health] Shutting down health monitor...');
    
    this.stopMonitoring();
    
    // Close pools
    if (this.primaryPool) {
      await this.primaryPool.end();
    }
    if (this.fallbackPool) {
      await this.fallbackPool.end();
    }
    
    console.log('[DB-Health] Shutdown complete');
  }
}

// Export singleton instance
export const dbHealthManager = new DatabaseHealthManager();

// Export utility functions for use in other modules

/**
 * Get a database client for read operations
 * Automatically uses fallback if primary is down
 */
export async function getReadClient() {
  const pool = dbHealthManager.getReadPool();
  return pool.connect();
}

/**
 * Get a database client for write operations
 * During fallback, returns null (caller should queue the write)
 */
export async function getWriteClient() {
  const pool = await dbHealthManager.getWritePool();
  if (!pool) {
    return null;
  }
  return pool.connect();
}

/**
 * Queue a write operation for later execution
 * Use during fallback mode when primary is unavailable
 */
export async function queueWriteOperation(sql, params = []) {
  await dbHealthManager.queueWrite({ sql, params });
}

/**
 * Check if we're currently in fallback mode
 */
export function isFallbackMode() {
  return dbHealthManager.state === DBState.FALLBACK;
}

/**
 * Get health status for monitoring endpoints
 */
export function getHealthStatus() {
  return dbHealthManager.getStatus();
}

export default dbHealthManager;
