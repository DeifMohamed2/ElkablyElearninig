const Quiz = require('../models/Quiz');
const User = require('../models/User');
const QuestionBank = require('../models/QuestionBank');
const Question = require('../models/Question');
const { validationResult } = require('express-validator');
const { uploadImage } = require('../utils/cloudinary');

// Get all quizzes with pagination and filtering
const getAllQuizzes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const {
      status,
      difficulty,
      testType,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (difficulty) filter.difficulty = difficulty;
    if (testType) filter.testType = testType;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const quizzes = await Quiz.find(filter)
      .populate('questionBank', 'name bankCode description totalQuestions')
      .populate('createdBy', 'userName email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true });

    const total = await Quiz.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Get statistics
    const stats = await Quiz.getQuizStats();

    res.render('admin/quizzes', {
      title: 'Quizzes Management | ELKABLY',
      theme: req.cookies.theme || 'light',
      currentPage: 'quizzes',
      quizzes,
      pagination: {
        currentPage: page,
        totalPages,
        total,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
      },
      filters: { status, difficulty, search, sortBy, sortOrder },
      stats,
    });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    req.flash('error', 'Failed to fetch quizzes');
    res.redirect('/admin/dashboard');
  }
};

// Get quiz creation page
const getCreateQuiz = async (req, res) => {
  try {
    const questionBanks = await QuestionBank.find({ status: 'active' })
      .select('name bankCode description totalQuestions tags')
      .sort({ name: 1 });

    // Generate a unique quiz code
    const generatedCode = await Quiz.generateQuizCode();

    console.log('Question banks found:', questionBanks.length);
    console.log('Question banks data:', questionBanks);

    res.render('admin/create-quiz', {
      title: 'Create New Quiz | ELKABLY',
      theme: req.cookies.theme || 'light',
      currentPage: 'quizzes',
      questionBanks,
      generatedCode,
      messages: {
        success: req.flash('success')[0],
        error: req.flash('error')[0],
      },
    });
  } catch (error) {
    console.error('Error fetching question banks:', error);
    req.flash('error', 'Failed to load quiz creation page');
    res.redirect('/admin/quizzes');
  }
};

// Get questions from a specific question bank
const getQuestionsFromBank = async (req, res) => {
  try {
    const { bankId } = req.params;
    const {
      page = 1,
      limit = 20,
      difficulty,
      type,
      search,
      all = false,
    } = req.query;

    // Build filter
    const filter = { bank: bankId };
    if (difficulty) filter.difficulty = difficulty;
    if (type) filter.questionType = type;
    if (search) {
      filter.$or = [
        { questionText: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    let questions;
    let total;

    if (all === 'true') {
      // Return all questions without pagination (for edit quiz page)
      questions = await Question.find(filter)
        .select(
          'questionText questionType difficulty points options correctAnswer correctAnswers explanation tags'
        )
        .sort({ createdAt: 1 })
        .lean();

      total = questions.length;
    } else {
      // Return paginated results (for other pages)
      const skip = (page - 1) * limit;
      questions = await Question.find(filter)
        .select(
          'questionText questionType difficulty points options correctAnswer correctAnswers explanation tags'
        )
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      total = await Question.countDocuments(filter);
    }

    if (all === 'true') {
      res.json({
        success: true,
        questions,
        total,
      });
    } else {
      res.json({
        success: true,
        questions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      });
    }
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch questions',
    });
  }
};

// Get questions from multiple question banks
const getQuestionsFromMultipleBanks = async (req, res) => {
  try {
    const { bankIds } = req.body; // Array of bank IDs
    const { difficulty, type, search } = req.query;

    console.log('=== GET QUESTIONS FROM MULTIPLE BANKS ===');
    console.log('Received bankIds:', bankIds);

    if (!Array.isArray(bankIds) || bankIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one question bank',
      });
    }

    // Build filter
    const filter = { bank: { $in: bankIds } };
    if (difficulty) filter.difficulty = difficulty;
    if (type) filter.questionType = type;
    if (search) {
      filter.$or = [
        { questionText: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    console.log('Filter:', JSON.stringify(filter));

    // Get all questions from selected banks
    const questions = await Question.find(filter)
      .populate('bank', 'name bankCode')
      .select(
        'questionText questionType difficulty points options correctAnswer correctAnswers explanation tags bank'
      )
      .sort({ bank: 1, createdAt: 1 })
      .lean();

    console.log(`Found ${questions.length} total questions`);

    // Group questions by bank - simple format for frontend
    const questionsByBank = {};
    questions.forEach((q) => {
      const bankId = q.bank._id.toString();
      if (!questionsByBank[bankId]) {
        questionsByBank[bankId] = [];
      }
      questionsByBank[bankId].push(q);
    });

    console.log(
      `Grouped questions into ${Object.keys(questionsByBank).length} banks`
    );

    res.json({
      success: true,
      questions: questionsByBank, // Match frontend expectation
      totalQuestions: questions.length,
    });
  } catch (error) {
    console.error('Error fetching questions from multiple banks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch questions from multiple banks',
      error: error.message,
    });
  }
};

// Get single question for preview
const getQuestionPreview = async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findById(questionId)
      .populate('bank', 'name bankCode')
      .lean();

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found',
      });
    }

    res.json({
      success: true,
      question,
    });
  } catch (error) {
    console.error('Error fetching question preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch question preview',
    });
  }
};

// Create new quiz
const createQuiz = async (req, res) => {
  try {
    // Check if this is an AJAX request
    const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest';

    // Debug: Log the request body
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);

    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = errors
        .array()
        .map((err) => err.msg)
        .join(', ');
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect('/admin/quizzes/create');
    }

    // Basic validation - check if req.body exists
    if (!req.body) {
      const errorMessage = 'No form data received';
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect('/admin/quizzes/create');
    }

    // Check if user is authenticated
    if (!req.session.user || !req.session.user.id) {
      const errorMessage = 'User not authenticated';
      if (isAjax) {
        return res.status(401).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect('/auth/login');
    }

    const {
      title,
      description,
      code,
      questionBank,
      questionBanks, // NEW: Support for multiple banks
      testType,
      duration,
      difficulty,
      selectedQuestions,
    } = req.body;

    // Debug: Log individual fields
    console.log('Individual fields:', {
      title: title ? 'present' : 'missing',
      description: description ? 'present' : 'missing',
      code: code ? 'present' : 'missing',
      questionBank: questionBank ? `present (${questionBank})` : 'missing',
      questionBanks: questionBanks
        ? `present (${
            Array.isArray(questionBanks) ? questionBanks.length : 'not array'
          })`
        : 'missing',
      duration:
        duration !== undefined && duration !== null
          ? `present (${duration})`
          : 'missing',
      difficulty: difficulty ? `present (${difficulty})` : 'missing',
      selectedQuestions: selectedQuestions
        ? `present (${
            Array.isArray(selectedQuestions)
              ? selectedQuestions.length
              : 'not array'
          })`
        : 'missing',
    });

    // Check if at least one bank is selected (either single or multiple)
    const hasQuestionBank =
      questionBank ||
      (questionBanks &&
        (Array.isArray(questionBanks)
          ? questionBanks.length > 0
          : questionBanks));

    if (
      !title ||
      !code ||
      !hasQuestionBank ||
      duration === undefined ||
      duration === null ||
      !difficulty
    ) {
      const errorMessage = 'Missing required fields';
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect('/admin/quizzes/create');
    }

    if (!selectedQuestions || selectedQuestions === '[]') {
      const errorMessage = 'Please select at least one question';
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect('/admin/quizzes/create');
    }

    const {
      instructions,
      passingScore,
      maxAttempts,
      shuffleQuestions,
      shuffleOptions,
      showCorrectAnswers,
      showResults,
      tags,
      thumbnail,
    } = req.body;

    // Parse selected questions
    let parsedQuestions = [];
    if (selectedQuestions) {
      try {
        // If it's already an array (from JSON request), use it directly
        if (Array.isArray(selectedQuestions)) {
          parsedQuestions = selectedQuestions;
        } else {
          // If it's a string (from form data), parse it
          parsedQuestions = JSON.parse(selectedQuestions);
        }
      } catch (e) {
        const errorMessage = 'Invalid question selection format';
        if (isAjax) {
          return res.status(400).json({
            success: false,
            message: errorMessage,
          });
        }
        req.flash('error', errorMessage);
        return res.redirect('/admin/quizzes/create');
      }
    }

    // Determine which banks to use
    let selectedBankIds = [];
    if (questionBanks) {
      // Multiple banks selected
      selectedBankIds = Array.isArray(questionBanks)
        ? questionBanks
        : [questionBanks];
    } else if (questionBank) {
      // Single bank selected (backward compatibility)
      selectedBankIds = [questionBank];
    }

    // Validate question banks exist
    const banks = await QuestionBank.find({ _id: { $in: selectedBankIds } });
    if (banks.length !== selectedBankIds.length) {
      const errorMessage =
        'One or more selected question banks not found. Please select valid question banks.';
      console.log(
        'Question banks not found. Selected:',
        selectedBankIds.length,
        'Found:',
        banks.length
      );
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect('/admin/quizzes/create');
    }

    console.log('Question banks found:', banks.map((b) => b.name).join(', '));

    // Validate that selected questions exist in the selected banks
    if (parsedQuestions.length > 0) {
      const questionIds = parsedQuestions.map((q) => q.question);
      const existingQuestions = await Question.find({
        _id: { $in: questionIds },
        bank: { $in: selectedBankIds },
      }).select('_id bank');

      if (existingQuestions.length !== questionIds.length) {
        const missingQuestions = questionIds.filter(
          (id) =>
            !existingQuestions.some((eq) => eq._id.toString() === id.toString())
        );

        const errorMessage = `Some selected questions do not exist in the selected question banks. Missing: ${missingQuestions.length} questions. Please refresh the page and select questions again.`;

        if (isAjax) {
          return res.status(400).json({
            success: false,
            message: errorMessage,
          });
        }
        req.flash('error', errorMessage);
        return res.redirect('/admin/quizzes/create');
      }

      // Add sourceBank to each question if not present
      parsedQuestions = parsedQuestions.map((q) => {
        if (!q.sourceBank) {
          const questionDoc = existingQuestions.find(
            (eq) => eq._id.toString() === q.question.toString()
          );
          if (questionDoc) {
            q.sourceBank = questionDoc.bank;
          }
        }
        return q;
      });
    }

    // Create quiz
    const quiz = new Quiz({
      title,
      description,
      code,
      questionBank: selectedBankIds[0], // For backward compatibility, store first bank
      questionBanks: selectedBankIds, // Store all selected banks
      testType,
      selectedQuestions: parsedQuestions,
      duration: parseInt(duration),
      difficulty,
      instructions,
      passingScore: parseInt(passingScore),
      maxAttempts: parseInt(maxAttempts),
      shuffleQuestions: shuffleQuestions === 'on' || shuffleQuestions === true,
      shuffleOptions: shuffleOptions === 'on' || shuffleOptions === true,
      showCorrectAnswers:
        showCorrectAnswers === 'on' || showCorrectAnswers === true,
      showResults: showResults === 'on' || showResults === true,
      tags: (() => {
        if (tags) {
          if (typeof tags === 'string') {
            return tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean);
          } else if (Array.isArray(tags)) {
            return tags.filter(Boolean);
          }
        }
        return [];
      })(),
      thumbnail: thumbnail || null,
      createdBy: req.session.user.id,
    });

    // Validate quiz
    const validation = quiz.validateQuiz();
    if (!validation.isValid) {
      const errorMessage = validation.errors.join(', ');
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect('/admin/quizzes/create');
    }

    await quiz.save();

    // Return JSON response for AJAX requests
    if (
      req.headers['x-requested-with'] === 'XMLHttpRequest' ||
      req.headers['content-type']?.includes('application/json')
    ) {
      return res.json({
        success: true,
        message: 'Quiz created successfully!',
        redirect: '/admin/quizzes',
        quiz: {
          id: quiz._id,
          title: quiz.title,
          code: quiz.code,
        },
      });
    }

    // Fallback for regular form submissions
    req.flash('success', 'Quiz created successfully!');
    res.redirect('/admin/quizzes');
  } catch (error) {
    console.error('Error creating quiz:', error);

    // Return JSON response for AJAX requests
    if (
      req.headers['x-requested-with'] === 'XMLHttpRequest' ||
      req.headers['content-type']?.includes('application/json')
    ) {
      let errorMessage = 'Failed to create quiz';
      if (error.code === 11000) {
        errorMessage = 'Quiz code already exists';
      }

      return res.status(400).json({
        success: false,
        message: errorMessage,
        error: error.message,
      });
    }

    // Fallback for regular form submissions
    if (error.code === 11000) {
      req.flash('error', 'Quiz code already exists');
    } else {
      req.flash('error', 'Failed to create quiz');
    }
    res.redirect('/admin/quizzes/create');
  }
};

// Get quiz edit page
const getEditQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await Quiz.findById(id)
      .populate('questionBank', 'name bankCode description totalQuestions')
      .populate('questionBanks', 'name bankCode description totalQuestions')
      .populate(
        'selectedQuestions.question',
        'questionText questionType difficulty points options correctAnswer explanation tags'
      )
      .lean({ virtuals: true });

    if (!quiz) {
      req.flash('error', 'Quiz not found');
      return res.redirect('/admin/quizzes');
    }

    // Get all active question banks
    const questionBanks = await QuestionBank.find({ status: 'active' })
      .select('name bankCode description totalQuestions tags')
      .sort({ name: 1 });

    // Determine selected banks - prefer questionBanks array, fallback to questionBank
    const selectedBankIds = quiz.questionBanks && quiz.questionBanks.length > 0 
      ? quiz.questionBanks.map(b => b._id.toString())
      : (quiz.questionBank ? [quiz.questionBank._id.toString()] : []);

    res.render('admin/edit-quiz', {
      title: 'Edit Quiz | ELKABLY',
      theme: req.cookies.theme || 'light',
      currentPage: 'quizzes',
      quiz,
      questionBanks,
      selectedBankIds,
    });
  } catch (error) {
    console.error('Error fetching quiz for edit:', error);
    req.flash('error', 'Failed to load quiz for editing');
    res.redirect('/admin/quizzes');
  }
};

// Update quiz
const updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const isAjax =
      req.headers['x-requested-with'] === 'XMLHttpRequest' ||
      req.headers['content-type']?.includes('application/json');

    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = errors
        .array()
        .map((err) => err.msg)
        .join(', ');
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect(`/admin/quizzes/${id}/edit`);
    }

    // Check if user is authenticated
    if (!req.session.user || !req.session.user.id) {
      const errorMessage = 'User not authenticated';
      if (isAjax) {
        return res.status(401).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect('/auth/login');
    }

    const {
      title,
      description,
      code,
      questionBank,
      questionBanks,
      duration,
      difficulty,
      instructions,
      passingScore,
      maxAttempts,
      shuffleQuestions,
      shuffleOptions,
      showCorrectAnswers,
      showResults,
      tags,
      selectedQuestions,
    } = req.body;

    // Debug: Log the received data
    console.log('Update Quiz - Received data:', {
      title: title ? 'present' : 'missing',
      description: description ? 'present' : 'missing',
      code: code ? 'present' : 'missing',
      questionBank: questionBank ? `present (${questionBank})` : 'missing',
      duration:
        duration !== undefined && duration !== null
          ? `present (${duration})`
          : 'missing',
      difficulty: difficulty ? `present (${difficulty})` : 'missing',
      selectedQuestions: selectedQuestions
        ? `present (${
            Array.isArray(selectedQuestions)
              ? selectedQuestions.length
              : 'not array'
          })`
        : 'missing',
    });

    // Handle questionBanks - support both single and multiple banks
    let bankIds = [];
    if (questionBanks) {
      // If questionBanks is provided (array or JSON string)
      if (Array.isArray(questionBanks)) {
        bankIds = questionBanks;
      } else if (typeof questionBanks === 'string') {
        try {
          bankIds = JSON.parse(questionBanks);
        } catch (e) {
          bankIds = [questionBanks];
        }
      } else {
        bankIds = [questionBanks];
      }
    } else if (questionBank) {
      // Fallback to single questionBank for backward compatibility
      bankIds = [questionBank];
    }

    // Basic validation with specific error messages
    const missingFields = [];
    if (!title) missingFields.push('title');
    if (!code) missingFields.push('code');
    if (bankIds.length === 0) missingFields.push('questionBank(s)');
    if (duration === undefined || duration === null)
      missingFields.push('duration');
    if (!difficulty) missingFields.push('difficulty');

    if (missingFields.length > 0) {
      const errorMessage = `Missing required fields: ${missingFields.join(
        ', '
      )}`;
      console.log('Validation failed:', errorMessage);
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect(`/admin/quizzes/${id}/edit`);
    }

    if (!selectedQuestions || selectedQuestions.length === 0) {
      const errorMessage = 'Please select at least one question';
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect(`/admin/quizzes/${id}/edit`);
    }

    // Parse selected questions
    let parsedQuestions = [];
    if (selectedQuestions) {
      try {
        // If it's already an array (from JSON request), use it directly
        if (Array.isArray(selectedQuestions)) {
          parsedQuestions = selectedQuestions;
        } else {
          // If it's a string (from form data), parse it
          parsedQuestions = JSON.parse(selectedQuestions);
        }
      } catch (e) {
        const errorMessage = 'Invalid question selection format';
        if (isAjax) {
          return res.status(400).json({
            success: false,
            message: errorMessage,
          });
        }
        req.flash('error', errorMessage);
        return res.redirect(`/admin/quizzes/${id}/edit`);
      }
    }

    // Validate question banks exist
    const banks = await QuestionBank.find({
      _id: { $in: bankIds }
    }).select('_id');

    if (banks.length !== bankIds.length) {
      const errorMessage = 'One or more selected question banks not found';
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect(`/admin/quizzes/${id}/edit`);
    }

    // Validate that selected questions exist in the selected banks
    if (parsedQuestions.length > 0) {
      const questionIds = parsedQuestions.map((q) => q.question);

      const existingQuestions = await Question.find({
        _id: { $in: questionIds },
        bank: { $in: bankIds },
      }).select('_id bank');

      if (existingQuestions.length !== questionIds.length) {
        const missingQuestions = questionIds.filter(
          (id) =>
            !existingQuestions.some((eq) => eq._id.toString() === id.toString())
        );

        const errorMessage = `Some selected questions do not exist in the selected question banks. Missing: ${missingQuestions.length} questions`;
        if (isAjax) {
          return res.status(400).json({
            success: false,
            message: errorMessage,
          });
        }
        req.flash('error', errorMessage);
        return res.redirect(`/admin/quizzes/${id}/edit`);
      }
    }

    const quiz = await Quiz.findById(id);
    if (!quiz) {
      const errorMessage = 'Quiz not found';
      if (isAjax) {
        return res.status(404).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect('/admin/quizzes');
    }

    // Update quiz fields
    quiz.title = title;
    quiz.description = description || '';
    quiz.code = code;
    // Update question banks - set both for backward compatibility
    quiz.questionBanks = bankIds;
    quiz.questionBank = bankIds[0] || null; // Keep first bank for backward compatibility
    quiz.selectedQuestions = parsedQuestions;
    quiz.duration = parseInt(duration);
    quiz.difficulty = difficulty;
    quiz.instructions = instructions;
    quiz.passingScore = parseInt(passingScore);
    quiz.maxAttempts = parseInt(maxAttempts);
    quiz.shuffleQuestions =
      shuffleQuestions === 'on' || shuffleQuestions === true;
    quiz.shuffleOptions = shuffleOptions === 'on' || shuffleOptions === true;
    quiz.showCorrectAnswers =
      showCorrectAnswers === 'on' || showCorrectAnswers === true;
    quiz.showResults = showResults === 'on' || showResults === true;
    // Handle tags - could be string (from form) or array (from JSON)
    if (tags) {
      if (typeof tags === 'string') {
        quiz.tags = tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      } else if (Array.isArray(tags)) {
        quiz.tags = tags.filter(Boolean);
      } else {
        quiz.tags = [];
      }
    } else {
      quiz.tags = [];
    }
    quiz.lastModifiedBy = req.session.user.id;

    // Validate quiz
    const validation = quiz.validateQuiz();
    if (!validation.isValid) {
      const errorMessage = validation.errors.join(', ');
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: errorMessage,
        });
      }
      req.flash('error', errorMessage);
      return res.redirect(`/admin/quizzes/${id}/edit`);
    }

    await quiz.save();

    // Return JSON response for AJAX requests
    if (isAjax) {
      return res.json({
        success: true,
        message: 'Quiz updated successfully!',
        quiz: {
          id: quiz._id,
          title: quiz.title,
          code: quiz.code,
        },
      });
    }

    // Fallback for regular form submissions
    req.flash('success', 'Quiz updated successfully');
    res.redirect('/admin/quizzes');
  } catch (error) {
    console.error('Error updating quiz:', error);

    // Return JSON response for AJAX requests
    if (
      req.headers['x-requested-with'] === 'XMLHttpRequest' ||
      req.headers['content-type']?.includes('application/json')
    ) {
      let errorMessage = 'Failed to update quiz';
      if (error.code === 11000) {
        errorMessage = 'Quiz code already exists';
      }

      return res.status(400).json({
        success: false,
        message: errorMessage,
        error: error.message,
      });
    }

    // Fallback for regular form submissions
    if (error.code === 11000) {
      req.flash('error', 'Quiz code already exists');
    } else {
      req.flash('error', 'Failed to update quiz');
    }
    res.redirect(`/admin/quizzes/${req.params.id}/edit`);
  }
};

// Get quiz details (management) with participants ranked by best score
const getQuizDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await Quiz.findById(id)
      .populate('questionBank', 'name bankCode description totalQuestions')
      .populate(
        'selectedQuestions.question',
        'questionText questionType difficulty points options correctAnswer explanation tags'
      )
      .populate('createdBy', 'userName email')
      .populate('lastModifiedBy', 'userName email')
      .lean({ virtuals: true });

    if (!quiz) {
      req.flash('error', 'Quiz not found');
      return res.redirect('/admin/quizzes');
    }

    // Find participants: users who attempted this quiz (standalone quiz attempts)
    const participants = await User.find({
      'quizAttempts.quiz': id,
    })
      .select('firstName lastName userName studentEmail quizAttempts createdAt')
      .lean();

    // Map and rank participants
    const rankedParticipants = participants
      .map((u) => {
        const qa = (u.quizAttempts || []).find(
          (q) => q.quiz && q.quiz.toString() === id.toString()
        );
        const attempts = qa ? qa.attempts || [] : [];
        const bestScore = attempts.length
          ? Math.max(...attempts.map((a) => a.score || 0))
          : 0;
        const lastAttempt = attempts.length
          ? attempts[attempts.length - 1]
          : null;
        return {
          studentId: u._id,
          name:
            u.firstName && u.lastName
              ? `${u.firstName} ${u.lastName}`
              : u.userName || 'Unknown',
          email: u.studentEmail || '',
          attemptsCount: attempts.length,
          bestScore,
          lastScore: lastAttempt ? lastAttempt.score : null,
          lastPassed: lastAttempt ? !!lastAttempt.passed : false,
          timeSpent: lastAttempt ? lastAttempt.timeSpent : 0,
          completedAt: lastAttempt ? lastAttempt.completedAt : null,
        };
      })
      .sort((a, b) => b.bestScore - a.bestScore);

    res.render('admin/quiz-details', {
      title: 'Quiz Management | ELKABLY',
      theme: req.cookies.theme || 'light',
      currentPage: 'quizzes',
      quiz,
      participants: rankedParticipants,
      participantsCount: rankedParticipants.length,
    });
  } catch (error) {
    console.error('Error fetching quiz details:', error);
    req.flash('error', 'Failed to fetch quiz details');
    res.redirect('/admin/quizzes');
  }
};

// Delete quiz (soft delete by default)
const deleteQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const { immediate = false, reason = '' } = req.body;
    const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest';

    // Find quiz including soft-deleted ones
    let quiz;
    if (immediate) {
      // For immediate delete, we need to find soft-deleted quizzes
      console.log('Looking for soft-deleted quiz with ID:', id);
      // Use direct database query to bypass pre-hook
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      const quizData = await db
        .collection('quizzes')
        .findOne({ _id: new mongoose.Types.ObjectId(id) });

      console.log('Found quiz data:', quizData ? 'Yes' : 'No');
      if (quizData) {
        // Create a Quiz instance from the raw data
        quiz = new Quiz(quizData);
        quiz.isNew = false; // Mark as existing document
        console.log('Created Quiz instance for hard delete');
      }
    } else {
      // For soft delete, use normal find (will exclude soft-deleted)
      quiz = await Quiz.findById(id);
    }

    if (!quiz) {
      if (isAjax) {
        return res.status(404).json({
          success: false,
          message: 'Quiz not found',
        });
      }
      req.flash('error', 'Quiz not found');
      return res.redirect('/admin/quizzes');
    }

    if (immediate) {
      // Hard delete - immediate deletion
      console.log('Performing hard delete for quiz:', id);
      await quiz.hardDelete();

      if (isAjax) {
        return res.json({
          success: true,
          message: 'Quiz permanently deleted successfully',
        });
      }
      req.flash('success', 'Quiz permanently deleted successfully');
    } else {
      // Soft delete - mark as deleted
      await quiz.softDelete(req.session.user.id, reason);

      if (isAjax) {
        return res.json({
          success: true,
          message: 'Quiz moved to trash successfully',
        });
      }
      req.flash('success', 'Quiz moved to trash successfully');
    }

    if (!isAjax) {
      res.redirect('/admin/quizzes');
    }
  } catch (error) {
    console.error('Error deleting quiz:', error);

    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete quiz',
      });
    }

    req.flash('error', 'Failed to delete quiz');
    res.redirect('/admin/quizzes');
  }
};

// Update quiz status
const updateQuizStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['draft', 'active', 'inactive', 'archived'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid status. Must be one of: draft, active, inactive, archived',
      });
    }

    const quiz = await Quiz.findById(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    // Check if status is actually changing
    if (quiz.status === status) {
      return res.json({
        success: true,
        message: 'Quiz status is already set to ' + status,
      });
    }

    const oldStatus = quiz.status;
    quiz.status = status;
    quiz.lastModifiedBy = req.session.user.id;
    await quiz.save();

    res.json({
      success: true,
      message: `Quiz status updated from ${oldStatus} to ${status} successfully`,
    });
  } catch (error) {
    console.error('Error updating quiz status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quiz status',
    });
  }
};

// Reset student quiz attempts
const resetStudentQuizAttempts = async (req, res) => {
  try {
    const { id: quizId, studentId } = req.params;

    // Verify quiz exists
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    // Find the student
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Reset the student's quiz attempts
    const result = await student.resetQuizAttempts(quizId);

    if (result.success) {
      res.json({
        success: true,
        message: `Quiz attempts reset successfully for ${student.firstName} ${student.lastName}`,
        student: {
          id: student._id,
          name: `${student.firstName} ${student.lastName}`,
          studentCode: student.studentCode,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Error resetting student quiz attempts:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting student quiz attempts',
    });
  }
};

// Get quiz statistics
const getQuizStats = async (req, res) => {
  try {
    const stats = await Quiz.getQuizStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching quiz stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz statistics',
    });
  }
};

// Upload quiz thumbnail
const uploadQuizThumbnail = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Upload to Cloudinary
    const thumbnailData = await uploadImage(req.file.buffer, {
      folder: 'quiz-thumbnails',
      transformation: [
        { width: 400, height: 300, crop: 'fill', quality: 'auto' },
        { format: 'auto' },
      ],
    });

    res.json({
      success: true,
      thumbnail: thumbnailData,
      message: 'Thumbnail uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading thumbnail:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload thumbnail',
    });
  }
};

// Get quiz thumbnail
const getQuizThumbnail = async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await Quiz.findById(id).select('thumbnail');

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    res.json({
      success: true,
      thumbnail: quiz.thumbnail || null,
    });
  } catch (error) {
    console.error('Error fetching quiz thumbnail:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz thumbnail',
    });
  }
};

// Update quiz thumbnail
const updateQuizThumbnail = async (req, res) => {
  try {
    const { id } = req.params;
    const { thumbnail } = req.body;

    if (!thumbnail) {
      return res.status(400).json({
        success: false,
        message: 'No thumbnail data provided',
      });
    }

    const quiz = await Quiz.findByIdAndUpdate(
      id,
      {
        thumbnail: thumbnail,
        lastModifiedBy: req.session.user.id,
      },
      { new: true }
    );

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    res.json({
      success: true,
      message: 'Thumbnail updated successfully',
      thumbnail: quiz.thumbnail,
    });
  } catch (error) {
    console.error('Error updating quiz thumbnail:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quiz thumbnail',
    });
  }
};

// Admin: Review a specific student's answers for a quiz
const getQuizStudentReview = async (req, res) => {
  try {
    const { id: quizId, studentId } = req.params;

    const quiz = await Quiz.findById(quizId)
      .populate('questionBank', 'name bankCode')
      .populate(
        'selectedQuestions.question',
        'questionText questionType difficulty points options correctAnswer explanation'
      )
      .lean();

    if (!quiz) {
      req.flash('error', 'Quiz not found');
      return res.redirect('/admin/quizzes');
    }

    const student = await User.findById(studentId).select(
      'firstName lastName userName studentEmail quizAttempts'
    );
    if (!student) {
      req.flash('error', 'Student not found');
      return res.redirect(`/admin/quizzes/${quizId}`);
    }

    const qa = (student.quizAttempts || []).find(
      (q) => q.quiz && q.quiz.toString() === quizId.toString()
    );

    if (!qa || !qa.attempts || qa.attempts.length === 0) {
      req.flash('error', 'No attempts found for this student');
      return res.redirect(`/admin/quizzes/${quizId}`);
    }

    // Choose attempt to review: latest by default, or by query attemptNumber
    let attemptToShow = qa.attempts[qa.attempts.length - 1];
    if (req.query.attempt) {
      const attemptNumber = parseInt(req.query.attempt);
      const found = qa.attempts.find((a) => a.attemptNumber === attemptNumber);
      if (found) attemptToShow = found;
    }

    // Build mapping for quick lookup of selectedQuestions points
    const questionMap = new Map();
    (quiz.selectedQuestions || []).forEach((sq) => {
      questionMap.set(sq.question._id.toString(), {
        points: sq.points || 1,
        question: sq.question,
      });
    });

    // Filter quiz questions to only show questions that the student actually attempted
    const attemptedQuestionIds = new Set(
      (attemptToShow.answers || []).map((answer) =>
        answer.questionId.toString()
      )
    );
    const attemptedQuestions = (quiz.selectedQuestions || []).filter((sq) =>
      attemptedQuestionIds.has(sq.question._id.toString())
    );

    // Debug logging
    console.log('Quiz Review Debug:');
    console.log(
      '- Total quiz questions:',
      (quiz.selectedQuestions || []).length
    );
    console.log('- Student attempted questions:', attemptedQuestionIds.size);
    console.log('- Attempted question IDs:', Array.from(attemptedQuestionIds));
    console.log('- Filtered questions for review:', attemptedQuestions.length);

    // Create a new quiz object with only attempted questions for the review
    const reviewQuiz = {
      ...quiz,
      selectedQuestions: attemptedQuestions,
    };

    // For admin, always allow showing answers
    const canShowAnswers = true;

    res.render('admin/quiz-review', {
      title: `Review: ${quiz.title}`,
      theme: req.cookies.theme || 'light',
      currentPage: 'quizzes',
      quiz: reviewQuiz,
      student,
      attempt: attemptToShow,
      canShowAnswers,
      questionMapExists: questionMap.size > 0,
    });
  } catch (error) {
    console.error('Error loading quiz review:', error);
    req.flash('error', 'Failed to load quiz review');
    res.redirect('/admin/quizzes');
  }
};

// Restore soft-deleted quiz
const restoreQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest';

    const quiz = await Quiz.findOne({ _id: id, isDeleted: true });
    if (!quiz) {
      if (isAjax) {
        return res.status(404).json({
          success: false,
          message: 'Deleted quiz not found',
        });
      }
      req.flash('error', 'Deleted quiz not found');
      return res.redirect('/admin/quizzes');
    }

    // Restore the quiz
    quiz.isDeleted = false;
    quiz.deletedAt = null;
    quiz.deletedBy = null;
    quiz.deleteReason = '';
    quiz.status = 'draft'; // Reset to draft when restored
    await quiz.save();

    if (isAjax) {
      return res.json({
        success: true,
        message: 'Quiz restored successfully',
      });
    }

    req.flash('success', 'Quiz restored successfully');
    res.redirect('/admin/quizzes');
  } catch (error) {
    console.error('Error restoring quiz:', error);

    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.status(500).json({
        success: false,
        message: 'Failed to restore quiz',
      });
    }

    req.flash('error', 'Failed to restore quiz');
    res.redirect('/admin/quizzes');
  }
};

// Get Trash Quizzes
const getTrashQuizzes = async (req, res) => {
  try {
    console.log('Getting trash quizzes...');
    // Use aggregate to get deleted quizzes with population
    const quizzes = await Quiz.aggregate([
      { $match: { isDeleted: true } },
      { $sort: { deletedAt: -1 } },
      {
        $lookup: {
          from: 'questionbanks',
          localField: 'questionBank',
          foreignField: '_id',
          as: 'questionBank',
          pipeline: [
            {
              $project: {
                name: 1,
                bankCode: 1,
                description: 1,
                totalQuestions: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: 'admins',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'createdBy',
          pipeline: [{ $project: { userName: 1, email: 1 } }],
        },
      },
      {
        $lookup: {
          from: 'admins',
          localField: 'deletedBy',
          foreignField: '_id',
          as: 'deletedBy',
          pipeline: [{ $project: { userName: 1, email: 1 } }],
        },
      },
      {
        $addFields: {
          questionBank: { $arrayElemAt: ['$questionBank', 0] },
          createdBy: { $arrayElemAt: ['$createdBy', 0] },
          deletedBy: { $arrayElemAt: ['$deletedBy', 0] },
        },
      },
    ]);

    console.log('Found trash quizzes:', quizzes.length);
    res.json({
      success: true,
      quizzes: quizzes,
    });
  } catch (error) {
    console.error('Error getting trash quizzes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trash quizzes',
    });
  }
};

// Get Quiz Stats (API endpoint)
const getQuizStatsAPI = async (req, res) => {
  try {
    const stats = await Quiz.getQuizStats();
    res.json({
      success: true,
      stats: stats,
    });
  } catch (error) {
    console.error('Error getting quiz stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get quiz statistics',
    });
  }
};

module.exports = {
  getAllQuizzes,
  getCreateQuiz,
  getQuestionsFromBank,
  getQuestionsFromMultipleBanks,
  getQuestionPreview,
  createQuiz,
  getEditQuiz,
  updateQuiz,
  getQuizDetails,
  deleteQuiz,
  restoreQuiz,
  getTrashQuizzes,
  getQuizStatsAPI,
  updateQuizStatus,
  resetStudentQuizAttempts,
  getQuizStats,
  uploadQuizThumbnail,
  getQuizThumbnail,
  updateQuizThumbnail,
  getQuizStudentReview,
};
