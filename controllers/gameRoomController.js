const GameRoom = require('../models/GameRoom');
const GameSession = require('../models/GameSession');
const Question = require('../models/Question');
const User = require('../models/User');
const QuestionBank = require('../models/QuestionBank');

// Admin Game Room Management
exports.getAdminGameRooms = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.search) {
      filter.title = { $regex: req.query.search, $options: 'i' };
    }
    if (req.query.difficulty) {
      filter.difficulty = req.query.difficulty;
    }
    if (req.query.gameState) {
      filter.gameState = req.query.gameState;
    }

    const gameRooms = await GameRoom.find(filter)
      .populate('createdBy', 'username email')
      .populate('questions')
      .populate('currentPlayers.user', 'username email')
      .populate('winner.user', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await GameRoom.countDocuments(filter);

    res.render('admin/game-rooms', {
      title: 'Game Rooms Management',
      currentPage: 'game-rooms',
      theme: req.cookies.theme || 'light',
      gameRooms,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: req.query,
    });
  } catch (error) {
    console.error('Error fetching game rooms:', error);
    req.flash('error', 'Failed to fetch game rooms');
    res.redirect('/admin/dashboard');
  }
};

exports.getCreateGameRoom = async (req, res) => {
  try {
    const banks = await QuestionBank.find({ isActive: true })
      .select('name bankCode totalQuestions')
      .sort({ createdAt: -1 });
    const questions = [];

    res.render('admin/create-game-room', {
      title: 'Create Game Room',
      currentPage: 'game-rooms',
      theme: req.cookies.theme || 'light',
      banks,
      questions,
    });
  } catch (error) {
    console.error('Error loading create game room page:', error);
    req.flash('error', 'Failed to load create game room page');
    res.redirect('/admin/game-rooms');
  }
};

// API to fetch questions by selected bank
exports.getQuestionsByBank = async (req, res) => {
  try {
    const { bankId } = req.params;
    if (!bankId) return res.status(400).json({ error: 'Bank ID is required' });

    // Fetch questions with fields from the canonical Question model
    const docs = await Question.find({ bank: bankId, isActive: true })
      .select(
        'questionText questionType difficulty options tags points createdAt'
      )
      .sort({ createdAt: -1 });

    // Map to the structure expected by the create-game-room page script
    const questions = docs.map((q) => ({
      _id: q._id,
      // UI expects `question` string
      question: q.questionText,
      questionType: q.questionType,
      // Derive a simple category from first tag if any
      category: Array.isArray(q.tags) && q.tags.length > 0 ? q.tags[0] : '',
      // Keep difficulty as-is (e.g., 'Easy', 'Medium', 'Hard')
      difficulty: q.difficulty || '',
      // UI expects array of plain strings for preview snippets
      options: Array.isArray(q.options)
        ? q.options.map((opt) => (opt && opt.text ? opt.text : ''))
        : [],
      points: q.points || 1,
    }));

    res.json({ questions });
  } catch (error) {
    console.error('Error fetching questions by bank:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
};

exports.createGameRoom = async (req, res) => {
  try {
    const {
      title,
      description,
      difficulty,
      category,
      maxPlayers,
      totalTime,
      selectedQuestions,
    } = req.body || {};

    // Normalize and coerce inputs
    const normalizedTitle = (title || '').toString().trim();
    const normalizedDescription = (description || '').toString().trim();
    const normalizedDifficulty = (difficulty || 'medium')
      .toString()
      .toLowerCase();
    const allowedDifficulties = ['easy', 'medium', 'hard'];
    const finalDifficulty = allowedDifficulties.includes(normalizedDifficulty)
      ? normalizedDifficulty
      : 'medium';

    let selectedQuestionsArray = [];
    if (Array.isArray(selectedQuestions)) {
      selectedQuestionsArray = selectedQuestions.filter(Boolean);
    } else if (typeof selectedQuestions === 'string') {
      selectedQuestionsArray = [selectedQuestions];
    } else if (
      selectedQuestions &&
      typeof selectedQuestions === 'object' &&
      selectedQuestions !== null
    ) {
      // Handle possible FormData-like object structures
      selectedQuestionsArray = Object.values(selectedQuestions).filter(Boolean);
    }

    // Check if user is authenticated
    if (!req.session || !req.session.user || !req.session.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Validate required fields
    if (!normalizedTitle || selectedQuestionsArray.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'Please fill in all required fields and select at least one question',
      });
    }

    // Validate maxPlayers
    const maxPlayersNum = parseInt(maxPlayers);
    if (maxPlayersNum < 2 || maxPlayersNum > 8) {
      return res.status(400).json({
        success: false,
        message: 'Maximum players must be between 2 and 8',
      });
    }

    // Validate total time (minutes)
    const totalTimeMinutes = parseInt(totalTime);
    if (
      isNaN(totalTimeMinutes) ||
      totalTimeMinutes < 1 ||
      totalTimeMinutes > 240
    ) {
      return res.status(400).json({
        success: false,
        message: 'Total time must be between 1 and 240 minutes',
      });
    }

    // Create game room
    const gameRoom = new GameRoom({
      title: normalizedTitle,
      description: normalizedDescription,
      difficulty: finalDifficulty,
      category,
      maxPlayers: maxPlayersNum,
      totalTime: totalTimeMinutes,
      questions: selectedQuestionsArray,
      createdBy: req.session.user.id,
    });

    await gameRoom.save();

    return res.status(201).json({
      success: true,
      message: 'Game room created successfully',
      gameRoom: {
        id: gameRoom._id,
        title: gameRoom.title,
        roomCode: gameRoom.roomCode,
      },
    });
  } catch (error) {
    console.error('Error creating game room:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create game room',
    });
  }
};

exports.getEditGameRoom = async (req, res) => {
  try {
    const gameRoom = await GameRoom.findById(req.params.id)
      .populate('questions')
      .populate('createdBy', 'username email');

    if (!gameRoom) {
      req.flash('error', 'Game room not found');
      return res.redirect('/admin/game-rooms');
    }

    // Load question banks like in create page
    const banks = await QuestionBank.find({ isActive: true })
      .select('name bankCode totalQuestions')
      .sort({ createdAt: -1 });

    // Identify which question bank the existing questions belong to
    let selectedBank = null;
    let allQuestionsFromBank = [];

    if (gameRoom.questions && gameRoom.questions.length > 0) {
      // Get the bank ID from the first question (assuming all questions are from the same bank)
      const firstQuestion = gameRoom.questions[0];
      if (firstQuestion && firstQuestion.bank) {
        selectedBank = firstQuestion.bank;

        // Load all questions from this bank
        const bankQuestions = await Question.find({
          bank: selectedBank,
          isActive: true,
        })
          .select(
            'questionText questionType difficulty options tags points createdAt'
          )
          .sort({ createdAt: -1 });

        // Map to the format expected by the edit page
        allQuestionsFromBank = bankQuestions.map((q) => ({
          _id: q._id,
          question: q.questionText,
          questionText: q.questionText,
          questionType: q.questionType,
          category: Array.isArray(q.tags) && q.tags.length > 0 ? q.tags[0] : '',
          difficulty: q.difficulty || '',
          options: Array.isArray(q.options)
            ? q.options.map((opt) => (opt && opt.text ? opt.text : ''))
            : [],
          points: q.points || 1,
        }));
      }
    }

    // Map existing questions to the format expected by the edit page
    const questions = gameRoom.questions.map((q) => ({
      _id: q._id,
      question: q.questionText || q.question,
      questionText: q.questionText || q.question,
      questionType: q.questionType,
      category: Array.isArray(q.tags) && q.tags.length > 0 ? q.tags[0] : '',
      difficulty: q.difficulty || '',
      options: Array.isArray(q.options)
        ? q.options.map((opt) => (opt && opt.text ? opt.text : ''))
        : [],
      points: q.points || 1,
    }));

    res.render('admin/edit-game-room', {
      title: 'Edit Game Room',
      currentPage: 'game-rooms',
      theme: req.cookies.theme || 'light',
      gameRoom: {
        ...gameRoom.toObject(),
        selectedBank: selectedBank,
      },
      questions:
        allQuestionsFromBank.length > 0 ? allQuestionsFromBank : questions,
      banks,
      existingQuestions: questions, // Keep reference to original questions for pre-selection
    });
  } catch (error) {
    console.error('Error loading edit game room page:', error);
    req.flash('error', 'Failed to load edit game room page');
    res.redirect('/admin/game-rooms');
  }
};

exports.updateGameRoom = async (req, res) => {
  try {
    const {
      title,
      description,
      difficulty,
      category,
      maxPlayers,
      totalTime,
      selectedQuestions,
    } = req.body;

    // Check if user is authenticated
    if (!req.session || !req.session.user || !req.session.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const gameRoom = await GameRoom.findById(req.params.id);
    if (!gameRoom) {
      return res.status(404).json({
        success: false,
        message: 'Game room not found',
      });
    }

    // Don't allow editing if game is in progress
    if (gameRoom.gameState === 'playing' || gameRoom.gameState === 'starting') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit game room while game is in progress',
      });
    }

    // Normalize and validate inputs
    const normalizedTitle = (title || '').toString().trim();
    const normalizedDescription = (description || '').toString().trim();
    const normalizedDifficulty = (difficulty || 'medium')
      .toString()
      .toLowerCase();
    const allowedDifficulties = ['easy', 'medium', 'hard'];
    const finalDifficulty = allowedDifficulties.includes(normalizedDifficulty)
      ? normalizedDifficulty
      : 'medium';

    let selectedQuestionsArray = [];
    if (Array.isArray(selectedQuestions)) {
      selectedQuestionsArray = selectedQuestions.filter(Boolean);
    } else if (typeof selectedQuestions === 'string') {
      selectedQuestionsArray = [selectedQuestions];
    }

    // Validate required fields
    if (!normalizedTitle || selectedQuestionsArray.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'Please fill in all required fields and select at least one question',
      });
    }

    // Validate maxPlayers
    const maxPlayersNum = parseInt(maxPlayers);
    if (maxPlayersNum < 2 || maxPlayersNum > 8) {
      return res.status(400).json({
        success: false,
        message: 'Maximum players must be between 2 and 8',
      });
    }

    // Validate total time (minutes)
    const totalTimeMinutes = parseInt(totalTime);
    if (
      isNaN(totalTimeMinutes) ||
      totalTimeMinutes < 1 ||
      totalTimeMinutes > 240
    ) {
      return res.status(400).json({
        success: false,
        message: 'Total time must be between 1 and 240 minutes',
      });
    }

    // Update fields
    gameRoom.title = normalizedTitle;
    gameRoom.description = normalizedDescription;
    gameRoom.difficulty = finalDifficulty;
    gameRoom.category = category;
    gameRoom.maxPlayers = maxPlayersNum;
    gameRoom.totalTime = totalTimeMinutes;
    gameRoom.questions = selectedQuestionsArray;

    await gameRoom.save();

    return res.status(200).json({
      success: true,
      message: 'Game room updated successfully',
      gameRoom: {
        id: gameRoom._id,
        title: gameRoom.title,
        roomCode: gameRoom.roomCode,
      },
    });
  } catch (error) {
    console.error('Error updating game room:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update game room',
    });
  }
};

exports.deleteGameRoom = async (req, res) => {
  try {
    console.log('Attempting to delete/reset game room with ID:', req.params.id);

    const gameRoom = await GameRoom.findById(req.params.id);
    if (!gameRoom) {
      console.log('Game room not found:', req.params.id);
      req.flash('error', 'Game room not found');
      return res.redirect('/admin/game-rooms');
    }

    console.log('Game room found, current state:', gameRoom.gameState);

    // Don't allow deleting if game is in progress
    if (gameRoom.gameState === 'playing' || gameRoom.gameState === 'starting') {
      console.log('Cannot delete game room in state:', gameRoom.gameState);
      req.flash('error', 'Cannot delete game room while game is in progress');
      return res.redirect('/admin/game-rooms');
    }

    // Only delete completed sessions, keep the room active
    const deletedSessions = await GameSession.deleteMany({
      gameRoom: gameRoom._id,
      status: 'completed',
    });

    console.log('Deleted sessions count:', deletedSessions.deletedCount);

    // Reset room for new sessions instead of deleting
    const resetResult = gameRoom.resetForNewSession();
    await gameRoom.save();

    console.log('Room reset successfully:', resetResult);

    req.flash(
      'success',
      'Game room reset successfully and is ready for new sessions'
    );
    res.redirect('/admin/game-rooms');
  } catch (error) {
    console.error('Error resetting game room:', error);
    req.flash('error', 'Failed to reset game room: ' + error.message);
    res.redirect('/admin/game-rooms');
  }
};

// Permanent Delete Game Room
exports.permanentDeleteGameRoom = async (req, res) => {
  try {
    console.log(
      'Attempting to permanently delete game room with ID:',
      req.params.id
    );

    const gameRoom = await GameRoom.findById(req.params.id);
    if (!gameRoom) {
      console.log('Game room not found:', req.params.id);
      req.flash('error', 'Game room not found');
      return res.redirect('/admin/game-rooms');
    }

    console.log('Game room found, current state:', gameRoom.gameState);

    // Don't allow deleting if game is in progress
    if (gameRoom.gameState === 'playing' || gameRoom.gameState === 'starting') {
      console.log('Cannot delete game room in state:', gameRoom.gameState);
      req.flash('error', 'Cannot delete game room while game is in progress');
      return res.redirect('/admin/game-rooms');
    }

    // Delete all associated game sessions
    const deletedSessions = await GameSession.deleteMany({
      gameRoom: gameRoom._id,
    });

    console.log('Deleted sessions count:', deletedSessions.deletedCount);

    // Permanently delete the game room
    await GameRoom.findByIdAndDelete(req.params.id);

    console.log('Game room permanently deleted successfully');

    req.flash(
      'success',
      `Game room "${gameRoom.title}" has been permanently deleted along with all associated data`
    );
    res.redirect('/admin/game-rooms');
  } catch (error) {
    console.error('Error permanently deleting game room:', error);
    req.flash(
      'error',
      'Failed to permanently delete game room: ' + error.message
    );
    res.redirect('/admin/game-rooms');
  }
};

exports.getGameRoomStats = async (req, res) => {
  try {
    const gameRoom = await GameRoom.findById(req.params.id)
      .populate('questions')
      .populate('leaderboard.user', 'username email');

    if (!gameRoom) {
      req.flash('error', 'Game room not found');
      return res.redirect('/admin/game-rooms');
    }

    const sessions = await GameSession.find({ gameRoom: gameRoom._id })
      .populate('user', 'username email')
      .sort({ score: -1, timeSpent: 1 });

    res.render('admin/game-room-stats', {
      title: 'Game Room Statistics',
      currentPage: 'game-rooms',
      theme: req.cookies.theme || 'light',
      gameRoom,
      sessions,
    });
  } catch (error) {
    console.error('Error fetching game room stats:', error);
    req.flash('error', 'Failed to fetch game room statistics');
    res.redirect('/admin/game-rooms');
  }
};

// Student Game Room Access
exports.getAvailableGameRooms = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const filter = {
      isActive: true,
      isPublic: true,
      // Show rooms that are waiting or playing (can accept new sessions)
      gameState: { $in: ['waiting', 'playing'] },
    };

    if (req.query.category) {
      filter.category = req.query.category;
    }
    if (req.query.difficulty) {
      filter.difficulty = req.query.difficulty;
    }
    if (req.query.search) {
      filter.title = { $regex: req.query.search, $options: 'i' };
    }

    const gameRooms = await GameRoom.find(filter)
      .populate('createdBy', 'username')
      .populate('currentPlayers.user', 'username profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await GameRoom.countDocuments(filter);

    // Get unique categories for filter
    const categories = await GameRoom.distinct('category', {
      isActive: true,
      isPublic: true,
      gameState: { $in: ['waiting', 'playing'] },
    });

    res.render('student/game-rooms', {
      title: 'Game Rooms',
      currentPage: 'games',
      theme: req.cookies.theme || 'light',
      student: req.session,
      gameRooms,
      categories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: req.query,
    });
  } catch (error) {
    console.error('Error fetching available game rooms:', error);
    req.flash('error', 'Failed to fetch game rooms');
    res.redirect('/student/dashboard');
  }
};

exports.joinGameRoom = async (req, res) => {
  try {
    console.log('Joining game room:', req.session.user);

    // Enhanced auth guard
    if (!req.session || !req.session.user || !req.session.user.id) {
      req.flash('error', 'Please log in to join a game room');
      return res.redirect('/auth/login');
    }

    const { roomCode } = req.params;
    if (!roomCode) {
      req.flash('error', 'Invalid room code');
      return res.redirect('/student/game-rooms');
    }

    const gameRoom = await GameRoom.findOne({ roomCode: roomCode })
      .populate('questions')
      .populate('currentPlayers.user', 'username email profilePicture');

    if (!gameRoom) {
      req.flash('error', 'Game room not found');
      return res.redirect('/student/game-rooms');
    }

    if (!gameRoom.isActive || !gameRoom.isPublic) {
      req.flash('error', 'This game room is not available');
      return res.redirect('/student/game-rooms');
    }

    const userId = req.session.user.id;
    const userIdStr = userId.toString();

    // Check if user is already in the room or was previously in the room
    const isAlreadyInRoom = gameRoom.currentPlayers.some(
      (p) => p && p.user && p.user._id && p.user._id.toString() === userIdStr
    );

    // Check if user has an active session (for reconnection scenarios)
    const existingSession = await GameSession.findOne({
      user: userId,
      gameRoom: gameRoom._id,
      isActive: true,
    });

    // Allow rejoining in these cases:
    // 1. Game is in waiting state (normal join)
    // 2. User was already in the room (reconnection after disconnect/reload)
    // 3. User has an active session (disconnected but session still exists)
    const canJoin =
      gameRoom.gameState === 'waiting' || isAlreadyInRoom || existingSession;

    if (gameRoom.gameState === 'playing' && !canJoin) {
      req.flash(
        'error',
        'Game has already started. You can only rejoin if you were previously playing.'
      );
      return res.redirect('/student/game-rooms');
    }

    if (gameRoom.gameState === 'completed') {
      req.flash('error', 'This game has already ended.');
      return res.redirect('/student/game-rooms');
    }

    // Check room capacity (allow if already in room or has existing session)
    if (
      gameRoom.currentPlayers.length >= gameRoom.maxPlayers &&
      !isAlreadyInRoom &&
      !existingSession
    ) {
      req.flash('error', 'Game room is full');
      return res.redirect('/student/game-rooms');
    }

    // Use atomic operation to add player or reconnect existing player
    if (!isAlreadyInRoom) {
      console.log(
        `Adding new player ${userIdStr} to room ${gameRoom.roomCode}`
      );

      // Try to find or create a session group
      const sessionResult = await GameRoom.findOrCreateSessionGroup(
        gameRoom._id,
        userId
      );

      if (!sessionResult.success) {
        req.flash('error', sessionResult.message || 'Failed to join game room');
        return res.redirect('/student/game-rooms');
      }

      // Add player to room if not already there
      const addResult = await GameRoom.addPlayerAtomic(
        gameRoom._id,
        userId,
        null
      );

      if (!addResult.success) {
        console.error(
          `Failed to add player ${userIdStr} to room ${gameRoom.roomCode}: ${addResult.message}`
        );
        req.flash('error', addResult.message || 'Failed to join game room');
        return res.redirect('/student/game-rooms');
      }

      console.log(
        `Successfully added player ${userIdStr} to room ${gameRoom.roomCode}`
      );
    } else {
      console.log(
        `Player ${userIdStr} already in room ${gameRoom.roomCode} - allowing reconnection`
      );

      // For existing players, make sure their socket connection gets updated
      const updateResult = await GameRoom.addPlayerAtomic(
        gameRoom._id,
        userId,
        null
      );

      if (!updateResult.success) {
        console.warn(
          `Warning: Could not update existing player ${userIdStr} in room ${gameRoom.roomCode}: ${updateResult.message}`
        );
        // Don't fail here - player might still be able to connect via socket
      } else {
        console.log(
          `Updated connection for existing player ${userIdStr} in room ${gameRoom.roomCode}`
        );
      }
    }

    res.redirect(`/student/game-room/${gameRoom.roomCode}/play`);
  } catch (error) {
    console.error('Error joining game room:', error);
    req.flash('error', 'An error occurred while joining the game room');
    res.redirect('/student/game-rooms');
  }
};

exports.getGameRoomPlay = async (req, res) => {
  try {
    // Auth guard
    if (!req.session || !req.session.user || !req.session.user.id) {
      req.flash('error', 'Authentication required');
      return res.redirect('/auth/login');
    }
    const gameRoom = await GameRoom.findOne({ roomCode: req.params.roomCode })
      .populate('questions')
      .populate('currentPlayers.user', 'username email profilePicture')
      .populate('leaderboard.user', 'username email profilePicture');

    if (!gameRoom) {
      req.flash('error', 'Game room not found');
      return res.redirect('/student/game-rooms');
    }

    // Check if user is in the room (guard against undefined refs)
    const isInRoom =
      Array.isArray(gameRoom.currentPlayers) &&
      gameRoom.currentPlayers.some(
        (p) =>
          p &&
          p.user &&
          p.user._id &&
          req.session &&
          req.session.user &&
          req.session.user.id &&
          p.user._id.toString() === req.session.user.id.toString()
      );

    if (!isInRoom && gameRoom.gameState === 'waiting') {
      req.flash('error', 'You are not in this game room');
      return res.redirect('/student/game-rooms');
    }

    // Get user's session
    let session = await GameSession.findOne({
      user: req.session.user.id,
      gameRoom: gameRoom._id,
      isActive: true,
    });

    if (!session && gameRoom.gameState === 'waiting') {
      // Create new session
      session = new GameSession({
        user: req.session.user.id,
        gameRoom: gameRoom._id,
        totalQuestions: gameRoom.questions.length,
      });
      await session.save();
    }

    // Load current user minimal info for the view and socket userId
    const currentUser = await User.findById(req.session.user.id).select(
      'username profilePicture'
    );

    res.render('student/game-room-play', {
      title: `${gameRoom.title} - Game Room`,
      theme: req.cookies.theme || 'light',
      student: req.session.user,
      gameRoom,
      session,
      user: currentUser,
    });
  } catch (error) {
    console.error('Error loading game room play page:', error);
    req.flash('error', 'Failed to load game room');
    res.redirect('/student/game-rooms');
  }
};

exports.leaveGameRoom = async (req, res) => {
  try {
    // Enhanced auth guard
    if (!req.session || !req.session.user || !req.session.user.id) {
      return res
        .status(401)
        .json({ success: false, message: 'Not authenticated' });
    }

    const { roomCode } = req.params;
    if (!roomCode) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid room code' });
    }

    const gameRoom = await GameRoom.findOne({ roomCode: roomCode });
    if (!gameRoom) {
      return res
        .status(404)
        .json({ success: false, message: 'Game room not found' });
    }

    const userId = req.session.user.id;

    // Use atomic operation to remove player
    const removeResult = await GameRoom.removePlayerAtomic(
      gameRoom._id,
      userId
    );

    if (!removeResult.success) {
      return res
        .status(400)
        .json({ success: false, message: removeResult.message });
    }

    // Update any active game sessions
    try {
      await GameSession.updateMany(
        { user: userId, gameRoom: gameRoom._id, isActive: true },
        {
          isActive: false,
          leftAt: new Date(),
          status: 'left',
        }
      );
    } catch (sessionError) {
      console.error('Error updating game sessions on leave:', sessionError);
      // Don't fail the request if session update fails
    }

    console.log(`Player ${userId} successfully left room ${roomCode}`);

    // Check if this is an AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.json({
        success: true,
        message: 'Left game room successfully',
      });
    } else {
      req.flash('success', 'You have left the game room');
      return res.redirect('/student/game-rooms');
    }
  } catch (error) {
    console.error('Error leaving game room:', error);

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res
        .status(500)
        .json({ success: false, message: 'Failed to leave game room' });
    } else {
      req.flash('error', 'Failed to leave game room');
      return res.redirect('/student/game-rooms');
    }
  }
};

exports.getMyGameHistory = async (req, res) => {
  try {
    // Auth guard
    if (!req.session || !req.session.user || !req.session.user.id) {
      req.flash('error', 'Authentication required');
      return res.redirect('/auth/login');
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const sessions = await GameSession.find({
      user: req.session.user.id,
      status: 'completed',
    })
      .populate('gameRoom', 'title roomCode category difficulty')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await GameSession.countDocuments({
      user: req.session.user.id,
      status: 'completed',
    });

    res.render('student/game-history', {
      title: 'My Game History',
      currentPage: 'games',
      theme: req.cookies.theme || 'light',
      student: req.session,
      sessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching game history:', error);
    req.flash('error', 'Failed to fetch game history');
    res.redirect('/student/dashboard');
  }
};

// API endpoints for real-time data
exports.getGameRoomData = async (req, res) => {
  try {
    // Auth guard
    if (!req.session || !req.session.user || !req.session.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const gameRoom = await GameRoom.findOne({ roomCode: req.params.roomCode })
      .populate('questions')
      .populate('currentPlayers.user', 'username email profilePicture')
      .populate('leaderboard.user', 'username email profilePicture');

    if (!gameRoom) {
      return res.status(404).json({ error: 'Game room not found' });
    }

    const session = await GameSession.findOne({
      user: req.session.user.id,
      gameRoom: gameRoom._id,
    });

    res.json({
      room: gameRoom,
      session: session,
    });
  } catch (error) {
    console.error('Error fetching game room data:', error);
    res.status(500).json({ error: 'Failed to fetch game room data' });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const leaderboard = await GameSession.getLeaderboard(req.params.roomId);
    res.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
};
