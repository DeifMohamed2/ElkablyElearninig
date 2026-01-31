const GuestUser = require('../models/GuestUser');
const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const { v4: uuidv4 } = require('uuid');

// Register a guest user
const registerGuestUser = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      phoneCountryCode,
      parentPhone,
      parentPhoneCountryCode,
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !phone || !parentPhone) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    // Generate session ID
    const sessionId = GuestUser.generateSessionId();
    const sessionToken = uuidv4();

    // Check if guest with same email exists and has active session
    let guestUser = await GuestUser.findByEmail(email);

    if (guestUser) {
      // Update existing guest user session
      guestUser.sessionId = sessionId;
      guestUser.sessionToken = sessionToken;
      guestUser.sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      guestUser.fullName = fullName;
      guestUser.phone = phone;
      guestUser.phoneCountryCode = phoneCountryCode || '+966';
      guestUser.parentPhone = parentPhone;
      guestUser.parentPhoneCountryCode = parentPhoneCountryCode || '+966';
      guestUser.isActive = true;
      guestUser.lastActiveAt = new Date();
      guestUser.ipAddress = req.ip;
      guestUser.userAgent = req.headers['user-agent'];
      await guestUser.save();
    } else {
      // Create new guest user
      guestUser = await GuestUser.create({
        fullName,
        email: email.toLowerCase(),
        phone,
        phoneCountryCode: phoneCountryCode || '+966',
        parentPhone,
        parentPhoneCountryCode: parentPhoneCountryCode || '+966',
        sessionId,
        sessionToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    // Set session data
    req.session.guestUser = {
      id: guestUser._id,
      sessionId: guestUser.sessionId,
      sessionToken: guestUser.sessionToken,
      fullName: guestUser.fullName,
      email: guestUser.email,
      isGuest: true,
    };

    return res.status(200).json({
      success: true,
      message: 'Guest registration successful',
      guestUser: {
        id: guestUser._id,
        fullName: guestUser.fullName,
        email: guestUser.email,
      },
    });
  } catch (error) {
    console.error('Guest registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register as guest',
      error: error.message,
    });
  }
};

// Get guest quiz details
const getGuestQuizDetails = async (req, res) => {
  try {
    const { id: quizId } = req.params;

    // Check if guest user is authenticated
    if (!req.session.guestUser || !req.session.guestUser.id) {
      return res.redirect(`/guest/auth?redirect=/guest/quiz/${quizId}/details`);
    }

    const guestUser = await GuestUser.findById(req.session.guestUser.id);

    if (!guestUser) {
      req.session.guestUser = null;
      return res.redirect(`/guest/auth?redirect=/guest/quiz/${quizId}/details`);
    }

    const quiz = await Quiz.findById(quizId)
      .populate('questionBank', 'name bankCode')
      .populate('createdBy', 'userName');

    if (!quiz) {
      req.flash('error_msg', 'Quiz not found');
      return res.redirect('/');
    }

    if (quiz.status !== 'active') {
      req.flash('error_msg', 'This quiz is not currently available');
      return res.redirect('/');
    }

    // Get attempt info for guest user
    const quizAttempt = guestUser.quizAttempts.find(
      (qa) => qa.quiz.toString() === quizId
    );

    const attemptHistory = quizAttempt
      ? quizAttempt.attempts.filter((a) => a.status === 'completed')
      : [];
    const bestScore = quizAttempt ? quizAttempt.bestScore : null;
    const activeAttempt = guestUser.getActiveAttempt(quizId);

    // Check if user has already passed the quiz
    const hasPassed = attemptHistory.some((a) => a.passed === true);

    // Check if can attempt (max 3 attempts for guests, but no more attempts if passed)
    const completedAttempts = attemptHistory.length;
    const maxAttempts = quiz.maxAttempts || 3;
    const attemptsExhausted = completedAttempts >= maxAttempts;
    
    // Anti-cheating: User can only view detailed results if passed OR exhausted all attempts
    const canViewDetailedResults = hasPassed || attemptsExhausted;
    const remainingAttempts = Math.max(0, maxAttempts - completedAttempts);
    
    let canAttempt;
    if (hasPassed) {
      canAttempt = {
        canAttempt: false,
        reason: 'You have already passed this quiz! 🎉',
        attemptsLeft: 0,
        hasPassed: true,
      };
    } else if (completedAttempts >= maxAttempts) {
      canAttempt = {
        canAttempt: false,
        reason: `Maximum attempts (${maxAttempts}) reached`,
        attemptsLeft: 0,
        hasPassed: false,
      };
    } else {
      canAttempt = {
        canAttempt: true,
        reason: 'Can attempt',
        attemptsLeft: maxAttempts - completedAttempts,
        hasPassed: false,
      };
    }

    // Calculate timing if there's an active attempt
    let timing = null;
    if (activeAttempt) {
      const now = new Date();
      const expectedEnd = new Date(activeAttempt.expectedEnd);
      const remainingSeconds = Math.max(0, Math.floor((expectedEnd - now) / 1000));
      const isExpired = remainingSeconds <= 0;

      timing = {
        durationMinutes: quiz.duration,
        remainingSeconds,
        isExpired,
        startedAt: activeAttempt.startedAt,
        expectedEnd: activeAttempt.expectedEnd,
      };
    }

    res.render('guest/quiz-details', {
      title: `${quiz.title} - Quiz Details`,
      quiz,
      guestUser,
      canAttempt,
      bestScore,
      attemptHistory,
      activeAttempt,
      timing,
      canViewDetailedResults,
      hasPassed,
      attemptsExhausted,
      remainingAttempts,
      maxAttempts,
      showResults: quiz.showResults !== false,
      theme: req.cookies.theme || 'light',
    });
  } catch (error) {
    console.error('Get guest quiz details error:', error);
    req.flash('error_msg', 'Error loading quiz details');
    res.redirect('/');
  }
};

// Start guest quiz attempt
const startGuestQuizAttempt = async (req, res) => {
  try {
    const { id: quizId } = req.params;

    // Check if guest user is authenticated
    if (!req.session.guestUser || !req.session.guestUser.id) {
      return res.redirect(`/guest/auth?redirect=/guest/quiz/${quizId}/start`);
    }

    const guestUser = await GuestUser.findById(req.session.guestUser.id);

    if (!guestUser) {
      req.session.guestUser = null;
      return res.redirect(`/guest/auth?redirect=/guest/quiz/${quizId}/start`);
    }

    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      req.flash('error_msg', 'Quiz not found');
      return res.redirect('/');
    }

    if (quiz.status !== 'active') {
      req.flash('error_msg', 'This quiz is not currently available');
      return res.redirect('/');
    }

    // Check for active attempt
    const activeAttempt = guestUser.getActiveAttempt(quizId);
    if (activeAttempt) {
      return res.redirect(`/guest/quiz/${quizId}/take`);
    }

    // Check max attempts and if already passed
    const quizAttempt = guestUser.quizAttempts.find(
      (qa) => qa.quiz.toString() === quizId
    );
    const completedAttempts = quizAttempt
      ? quizAttempt.attempts.filter((a) => a.status === 'completed')
      : [];
    const hasPassed = completedAttempts.some((a) => a.passed === true);
    const maxAttempts = quiz.maxAttempts || 3;

    // If user has already passed, don't allow more attempts
    if (hasPassed) {
      req.flash('success_msg', 'You have already passed this quiz! 🎉');
      return res.redirect(`/guest/quiz/${quizId}/results`);
    }

    if (completedAttempts.length >= maxAttempts) {
      req.flash('error_msg', `Maximum attempts (${maxAttempts}) reached`);
      return res.redirect(`/guest/quiz/${quizId}/details`);
    }

    // Start new attempt
    await guestUser.startQuizAttempt(quizId, quiz.duration);

    return res.redirect(`/guest/quiz/${quizId}/take`);
  } catch (error) {
    console.error('Start guest quiz error:', error);
    req.flash('error_msg', 'Error starting quiz');
    res.redirect('/');
  }
};

// Take guest quiz page
const takeGuestQuizPage = async (req, res) => {
  try {
    const { id: quizId } = req.params;

    // Check if guest user is authenticated
    if (!req.session.guestUser || !req.session.guestUser.id) {
      return res.redirect(`/guest/auth?redirect=/guest/quiz/${quizId}/take`);
    }

    let guestUser = await GuestUser.findById(req.session.guestUser.id);

    if (!guestUser) {
      req.session.guestUser = null;
      return res.redirect(`/guest/auth?redirect=/guest/quiz/${quizId}/take`);
    }

    const quiz = await Quiz.findById(quizId).populate('selectedQuestions.question');

    if (!quiz) {
      req.flash('error_msg', 'Quiz not found');
      return res.redirect('/');
    }

    if (quiz.status !== 'active') {
      req.flash('error_msg', 'This quiz is not currently available');
      return res.redirect('/');
    }

    // Check for active attempt or create one
    let activeAttempt = guestUser.getActiveAttempt(quizId);

    if (!activeAttempt) {
      // Check max attempts and if already passed
      const quizAttempt = guestUser.quizAttempts.find(
        (qa) => qa.quiz.toString() === quizId
      );
      const completedAttempts = quizAttempt
        ? quizAttempt.attempts.filter((a) => a.status === 'completed')
        : [];
      const hasPassed = completedAttempts.some((a) => a.passed === true);
      const maxAttempts = quiz.maxAttempts || 3;

      // If user has already passed, redirect to results
      if (hasPassed) {
        req.flash('success_msg', 'You have already passed this quiz! 🎉');
        return res.redirect(`/guest/quiz/${quizId}/results`);
      }

      if (completedAttempts.length >= maxAttempts) {
        req.flash('error_msg', `Maximum attempts (${maxAttempts}) reached`);
        return res.redirect(`/guest/quiz/${quizId}/details`);
      }

      // Start new attempt
      const attemptResult = await guestUser.startQuizAttempt(quizId, quiz.duration);
      activeAttempt = attemptResult.newAttempt;
      guestUser = await GuestUser.findById(req.session.guestUser.id);
    }

    if (!activeAttempt) {
      req.flash('error_msg', 'Failed to start quiz attempt');
      return res.redirect(`/guest/quiz/${quizId}/details`);
    }

    // Get questions
    let questions = quiz.selectedQuestions;

    // Calculate timing
    const now = new Date();
    const expectedEnd = new Date(activeAttempt.expectedEnd);
    const remainingSeconds = Math.max(0, Math.floor((expectedEnd - now) / 1000));
    const isExpired = remainingSeconds <= 0;

    const timing = {
      durationMinutes: quiz.duration,
      remainingSeconds,
      isExpired,
      startedAt: activeAttempt.startedAt,
      expectedEnd: activeAttempt.expectedEnd,
      passingScore: quiz.passingScore,
    };

    res.render('guest/take-quiz', {
      title: `Taking ${quiz.title}`,
      quiz: {
        ...quiz.toObject(),
        selectedQuestions: questions,
      },
      guestUser,
      attemptNumber: activeAttempt.attemptNumber,
      timing,
      settings: {
        shuffleQuestions: quiz.shuffleQuestions || false,
        shuffleOptions: quiz.shuffleOptions || false,
        showCorrectAnswers: quiz.showCorrectAnswers !== false,
        showResults: quiz.showResults !== false,
        instructions: quiz.instructions || '',
      },
      theme: req.cookies.theme || 'light',
    });
  } catch (error) {
    console.error('Take guest quiz error:', error);
    req.flash('error_msg', 'Error loading quiz');
    res.redirect('/');
  }
};

// Get secure questions for guest quiz (API endpoint)
const getSecureGuestQuizQuestions = async (req, res) => {
  try {
    const { quizId } = req.body;

    if (!req.session.guestUser || !req.session.guestUser.id) {
      return res.status(401).json({
        success: false,
        message: 'Guest authentication required',
      });
    }

    const guestUser = await GuestUser.findById(req.session.guestUser.id);

    if (!guestUser) {
      return res.status(401).json({
        success: false,
        message: 'Guest user not found',
      });
    }

    const quiz = await Quiz.findById(quizId).populate('selectedQuestions.question');

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    // Get active attempt
    const activeAttempt = guestUser.getActiveAttempt(quizId);

    if (!activeAttempt) {
      return res.status(400).json({
        success: false,
        message: 'No active attempt found',
      });
    }

    // Prepare questions without answers
    let questions = quiz.selectedQuestions.map((sq, index) => {
      const question = sq.question;
      if (!question) return null;

      const questionData = {
        _id: question._id,
        questionText: question.questionText,
        questionType: question.questionType,
        options: question.options
          ? question.options.map((opt) => ({
              text: opt.text,
              image: opt.image,
            }))
          : [],
        points: sq.points || 1,
        order: sq.order || index + 1,
        questionImage: question.questionImage,
        explanation: null, // Hide explanation until submission
      };

      return questionData;
    }).filter(Boolean);

    // Shuffle questions if enabled
    if (quiz.shuffleQuestions) {
      // Use stored order or generate new one
      if (!activeAttempt.questionOrder || activeAttempt.questionOrder.length === 0) {
        const indices = questions.map((_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        activeAttempt.questionOrder = indices;
        await guestUser.save();
      }
      questions = activeAttempt.questionOrder.map((i) => questions[i]);
    }

    // Shuffle options if enabled
    if (quiz.shuffleOptions) {
      questions = questions.map((q, qIndex) => {
        if (q.options && q.options.length > 0) {
          const existingOrder = activeAttempt.optionsOrder?.find(
            (oo) => oo.questionIndex === qIndex
          );
          
          let optionIndices;
          if (existingOrder) {
            optionIndices = existingOrder.optionsIndices;
          } else {
            optionIndices = q.options.map((_, i) => i);
            for (let i = optionIndices.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [optionIndices[i], optionIndices[j]] = [optionIndices[j], optionIndices[i]];
            }
            if (!activeAttempt.optionsOrder) {
              activeAttempt.optionsOrder = [];
            }
            activeAttempt.optionsOrder.push({
              questionIndex: qIndex,
              optionsIndices: optionIndices,
            });
          }
          
          q.options = optionIndices.map((i) => q.options[i]);
        }
        return q;
      });
      await guestUser.save();
    }

    // Ensure questionImage is present (already set above)

    return res.json({
      success: true,
      questions,
      totalQuestions: questions.length,
      timing: {
        remainingSeconds: Math.max(
          0,
          Math.floor((new Date(activeAttempt.expectedEnd) - new Date()) / 1000)
        ),
      },
    });
  } catch (error) {
    console.error('Get secure guest quiz questions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error loading questions',
    });
  }
};

// Submit guest quiz
const submitGuestQuiz = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { answers, timeSpent } = req.body;

    if (!req.session.guestUser || !req.session.guestUser.id) {
      return res.status(401).json({
        success: false,
        message: 'Guest authentication required',
      });
    }

    const guestUser = await GuestUser.findById(req.session.guestUser.id);

    if (!guestUser) {
      return res.status(401).json({
        success: false,
        message: 'Guest user not found',
      });
    }

    const quiz = await Quiz.findById(quizId).populate('selectedQuestions.question');

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    // Get active attempt
    const activeAttempt = guestUser.getActiveAttempt(quizId);

    if (!activeAttempt) {
      return res.status(400).json({
        success: false,
        message: 'No active attempt found',
      });
    }

    // Convert answers object to array format if needed
    // Frontend sends: { questionId: "answer", ... }
    // We'll work with it as an object like the student controller does
    let answersObj = {};
    if (Array.isArray(answers)) {
      // Convert array to object
      answers.forEach(a => {
        answersObj[a.questionId] = a.selectedAnswer;
      });
    } else if (answers && typeof answers === 'object') {
      answersObj = answers;
    }

    // Calculate score - same logic as student controller
    let correctCount = 0;
    let totalPoints = 0;
    const processedAnswers = [];

    quiz.selectedQuestions.forEach((selectedQ, index) => {
      const question = selectedQ.question;
      const userAnswer = answersObj[question._id.toString()];
      let isCorrect = false;
      let points = 0;

      if (question.questionType === 'Written') {
        // Handle written questions with multiple correct answers
        if (question.correctAnswers && question.correctAnswers.length > 0) {
          // Normalize user answer for comparison
          const normalizedUserAnswer = userAnswer
            ? userAnswer.trim().toLowerCase()
            : '';

          // Check against all correct answers
          for (const correctAnswerObj of question.correctAnswers) {
            const correctAnswer = correctAnswerObj.text
              ? correctAnswerObj.text.trim().toLowerCase()
              : '';

            // Check for exact match or if user answer contains any of the comma-separated answers
            if (correctAnswer.includes(',')) {
              // Handle multiple answers separated by commas (e.g., "x+2,x+1")
              const correctAnswersList = correctAnswer
                .split(',')
                .map((a) => a.trim().toLowerCase());
              if (
                correctAnswersList.some(
                  (answer) =>
                    answer === normalizedUserAnswer ||
                    normalizedUserAnswer.includes(answer)
                )
              ) {
                isCorrect = true;
                break;
              }
            } else {
              // Single correct answer
              if (
                normalizedUserAnswer === correctAnswer ||
                normalizedUserAnswer.includes(correctAnswer)
              ) {
                isCorrect = true;
                break;
              }
            }
          }
        }
      } else {
        // Handle MCQ and True/False questions
        // userAnswer is the TEXT of the selected option
        // We need to find if the selected option is marked as correct
        if (question.options && question.options.length > 0 && userAnswer) {
          const userText = userAnswer.toString().trim();
          const selectedOption = question.options.find(
            (opt) => opt.text && opt.text.trim() === userText
          );
          if (selectedOption) {
            isCorrect = selectedOption.isCorrect === true;
          }
        }
      }

      points = isCorrect ? (selectedQ.points || 1) : 0;

      if (isCorrect) {
        correctCount++;
      }
      totalPoints += points;

      // Only include answered questions or provide a default value for unanswered ones
      const answerValue =
        userAnswer ||
        (question.questionType === 'Written' ? 'No answer provided' : '0');

      // Get the correct answer text for display in results
      let correctAnswerText = '';
      if (question.questionType === 'Written') {
        correctAnswerText = question.correctAnswers
          ? question.correctAnswers.map((a) => a.text).join(', ')
          : '';
      } else {
        // Find the correct option and get its text
        const correctOption = question.options.find((opt) => opt.isCorrect);
        correctAnswerText = correctOption ? correctOption.text : '';
      }

      processedAnswers.push({
        questionId: question._id,
        selectedAnswer: answerValue,
        correctAnswer: correctAnswerText,
        isCorrect,
        points,
        questionType: question.questionType,
      });
    });

    const score = Math.round(
      (correctCount / quiz.selectedQuestions.length) * 100
    );
    const passed = score >= quiz.passingScore;

    // Submit the attempt
    const result = await guestUser.submitQuizAttempt(quizId, processedAnswers, timeSpent);

    // Determine redirect URL based on showResults setting
    const redirectUrl = quiz.showResults === false 
      ? `/guest/quiz/${quizId}/details` 
      : `/guest/quiz/${quizId}/results`;

    return res.json({
      success: true,
      result: {
        score,
        correctAnswers: correctCount,
        totalQuestions: quiz.selectedQuestions.length,
        passed,
        passingScore: quiz.passingScore,
        timeSpent: timeSpent || 0,
        totalPoints,
        showResults: quiz.showResults !== false,
      },
      redirectUrl,
    });
  } catch (error) {
    console.error('Submit guest quiz error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error submitting quiz',
    });
  }
};

// Get guest quiz results
const getGuestQuizResults = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { attempt } = req.query;

    if (!req.session.guestUser || !req.session.guestUser.id) {
      return res.redirect(`/guest/auth?redirect=/guest/quiz/${quizId}/results`);
    }

    const guestUser = await GuestUser.findById(req.session.guestUser.id);

    if (!guestUser) {
      req.session.guestUser = null;
      return res.redirect(`/guest/auth?redirect=/guest/quiz/${quizId}/results`);
    }

    const quiz = await Quiz.findById(quizId)
      .populate('selectedQuestions.question')
      .populate('questionBank', 'name');

    if (!quiz) {
      req.flash('error_msg', 'Quiz not found');
      return res.redirect('/');
    }

    // Check if showResults is enabled for this quiz
    if (quiz.showResults === false) {
      req.flash('error_msg', 'Results are not available for this quiz');
      return res.redirect(`/guest/quiz/${quizId}/details`);
    }

    // Get quiz attempt data
    const quizAttempt = guestUser.quizAttempts.find(
      (qa) => qa.quiz.toString() === quizId
    );

    if (!quizAttempt || quizAttempt.attempts.length === 0) {
      req.flash('error_msg', 'No attempt found for this quiz');
      return res.redirect(`/guest/quiz/${quizId}/details`);
    }

    // Get specific attempt or latest completed
    let targetAttempt;
    if (attempt) {
      targetAttempt = quizAttempt.attempts.find(
        (a) => a.attemptNumber === parseInt(attempt)
      );
    } else {
      // Get latest completed attempt
      targetAttempt = quizAttempt.attempts
        .filter((a) => a.status === 'completed')
        .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
    }

    if (!targetAttempt) {
      req.flash('error_msg', 'Attempt not found');
      return res.redirect(`/guest/quiz/${quizId}/details`);
    }

    // Anti-cheating: Check if user can view detailed results
    // User can only view correct answers if:
    // 1. They have passed the quiz, OR
    // 2. They have exhausted all their attempts (max attempts reached)
    const completedAttempts = quizAttempt.attempts.filter((a) => a.status === 'completed');
    const hasPassed = completedAttempts.some((a) => a.passed === true);
    const maxAttempts = quiz.maxAttempts || 3;
    const attemptsExhausted = completedAttempts.length >= maxAttempts;
    const canViewDetailedResults = hasPassed || attemptsExhausted;
    const remainingAttempts = Math.max(0, maxAttempts - completedAttempts.length);

    // Prepare questions with answers for review
    // Only show correct answers if canViewDetailedResults is true (passed or attempts exhausted)
    const questionsWithAnswers = quiz.selectedQuestions.map((sq) => {
      const question = sq.question;
      const userAnswer = targetAttempt.answers.find(
        (a) => a.questionId.toString() === question._id.toString()
      );

      // Get the correct answer text for display - ONLY if user can view detailed results
      let correctAnswerText = null;
      if (quiz.showCorrectAnswers && canViewDetailedResults) {
        if (question.questionType === 'Written') {
          correctAnswerText = question.correctAnswers
            ? question.correctAnswers.map((a) => a.text).join(', ')
            : '';
        } else {
          // Find the correct option and get its text
          const correctOption = question.options.find((opt) => opt.isCorrect);
          correctAnswerText = correctOption ? correctOption.text : '';
        }
      }

      // For options, hide isCorrect flag if user cannot view detailed results
      const sanitizedOptions = canViewDetailedResults 
        ? question.options 
        : question.options.map(opt => ({ ...opt.toObject ? opt.toObject() : opt, isCorrect: undefined }));

      return {
        question: {
          _id: question._id,
          questionText: question.questionText,
          questionType: question.questionType,
          options: sanitizedOptions,
          correctAnswer: correctAnswerText,
          explanation: (quiz.showCorrectAnswers && canViewDetailedResults) ? question.explanation : null,
          questionImage: question.questionImage || null,
        },
        userAnswer: userAnswer?.selectedAnswer,
        isCorrect: userAnswer?.isCorrect || false,
        points: sq.points || 1,
        earnedPoints: userAnswer?.points || 0,
      };
    });

    res.render('guest/quiz-results', {
      title: `${quiz.title} - Results`,
      quiz,
      guestUser: req.session.guestUser,
      attempt: targetAttempt,
      questionsWithAnswers,
      allAttempts: quizAttempt.attempts.filter((a) => a.status === 'completed'),
      bestScore: quizAttempt.bestScore,
      showCorrectAnswers: quiz.showCorrectAnswers && canViewDetailedResults,
      canViewDetailedResults,
      hasPassed,
      attemptsExhausted,
      remainingAttempts,
      maxAttempts,
      theme: req.cookies.theme || 'light',
    });
  } catch (error) {
    console.error('Get guest quiz results error:', error);
    req.flash('error_msg', 'Error loading results');
    res.redirect('/');
  }
};

// Guest authentication page
const getGuestAuthPage = async (req, res) => {
  const { redirect } = req.query;

  // Check if already authenticated as guest
  if (req.session.guestUser && req.session.guestUser.id) {
    const guestUser = await GuestUser.findById(req.session.guestUser.id);
    if (guestUser && guestUser.isActive) {
      if (redirect) {
        return res.redirect(redirect);
      }
      return res.redirect('/');
    }
  }

  res.render('guest/auth', {
    title: 'Continue as Guest | ELKABLY',
    theme: req.cookies.theme || 'light',
    redirectUrl: redirect || '/',
  });
};

// Guest dashboard - show all quizzes and history
const getGuestDashboard = async (req, res) => {
  try {
    if (!req.session.guestUser || !req.session.guestUser.id) {
      return res.redirect('/guest/auth?redirect=/guest/dashboard');
    }

    const guestUser = await GuestUser.findById(req.session.guestUser.id)
      .populate('quizAttempts.quiz', 'title code testType difficulty duration');

    if (!guestUser) {
      req.session.guestUser = null;
      return res.redirect('/guest/auth?redirect=/guest/dashboard');
    }

    // Get all active quizzes
    const availableQuizzes = await Quiz.find({ status: 'active' })
      .select('title description code testType difficulty duration passingScore')
      .sort({ createdAt: -1 })
      .lean();

    // Build quiz history from attempts
    const quizHistory = [];
    for (const attempt of guestUser.quizAttempts) {
      if (attempt.quiz) {
        for (const att of attempt.attempts) {
          quizHistory.push({
            quizId: attempt.quiz._id,
            quizTitle: attempt.quiz.title || 'Unknown Quiz',
            attemptNumber: att.attemptNumber,
            score: att.score,
            passed: att.passed,
            status: att.status,
            completedAt: att.completedAt,
            startedAt: att.startedAt,
          });
        }
      }
    }

    // Sort by most recent first
    quizHistory.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

    // Calculate stats
    const completedAttempts = quizHistory.filter(a => a.status === 'completed');
    const passedAttempts = completedAttempts.filter(a => a.passed);
    const scores = completedAttempts.map(a => a.score);
    
    const stats = {
      totalAttempts: quizHistory.length,
      passedAttempts: passedAttempts.length,
      averageScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      bestScore: scores.length > 0 ? Math.max(...scores) : 0,
    };

    res.render('guest/dashboard', {
      title: 'Guest Dashboard | ELKABLY',
      guest: guestUser,
      guestUser: req.session.guestUser,
      availableQuizzes,
      quizHistory,
      stats,
      theme: req.cookies.theme || 'light',
    });
  } catch (error) {
    console.error('Guest dashboard error:', error);
    req.flash('error_msg', 'Error loading dashboard');
    res.redirect('/');
  }
};

// Logout guest user
const logoutGuestUser = async (req, res) => {
  req.session.guestUser = null;
  req.flash('success_msg', 'Logged out successfully');
  res.redirect('/');
};

// Middleware to check if guest is authenticated
const ensureGuestAuthenticated = async (req, res, next) => {
  if (req.session.guestUser && req.session.guestUser.id) {
    const guestUser = await GuestUser.findById(req.session.guestUser.id);
    if (guestUser && guestUser.isActive) {
      req.guestUser = guestUser;
      return next();
    }
  }
  
  const redirectUrl = req.originalUrl;
  return res.redirect(`/guest/auth?redirect=${encodeURIComponent(redirectUrl)}`);
};

module.exports = {
  registerGuestUser,
  getGuestQuizDetails,
  startGuestQuizAttempt,
  takeGuestQuizPage,
  getSecureGuestQuizQuestions,
  submitGuestQuiz,
  getGuestQuizResults,
  getGuestAuthPage,
  getGuestDashboard,
  logoutGuestUser,
  ensureGuestAuthenticated,
};
