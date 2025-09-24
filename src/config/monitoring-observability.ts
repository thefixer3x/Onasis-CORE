/**
 * Production Monitoring and Observability Configuration
 * Enterprise-grade monitoring, logging, and alerting setup
 * 
 * @module MonitoringObservability
 * @version 1.0.0
 * @standards OpenTelemetry, Prometheus, ELK Stack
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { metrics } from '@opentelemetry/api';
import pino from 'pino';
import { StatsD } from 'node-statsd';

/**
 * OpenTelemetry Configuration
 */
export class TelemetryService {
  private static sdk: NodeSDK;
  
  /**
   * Initialize OpenTelemetry with Jaeger and Prometheus
   */
  static initialize() {
    // Configure resource
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'lanonasis-maas',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'memory-service',
      [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.INSTANCE_ID || 'default',
    });
    
    // Jaeger exporter for traces
    const jaegerExporter = new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
      serviceName: 'lanonasis-maas',
    });
    
    // Prometheus exporter for metrics
    const prometheusExporter = new PrometheusExporter({
      port: parseInt(process.env.METRICS_PORT || '9090'),
      endpoint: '/metrics',
    }, () => {
      console.log('Prometheus metrics available at :9090/metrics');
    });
    
    // Initialize SDK
    this.sdk = new NodeSDK({
      resource,
      traceExporter: jaegerExporter,
      metricReader: prometheusExporter,
      instrumentations: [
        // Auto-instrumentation for common libraries
        require('@opentelemetry/instrumentation-http').HttpInstrumentation,
        require('@opentelemetry/instrumentation-express').ExpressInstrumentation,
        require('@opentelemetry/instrumentation-pg').PgInstrumentation,
        require('@opentelemetry/instrumentation-redis').RedisInstrumentation,
      ],
    });
    
    // Start SDK
    this.sdk.start();
  }
  
  /**
   * Shutdown telemetry gracefully
   */
  static async shutdown() {
    await this.sdk?.shutdown();
  }
}

/**
 * Structured Logging Configuration
 */
export class LoggingService {
  private static logger: pino.Logger;
  
  /**
   * Initialize structured logger
   */
  static initialize() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ severity: label.toUpperCase() }),
        bindings: (bindings) => ({
          pid: bindings.pid,
          hostname: bindings.hostname,
          node_version: process.version,
        }),
      },
      base: {
        service: 'lanonasis-maas',
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'production',
        region: process.env.AWS_REGION || 'us-east-1',
        instance_id: process.env.INSTANCE_ID,
      },
      serializers: {
        err: pino.stdSerializers.err,
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          headers: {
            'user-agent': req.headers['user-agent'],
            'x-request-id': req.headers['x-request-id'],
            'x-tenant-id': req.headers['x-tenant-id'],
          },
          remoteAddress: req.socket.remoteAddress,
          remotePort: req.socket.remotePort,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
          headers: res.getHeaders(),
        }),
      },
      // Send to multiple destinations
      transport: {
        targets: [
          {
            target: 'pino-pretty',
            options: { destination: 1 }, // stdout
            level: 'info',
          },
          {
            target: 'pino-elasticsearch',
            options: {
              node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
              index: 'lanonasis-logs',
              consistency: 'one',
              'es-version': 7,
            },
            level: 'debug',
          },
        ],
      },
    });
  }
  
  /**
   * Get logger instance
   */
  static getLogger() {
    if (!this.logger) {
      this.initialize();
    }
    return this.logger;
  }
}

/**
 * Metrics Collection Service
 */
export class MetricsService {
  private static statsd: StatsD;
  private static customMetrics: Map<string, any> = new Map();
  
  /**
   * Initialize StatsD client
   */
  static initialize() {
    this.statsd = new StatsD({
      host: process.env.STATSD_HOST || 'localhost',
      port: parseInt(process.env.STATSD_PORT || '8125'),
      prefix: 'lanonasis.maas.',
      suffix: '',
      globalize: false,
      cacheDns: true,
      mock: process.env.NODE_ENV === 'test',
    });
    
    // Initialize custom metrics
    this.initializeCustomMetrics();
  }
  
  /**
   * Initialize custom Prometheus metrics
   */
  private static initializeCustomMetrics() {
    const meter = metrics.getMeter('lanonasis-maas', '1.0.0');
    
    // Request counter
    this.customMetrics.set('request_counter', meter.createCounter('http_requests_total', {
      description: 'Total number of HTTP requests',
    }));
    
    // Request duration histogram
    this.customMetrics.set('request_duration', meter.createHistogram('http_request_duration_seconds', {
      description: 'HTTP request duration in seconds',
      boundaries: [0.1, 0.5, 1, 2, 5, 10],
    }));
    
    // Active connections gauge
    this.customMetrics.set('active_connections', meter.createUpDownCounter('active_connections', {
      description: 'Number of active connections',
    }));
    
    // Memory usage gauge
    this.customMetrics.set('memory_usage', meter.createObservableGauge('memory_usage_bytes', {
      description: 'Process memory usage in bytes',
    }));
    
    // Vector operations counter
    this.customMetrics.set('vector_operations', meter.createCounter('vector_operations_total', {
      description: 'Total number of vector operations',
    }));
    
    // Embedding latency histogram
    this.customMetrics.set('embedding_latency', meter.createHistogram('embedding_latency_seconds', {
      description: 'Embedding generation latency in seconds',
      boundaries: [0.5, 1, 2, 5, 10, 30],
    }));
  }
  
  /**
   * Record HTTP request
   */
  static recordRequest(method: string, path: string, statusCode: number, duration: number, tenantId?: string) {
    const labels = {
      method,
      path,
      status_code: statusCode.toString(),
      tenant_id: tenantId || 'unknown',
    };
    
    // Prometheus metrics
    this.customMetrics.get('request_counter')?.add(1, labels);
    this.customMetrics.get('request_duration')?.record(duration / 1000, labels);
    
    // StatsD metrics
    this.statsd?.increment(`requests.${method}.${statusCode}`);
    this.statsd?.timing(`request_duration.${method}`, duration);
  }
  
  /**
   * Record vector operation
   */
  static recordVectorOperation(operation: string, count: number, duration: number, tenantId?: string) {
    const labels = {
      operation,
      tenant_id: tenantId || 'unknown',
    };
    
    this.customMetrics.get('vector_operations')?.add(count, labels);
    this.statsd?.increment(`vectors.${operation}`, count);
    this.statsd?.timing(`vector_operation.${operation}`, duration);
  }
  
  /**
   * Record business metrics
   */
  static recordBusinessMetric(metric: string, value: number, tags?: Record<string, string>) {
    this.statsd?.gauge(metric, value, tags);
  }
}

/**
 * Health Check Service
 */
export class HealthCheckService {
  private static checks: Map<string, () => Promise<boolean>> = new Map();
  
  /**
   * Register a health check
   */
  static registerCheck(name: string, check: () => Promise<boolean>) {
    this.checks.set(name, check);
  }
  
  /**
   * Run all health checks
   */
  static async runChecks(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
    timestamp: string;
    version: string;
  }> {
    const results: Record<string, boolean> = {};
    let failedChecks = 0;
    
    for (const [name, check] of this.checks) {
      try {
        results[name] = await check();
        if (!results[name]) failedChecks++;
      } catch (error) {
        results[name] = false;
        failedChecks++;
      }
    }
    
    const totalChecks = this.checks.size;
    let status: 'healthy' | 'degraded' | 'unhealthy';
    
    if (failedChecks === 0) {
      status = 'healthy';
    } else if (failedChecks < totalChecks / 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }
    
    return {
      status,
      checks: results,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
    };
  }
  
  /**
   * Initialize default health checks
   */
  static initializeDefaultChecks() {
    // Database health check
    this.registerCheck('database', async () => {
      try {
        // TODO: Implement actual database ping
        return true;
      } catch {
        return false;
      }
    });
    
    // Redis health check
    this.registerCheck('redis', async () => {
      try {
        // TODO: Implement Redis ping
        return true;
      } catch {
        return false;
      }
    });
    
    // Memory health check
    this.registerCheck('memory', async () => {
      const used = process.memoryUsage();
      const limit = 2 * 1024 * 1024 * 1024; // 2GB
      return used.heapUsed < limit;
    });
    
    // Disk space health check
    this.registerCheck('disk', async () => {
      // TODO: Implement disk space check
      return true;
    });
  }
}

/**
 * Alert Configuration
 */
export class AlertingService {
  private static alertChannels: Map<string, (alert: any) => Promise<void>> = new Map();
  
  /**
   * Initialize alerting channels
   */
  static initialize() {
    // Slack integration
    if (process.env.SLACK_WEBHOOK_URL) {
      this.alertChannels.set('slack', async (alert) => {
        const axios = require('axios');
        await axios.post(process.env.SLACK_WEBHOOK_URL, {
          text: `🚨 Alert: ${alert.title}`,
          attachments: [{
            color: alert.severity === 'critical' ? 'danger' : 'warning',
            fields: [
              { title: 'Severity', value: alert.severity, short: true },
              { title: 'Service', value: alert.service, short: true },
              { title: 'Description', value: alert.description },
              { title: 'Timestamp', value: alert.timestamp },
            ],
          }],
        });
      });
    }
    
    // PagerDuty integration
    if (process.env.PAGERDUTY_INTEGRATION_KEY) {
      this.alertChannels.set('pagerduty', async (alert) => {
        const axios = require('axios');
        await axios.post('https://events.pagerduty.com/v2/enqueue', {
          routing_key: process.env.PAGERDUTY_INTEGRATION_KEY,
          event_action: 'trigger',
          payload: {
            summary: alert.title,
            severity: alert.severity,
            source: 'lanonasis-maas',
            custom_details: alert,
          },
        });
      });
    }
    
    // Email integration
    if (process.env.ALERT_EMAIL) {
      this.alertChannels.set('email', async (alert) => {
        // TODO: Implement email alerting
        console.log('Email alert:', alert);
      });
    }
  }
  
  /**
   * Send alert to all configured channels
   */
  static async sendAlert(alert: {
    title: string;
    description: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    service: string;
    metadata?: any;
  }) {
    const enrichedAlert = {
      ...alert,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      instance_id: process.env.INSTANCE_ID,
    };
    
    for (const [channel, sender] of this.alertChannels) {
      try {
        await sender(enrichedAlert);
      } catch (error) {
        console.error(`Failed to send alert to ${channel}:`, error);
      }
    }
  }
}

/**
 * Performance Monitoring
 */
export class PerformanceMonitor {
  private static thresholds = {
    response_time_ms: 1000,
    memory_usage_mb: 1024,
    cpu_usage_percent: 80,
    error_rate_percent: 1,
  };
  
  /**
   * Monitor response times
   */
  static checkResponseTime(duration: number, endpoint: string) {
    if (duration > this.thresholds.response_time_ms) {
      AlertingService.sendAlert({
        title: 'High Response Time',
        description: `Endpoint ${endpoint} took ${duration}ms to respond`,
        severity: duration > this.thresholds.response_time_ms * 2 ? 'error' : 'warning',
        service: 'api',
        metadata: { endpoint, duration },
      });
    }
  }
  
  /**
   * Monitor memory usage
   */
  static checkMemoryUsage() {
    const used = process.memoryUsage();
    const usedMB = used.heapUsed / 1024 / 1024;
    
    if (usedMB > this.thresholds.memory_usage_mb) {
      AlertingService.sendAlert({
        title: 'High Memory Usage',
        description: `Process using ${usedMB.toFixed(2)}MB of memory`,
        severity: usedMB > this.thresholds.memory_usage_mb * 1.5 ? 'critical' : 'warning',
        service: 'system',
        metadata: { memory: used },
      });
    }
  }
  
  /**
   * Start periodic monitoring
   */
  static startMonitoring() {
    // Memory monitoring every minute
    setInterval(() => this.checkMemoryUsage(), 60000);
    
    // Custom business metrics every 5 minutes
    setInterval(() => {
      // TODO: Collect and report business metrics
      MetricsService.recordBusinessMetric('active_tenants', 0);
      MetricsService.recordBusinessMetric('total_embeddings', 0);
      MetricsService.recordBusinessMetric('api_usage', 0);
    }, 300000);
  }
}

/**
 * Distributed Tracing Utilities
 */
export class TracingUtils {
  /**
   * Extract trace context from request
   */
  static extractTraceContext(headers: any) {
    return {
      traceId: headers['x-trace-id'] || this.generateTraceId(),
      spanId: headers['x-span-id'] || this.generateSpanId(),
      parentSpanId: headers['x-parent-span-id'],
      flags: headers['x-trace-flags'] || '01',
    };
  }
  
  /**
   * Generate trace ID
   */
  static generateTraceId(): string {
    return require('crypto').randomBytes(16).toString('hex');
  }
  
  /**
   * Generate span ID
   */
  static generateSpanId(): string {
    return require('crypto').randomBytes(8).toString('hex');
  }
  
  /**
   * Inject trace context into headers
   */
  static injectTraceContext(headers: any, context: any) {
    headers['x-trace-id'] = context.traceId;
    headers['x-span-id'] = context.spanId;
    if (context.parentSpanId) {
      headers['x-parent-span-id'] = context.parentSpanId;
    }
    headers['x-trace-flags'] = context.flags;
    return headers;
  }
}

/**
 * Export all monitoring configurations
 */
export default {
  TelemetryService,
  LoggingService,
  MetricsService,
  HealthCheckService,
  AlertingService,
  PerformanceMonitor,
  TracingUtils,
};
