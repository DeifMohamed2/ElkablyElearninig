const GameRoom = require('../models/GameRoom');
const GameSession = require('../models/GameSession');
const Question = require('../models/Question');

class GameSocketHandler {
  constructor(io) {
    this.io = io;
    this.activeRooms = new Map(); // roomCode -> room data
    this.playerSessions = new Map(); // socketId -> session data
    this.disconnectionTimers = new Map(); // userId-roomCode -> timeout
    this.endingGames = new Set(); // roomCode -> prevent duplicate endGame calls
    this.reconnectionGracePeriod = 10000; // 10 seconds grace period for reconnection
    this.setupSocketHandlers();
  }

  // Clean up all timers and resources
  cleanup() {
    console.log('Cleaning up GameSocketHandler...');

    // Clear all disconnection timers
    for (const [key, timer] of this.disconnectionTimers.entries()) {
      clearTimeout(timer);
      console.log(`Cleared disconnection timer for ${key}`);
    }
    this.disconnectionTimers.clear();

    // Clear session timers
    if (this.sessionTimers) {
      for (const [roomCode, timer] of this.sessionTimers.entries()) {
        clearInterval(timer);
        console.log(`Cleared session timer for room ${roomCode}`);
      }
      this.sessionTimers.clear();
    }

    // Clear ending games set
    this.endingGames.clear();

    // Clear session data
    this.playerSessions.clear();
    this.activeRooms.clear();

    console.log('GameSocketHandler cleanup complete');
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);

      // Join room
      socket.on('join-room', async (data) => {
        await this.handleJoinRoom(socket, data);
      });

      // Leave room
      socket.on('leave-room', async (data) => {
        await this.handleLeaveRoom(socket, data);
      });

      // Player ready
      socket.on('player-ready', async (data) => {
        await this.handlePlayerReady(socket, data);
      });

      // Answer question
      socket.on('answer-question', async (data) => {
        await this.handleAnswerQuestion(socket, data);
      });

      // Request specific question
      socket.on('request-question', async (data) => {
        await this.handleRequestQuestion(socket, data);
      });

      // Player completed all questions
      socket.on('player-completed', async (data) => {
        await this.handlePlayerCompleted(socket, data);
      });

      // Admin force-start event (admin client should emit this with { roomCode, adminId })
      socket.on('admin-force-start', async (data) => {
        try {
          const { roomCode } = data;
          if (!roomCode)
            return socket.emit('error', { message: 'Missing roomCode' });

          const room = await GameRoom.findOne({ roomCode }).populate(
            'currentPlayers.user'
          );
          if (!room) return socket.emit('error', { message: 'Room not found' });

          // Attempt to start game forcing bypass of min players
          const startResult = room.startGame({ force: true });
          if (!startResult.success) {
            return socket.emit('error', { message: startResult.message });
          }

          // Persist state and notify players
          const updatedRoom = await GameRoom.findByIdAndUpdate(
            room._id,
            { gameState: 'starting', gameStartedAt: new Date() },
            { new: true }
          ).populate('questions');

          this.io.to(updatedRoom.roomCode).emit('game-starting', {
            room: this.formatRoomData(updatedRoom),
            countdown: 5,
            forced: true,
          });

          // Start countdown then begin gameplay
          setTimeout(async () => {
            await this.beginGameplay(updatedRoom);
          }, 5000);
        } catch (error) {
          console.error('Error handling admin-force-start:', error);
          socket.emit('error', { message: 'Failed to force start game' });
        }
      });

      // Request current state
      socket.on('request-game-state', async (data) => {
        await this.handleRequestGameState(socket, data);
      });

      // Disconnect
      socket.on('disconnect', async () => {
        await this.handleDisconnect(socket);
      });

      // Heartbeat
      socket.on('heartbeat', () => {
        socket.emit('heartbeat-response');
      });
    });
  }

  // Helper method to disconnect existing socket for a user in a room
  async disconnectExistingUserSocket(userId, roomCode) {
    try {
      // Find and disconnect any existing sockets for this user in this room
      const existingSessions = Array.from(this.playerSessions.entries()).filter(
        ([socketId, session]) =>
          session.userId === userId.toString() &&
          session.roomCode === roomCode &&
          socketId !== undefined
      );

      for (const [socketId, session] of existingSessions) {
        console.log(
          `Disconnecting existing socket ${socketId} for user ${userId}`
        );
        const existingSocket = this.io.sockets.sockets.get(socketId);
        if (existingSocket) {
          existingSocket.disconnect(true);
        }
        this.playerSessions.delete(socketId);
      }
    } catch (error) {
      console.error('Error disconnecting existing user socket:', error);
    }
  }

  async handleJoinRoom(socket, data) {
    try {
      const { roomCode, userId } = data;

      // Validate input
      if (!roomCode || !userId) {
        return socket.emit('error', {
          message: 'Missing room code or user ID',
        });
      }

      // Create disconnection key and cancel any pending disconnection timer
      const disconnectionKey = `${userId}-${roomCode}`;
      if (this.disconnectionTimers.has(disconnectionKey)) {
        clearTimeout(this.disconnectionTimers.get(disconnectionKey));
        this.disconnectionTimers.delete(disconnectionKey);
        console.log(
          `Cancelled disconnection timer for player ${userId} in room ${roomCode} - reconnecting`
        );
      }

      // Find room
      const room = await GameRoom.findOne({ roomCode, isActive: true })
        .populate('questions')
        .populate('currentPlayers.user', 'username email profilePicture');

      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }

      // Check if game has started (but allow if player was already in the room or has active session)
      const isExistingPlayer = room.currentPlayers.some(
        (p) => p.user && p.user._id.toString() === userId.toString()
      );

      // Check for existing active session (for reconnection scenarios)
      const existingSession = await GameSession.findOne({
        user: userId,
        gameRoom: room._id,
        isActive: true,
      });

      // Allow rejoining in these cases:
      // 1. Game is in waiting state (normal join)
      // 2. Player was already in the room (reconnection after disconnect/reload)
      // 3. Player has an active session (disconnected but session still exists)
      // 4. Game is in playing state and player has session (mid-game reconnection)
      // BUT NEVER allow joining if game is finished
      const canJoin =
        room.gameState !== 'finished' &&
        (room.gameState === 'waiting' ||
          isExistingPlayer ||
          existingSession ||
          (room.gameState === 'playing' && existingSession));

      if (!canJoin) {
        const reason =
          room.gameState === 'finished'
            ? 'This game has already finished. Please join a new game room.'
            : 'Game has already started. You can only rejoin if you were previously playing.';

        return socket.emit('error', {
          message: reason,
        });
      }

      // Check if room is full (but allow reconnections)
      if (
        room.currentPlayers.length >= room.maxPlayers &&
        !isExistingPlayer &&
        !existingSession
      ) {
        return socket.emit('error', { message: 'Room is full' });
      }

      // Disconnect any existing socket for this user in this room
      await this.disconnectExistingUserSocket(userId, roomCode);

      // Use atomic operation to add/update player
      const addResult = await GameRoom.addPlayerAtomic(
        room._id,
        userId,
        socket.id
      );

      if (!addResult.success) {
        return socket.emit('error', { message: addResult.message });
      }

      // Get updated room data
      const updatedRoom =
        addResult.room ||
        (await GameRoom.findById(room._id)
          .populate('questions')
          .populate('currentPlayers.user', 'username email profilePicture'));

      // Create or update game session
      let session = await GameSession.findOne({
        user: userId,
        gameRoom: updatedRoom._id,
        isActive: true,
      });

      if (!session) {
        session = new GameSession({
          user: userId,
          gameRoom: updatedRoom._id,
          score: 0,
          totalQuestions: updatedRoom.questions.length,
          isActive: true,
          isReady: false,
        });

        // Shuffle questions for this session
        const shuffleResult = session.shuffleQuestions(updatedRoom.questions);
        console.log(
          `Shuffled ${shuffleResult.shuffledQuestions.length} questions for user ${userId}`
        );
        await session.save();
      } else {
        // Update existing session
        session.isActive = true;
        session.lastActivity = new Date();

        // If session doesn't have shuffled questions, shuffle them now
        if (
          !session.shuffledQuestions ||
          session.shuffledQuestions.length === 0
        ) {
          console.log(
            `Re-shuffling questions for existing session ${session._id}`
          );
          session.shuffleQuestions(updatedRoom.questions);
        }

        await session.save();
      }

      // Join socket room
      socket.join(roomCode);
      socket.gameRoom = roomCode;
      socket.userId = userId;

      // Store session data
      this.playerSessions.set(socket.id, {
        sessionId: session._id,
        roomCode: roomCode,
        userId: userId,
        joinedAt: new Date(),
      });

      // Emit room update to all players
      this.emitRoomUpdate(updatedRoom);

      // Send success to joining player
      socket.emit('joined-room', {
        success: true,
        room: this.formatRoomData(updatedRoom),
        session: this.formatSessionData(session),
        isExisting: addResult.isExisting || false,
      });

      console.log(
        `Player ${userId} joined room ${roomCode} (${
          addResult.isExisting ? 'existing' : 'new'
        })`
      );
      console.log(
        `Room ${roomCode} status: ${updatedRoom.currentPlayers.length}/${updatedRoom.maxPlayers} players, gameState: ${updatedRoom.gameState}`
      );

      // If game is already in progress and this is a reconnection, send current question
      if (
        updatedRoom.gameState === 'playing' &&
        (addResult.isExisting || existingSession)
      ) {
        console.log(
          `Sending current question to reconnecting player ${userId}`
        );

        // Send the current question based on the player's session
        if (session.shuffledQuestions && session.shuffledQuestions.length > 0) {
          const currentQuestionIndex = session.currentQuestionIndex || 0;
          const totalQuestions = session.shuffledQuestions.length;

          // Check if player has completed all questions
          if (currentQuestionIndex >= totalQuestions) {
            console.log(
              `Player ${userId} has completed all questions (${currentQuestionIndex}/${totalQuestions})`
            );

            // Send completion state instead of trying to load a question
            socket.emit('player-completion-state', {
              isCompleted: true,
              currentQuestionIndex: currentQuestionIndex,
              totalQuestions: totalQuestions,
              waitingForOthers: true,
            });
          } else {
            const question = session.shuffledQuestions[currentQuestionIndex];

            if (question) {
              socket.emit('question-loaded', {
                question: this.formatQuestionData(question),
                questionIndex: currentQuestionIndex,
                totalQuestions: totalQuestions,
                timeLimit: updatedRoom.timePerQuestion || 30,
              });
            }
          }
        }

        // Also send current game state
        socket.emit('game-state', {
          room: this.formatRoomData(updatedRoom),
          session: this.formatSessionData(session),
          gameState: 'playing',
          reconnection: true,
        });
      }

      // Check if room is full and should auto-start
      if (
        updatedRoom.currentPlayers.length >= updatedRoom.maxPlayers &&
        updatedRoom.gameState === 'waiting'
      ) {
        console.log(
          `Room ${roomCode} is full (${updatedRoom.currentPlayers.length}/${updatedRoom.maxPlayers}), auto-starting game...`
        );

        // Emit special event for room full
        this.io.to(roomCode).emit('room-full', {
          room: this.formatRoomData(updatedRoom),
          message: 'Room is full! Game starting soon...',
          countdown: 3,
        });

        // Also emit to all clients for room list updates
        this.io.emit('room-status-change', {
          roomCode: roomCode,
          status: 'full',
          players: updatedRoom.currentPlayers.length,
          maxPlayers: updatedRoom.maxPlayers,
        });

        // Small delay to ensure all clients have received the room update
        setTimeout(async () => {
          try {
            // Get fresh room data to ensure we have latest state
            const freshRoom = await GameRoom.findById(updatedRoom._id)
              .populate('questions')
              .populate('currentPlayers.user', 'username email profilePicture');

            if (
              freshRoom &&
              freshRoom.gameState === 'waiting' &&
              freshRoom.currentPlayers.length >= freshRoom.maxPlayers
            ) {
              console.log(
                `Auto-starting game for room ${roomCode} with ${freshRoom.currentPlayers.length} players`
              );
              await this.startGame(freshRoom);
            } else {
              console.log(
                `Auto-start conditions not met for room ${roomCode}:`,
                {
                  exists: !!freshRoom,
                  gameState: freshRoom?.gameState,
                  playerCount: freshRoom?.currentPlayers.length,
                  maxPlayers: freshRoom?.maxPlayers,
                }
              );
            }
          } catch (autoStartError) {
            console.error('Error auto-starting game:', autoStartError);
          }
        }, 1000); // Increased delay to 1 second to ensure UI is updated
      } else {
        console.log(`Room ${roomCode} not ready for auto-start:`, {
          currentPlayers: updatedRoom.currentPlayers.length,
          maxPlayers: updatedRoom.maxPlayers,
          gameState: updatedRoom.gameState,
        });
      }
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  }

  async handleLeaveRoom(socket, data) {
    try {
      const { roomCode } = data;

      if (!socket.gameRoom || socket.gameRoom !== roomCode) {
        return socket.emit('error', { message: 'Not in this room' });
      }

      if (!socket.userId) {
        return socket.emit('error', { message: 'User not identified' });
      }

      const room = await GameRoom.findOne({ roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Room not found' });
      }

      // Use atomic operation to remove player
      const removeResult = await GameRoom.removePlayerAtomic(
        room._id,
        socket.userId
      );

      if (!removeResult.success) {
        return socket.emit('error', { message: removeResult.message });
      }

      // Update session
      const sessionData = this.playerSessions.get(socket.id);
      if (sessionData) {
        try {
          await GameSession.findByIdAndUpdate(sessionData.sessionId, {
            isActive: false,
            leftAt: new Date(),
          });
        } catch (sessionError) {
          console.error('Error updating session on leave:', sessionError);
        }
      }

      // Clean up socket data
      socket.leave(roomCode);
      socket.gameRoom = null;
      socket.userId = null;
      this.playerSessions.delete(socket.id);

      // Get updated room for broadcast
      const updatedRoom =
        removeResult.room ||
        (await GameRoom.findById(room._id).populate(
          'currentPlayers.user',
          'username email profilePicture'
        ));

      // Emit room update to remaining players
      this.emitRoomUpdate(updatedRoom);

      // Send success to leaving player
      socket.emit('left-room', { success: true });

      console.log(`Player ${socket.userId} left room ${roomCode}`);
    } catch (error) {
      console.error('Error leaving room:', error);
      socket.emit('error', { message: 'Failed to leave room' });
    }
  }

  async handlePlayerReady(socket, data) {
    try {
      const { roomCode } = data;

      console.log(
        `Player ready request: userId=${socket.userId}, roomCode=${roomCode}`
      );

      if (!socket.gameRoom || socket.gameRoom !== roomCode) {
        console.error(
          `Player ${socket.userId} not in room ${roomCode}, current room: ${socket.gameRoom}`
        );
        return socket.emit('error', { message: 'Not in this room' });
      }

      if (!socket.userId) {
        console.error('User not identified in socket');
        return socket.emit('error', { message: 'User not identified' });
      }

      // Use atomic operation to update player ready status
      const updatedRoom = await GameRoom.findOneAndUpdate(
        {
          roomCode: roomCode,
          'currentPlayers.user': socket.userId,
        },
        {
          $set: { 'currentPlayers.$.isReady': true },
        },
        { new: true }
      ).populate('currentPlayers.user', 'username email profilePicture');

      if (!updatedRoom) {
        console.error(`Player ${socket.userId} not found in room ${roomCode}`);
        return socket.emit('error', { message: 'Player not found in room' });
      }

      console.log(
        `Player ${socket.userId} marked as ready in room ${roomCode}`
      );

      // Update session
      const sessionData = this.playerSessions.get(socket.id);
      if (sessionData) {
        try {
          await GameSession.findByIdAndUpdate(sessionData.sessionId, {
            isReady: true,
            readyAt: new Date(),
          });
          console.log(`Session ${sessionData.sessionId} marked as ready`);
        } catch (sessionError) {
          console.error('Error updating session ready status:', sessionError);
        }
      } else {
        console.warn(`No session data found for socket ${socket.id}`);
      }

      // Emit room update
      this.emitRoomUpdate(updatedRoom);

      // Check if all players are ready and start game
      console.log(
        `Checking if all players ready: ${
          updatedRoom.currentPlayers.length
        } players, ready check: ${updatedRoom.allPlayersReady()}`
      );

      if (updatedRoom.allPlayersReady()) {
        console.log(`All players ready in room ${roomCode}, starting game...`);
        await this.startGame(updatedRoom);
      } else {
        const readyCount = updatedRoom.currentPlayers.filter(
          (p) => p.isReady
        ).length;
        console.log(
          `Waiting for more players: ${readyCount}/${updatedRoom.currentPlayers.length} ready`
        );
      }
    } catch (error) {
      console.error('Error setting player ready:', error);
      socket.emit('error', { message: 'Failed to set ready status' });
    }
  }

  async handleAnswerQuestion(socket, data) {
    try {
      const { roomCode, questionId, selectedAnswer, timeSpent, questionIndex } =
        data;

      if (!socket.gameRoom || socket.gameRoom !== roomCode) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }

      const room = await GameRoom.findOne({ roomCode });
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (room.gameState !== 'playing') {
        socket.emit('error', { message: 'Game is not active' });
        return;
      }

      // Get the session and find the question from shuffled questions
      const sessionData = this.playerSessions.get(socket.id);
      if (!sessionData) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      const session = await GameSession.findById(
        sessionData.sessionId
      ).populate('shuffledQuestions');
      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Get userId from session
      const userId = session.user;

      // Find the question by ID from the session's shuffled questions
      const question = session.shuffledQuestions.find(
        (q) => q._id.toString() === questionId
      );
      if (!question) {
        socket.emit('error', { message: 'Invalid question' });
        return;
      }

      // Record answer using the question object for proper checking
      const answerResult = session.answerQuestion(
        questionId,
        selectedAnswer,
        timeSpent,
        question
      );
      if (!answerResult.success) {
        socket.emit('error', { message: answerResult.message });
        return;
      }

      await session.save();

      // Emit answer result to player (without revealing correct answer)
      socket.emit('answer-result', {
        success: true,
        isCorrect: answerResult.isCorrect,
        scoreEarned: answerResult.scoreEarned || 0,
        totalScore: answerResult.totalScore || session.score,
        currentQuestionIndex: session.currentQuestionIndex,
        stats: {
          score: session.score,
          correctAnswers: session.correctAnswers,
          totalQuestions: session.totalQuestions,
          accuracy: Math.round(
            (session.correctAnswers / Math.max(1, session.answers.length)) * 100
          ),
        },
        questionType: question.questionType,
      });

      // Emit player progress to room
      this.emitPlayerProgress(room, session);

      // Update live leaderboard
      await this.updateLiveLeaderboard(room);

      // Check if player has completed all questions
      if (session.currentQuestionIndex >= session.shuffledQuestions.length) {
        console.log(
          `Player ${userId} has completed all questions (${session.currentQuestionIndex}/${session.shuffledQuestions.length})`
        );

        // Mark session as completed
        try {
          await GameSession.findByIdAndUpdate(sessionData.sessionId, {
            status: 'completed',
            timeCompleted: new Date(),
          });
          console.log(`Session ${sessionData.sessionId} marked as completed`);

          // Emit completion event to the player
          socket.emit('player-completion-detected', {
            isCompleted: true,
            currentQuestionIndex: session.currentQuestionIndex,
            totalQuestions: session.shuffledQuestions.length,
          });

          // Trigger the player completed handler
          await this.handlePlayerCompleted(socket, {
            roomCode: room.roomCode,
            userId: userId,
          });
        } catch (error) {
          console.error('Error marking session as completed:', error);
        }
      }

      // No need to check if all players answered - individual control
    } catch (error) {
      console.error('Error answering question:', error);
      socket.emit('error', { message: 'Failed to submit answer' });
    }
  }

  async handleRequestGameState(socket, data) {
    try {
      const { roomCode } = data;

      const room = await GameRoom.findOne({ roomCode })
        .populate('questions')
        .populate('currentPlayers.user', 'username email profilePicture')
        .populate('leaderboard.user', 'username email profilePicture');

      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const sessionData = this.playerSessions.get(socket.id);
      let session = null;
      if (sessionData) {
        session = await GameSession.findById(sessionData.sessionId).populate(
          'shuffledQuestions'
        );
      }

      // Check if session has completed all questions
      const hasCompletedAllQuestions =
        session && session.currentQuestionIndex >= session.totalQuestions;

      // Check if the game has ended
      if (room.gameState === 'finished') {
        socket.emit('game-state', {
          room: this.formatRoomData(room),
          session: session ? this.formatSessionData(session) : null,
          gameState: 'finished',
        });
        return;
      }

      // If player has completed all questions but game is still playing
      if (hasCompletedAllQuestions && room.gameState === 'playing') {
        console.log(
          `Player ${sessionData.userId} has completed all questions - sending completion state`
        );

        socket.emit('player-completion-state', {
          room: this.formatRoomData(room),
          session: this.formatSessionData(session),
          playerStats: {
            score: session.score,
            correctAnswers: session.correctAnswers,
            totalQuestions: session.totalQuestions,
            accuracy: Math.round(
              (session.correctAnswers / session.totalQuestions) * 100
            ),
            timeSpent: session.timeSpent,
          },
        });
        return;
      }

      // Normal game state response
      socket.emit('game-state', {
        room: this.formatRoomData(room),
        session: session ? this.formatSessionData(session) : null,
        gameState: room.gameState,
      });

      // If game is playing and session exists, send current question
      if (
        room.gameState === 'playing' &&
        session &&
        !hasCompletedAllQuestions
      ) {
        if (session.shuffledQuestions && session.shuffledQuestions.length > 0) {
          const currentQuestionIndex = Math.min(
            session.currentQuestionIndex || 0,
            session.shuffledQuestions.length - 1
          );

          const question = session.shuffledQuestions[currentQuestionIndex];

          if (question) {
            socket.emit('question-loaded', {
              question: this.formatQuestionData(question),
              questionIndex: currentQuestionIndex,
              totalQuestions: session.shuffledQuestions.length,
              timeLimit: room.timePerQuestion || 30,
            });
          }
        }
      }
    } catch (error) {
      console.error('Error getting game state:', error);
      socket.emit('error', { message: 'Failed to get game state' });
    }
  }

  async handleDisconnect(socket) {
    try {
      const sessionData = this.playerSessions.get(socket.id);
      if (!sessionData) {
        console.log(`Socket ${socket.id} disconnected with no session data`);
        return;
      }

      const { roomCode, userId } = sessionData;
      console.log(
        `Player ${userId} disconnected from room ${roomCode} (socket: ${socket.id})`
      );

      // Check if this user has another active connection in the same room
      const otherActiveSessions = Array.from(
        this.playerSessions.entries()
      ).filter(
        ([socketId, session]) =>
          socketId !== socket.id &&
          session.userId === userId &&
          session.roomCode === roomCode
      );

      if (otherActiveSessions.length > 0) {
        console.log(
          `Player ${userId} has another active connection - not removing from room`
        );
        this.playerSessions.delete(socket.id);
        return;
      }

      // Create a unique key for this user-room combination
      const disconnectionKey = `${userId}-${roomCode}`;

      // Clear any existing disconnection timer for this user-room combination
      if (this.disconnectionTimers.has(disconnectionKey)) {
        clearTimeout(this.disconnectionTimers.get(disconnectionKey));
        this.disconnectionTimers.delete(disconnectionKey);
      }

      // Set up a delayed removal timer
      const removalTimer = setTimeout(async () => {
        try {
          console.log(
            `Grace period expired for player ${userId} in room ${roomCode}, removing from room`
          );

          // Double-check if the user has reconnected during the grace period
          const currentActiveSessions = Array.from(
            this.playerSessions.values()
          ).filter(
            (session) =>
              session.userId === userId && session.roomCode === roomCode
          );

          if (currentActiveSessions.length === 0) {
            // User hasn't reconnected, remove them from the room
            const room = await GameRoom.findOne({ roomCode });
            if (room) {
              const removeResult = await GameRoom.removePlayerAtomic(
                room._id,
                userId
              );

              if (removeResult.success) {
                console.log(
                  `Player ${userId} removed from room ${removeResult.room._id}`
                );
                console.log(
                  `Room update broadcasted for room ${roomCode} (${removeResult.room.currentPlayers.length} players)`
                );

                // Emit room update to all players
                this.emitRoomUpdate(removeResult.room);

                // Emit specific leave event
                this.io.to(roomCode).emit('player-left', {
                  userId: userId,
                  roomCode: roomCode,
                  currentPlayerCount: removeResult.room.currentPlayers.length,
                  message: `Player left room ${roomCode}`,
                });

                console.log(`Player ${userId || 'null'} left room ${roomCode}`);

                // Update game session
                // If session still active, mark as disconnected and completed if necessary
                const session = await GameSession.findOne({
                  user: userId,
                  gameRoom: room._id,
                  isActive: true,
                });
                if (session) {
                  try {
                    // If player had answered some questions, complete their session so they don't block others
                    if (
                      session.currentQuestionIndex >= session.totalQuestions ||
                      session.answers.length > 0
                    ) {
                      session.status = 'completed';
                      session.timeCompleted = new Date();
                      session.isActive = false;
                      session.timeSpent = Math.floor(
                        (session.timeCompleted - session.timeStarted) / 1000
                      );
                      await session.save();
                      console.log(
                        `Session ${session._id} marked completed due to disconnect (grace expired)`
                      );
                    } else {
                      // Otherwise mark as disconnected so endGame will not wait on them
                      session.status = 'disconnected';
                      session.isActive = false;
                      session.timeCompleted = new Date();
                      await session.save();
                      console.log(
                        `Session ${session._id} marked disconnected (grace expired)`
                      );
                    }
                  } catch (sessErr) {
                    console.error(
                      'Error updating session on delayed removal:',
                      sessErr
                    );
                  }
                }
              }
            }
          } else {
            console.log(
              `Player ${userId} reconnected during grace period, not removing from room`
            );
          }
        } catch (error) {
          console.error(
            `Error during delayed removal for player ${userId}:`,
            error
          );
        } finally {
          // Clean up the timer reference
          this.disconnectionTimers.delete(disconnectionKey);
        }
      }, this.reconnectionGracePeriod);

      // Store the timer reference
      this.disconnectionTimers.set(disconnectionKey, removalTimer);

      console.log(
        `Player ${userId} disconnected from room ${roomCode} - grace period started (${
          this.reconnectionGracePeriod / 1000
        }s)`
      );

      // Clean up the session data
      this.playerSessions.delete(socket.id);
    } catch (error) {
      console.error('Error handling socket disconnect:', error);
      // Clean up session data even if there's an error
      this.playerSessions.delete(socket.id);
    }
  }

  async startGame(room) {
    try {
      const startResult = room.startGame();
      if (!startResult.success) {
        this.io
          .to(room.roomCode)
          .emit('error', { message: startResult.message });
        return;
      }

      // Use atomic operation to update game state and get updated room
      const updatedRoom = await GameRoom.findByIdAndUpdate(
        room._id,
        { gameState: 'starting', gameStartedAt: new Date() },
        { new: true }
      ).populate('questions');

      // Emit game starting
      this.io.to(updatedRoom.roomCode).emit('game-starting', {
        room: this.formatRoomData(updatedRoom),
        countdown: 5,
      });

      // Start countdown
      let countdown = 5;
      const countdownInterval = setInterval(() => {
        countdown--;
        this.io.to(updatedRoom.roomCode).emit('game-countdown', { countdown });

        if (countdown <= 0) {
          clearInterval(countdownInterval);
          this.beginGameplay(updatedRoom);
        }
      }, 1000);
    } catch (error) {
      console.error('Error starting game:', error);
      this.io
        .to(room.roomCode)
        .emit('error', { message: 'Failed to start game' });
    }
  }

  async beginGameplay(room) {
    try {
      // Use atomic operation to update game state and get updated room with questions
      const updatedRoom = await GameRoom.findByIdAndUpdate(
        room._id,
        { gameState: 'playing' },
        { new: true }
      ).populate('questions');

      // Send first question with the updated room
      await this.sendQuestion(updatedRoom, 0);
    } catch (error) {
      console.error('Error beginning gameplay:', error);
    }
  }

  async sendQuestion(room, questionIndex) {
    try {
      if (questionIndex >= room.questions.length) {
        await this.endGame(room);
        return;
      }

      // Use atomic operation to update current question index and populate questions
      const updatedRoom = await GameRoom.findByIdAndUpdate(
        room._id,
        { currentQuestionIndex: questionIndex },
        { new: true }
      ).populate('questions');

      // Send the question to each player with their individual shuffled order
      await this.sendQuestionToAllPlayers(updatedRoom, questionIndex);

      // Start question timer as backup
      setTimeout(() => {
        this.checkQuestionComplete(updatedRoom);
      }, (updatedRoom.timePerQuestion || 30) * 1000);
    } catch (error) {
      console.error('Error sending question:', error);
    }
  }

  // Send question to all players with their individual shuffled order
  async sendQuestionToAllPlayers(room, questionIndex) {
    try {
      // Get all active sessions for this room
      const sessions = await GameSession.find({
        gameRoom: room._id,
        isActive: true,
      }).populate('shuffledQuestions');

      // If no sessions found or sessions don't have shuffled questions, fallback to original method
      if (
        sessions.length === 0 ||
        sessions.some(
          (s) => !s.shuffledQuestions || s.shuffledQuestions.length === 0
        )
      ) {
        console.log('Falling back to original question sending method');
        // Fallback to original method - send same question to all players
        const question = room.questions[questionIndex];
        if (question) {
          // Calculate remaining time for the entire session
          const gameStartTime = room.gameStartedAt || new Date();
          const totalTimeMs = room.totalTime * 60 * 1000;
          const elapsedTime = Date.now() - gameStartTime.getTime();
          const remainingTimeMs = Math.max(0, totalTimeMs - elapsedTime);
          const remainingTimeSeconds = Math.floor(remainingTimeMs / 1000);

          // Emit question to all players in the room
          this.io.to(room.roomCode).emit('new-question', {
            question: this.formatQuestionData(question),
            questionIndex: questionIndex + 1,
            totalQuestions: room.questions.length,
            timePerQuestion: room.timePerQuestion || 30,
            totalTimeRemaining: remainingTimeSeconds,
            currentQuestionIndex: questionIndex,
          });
        }
      } else {
        // Send question to each player based on their shuffled order
        for (const session of sessions) {
          if (
            session.shuffledQuestions &&
            session.shuffledQuestions.length > questionIndex
          ) {
            const playerQuestion = session.shuffledQuestions[questionIndex];
            const socketId = this.findSocketByUserId(session.user.toString());

            if (socketId && playerQuestion) {
              const socket = this.io.sockets.sockets.get(socketId);
              if (socket) {
                // Calculate remaining time for the entire session
                const gameStartTime = room.gameStartedAt || new Date();
                const totalTimeMs = room.totalTime * 60 * 1000;
                const elapsedTime = Date.now() - gameStartTime.getTime();
                const remainingTimeMs = Math.max(0, totalTimeMs - elapsedTime);
                const remainingTimeSeconds = Math.floor(remainingTimeMs / 1000);

                // Emit question to this specific player
                socket.emit('new-question', {
                  question: this.formatQuestionData(playerQuestion),
                  questionIndex: questionIndex + 1,
                  totalQuestions: room.questions.length,
                  timePerQuestion: room.timePerQuestion || 30,
                  totalTimeRemaining: remainingTimeSeconds,
                  currentQuestionIndex: questionIndex,
                });
              }
            }
          }
        }
      }

      // Start session timer if this is the first question
      if (questionIndex === 0) {
        const gameStartTime = room.gameStartedAt || new Date();
        const totalTimeMs = room.totalTime * 60 * 1000;
        const elapsedTime = Date.now() - gameStartTime.getTime();
        const remainingTimeMs = Math.max(0, totalTimeMs - elapsedTime);
        const remainingTimeSeconds = Math.floor(remainingTimeMs / 1000);
        this.startSessionTimer(room, remainingTimeSeconds);
      }
    } catch (error) {
      console.error('Error sending question to all players:', error);
    }
  }

  // Helper method to find socket ID by user ID
  findSocketByUserId(userId) {
    for (const [socketId, sessionData] of this.playerSessions.entries()) {
      if (
        sessionData.userId === userId ||
        sessionData.userId === userId.toString()
      ) {
        return socketId;
      }
    }
    return null;
  }

  startSessionTimer(room, initialTimeSeconds) {
    console.log(
      `Starting session timer for room ${room.roomCode} with ${initialTimeSeconds} seconds`
    );

    let remainingSeconds = initialTimeSeconds;

    const timer = setInterval(async () => {
      // Check if room still exists and game is not finished
      const currentRoom = await GameRoom.findById(room._id);
      if (!currentRoom || currentRoom.gameState === 'finished') {
        console.log(
          `Stopping session timer for room ${room.roomCode} - game finished or room removed`
        );
        clearInterval(timer);
        if (this.sessionTimers) {
          this.sessionTimers.delete(room.roomCode);
        }
        return;
      }

      remainingSeconds--;

      // Only emit timer updates if game is still active (not finished)
      if (currentRoom.gameState !== 'finished') {
        this.io.to(room.roomCode).emit('session-timer-update', {
          remainingSeconds: remainingSeconds,
          remainingMinutes: Math.floor(remainingSeconds / 60),
          remainingSecondsOnly: remainingSeconds % 60,
        });
      }

      // Check if time is up
      if (remainingSeconds <= 0) {
        clearInterval(timer);
        console.log(`Session timer expired for room ${room.roomCode}`);

        // Get the latest room state before ending the game
        const latestRoom = await GameRoom.findById(room._id);
        if (!latestRoom || latestRoom.gameState === 'finished') {
          console.log(
            `Room ${room.roomCode} already finished, skipping timer-based endGame`
          );
          if (this.sessionTimers) {
            this.sessionTimers.delete(room.roomCode);
          }
          return;
        }

        // End the game
        this.io.to(room.roomCode).emit('session-time-up', {
          message: "Time's up! The game session has ended.",
        });

        setTimeout(async () => {
          // Get the most up-to-date room state before ending
          const freshRoom = await GameRoom.findById(room._id);
          if (freshRoom && freshRoom.gameState !== 'finished') {
            await this.endGame(freshRoom);
          } else {
            console.log(
              `Room ${room.roomCode} already finished by another process, skipping timer endGame`
            );
          }
        }, 2000);
      }
    }, 1000);

    // Store timer reference for cleanup
    if (!this.sessionTimers) {
      this.sessionTimers = new Map();
    }
    this.sessionTimers.set(room.roomCode, timer);
  }

  async checkQuestionComplete(room) {
    try {
      const sessions = await GameSession.find({
        gameRoom: room._id,
        isActive: true,
      });

      const answeredSessions = sessions.filter((s) =>
        s.answers.some(
          (a) =>
            a.questionId.toString() ===
            room.questions[room.currentQuestionIndex]._id.toString()
        )
      );

      // If all players answered or time is up, move to next question
      if (
        answeredSessions.length === sessions.length ||
        room.gameState !== 'playing'
      ) {
        // Add a delay to show feedback before moving to next question
        this.io.to(room.roomCode).emit('question-complete', {
          message: 'All players have answered. Moving to next question...',
          delay: 3000, // 3 seconds delay
        });

        setTimeout(async () => {
          await this.nextQuestion(room);
        }, 3000);
      }
    } catch (error) {
      console.error('Error checking question complete:', error);
    }
  }

  async nextQuestion(room) {
    try {
      const nextIndex = room.currentQuestionIndex + 1;

      if (nextIndex >= room.questions.length) {
        await this.endGame(room);
      } else {
        await this.sendQuestion(room, nextIndex);
      }
    } catch (error) {
      console.error('Error moving to next question:', error);
    }
  }

  async endGame(room) {
    try {
      // Check if this room is already being ended
      if (this.endingGames.has(room.roomCode)) {
        console.log(
          `Room ${room.roomCode} is already being ended, skipping duplicate endGame call`
        );
        return;
      }

      // Mark this room as being ended
      this.endingGames.add(room.roomCode);

      // Check if game is already finished to prevent duplicate processing
      const currentRoom = await GameRoom.findById(room._id);
      if (!currentRoom || currentRoom.gameState === 'finished') {
        console.log(
          `Game in room ${room.roomCode} already finished, skipping endGame`
        );
        this.endingGames.delete(room.roomCode); // Clean up flag
        return;
      }

      // Atomically set game state to 'finished' to prevent race conditions
      const updatedRoom = await GameRoom.findByIdAndUpdate(
        room._id,
        {
          gameState: 'finished',
          gameEndedAt: new Date(),
        },
        { new: true }
      );

      if (!updatedRoom || updatedRoom.gameState !== 'finished') {
        console.log(`Failed to update room ${room.roomCode} to finished state`);
        this.endingGames.delete(room.roomCode); // Clean up flag
        return;
      }

      console.log(`Starting endGame process for room ${room.roomCode}`);

      // Get all sessions for this room (both active and completed)
      const sessions = await GameSession.find({
        gameRoom: room._id,
        $or: [{ isActive: true }, { status: 'completed' }],
      }).populate('user', 'username email profilePicture');

      console.log(
        `Found ${sessions.length} sessions for room ${room.roomCode}`
      );

      // Create a Map to ensure each user appears only once in the leaderboard
      const playerMap = new Map();

      // Process each session and deduplicate by user ID
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        const userId = session.user._id.toString();

        // Skip if we already processed this user (deduplication)
        if (playerMap.has(userId)) {
          console.log(
            `Skipping duplicate session for user ${userId} in room ${room.roomCode}`
          );
          continue;
        }

        let result;

        // If session is not already completed, complete it now
        if (session.status !== 'completed') {
          result = session.completeGame();
          await session.save();
          console.log(`Completed session for user ${userId}`);
        } else {
          // Session already completed, use existing data
          result = {
            finalScore: session.score,
            timeSpent: session.timeSpent,
            correctAnswers: session.correctAnswers,
            totalQuestions: session.totalQuestions,
          };
          console.log(
            `Using existing completed session data for user ${userId}`
          );
        }

        // Add to playerMap for deduplication
        playerMap.set(userId, {
          user: session.user,
          score: result.finalScore,
          timeCompleted: result.timeSpent,
          correctAnswers: result.correctAnswers,
          totalQuestions: result.totalQuestions,
          position: 0, // Will be set after sorting
        });
      }

      // Convert Map to array for leaderboard
      const leaderboard = Array.from(playerMap.values());

      console.log(
        `Created leaderboard with ${leaderboard.length} unique players for room ${room.roomCode}`
      );

      // Sort leaderboard
      leaderboard.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timeCompleted - b.timeCompleted;
      });

      // Update positions
      leaderboard.forEach((entry, index) => {
        entry.position = index + 1;
      });

      // Use atomic operation to update leaderboard and winner
      const winner =
        leaderboard.length > 0
          ? {
              user: leaderboard[0].user,
              score: leaderboard[0].score,
              timeCompleted: leaderboard[0].timeCompleted,
            }
          : null;

      await GameRoom.findByIdAndUpdate(room._id, {
        leaderboard: leaderboard,
        winner: winner,
      });

      // Clean up session timer for this room
      if (this.sessionTimers && this.sessionTimers.has(room.roomCode)) {
        clearInterval(this.sessionTimers.get(room.roomCode));
        this.sessionTimers.delete(room.roomCode);
        console.log(`Cleared session timer for finished room ${room.roomCode}`);
      }

      // Emit game results
      this.io.to(room.roomCode).emit('game-ended', {
        leaderboard: leaderboard,
        winner: leaderboard[0],
        room: this.formatRoomData(updatedRoom),
      });

      console.log(
        `Game ended in room ${room.roomCode} with ${leaderboard.length} unique players - all timers cleared`
      );

      // Clean up the ending flag
      this.endingGames.delete(room.roomCode);
    } catch (error) {
      console.error('Error ending game:', error);
      // Clean up the ending flag even on error
      this.endingGames.delete(room.roomCode);
    }
  }

  emitRoomUpdate(room) {
    try {
      const roomData = this.formatRoomData(room);

      // Emit to players in the specific room (for game room play page)
      this.io.to(room.roomCode).emit('room-update', {
        room: roomData,
        timestamp: new Date().toISOString(),
      });

      // Emit to all connected clients (for game rooms list page)
      this.io.emit('global-room-update', {
        room: roomData,
        timestamp: new Date().toISOString(),
      });

      // Also emit the older event name for backward compatibility
      this.io.emit('room-update', {
        room: roomData,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `Room update broadcasted for room ${room.roomCode} (${room.currentPlayers.length} players)`
      );
    } catch (error) {
      console.error('Error emitting room update:', error);
    }
  }

  emitPlayerProgress(room, session) {
    this.io.to(room.roomCode).emit('player-progress', {
      userId: session.user,
      score: session.score,
      currentQuestionIndex: session.currentQuestionIndex,
      correctAnswers: session.correctAnswers,
    });
  }

  async handleRequestQuestion(socket, data) {
    try {
      const { roomCode, questionIndex } = data;

      const room = await GameRoom.findOne({ roomCode });
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Get the session for this user
      const sessionData = this.playerSessions.get(socket.id);
      if (!sessionData) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      const session = await GameSession.findById(
        sessionData.sessionId
      ).populate('shuffledQuestions');
      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      if (
        questionIndex >= 0 &&
        questionIndex < session.shuffledQuestions.length
      ) {
        const question = session.shuffledQuestions[questionIndex];
        socket.emit('question-loaded', {
          question: this.formatQuestionData(question),
          questionIndex: questionIndex,
          totalQuestions: room.questions.length,
        });
      } else {
        socket.emit('error', { message: 'Invalid question index' });
      }
    } catch (error) {
      console.error('Error requesting question:', error);
      socket.emit('error', { message: 'Failed to load question' });
    }
  }

  async handlePlayerCompleted(socket, data) {
    try {
      const { roomCode, userId } = data;

      console.log(
        `Player ${userId} completed all questions in room ${roomCode}`
      );

      // Get user information for the notification
      const sessionData = this.playerSessions.get(socket.id);
      let username = 'Player';

      if (sessionData && sessionData.sessionId) {
        try {
          const session = await GameSession.findById(
            sessionData.sessionId
          ).populate('user', 'username');
          if (session && session.user && session.user.username) {
            username = session.user.username;
          }
        } catch (error) {
          console.error('Error getting user info for completion:', error);
        }
      }

      // Mark session as completed
      if (sessionData && sessionData.sessionId) {
        try {
          await GameSession.findByIdAndUpdate(sessionData.sessionId, {
            status: 'completed',
            timeCompleted: new Date(),
          });
          console.log(`Session ${sessionData.sessionId} marked as completed`);
        } catch (error) {
          console.error('Error marking session as completed:', error);
        }
      }

      // Notify other players (not the one who completed) that this player finished
      socket.to(roomCode).emit('player-completed', {
        userId: userId,
        username: username,
        completedAt: new Date(),
      });

      // Check if ALL players have completed and end the game only then
      const room = await GameRoom.findOne({ roomCode }).populate(
        'currentPlayers.user'
      );
      if (room) {
        // Get all active sessions for current players only
        const currentPlayerIds = room.currentPlayers.map((p) =>
          p.user._id.toString()
        );

        // Consider both completed and disconnected sessions as not blocking the end
        const allSessionsForPlayers = await GameSession.find({
          gameRoom: room._id,
          user: { $in: currentPlayerIds },
        });

        const completedOrDisconnected = allSessionsForPlayers.filter(
          (session) => ['completed', 'disconnected'].includes(session.status)
        );

        // Sessions that are strictly completed (not disconnected)
        const completedSessions = allSessionsForPlayers.filter(
          (session) => session.status === 'completed'
        );

        console.log(
          `Room ${roomCode}: ${completedOrDisconnected.length}/${allSessionsForPlayers.length} players completed/disconnected`
        );
        console.log(
          'Current player sessions status:',
          allSessionsForPlayers.map((s) => ({
            user: s.user,
            status: s.status,
            isActive: s.status !== 'disconnected',
          }))
        );

        // Only end game when ALL current players have completed
        if (
          completedOrDisconnected.length === allSessionsForPlayers.length &&
          allSessionsForPlayers.length > 0 &&
          completedOrDisconnected.length === room.currentPlayers.length // Must equal total current players
        ) {
          console.log(
            `ALL players (${completedSessions.length}/${room.currentPlayers.length}) completed in room ${roomCode}, ending game...`
          );

          // This is the last player to complete - send them directly to game end
          socket.emit('game-ending-immediately', {
            message: 'All players have completed! Calculating final results...',
            isLastPlayer: true,
          });

          // Get the latest room state before ending the game
          const latestRoom = await GameRoom.findById(room._id);
          if (latestRoom && latestRoom.gameState !== 'finished') {
            await this.endGame(latestRoom);
          } else {
            console.log(
              `Room ${roomCode} already finished, skipping player completion endGame`
            );
          }
        } else {
          console.log(
            `Waiting for more players: ${completedSessions.length}/${room.currentPlayers.length} completed`
          );

          // This player needs to wait for others
          socket.emit('player-completion-confirmed', {
            userId: userId,
            username: username,
            completedAt: new Date(),
            message:
              'You have completed all questions! Waiting for other players...',
            playersRemaining:
              room.currentPlayers.length - completedSessions.length,
          });

          // Update live leaderboard for all players to show current progress
          await this.updateLiveLeaderboard(room);
        }
      }
    } catch (error) {
      console.error('Error handling player completed:', error);
    }
  }

  async updateLiveLeaderboard(room) {
    try {
      // Include all sessions for the room so completed players also appear on the leaderboard
      const sessions = await GameSession.find({
        gameRoom: room._id,
      }).populate('user', 'username email profilePicture');

      // Create live leaderboard sorted by score
      const leaderboard = sessions
        .map((session) => ({
          user: session.user,
          score: session.score,
          correctAnswers: session.correctAnswers,
          totalQuestions: session.totalQuestions || room.questions.length,
          currentQuestionIndex: session.currentQuestionIndex,
          status: session.status,
          isCompleted: session.status === 'completed',
          accuracy:
            session.totalQuestions > 0
              ? Math.round(
                  (session.correctAnswers / session.totalQuestions) * 100
                )
              : 0,
        }))
        .sort((a, b) => {
          // First sort by completion status (completed players first)
          if (a.isCompleted !== b.isCompleted) {
            return b.isCompleted ? 1 : -1;
          }
          // Then by score (higher first)
          if (b.score !== a.score) return b.score - a.score;
          // Then by progress (more questions answered first)
          return b.currentQuestionIndex - a.currentQuestionIndex;
        });

      // Emit to all players in the room
      this.io.to(room.roomCode).emit('live-leaderboard-update', {
        leaderboard: leaderboard,
        roomState: {
          totalQuestions: room.questions.length,
          gameState: room.gameState,
          playersCount: room.currentPlayers.length,
        },
      });
    } catch (error) {
      console.error('Error updating live leaderboard:', error);
    }
  }

  formatRoomData(room) {
    return {
      _id: room._id,
      title: room.title,
      description: room.description,
      roomCode: room.roomCode,
      maxPlayers: room.maxPlayers,
      currentPlayerCount: room.currentPlayerCount,
      currentPlayers: room.currentPlayers.map((p) => ({
        user: p.user,
        isReady: p.isReady,
        joinedAt: p.joinedAt,
      })),
      gameState: room.gameState,
      currentQuestionIndex: room.currentQuestionIndex,
      timePerQuestion: room.timePerQuestion,
      totalQuestions: room.questions.length,
      leaderboard: room.leaderboard,
      winner: room.winner,
      gameStartedAt: room.gameStartedAt,
      gameEndedAt: room.gameEndedAt,
    };
  }

  formatSessionData(session) {
    return {
      _id: session._id,
      score: session.score,
      correctAnswers: session.correctAnswers,
      totalQuestions: session.totalQuestions,
      currentQuestionIndex: session.currentQuestionIndex,
      status: session.status,
      isReady: session.isReady,
      answers: session.answers,
      accuracy: session.accuracy,
      averageTimePerQuestion: session.averageTimePerQuestion,
      timeStarted: session.timeStarted,
      timeCompleted: session.timeCompleted,
      timeSpent: session.timeSpent,
      position: session.position,
    };
  }

  formatQuestionData(question) {
    return {
      _id: question._id,
      questionText: question.questionText,
      question: question.questionText || question.question, // For backward compatibility
      questionImage: question.questionImage,
      questionType: question.questionType,
      options: question.options,
      difficulty: question.difficulty,
      category: question.category,
      explanation: question.explanation,
      points: question.points || 1,
      // Don't include correctAnswer in the formatted data
    };
  }
}

module.exports = GameSocketHandler;
