/**
 * Enhanced Game Room Client SDK
 * Enterprise-grade client library for Socket.IO game room integration
 * Compatible with our enhanced server-side implementation
 */

/* eslint-disable no-plusplus, no-console, no-undef */
class EnterpriseGameClient {
  constructor(options = {}) {
    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      maxReconnectDelay: 5000,
      timeout: 20000,
      forceNew: true,
      transports: ['websocket', 'polling'],
      ...options,
    };

    this.socket = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.authToken = null;
    this.correlationId = this.generateCorrelationId();
    this.eventHandlers = new Map();
    this.connectionState = 'disconnected';
    
    // Performance tracking
    this.metrics = {
      connectionTime: 0,
      messageSent: 0,
      messagesReceived: 0,
      errors: 0,
      latency: [],
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize connection with authentication
   */
  async connect(authToken, roomCode, userId) {
    try {
      this.authToken = authToken;
      this.roomCode = roomCode;
      this.userId = userId;

      const startTime = Date.now();

      // Create socket with authentication headers
      this.socket = io({
        ...this.config,
        auth: {
          token: authToken,
          correlationId: this.correlationId
        },
        extraHeaders: {
          'x-correlation-id': this.correlationId,
          'x-client-version': '2.0.0'
        }
      });

      this.setupSocketEventHandlers();

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.timeout);

        this.socket.on('connect', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.connectionState = 'connected';
          this.metrics.connectionTime = Date.now() - startTime;
          this.emit('client:connected', { connectionTime: this.metrics.connectionTime });
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          clearTimeout(timeout);
          this.connectionState = 'error';
          this.metrics.errors++;
          reject(error);
        });
      });

      // Auto-join room after connection
      await this.joinRoom(roomCode, userId);

    } catch (error) {
      this.emit('client:error', { error: error.message, type: 'connection' });
      throw error;
    }
  }

  /**
   * Join a game room with validation
   */
  async joinRoom(roomCode, userId) {
    if (!this.isConnected) {
      throw new Error('Must be connected before joining room');
    }

    return this.sendWithAck('join_room', {
      roomCode,
      userId,
      timestamp: Date.now(),
      correlationId: this.correlationId
    });
  }

  /**
   * Send message with acknowledgment and timeout
   */
  async sendWithAck(event, data, timeout = 5000) {
    if (!this.isConnected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for acknowledgment: ${event}`));
      }, timeout);

      const enrichedData = {
        ...data,
        correlationId: this.correlationId,
        timestamp: Date.now(),
        clientVersion: '2.0.0'
      };

      this.socket.emit(event, enrichedData, (response) => {
        clearTimeout(timer);
        this.metrics.messageSent++;

        if (response && response.success === false) {
          reject(new Error(response.error || 'Server error'));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Send message without acknowledgment
   */
  send(event, data) {
    if (!this.isConnected) {
      this.emit('client:error', { error: 'Socket not connected', type: 'send' });
      return;
    }

    const enrichedData = {
      ...data,
      correlationId: this.correlationId,
      timestamp: Date.now(),
      clientVersion: '2.0.0'
    };

    this.socket.emit(event, enrichedData);
    this.metrics.messageSent++;
  }

  /**
   * Setup socket event handlers
   */
  setupSocketEventHandlers() {
    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.isReconnecting = false;
      this.connectionState = 'connected';
      this.emit('client:connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.connectionState = 'disconnected';
      this.emit('client:disconnected', { reason });
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.isReconnecting = false;
      this.emit('client:reconnected', { attempts: attemptNumber });
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      this.isReconnecting = true;
      this.emit('client:reconnecting', { attempt: attemptNumber });
    });

    this.socket.on('reconnect_error', (error) => {
      this.metrics.errors++;
      this.emit('client:reconnect_error', { error: error.message });
    });

    // Security and error events
    this.socket.on('rate_limit_exceeded', (data) => {
      this.emit('client:rate_limited', data);
    });

    this.socket.on('validation_error', (data) => {
      this.metrics.errors++;
      this.emit('client:validation_error', data);
    });

    this.socket.on('auth_error', (data) => {
      this.metrics.errors++;
      this.emit('client:auth_error', data);
    });

    // Game events (updated to match server)
    this.socket.on('room_joined', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:room_joined', data);
    });

    this.socket.on('room_updated', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:room_updated', data);
    });

    this.socket.on('player_joined', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:player_joined', data);
    });

    this.socket.on('player_left', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:player_left', data);
    });

    this.socket.on('game_started', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:started', data);
    });

    this.socket.on('game_countdown', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:countdown', data);
    });

    this.socket.on('question_presented', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:question_presented', data);
    });

    this.socket.on('answer_submitted', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:answer_submitted', data);
    });

    this.socket.on('question_completed', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:question_completed', data);
    });

    this.socket.on('game_ended', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:ended', data);
    });

    this.socket.on('leaderboard_updated', (data) => {
      this.metrics.messagesReceived++;
      this.emit('game:leaderboard_updated', data);
    });

    // Generic error handler
    this.socket.on('error', (error) => {
      this.metrics.errors++;
      this.emit('client:error', { error: error.message || error, type: 'socket' });
    });
  }

  /**
   * Game actions
   */
  async markPlayerReady() {
    return this.sendWithAck('player_ready', {
      roomCode: this.roomCode,
      userId: this.userId
    });
  }

  async submitAnswer(questionIndex, selectedAnswer, timeSpent) {
    return this.sendWithAck('submit_answer', {
      questionIndex,
      selectedAnswer,
      timeSpent,
      timestamp: Date.now()
    });
  }

  async leaveRoom() {
    return this.sendWithAck('leave_room', {
      roomCode: this.roomCode,
      userId: this.userId
    });
  }

  async requestGameState() {
    return this.sendWithAck('get_game_state', {
      roomCode: this.roomCode
    });
  }

  /**
   * Event system
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Health and monitoring
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      reconnecting: this.isReconnecting,
      state: this.connectionState,
      metrics: { ...this.metrics },
      latency: this.socket ? this.socket.ping : null
    };
  }

  /**
   * Utilities
   */
  generateCorrelationId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  setupEventHandlers() {
    // Handle page visibility for connection management
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.isConnected) {
          // Page hidden, prepare for potential disconnect
          this.send('client_inactive', { timestamp: Date.now() });
        } else if (!document.hidden && !this.isConnected) {
          // Page visible but disconnected, attempt reconnect
          this.reconnect();
        }
      });

      // Handle page unload
      window.addEventListener('beforeunload', () => {
        if (this.isConnected) {
          this.send('client_disconnecting', { reason: 'page_unload' });
        }
      });
    }
  }

  /**
   * Reconnection logic
   */
  async reconnect() {
    if (this.isReconnecting) return;

    try {
      this.isReconnecting = true;
      await this.connect(this.authToken, this.roomCode, this.userId);
    } catch (error) {
      this.emit('client:reconnect_failed', { error: error.message });
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.connectionState = 'disconnected';
    this.eventHandlers.clear();
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnterpriseGameClient;
} else if (typeof window !== 'undefined') {
  window.EnterpriseGameClient = EnterpriseGameClient;
}