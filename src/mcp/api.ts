/**
 * MCP API Client and Integration
 * Provides API endpoints and client library for MCP server
 */

import axios, { AxiosInstance } from 'axios';
import EventSource from 'eventsource';
import { EventEmitter } from 'events';

// MCP API Types
export interface MCPConfig {
  endpoint?: string;
  apiKey: string;
  clientId?: string;
  capabilities?: string[];
  timeout?: number;
  retryAttempts?: number;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPRequest {
  method: string;
  params?: any;
  timeout?: number;
}

export interface MCPResponse<T = any> {
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  timestamp: string;
}

export interface MCPStreamEvent {
  id: string;
  type: 'notification' | 'response' | 'error';
  method?: string;
  params?: any;
  result?: any;
  error?: any;
  timestamp: string;
}

/**
 * MCP API Client
 */
export class MCPClient extends EventEmitter {
  private config: Required<MCPConfig>;
  private axios: AxiosInstance;
  private eventSource: EventSource | null = null;
  private connectionId: string | null = null;
  private messageQueue: Map<string, { resolve: Function; reject: Function }> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: MCPConfig) {
    super();
    
    this.config = {
      endpoint: config.endpoint || 'https://mcp.lanonasis.com',
      apiKey: config.apiKey,
      clientId: config.clientId || this.generateClientId(),
      capabilities: config.capabilities || ['memory', 'api_keys', 'tools'],
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3
    };

    // Setup axios instance
    this.axios = axios.create({
      baseURL: this.config.endpoint,
      timeout: this.config.timeout,
      headers: {
        'X-API-Key': this.config.apiKey,
        'X-Client-Id': this.config.clientId,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Connect to MCP SSE endpoint
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.eventSource) {
        this.disconnect();
      }

      const url = `${this.config.endpoint}/sse?apiKey=${encodeURIComponent(this.config.apiKey)}`;
      
      this.eventSource = new EventSource(url, {
        headers: {
          'X-API-Key': this.config.apiKey,
          'X-Client-Id': this.config.clientId,
          'X-MCP-Capabilities': this.config.capabilities.join(',')
        }
      });

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        this.emit('connected');
        resolve();
      };

      this.eventSource.onerror = (error) => {
        this.emit('error', error);
        this.handleReconnect();
        reject(error);
      };

      this.eventSource.onmessage = (event) => {
        this.handleSSEMessage(event);
      };

      // Handle specific event types
      this.eventSource.addEventListener('notification', (event: any) => {
        const data = JSON.parse(event.data);
        this.handleNotification(data);
      });

      this.eventSource.addEventListener('response', (event: any) => {
        const data = JSON.parse(event.data);
        this.handleResponse(data);
      });

      this.eventSource.addEventListener('error', (event: any) => {
        const data = JSON.parse(event.data);
        this.handleError(data);
      });
    });
  }

  /**
   * Disconnect from MCP server
   */
  public disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connectionId = null;
    this.messageQueue.clear();
    this.emit('disconnected');
  }

  /**
   * Call an MCP tool
   */
  public async call<T = any>(request: MCPRequest): Promise<T> {
    const messageId = this.generateMessageId();
    
    // If not connected, try to connect first
    if (!this.connectionId) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageQueue.delete(messageId);
        reject(new Error(`Request timeout: ${request.method}`));
      }, request.timeout || this.config.timeout);

      this.messageQueue.set(messageId, {
        resolve: (result: T) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      // Send message via POST endpoint
      this.axios.post('/message', {
        connectionId: this.connectionId,
        message: {
          id: messageId,
          type: 'request',
          method: request.method,
          params: request.params,
          timestamp: new Date().toISOString()
        }
      }).catch((error) => {
        this.messageQueue.delete(messageId);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * List available MCP tools
   */
  public async listTools(): Promise<MCPToolDefinition[]> {
    const response = await this.axios.get<{ tools: MCPToolDefinition[] }>('/tools');
    return response.data.tools;
  }

  /**
   * Get MCP server health status
   */
  public async getHealth(): Promise<any> {
    const response = await this.axios.get('/health');
    return response.data;
  }

  // Memory service methods
  public async createMemory(params: {
    title: string;
    content: string;
    type?: string;
    tags?: string[];
  }) {
    return this.call({
      method: 'memory_create',
      params
    });
  }

  public async searchMemory(params: {
    query: string;
    limit?: number;
    threshold?: number;
    type?: string;
    tags?: string[];
  }) {
    return this.call({
      method: 'memory_search',
      params
    });
  }

  public async listMemory(params?: {
    limit?: number;
    offset?: number;
    type?: string;
    tags?: string[];
  }) {
    return this.call({
      method: 'memory_list',
      params: params || {}
    });
  }

  // API key management methods
  public async createApiKey(params: {
    name: string;
    type?: 'test' | 'live' | 'restricted' | 'admin';
    environment?: 'development' | 'staging' | 'production';
  }) {
    return this.call({
      method: 'api_key_create',
      params
    });
  }

  // System methods
  public async getStatus() {
    return this.call({
      method: 'get_status'
    });
  }

  /**
   * Handle SSE message
   */
  private handleSSEMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      this.emit('message', data);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Handle notification from server
   */
  private handleNotification(data: MCPStreamEvent) {
    if (data.method === 'connection.established') {
      this.connectionId = data.params?.connectionId;
      this.emit('ready', data.params);
    } else if (data.method === 'ping') {
      // Respond to ping with pong
      this.axios.post('/message', {
        connectionId: this.connectionId,
        message: {
          id: this.generateMessageId(),
          type: 'notification',
          method: 'pong',
          timestamp: new Date().toISOString()
        }
      }).catch(() => {}); // Ignore pong errors
    } else {
      this.emit('notification', data);
    }
  }

  /**
   * Handle response from server
   */
  private handleResponse(data: MCPStreamEvent) {
    const pending = this.messageQueue.get(data.id);
    if (pending) {
      this.messageQueue.delete(data.id);
      if (data.error) {
        pending.reject(new Error(data.error.message));
      } else {
        pending.resolve(data.result);
      }
    }
  }

  /**
   * Handle error from server
   */
  private handleError(data: MCPStreamEvent) {
    const pending = this.messageQueue.get(data.id);
    if (pending) {
      this.messageQueue.delete(data.id);
      pending.reject(new Error(data.error?.message || 'Unknown error'));
    }
    this.emit('error', data.error);
  }

  /**
   * Handle reconnection
   */
  private handleReconnect() {
    if (this.reconnectAttempts >= this.config.retryAttempts) {
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.reconnectTimer = setTimeout(() => {
      this.emit('reconnecting', this.reconnectAttempts);
      this.connect().catch(() => {});
    }, delay);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `mcp-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * MCP API REST Endpoints
 * For direct HTTP API access without SSE
 */
export class MCPRestAPI {
  private axios: AxiosInstance;

  constructor(config: { endpoint?: string; apiKey: string }) {
    this.axios = axios.create({
      baseURL: config.endpoint || 'https://api.lanonasis.com/mcp',
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Create memory via REST API
   */
  async createMemory(params: {
    title: string;
    content: string;
    type?: string;
    tags?: string[];
  }) {
    const response = await this.axios.post('/memory', params);
    return response.data;
  }

  /**
   * Search memories via REST API
   */
  async searchMemory(params: {
    query: string;
    limit?: number;
    threshold?: number;
  }) {
    const response = await this.axios.post('/memory/search', params);
    return response.data;
  }

  /**
   * List memories via REST API
   */
  async listMemory(params?: {
    limit?: number;
    offset?: number;
    type?: string;
  }) {
    const response = await this.axios.get('/memory', { params });
    return response.data;
  }

  /**
   * Get memory by ID via REST API
   */
  async getMemory(id: string) {
    const response = await this.axios.get(`/memory/${id}`);
    return response.data;
  }

  /**
   * Update memory via REST API
   */
  async updateMemory(id: string, params: {
    title?: string;
    content?: string;
    type?: string;
    tags?: string[];
  }) {
    const response = await this.axios.put(`/memory/${id}`, params);
    return response.data;
  }

  /**
   * Delete memory via REST API
   */
  async deleteMemory(id: string) {
    const response = await this.axios.delete(`/memory/${id}`);
    return response.data;
  }

  /**
   * Create API key via REST API
   */
  async createApiKey(params: {
    name: string;
    type?: string;
    permissions?: any;
  }) {
    const response = await this.axios.post('/api-keys', params);
    return response.data;
  }

  /**
   * List API keys via REST API
   */
  async listApiKeys() {
    const response = await this.axios.get('/api-keys');
    return response.data;
  }

  /**
   * Rotate API key via REST API
   */
  async rotateApiKey(keyId: string) {
    const response = await this.axios.post(`/api-keys/${keyId}/rotate`);
    return response.data;
  }

  /**
   * Delete API key via REST API
   */
  async deleteApiKey(keyId: string) {
    const response = await this.axios.delete(`/api-keys/${keyId}`);
    return response.data;
  }
}

// Export convenience functions
export function createMCPClient(config: MCPConfig): MCPClient {
  return new MCPClient(config);
}

export function createMCPRestAPI(config: { endpoint?: string; apiKey: string }): MCPRestAPI {
  return new MCPRestAPI(config);
}

// Export default client factory
export default {
  createClient: createMCPClient,
  createRestAPI: createMCPRestAPI,
  MCPClient,
  MCPRestAPI
};