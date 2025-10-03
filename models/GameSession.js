const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    gameRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameRoom',
      required: true,
    },
    socketId: {
      type: String,
      required: false,
    },
    answers: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Question',
          required: true,
        },
        selectedAnswer: String,
        isCorrect: Boolean,
        timeSpent: Number, // in seconds
        answeredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    currentQuestionIndex: {
      type: Number,
      default: 0,
    },
    shuffledQuestions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ], // Array to store shuffled question order for this session
    score: {
      type: Number,
      default: 0,
    },
    correctAnswers: {
      type: Number,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      default: 0,
    },
    timeStarted: {
      type: Date,
      default: Date.now,
    },
    timeCompleted: Date,
    timeSpent: Number, // total time in seconds
    isActive: {
      type: Boolean,
      default: true,
    },
    isReady: {
      type: Boolean,
      default: false,
    },
    position: Number, // final ranking position
    status: {
      type: String,
      enum: ['waiting', 'ready', 'playing', 'completed', 'disconnected'],
      default: 'waiting',
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for accuracy percentage
gameSessionSchema.virtual('accuracy').get(function () {
  if (this.totalQuestions === 0) return 0;
  return Math.round((this.correctAnswers / this.totalQuestions) * 100);
});

// Virtual for average time per question
gameSessionSchema.virtual('averageTimePerQuestion').get(function () {
  if (this.answers.length === 0) return 0;
  return Math.round(
    this.answers.reduce((sum, answer) => sum + answer.timeSpent, 0) /
      this.answers.length
  );
});

// Method to answer a question
gameSessionSchema.methods.answerQuestion = function (
  questionId,
  selectedAnswer,
  timeSpent,
  question
) {
  // Check if already answered this question
  const existingAnswer = this.answers.find(
    (a) => a.questionId.toString() === questionId.toString()
  );
  if (existingAnswer) {
    return { success: false, message: 'Question already answered' };
  }

  // Validate input
  if (!question) {
    return { success: false, message: 'Question data is required' };
  }

  if (
    selectedAnswer === null ||
    selectedAnswer === undefined ||
    selectedAnswer === ''
  ) {
    return { success: false, message: 'Answer is required' };
  }

  let isCorrect = false;

  // Use the enhanced question validation methods
  if (question.questionType === 'Written') {
    isCorrect = question.isCorrectWrittenAnswer(selectedAnswer);
  } else {
    isCorrect = question.isCorrectMCQAnswer(selectedAnswer);
  }

  // Add answer with additional metadata
  const answerData = {
    questionId,
    selectedAnswer,
    isCorrect,
    timeSpent: Math.max(0, timeSpent || 0),
    answeredAt: new Date(),
    questionType: question.questionType,
  };

  this.answers.push(answerData);

  // Update stats - only when answer is correct
  if (isCorrect) {
    // Calculate score based on difficulty and time
    let baseScore = 10;
    if (question.difficulty === 'Easy') baseScore = 5;
    else if (question.difficulty === 'Medium') baseScore = 10;
    else if (question.difficulty === 'Hard') baseScore = 15;

    // Time bonus: faster answers get bonus points (max 5 extra points)
    const timeBonus = Math.max(
      0,
      Math.min(5, Math.floor((30 - timeSpent) / 6))
    );

    this.score += baseScore + timeBonus;
    this.correctAnswers += 1;

    // Return score earned for feedback
    var scoreEarned = baseScore + timeBonus;
  }

  // Move to next question
  this.currentQuestionIndex += 1;

  return {
    success: true,
    message: 'Answer recorded',
    isCorrect,
    scoreEarned: isCorrect ? scoreEarned : 0,
    totalScore: this.score,
  };
};

// Method to complete the game
gameSessionSchema.methods.completeGame = function () {
  this.timeCompleted = new Date();
  this.timeSpent = Math.floor((this.timeCompleted - this.timeStarted) / 1000);
  this.status = 'completed';
  this.isActive = false;
  this.totalQuestions = this.answers.length;

  // Calculate final score with time bonus
  const timeBonus = Math.max(0, 100 - this.timeSpent); // Bonus points for faster completion
  this.score += timeBonus;

  return {
    success: true,
    finalScore: this.score,
    correctAnswers: this.correctAnswers,
    totalQuestions: this.totalQuestions,
    timeSpent: this.timeSpent,
    accuracy: this.accuracy,
  };
};

// Method to disconnect player
gameSessionSchema.methods.disconnect = function () {
  this.status = 'disconnected';
  this.isActive = false;
  return { success: true, message: 'Player disconnected' };
};

// Method to set ready status
gameSessionSchema.methods.setReady = function () {
  this.isReady = true;
  this.status = 'ready';
  return { success: true, message: 'Player ready' };
};

// Method to shuffle questions for this session
gameSessionSchema.methods.shuffleQuestions = function (questions) {
  // Create a copy of the questions array and shuffle it
  const shuffledQuestions = [...questions];

  // Fisher-Yates shuffle algorithm
  for (let i = shuffledQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledQuestions[i], shuffledQuestions[j]] = [
      shuffledQuestions[j],
      shuffledQuestions[i],
    ];
  }

  this.shuffledQuestions = shuffledQuestions.map((q) => q._id);
  return { success: true, shuffledQuestions };
};

// Static method to get leaderboard for a game room
gameSessionSchema.statics.getLeaderboard = function (gameRoomId) {
  return this.find({
    gameRoom: gameRoomId,
    status: 'completed',
  })
    .populate('user', 'username email profilePicture')
    .sort({ score: -1, timeSpent: 1 }) // Sort by score desc, then by time asc
    .exec();
};

// Index for better performance
gameSessionSchema.index({ user: 1, gameRoom: 1 });
gameSessionSchema.index({ gameRoom: 1, status: 1 });
gameSessionSchema.index({ gameRoom: 1, score: -1 });
gameSessionSchema.index({ socketId: 1 });

module.exports = mongoose.model('GameSession', gameSessionSchema);
