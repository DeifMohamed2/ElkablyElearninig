const mongoose = require('mongoose');
const GameSession = require('./GameSession');

const gameRoomSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    category: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    maxPlayers: {
      type: Number,
      required: true,
      min: 2,
      max: 8,
      default: 4,
    },
    timePerQuestion: {
      type: Number, // in seconds
      required: false,
    },
    totalTime: {
      type: Number, // in minutes
      required: true,
    },
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],
    thumbnail: {
      url: String,
      filename: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    roomCode: {
      type: String,
      unique: true,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    currentPlayers: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        lastActive: {
          type: Date,
          default: Date.now,
        },
        socketId: String,
        isReady: {
          type: Boolean,
          default: false,
        },
      },
    ],
    gameState: {
      type: String,
      enum: ['waiting', 'starting', 'playing', 'finished'],
      default: 'waiting',
    },
    activeSessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameSession',
      },
    ],
    maxSessions: {
      type: Number,
      default: 10, // Allow multiple sessions per room
    },
    currentQuestionIndex: {
      type: Number,
      default: 0,
    },
    gameStartedAt: Date,
    gameEndedAt: Date,
    winner: {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      score: Number,
      timeCompleted: Number,
    },
    leaderboard: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        score: Number,
        timeCompleted: Number,
        correctAnswers: Number,
        totalQuestions: Number,
        position: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Generate unique room code before validation so "required" passes
gameRoomSchema.pre('validate', async function (next) {
  if (!this.roomCode) {
    let roomCode;
    let isUnique = false;

    while (!isUnique) {
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const existingRoom = await this.constructor.findOne({ roomCode });
      if (!existingRoom) {
        isUnique = true;
      }
    }

    this.roomCode = roomCode;
  }
  next();
});

// Virtual for current player count
gameRoomSchema.virtual('currentPlayerCount').get(function () {
  return this.currentPlayers.length;
});

// Virtual for game duration
gameRoomSchema.virtual('gameDuration').get(function () {
  if (this.gameStartedAt && this.gameEndedAt) {
    return Math.floor((this.gameEndedAt - this.gameStartedAt) / 1000);
  }
  return null;
});

// Static method to add player to room using atomic operations
gameRoomSchema.statics.addPlayerAtomic = async function (
  roomId,
  userId,
  socketId
) {
  // Validate input
  if (!userId || !roomId) {
    return { success: false, message: 'Invalid user or room' };
  }

  const userIdStr = userId.toString();

  try {
    // First, try to update existing player's socket ID (allow for any game state)
    const updateExisting = await this.findOneAndUpdate(
      {
        _id: roomId,
        'currentPlayers.user': userId,
      },
      {
        $set: {
          'currentPlayers.$.socketId': socketId,
          'currentPlayers.$.lastActive': new Date(),
        },
      },
      { new: true }
    );

    if (updateExisting) {
      console.log(
        `Player ${userIdStr} already in room, updating socket ID (gameState: ${updateExisting.gameState})`
      );
      return {
        success: true,
        message: 'Player connection updated',
        isExisting: true,
        room: updateExisting,
      };
    }

    // If player doesn't exist, check if we can add them (only for waiting rooms)
    const addNew = await this.findOneAndUpdate(
      {
        _id: roomId,
        gameState: 'waiting',
        'currentPlayers.user': { $ne: userId },
        $expr: { $lt: [{ $size: '$currentPlayers' }, '$maxPlayers'] },
      },
      {
        $push: {
          currentPlayers: {
            user: userId,
            socketId: socketId,
            joinedAt: new Date(),
            isReady: false,
            lastActive: new Date(),
          },
        },
      },
      { new: true }
    );

    if (addNew) {
      console.log(`Adding new player ${userIdStr} to room`);
      console.log(
        `Room now has ${addNew.currentPlayers.length}/${addNew.maxPlayers} players`
      );
      return {
        success: true,
        message: 'Player added to room',
        isNew: true,
        room: addNew,
      };
    }

    // If we reach here, either room is full, game started, or room doesn't exist
    const room = await this.findById(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }
    if (room.gameState !== 'waiting') {
      return {
        success: false,
        message:
          'Game has already started - only existing players can reconnect',
      };
    }
    if (room.currentPlayers.length >= room.maxPlayers) {
      return { success: false, message: 'Room is full' };
    }

    return { success: false, message: 'Unable to join room' };
  } catch (error) {
    console.error('Error in addPlayerAtomic:', error);
    return { success: false, message: 'Database error occurred' };
  }
};

// Static method to remove player from room using atomic operations
gameRoomSchema.statics.removePlayerAtomic = async function (roomId, userId) {
  if (!userId || !roomId) {
    return { success: false, message: 'Invalid user or room' };
  }

  try {
    const result = await this.findOneAndUpdate(
      { _id: roomId },
      {
        $pull: { currentPlayers: { user: userId } },
      },
      { new: true }
    );

    if (!result) {
      return { success: false, message: 'Room not found' };
    }

    // If no players left, reset game state only if room is not finished
    // This prevents finished rooms from being reset to waiting state
    if (result.currentPlayers.length === 0 && result.gameState !== 'finished') {
      await this.findByIdAndUpdate(roomId, {
        gameState: 'waiting',
        currentQuestionIndex: 0,
      });
    }

    console.log(`Player ${userId} removed from room ${roomId}`);
    return { success: true, message: 'Player removed from room', room: result };
  } catch (error) {
    console.error('Error in removePlayerAtomic:', error);
    return { success: false, message: 'Database error occurred' };
  }
};

// Instance method for backward compatibility
gameRoomSchema.methods.addPlayer = function (userId, socketId) {
  // This method now just calls the static atomic version
  return this.constructor.addPlayerAtomic(this._id, userId, socketId);
};

// Instance method for backward compatibility
gameRoomSchema.methods.removePlayer = function (userId) {
  // This method now just calls the static atomic version
  return this.constructor.removePlayerAtomic(this._id, userId);
};

// Method to check if all players are ready
gameRoomSchema.methods.allPlayersReady = function () {
  // Need at least 2 players and all current players must be ready
  return (
    this.currentPlayers.length >= 2 &&
    this.currentPlayers.every((p) => p.isReady)
  );
};

// Method to start game
gameRoomSchema.methods.startGame = function () {
  if (this.currentPlayers.length < 2) {
    return { success: false, message: 'Need at least 2 players to start' };
  }

  this.gameState = 'starting';
  this.gameStartedAt = new Date();
  this.currentQuestionIndex = 0;

  return { success: true, message: 'Game starting' };
};

// Method to end game
gameRoomSchema.methods.endGame = function (leaderboard) {
  this.gameState = 'finished';
  this.gameEndedAt = new Date();
  this.leaderboard = leaderboard;

  if (leaderboard && leaderboard.length > 0) {
    this.winner = {
      user: leaderboard[0].user,
      score: leaderboard[0].score,
      timeCompleted: leaderboard[0].timeCompleted,
    };
  }

  return { success: true, message: 'Game ended' };
};

// Method to reset room for new sessions
gameRoomSchema.methods.resetForNewSession = function () {
  this.gameState = 'waiting';
  this.currentPlayers = [];
  this.currentQuestionIndex = 0;
  this.gameStartedAt = null;
  this.gameEndedAt = null;
  this.winner = null;
  this.leaderboard = [];

  return { success: true, message: 'Room reset for new session' };
};

// Static method to find or create session group
gameRoomSchema.statics.findOrCreateSessionGroup = async function (
  roomId,
  userId
) {
  const room = await this.findById(roomId);
  if (!room) {
    return { success: false, message: 'Room not found' };
  }

  // Check if user is already in a session group
  const existingSession = await GameSession.findOne({
    gameRoom: roomId,
    user: userId,
    isActive: true,
  });

  if (existingSession) {
    return { success: true, session: existingSession, isExisting: true };
  }

  // Find available session group (less than 4 players)
  const activeSessions = await GameSession.find({
    gameRoom: roomId,
    isActive: true,
    status: 'waiting',
  }).populate('user');

  // Group sessions by similar start times (within 30 seconds)
  const sessionGroups = {};
  activeSessions.forEach((session) => {
    const timeKey = Math.floor(session.timeStarted.getTime() / 30000) * 30000; // 30 second buckets
    if (!sessionGroups[timeKey]) {
      sessionGroups[timeKey] = [];
    }
    sessionGroups[timeKey].push(session);
  });

  // Find a group with space
  for (const [timeKey, sessions] of Object.entries(sessionGroups)) {
    if (sessions.length < 4) {
      // Join existing group
      const session = new GameSession({
        user: userId,
        gameRoom: roomId,
        totalQuestions: room.questions.length,
        isActive: true,
        isReady: false,
        status: 'waiting',
      });
      await session.save();
      return {
        success: true,
        session,
        isExisting: false,
        groupSize: sessions.length + 1,
      };
    }
  }

  // Create new session group
  const session = new GameSession({
    user: userId,
    gameRoom: roomId,
    totalQuestions: room.questions.length,
    isActive: true,
    isReady: false,
    status: 'waiting',
  });
  await session.save();
  return { success: true, session, isExisting: false, groupSize: 1 };
};

// Index for better performance
gameRoomSchema.index({ roomCode: 1 });
gameRoomSchema.index({ isActive: 1, isPublic: 1 });
gameRoomSchema.index({ gameState: 1 });
gameRoomSchema.index({ createdBy: 1 });

module.exports = mongoose.model('GameRoom', gameRoomSchema);
