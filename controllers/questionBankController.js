const QuestionBank = require('../models/QuestionBank');
const Question = require('../models/Question');
const Admin = require('../models/Admin');

// ==================== QUESTION BANK CONTROLLERS ====================

// Get all question banks with filtering
const getQuestionBanks = async (req, res) => {
  try {
    const { 
      status, 
      search,
      testType,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 12
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (testType && testType !== 'all') {
      filter.testType = testType;
    }
    
    
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { bankCode: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get question banks with pagination
    const questionBanks = await QuestionBank.find(filter)
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalBanks = await QuestionBank.countDocuments(filter);
    const totalPages = Math.ceil(totalBanks / parseInt(limit));

    // Get bank statistics
    const stats = await getQuestionBankStats();

    // Get filter options
    const filterOptions = await getQuestionBankFilterOptions();

    return res.render('admin/question-banks', {
      title: 'Question Banks | ELKABLY',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      questionBanks,
      stats,
      filterOptions,
      currentFilters: { status, search, testType, sortBy, sortOrder },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBanks,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching question banks:', error);
    req.flash('error', 'Failed to fetch question banks');
    return res.redirect('/admin/dashboard');
  }
};

// Create new question bank
const createQuestionBank = async (req, res) => {
  try {
    const { name, description, tags, testType } = req.body;

    // Check if bank with same name exists
    const existingBank = await QuestionBank.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });

    if (existingBank) {
      req.flash('error', 'A question bank with this name already exists');
      return res.redirect('/admin/question-banks/banks');
    }

    // Validate testType
    if (!testType) {
      req.flash('error', 'Test type is required');
      return res.redirect('/admin/question-banks/banks');
    }

    // Create new question bank
    const questionBank = new QuestionBank({
      name,
      description,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      testType,
      createdBy: req.session.user ? req.session.user._id : null
    });

    await questionBank.save();

    req.flash('success', 'Question bank created successfully');
    return res.redirect(`/admin/question-banks/banks/${questionBank.bankCode}`);
  } catch (error) {
    console.error('Error creating question bank:', error);
    req.flash('error', 'Failed to create question bank');
    return res.redirect('/admin/question-banks/banks');
  }
};

// Get single question bank
const getQuestionBank = async (req, res) => {
  try {
    const { bankCode } = req.params;

    const questionBank = await QuestionBank.findOne({ bankCode })
      .populate('createdBy', 'name email')
      .populate('questions');

    if (!questionBank) {
      req.flash('error', 'Question bank not found');
      return res.redirect('/admin/question-banks/banks');
    }

    // Get all questions (no pagination - scroll only)
    const { 
      difficulty, 
      tags, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'asc'
    } = req.query;

    const questionFilter = { bank: questionBank._id };
    
    if (difficulty && difficulty !== 'all') {
      questionFilter.difficulty = difficulty;
    }
    
    if (tags) {
      questionFilter.tags = { $in: tags.split(',') };
    }
    
    if (search) {
      questionFilter.$or = [
        { questionText: { $regex: search, $options: 'i' } },
        { explanation: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Fetch all questions without pagination
    const questions = await Question.find(questionFilter)
      .populate('createdBy', 'name email')
      .sort(sort);

    const totalQuestions = questions.length;

    // Get question statistics for this bank
    const questionStats = await getQuestionStatsForBank(questionBank._id);

    return res.render('admin/question-bank-details', {
      title: `${questionBank.name} - Question Bank | ELKABLY`,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      questionBank,
      questions,
      questionStats,
      currentFilters: { difficulty, tags, search, sortBy, sortOrder },
      pagination: {
        totalQuestions
      }
    });
  } catch (error) {
    console.error('Error fetching question bank:', error);
    req.flash('error', 'Failed to fetch question bank');
    return res.redirect('/admin/question-banks/banks');
  }
};

// Update question bank
const updateQuestionBank = async (req, res) => {
  try {
    const { bankCode } = req.params;
    const { name, description, status, tags, testType } = req.body;

    const questionBank = await QuestionBank.findOne({ bankCode });

    if (!questionBank) {
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Question bank not found' });
      }
      req.flash('error', 'Question bank not found');
      return res.redirect('/admin/question-banks/banks');
    }

    // Check if name is being changed and if it conflicts
    if (name !== questionBank.name) {
      const existingBank = await QuestionBank.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: questionBank._id }
      });

      if (existingBank) {
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
          return res.status(400).json({ success: false, message: 'A question bank with this name already exists' });
        }
        req.flash('error', 'A question bank with this name already exists');
        return res.redirect(`/admin/question-banks/banks/${bankCode}`);
      }
    }

    // Update question bank
    questionBank.name = name;
    questionBank.description = description;
    questionBank.status = status;
    questionBank.tags = tags ? tags.split(',').map(tag => tag.trim()) : [];
    if (testType) {
      questionBank.testType = testType;
    }

    await questionBank.save();

    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
      return res.json({ 
        success: true, 
        message: 'Question bank updated successfully',
        questionBank: {
          name: questionBank.name,
          description: questionBank.description,
          status: questionBank.status,
          tags: questionBank.tags,
          testType: questionBank.testType
        }
      });
    }

    req.flash('success', 'Question bank updated successfully');
    return res.redirect(`/admin/question-banks/banks/${bankCode}`);
  } catch (error) {
    console.error('Error updating question bank:', error);
    
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
      return res.status(500).json({ success: false, message: 'Failed to update question bank' });
    }
    
    req.flash('error', 'Failed to update question bank');
    return res.redirect(`/admin/question-banks/banks/${req.params.bankCode}`);
  }
};

// Delete question bank
const deleteQuestionBank = async (req, res) => {
  try {
    const { bankCode } = req.params;
    console.log('Delete request received for bankCode:', bankCode);
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);
    
    // Check if this is a JSON/AJAX request (check multiple headers)
    const isJsonRequest = req.headers.accept && req.headers.accept.includes('application/json') ||
                         req.headers['content-type'] && req.headers['content-type'].includes('application/json') ||
                         req.xhr;

    const questionBank = await QuestionBank.findOne({ bankCode });

    if (!questionBank) {
      console.log('Question bank not found for bankCode:', bankCode);
      if (isJsonRequest) {
        return res.status(404).json({ success: false, message: 'Question bank not found' });
      }
      req.flash('error', 'Question bank not found');
      return res.redirect('/admin/question-banks/banks');
    }

    console.log('Deleting question bank:', questionBank._id);
    console.log('Deleting all questions in bank:', questionBank._id);

    // Delete all questions in this bank
    await Question.deleteMany({ bank: questionBank._id });

    // Delete the question bank
    await QuestionBank.findByIdAndDelete(questionBank._id);

    console.log('Question bank deleted successfully');

    if (isJsonRequest) {
      return res.json({ 
        success: true, 
        message: 'Question bank and all its questions deleted successfully' 
      });
    }

    req.flash('success', 'Question bank and all its questions deleted successfully');
    return res.redirect('/admin/question-banks/banks');
  } catch (error) {
    console.error('Error deleting question bank:', error);
    
    // Check if this is a JSON/AJAX request
    const isJsonRequest = req.headers.accept && req.headers.accept.includes('application/json') ||
                         req.headers['content-type'] && req.headers['content-type'].includes('application/json') ||
                         req.xhr;
    
    if (isJsonRequest) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to delete question bank: ' + error.message 
      });
    }
    
    req.flash('error', 'Failed to delete question bank');
    return res.redirect('/admin/question-banks/banks');
  }
};

// ==================== QUESTION CONTROLLERS ====================

// Get questions in a bank
const getQuestions = async (req, res) => {
  try {
    const { bankCode } = req.params;
    const { 
      difficulty, 
      tags, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    const questionBank = await QuestionBank.findOne({ bankCode });
    if (!questionBank) {
      req.flash('error', 'Question bank not found');
      return res.redirect('/admin/question-banks/banks');
    }

    const filter = { bank: questionBank._id };
    
    if (difficulty && difficulty !== 'all') {
      filter.difficulty = difficulty;
    }
    
    if (tags) {
      filter.tags = { $in: tags.split(',') };
    }
    
    if (search) {
      filter.$or = [
        { questionText: { $regex: search, $options: 'i' } },
        { explanation: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const questions = await Question.find(filter)
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalQuestions = await Question.countDocuments(filter);
    const totalPages = Math.ceil(totalQuestions / parseInt(limit));

    return res.json({
      success: true,
      questions,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalQuestions,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch questions' });
  }
};

// Create new question
const createQuestion = async (req, res) => {
  try {
    const { bankCode } = req.params;
    
    // Handle both JSON and form data
    let bodyData = req.body;
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
      bodyData = req.body;
    } else {
      // If it's form data, it should already be parsed by express.urlencoded middleware
      bodyData = req.body;
    }
    
    const { 
      questionText, 
      questionImage, 
      uploadedImageUrl,
      questionType, 
      options, 
      explanation, 
      explanationImage, 
      difficulty, 
      tags, 
      points,
      answerMultiplicity
    } = bodyData;

    // Handle both array and single value formats for backward compatibility
    const answerMultiplicityValue = Array.isArray(bodyData.answerMultiplicity) ? bodyData.answerMultiplicity[0] : bodyData.answerMultiplicity;


    const questionBank = await QuestionBank.findOne({ bankCode });
    if (!questionBank) {
      return res.status(404).json({
        success: false,
        message: 'Question bank not found'
      });
    }

    // Parse options from JSON string
    let parsedOptions = [];
    if (options) {
      try {
        parsedOptions = typeof options === 'string' ? JSON.parse(options) : options;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid options format'
        });
      }
    }

    // Validate question text length
    if (!questionText || questionText.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Question text must be at least 10 characters long'
      });
    }

    // Validate options based on question type
    if (questionType === 'Written') {
      // For written questions, validate correctAnswers
      // Handle both array and string formats
      let correctAnswers = bodyData.correctAnswers || [];
      let answerMandatory = bodyData.answerMandatory || [];
      
      // Convert to arrays if they're strings
      if (typeof correctAnswers === 'string') {
        correctAnswers = [correctAnswers];
      }
      if (typeof answerMandatory === 'string') {
        answerMandatory = [answerMandatory];
      }
      
      // Process answers with mandatory flags
      const processedAnswers = correctAnswers.map((answer, index) => ({
        text: answer ? answer.trim() : '',
        isMandatory: answerMandatory[index] === 'true' || answerMandatory[index] === true
      })).filter(answer => answer.text.length > 0);
      
      if (processedAnswers.length === 0) {
        console.log('Validation failed: No correct answers for written question');
        return res.status(400).json({
          success: false,
          message: 'Written questions must have at least one correct answer'
        });
      }

      // Ensure at least one mandatory answer
      const hasMandatoryAnswer = processedAnswers.some(answer => answer.isMandatory);
      if (!hasMandatoryAnswer) {
        return res.status(400).json({
          success: false,
          message: 'Written questions must have at least one mandatory answer'
        });
      }

      // Enforce multiplicity rules server-side
      const multiplicity = answerMultiplicityValue === 'multiple' ? 'multiple' : 'single';
      if (multiplicity === 'single' && processedAnswers.length !== 1) {
        return res.status(400).json({
          success: false,
          message: 'For single-answer written questions, provide exactly one correct answer'
        });
      }
    } else if (questionType === 'True/False') {
      if (parsedOptions.length !== 2) {
        return res.status(400).json({
          success: false,
          message: 'True/False questions must have exactly 2 options'
        });
      }
      
      const optionTexts = parsedOptions.map(option => option.text.toLowerCase().trim());
      if (!optionTexts.includes('true') || !optionTexts.includes('false')) {
        return res.status(400).json({
          success: false,
          message: 'True/False questions must have "True" and "False" as options'
        });
      }
    } else if (questionType === 'MCQ') {
      if (parsedOptions.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'MCQ questions must have at least 2 options'
        });
      }
    }

    // Validate that at least one option is marked as correct (for MCQ and True/False)
    if (questionType !== 'Written') {
      const hasCorrectOption = parsedOptions.some(option => option.isCorrect === true);
      if (!hasCorrectOption) {
        console.log('Validation failed: No correct option selected');
        return res.status(400).json({
          success: false,
          message: 'At least one option must be marked as correct'
        });
      }
    }

    // Determine which image URL to use (uploaded image takes priority)
    const finalImageUrl = uploadedImageUrl || questionImage || '';

    // Create new question
    const questionData = {
      questionText,
      questionImage: finalImageUrl,
      questionType: questionType || 'MCQ',
      explanation: explanation || '',
      explanationImage: explanationImage || '',
      difficulty,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      points: parseInt(points) || 1,
      bank: questionBank._id,
      createdBy: req.session.user ? req.session.user._id : null
    };

    // Add type-specific fields
    if (questionType === 'Written') {
      // Handle both array and string formats
      let correctAnswers = bodyData.correctAnswers || [];
      let answerMandatory = bodyData.answerMandatory || [];
      
      // Convert to arrays if they're strings
      if (typeof correctAnswers === 'string') {
        correctAnswers = [correctAnswers];
      }
      if (typeof answerMandatory === 'string') {
        answerMandatory = [answerMandatory];
      }
      
      // Process answers with mandatory flags
      const processedAnswers = correctAnswers.map((answer, index) => ({
        text: answer ? answer.trim() : '',
        isMandatory: answerMandatory[index] === 'true' || answerMandatory[index] === true
      })).filter(answer => answer.text.length > 0);
      
      questionData.correctAnswers = processedAnswers;
      const multiplicity = answerMultiplicityValue === 'multiple' ? 'multiple' : 'single';
      questionData.answerMultiplicity = multiplicity;
    } else {
      questionData.options = parsedOptions;
    }

    const question = new Question(questionData);

    await question.save();

    // Add question to bank's questions array
    questionBank.questions.push(question._id);
    await questionBank.save();

    // Update question bank counts
    await questionBank.updateQuestionCounts();

    console.log('Question created successfully:', question._id);
    return res.status(201).json({
      success: true,
      message: 'Question created successfully',
      question: {
        _id: question._id,
        questionText: question.questionText,
        questionType: question.questionType,
        difficulty: question.difficulty,
        points: question.points
      }
    });
  } catch (error) {
    console.error('Error creating question:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create question',
      error: error.message
    });
  }
};

// Get single question
const getQuestion = async (req, res) => {
  try {
    const { bankCode, questionId } = req.params;

    const questionBank = await QuestionBank.findOne({ bankCode });
    if (!questionBank) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Question bank not found' });
      }
      req.flash('error', 'Question bank not found');
      return res.redirect('/admin/question-banks/banks');
    }

    const question = await Question.findOne({ 
      _id: questionId, 
      bank: questionBank._id 
    }).populate('createdBy', 'name email');

    if (!question) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Question not found' });
      }
      req.flash('error', 'Question not found');
      return res.redirect(`/admin/question-banks/banks/${bankCode}`);
    }

    // Return JSON for AJAX requests (preview)
    console.log('Request headers:', req.headers.accept);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      console.log('Returning JSON response for question:', questionId);
      return res.json({ 
        success: true, 
        question: {
          _id: question._id,
          questionText: question.questionText,
          questionImage: question.questionImage || '',
          questionType: question.questionType,
          options: question.options,
          correctAnswers: question.correctAnswers,
          answerMultiplicity: question.answerMultiplicity,
          explanation: question.explanation,
          difficulty: question.difficulty,
          tags: question.tags,
          points: question.points,
          createdAt: question.createdAt,
          createdBy: question.createdBy
        }
      });
    }

    // For non-JSON requests, redirect to the question bank page
    req.flash('info', 'Question preview is available via the preview button');
    return res.redirect(`/admin/question-banks/banks/${bankCode}`);
  } catch (error) {
    console.error('Error fetching question:', error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ success: false, message: 'Failed to fetch question' });
    }
    req.flash('error', 'Failed to fetch question');
    return res.redirect(`/admin/question-banks/banks/${req.params.bankCode}`);
  }
};

// Update question
const updateQuestion = async (req, res) => {
  try {
    const { bankCode, questionId } = req.params;
    console.log('Updating question with data:', req.body);
    // Handle both JSON and form data
    let bodyData = req.body;
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
      bodyData = req.body;
    } else {
      bodyData = req.body;
    }
    
    const { 
      questionText, 
      questionImage, 
      uploadedImageUrl,
      questionType, 
      options, 
      explanation, 
      explanationImage, 
      difficulty, 
      tags, 
      points,
      status,
      answerMultiplicity
    } = bodyData;
    console.log('Answer multiplicity:', answerMultiplicity);
    // Handle both array and single value formats for backward compatibility
    const answerMultiplicityValue = Array.isArray(answerMultiplicity) ? answerMultiplicity[0] : answerMultiplicity;
    console.log('Answer multiplicity value:', answerMultiplicityValue);
    const questionBank = await QuestionBank.findOne({ bankCode });
    if (!questionBank) {
      return res.status(404).json({
        success: false,
        message: 'Question bank not found'
      });
    }

    const question = await Question.findOne({ 
      _id: questionId, 
      bank: questionBank._id 
    });

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Parse options from JSON string
    let parsedOptions = [];
    if (options) {
      try {
        parsedOptions = typeof options === 'string' ? JSON.parse(options) : options;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid options format'
        });
      }
    }

    // Determine which image URL to use (uploaded image takes priority)
    const finalImageUrl = uploadedImageUrl || questionImage || '';

    // Update question
    question.questionText = questionText;
    question.questionImage = finalImageUrl;
    question.questionType = questionType || 'MCQ';
    question.explanation = explanation || '';
    question.explanationImage = explanationImage || '';
    question.difficulty = difficulty;
    question.tags = tags ? tags.split(',').map(tag => tag.trim()) : [];
    question.points = parseInt(points) || 1;
    question.status = status || 'draft';

    // Update type-specific fields
    if (questionType === 'Written') {
      // Handle both array and string formats
      let correctAnswers = bodyData.correctAnswers || [];
      let answerMandatory = bodyData.answerMandatory || [];
      
      // Convert to arrays if they're strings
      if (typeof correctAnswers === 'string') {
        correctAnswers = [correctAnswers];
      }
      if (typeof answerMandatory === 'string') {
        answerMandatory = [answerMandatory];
      }
      
      // Process answers with mandatory flags
      const processedAnswers = correctAnswers.map((answer, index) => ({
        text: answer ? answer.trim() : '',
        isMandatory: answerMandatory[index] === 'true' || answerMandatory[index] === true
      })).filter(answer => answer.text.length > 0);
      
      question.correctAnswers = processedAnswers;
      const multiplicity = answerMultiplicityValue === 'multiple' ? 'multiple' : 'single';
      question.answerMultiplicity = multiplicity;
      // Clear options for written questions
      question.options = [];
    } else {
      question.options = parsedOptions;
      // Clear written question fields for MCQ/True-False
      question.correctAnswers = [];
    }

    // Enforce multiplicity rule server-side on update as well
    if (questionType === 'Written') {
      // Use the multiplicity value that was just calculated
      const multiplicity = answerMultiplicityValue === 'multiple' ? 'multiple' : 'single';
      if (multiplicity === 'single' && question.correctAnswers.length !== 1) {
        return res.status(400).json({
          success: false,
          message: 'For single-answer written questions, provide exactly one correct answer'
        });
      }
      
      // Ensure at least one mandatory answer exists
      const hasMandatoryAnswer = question.correctAnswers.some(answer => answer.isMandatory === true);
      if (!hasMandatoryAnswer) {
        return res.status(400).json({
          success: false,
          message: 'Written questions must have at least one mandatory answer'
        });
      }
    }

    await question.save();

    // Update question bank counts
    await questionBank.updateQuestionCounts();

    return res.status(200).json({
      success: true,
      message: 'Question updated successfully',
      question: {
        _id: question._id,
        questionText: question.questionText,
        questionType: question.questionType,
        difficulty: question.difficulty,
        points: question.points
      }
    });
  } catch (error) {
    console.error('Error updating question:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update question',
      error: error.message
    });
  }
};

// Delete question
const deleteQuestion = async (req, res) => {
  try {
    const { bankCode, questionId } = req.params;

    const questionBank = await QuestionBank.findOne({ bankCode });
    if (!questionBank) {
      // Check if this is an AJAX request
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Question bank not found' });
      }
      req.flash('error', 'Question bank not found');
      return res.redirect('/admin/question-banks/banks');
    }

    const question = await Question.findOne({ 
      _id: questionId, 
      bank: questionBank._id 
    });

    if (!question) {
      // Check if this is an AJAX request
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Question not found' });
      }
      req.flash('error', 'Question not found');
      return res.redirect(`/admin/question-banks/banks/${bankCode}`);
    }

    await Question.findByIdAndDelete(questionId);

    // Remove question from bank's questions array
    questionBank.questions = questionBank.questions.filter(qId => qId.toString() !== questionId);
    await questionBank.save();

    // Update question bank counts
    await questionBank.updateQuestionCounts();

    // Check if this is an AJAX request
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, message: 'Question deleted successfully' });
    }

    req.flash('success', 'Question deleted successfully');
    return res.redirect(`/admin/question-banks/banks/${bankCode}`);
  } catch (error) {
    console.error('Error deleting question:', error);
    // Check if this is an AJAX request
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ success: false, message: 'Failed to delete question' });
    }
    req.flash('error', 'Failed to delete question');
    return res.redirect(`/admin/question-banks/banks/${req.params.bankCode}`);
  }
};

// Duplicate question
const duplicateQuestion = async (req, res) => {
  try {
    const { bankCode, questionId } = req.params;

    const questionBank = await QuestionBank.findOne({ bankCode });
    if (!questionBank) {
      req.flash('error', 'Question bank not found');
      return res.redirect('/admin/question-banks/banks');
    }

    const originalQuestion = await Question.findOne({ 
      _id: questionId, 
      bank: questionBank._id 
    });

    if (!originalQuestion) {
      req.flash('error', 'Question not found');
      return res.redirect(`/admin/question-banks/banks/${bankCode}`);
    }

    // Create duplicate question
    const duplicatedQuestion = new Question({
      ...originalQuestion.toObject(),
      _id: undefined,
      questionText: `${originalQuestion.questionText} (Copy)`,
      createdAt: undefined,
      updatedAt: undefined
    });

    await duplicatedQuestion.save();

    // Add duplicated question to bank's questions array
    questionBank.questions.push(duplicatedQuestion._id);
    await questionBank.save();

    // Update question bank counts
    await questionBank.updateQuestionCounts();

    req.flash('success', 'Question duplicated successfully');
    return res.redirect(`/admin/question-banks/banks/${bankCode}`);
  } catch (error) {
    console.error('Error duplicating question:', error);
    req.flash('error', 'Failed to duplicate question');
    return res.redirect(`/admin/question-banks/banks/${req.params.bankCode}`);
  }
};

// ==================== HELPER FUNCTIONS ====================

// Get question bank statistics
const getQuestionBankStats = async () => {
  try {
    const totalBanks = await QuestionBank.countDocuments();
    const activeBanks = await QuestionBank.countDocuments({ status: 'active' });
    const draftBanks = await QuestionBank.countDocuments({ status: 'draft' });
    const totalQuestions = await Question.countDocuments();

    return {
      totalBanks,
      activeBanks,
      draftBanks,
      totalQuestions
    };
  } catch (error) {
    console.error('Error getting question bank stats:', error);
    return {
      totalBanks: 0,
      activeBanks: 0,
      draftBanks: 0,
      totalQuestions: 0
    };
  }
};

// Get question bank filter options
const getQuestionBankFilterOptions = async () => {
  try {
    return {
      // No filter options needed since level and year are removed
    };
  } catch (error) {
    console.error('Error getting filter options:', error);
    return {};
  }
};

// Get question statistics for a specific bank
const getQuestionStatsForBank = async (bankId) => {
  try {
    const totalQuestions = await Question.countDocuments({ bank: bankId });
    const easyQuestions = await Question.countDocuments({ bank: bankId, difficulty: 'Easy' });
    const mediumQuestions = await Question.countDocuments({ bank: bankId, difficulty: 'Medium' });
    const hardQuestions = await Question.countDocuments({ bank: bankId, difficulty: 'Hard' });
    const activeQuestions = await Question.countDocuments({ bank: bankId, status: 'active' });
    const draftQuestions = await Question.countDocuments({ bank: bankId, status: 'draft' });

    return {
      totalQuestions,
      easyQuestions,
      mediumQuestions,
      hardQuestions,
      activeQuestions,
      draftQuestions
    };
  } catch (error) {
    console.error('Error getting question stats for bank:', error);
    return {
      totalQuestions: 0,
      easyQuestions: 0,
      mediumQuestions: 0,
      hardQuestions: 0,
      activeQuestions: 0,
      draftQuestions: 0
    };
  }
};

// Search questions
const searchQuestions = async (req, res) => {
  try {
    const { bankCode } = req.params;
    const { q, difficulty, tags } = req.query;

    const questionBank = await QuestionBank.findOne({ bankCode });
    if (!questionBank) {
      return res.status(404).json({ success: false, message: 'Question bank not found' });
    }

    const filter = { bank: questionBank._id };
    
    if (q) {
      filter.$or = [
        { questionText: { $regex: q, $options: 'i' } },
        { explanation: { $regex: q, $options: 'i' } }
      ];
    }
    
    if (difficulty && difficulty !== 'all') {
      filter.difficulty = difficulty;
    }
    
    if (tags) {
      filter.tags = { $in: tags.split(',') };
    }

    const questions = await Question.find(filter)
      .select('questionText difficulty tags points createdAt')
      .sort({ createdAt: -1 })
      .limit(20);

    return res.json({ success: true, questions });
  } catch (error) {
    console.error('Error searching questions:', error);
    return res.status(500).json({ success: false, message: 'Search failed' });
  }
};

// Get question statistics
const getQuestionStats = async (req, res) => {
  try {
    const { bankCode } = req.params;
    const questionBank = await QuestionBank.findOne({ bankCode });
    
    if (!questionBank) {
      return res.status(404).json({ success: false, message: 'Question bank not found' });
    }

    const stats = await getQuestionStatsForBank(questionBank._id);
    return res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting question stats:', error);
    return res.status(500).json({ success: false, message: 'Failed to get statistics' });
  }
};

// Export questions (placeholder)
const exportQuestions = async (req, res) => {
  try {
    const { bankCode } = req.params;
    const { format = 'json' } = req.query;

    const questionBank = await QuestionBank.findOne({ bankCode });
    if (!questionBank) {
      req.flash('error', 'Question bank not found');
      return res.redirect('/admin/question-banks/banks');
    }

    const questions = await Question.find({ bank: questionBank._id })
      .populate('createdBy', 'name email');

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${questionBank.bankCode}-questions.json"`);
      return res.json({ questionBank, questions });
    }

    req.flash('info', 'Export functionality will be implemented soon');
    return res.redirect(`/admin/question-banks/banks/${bankCode}`);
  } catch (error) {
    console.error('Error exporting questions:', error);
    req.flash('error', 'Failed to export questions');
    return res.redirect(`/admin/question-banks/banks/${req.params.bankCode}`);
  }
};

// Import questions (placeholder)
const importQuestions = async (req, res) => {
  try {
    const { bankCode } = req.params;
    
    req.flash('info', 'Import functionality will be implemented soon');
    return res.redirect(`/admin/question-banks/banks/${bankCode}`);
  } catch (error) {
    console.error('Error importing questions:', error);
    req.flash('error', 'Failed to import questions');
    return res.redirect(`/admin/question-banks/banks/${req.params.bankCode}`);
  }
};

// Sync questions array for all question banks (utility function)
const syncAllQuestionBanks = async (req, res) => {
  try {
    const questionBanks = await QuestionBank.find({});
    let syncedCount = 0;
    
    for (const bank of questionBanks) {
      await bank.syncQuestionsArray();
      syncedCount++;
    }
    
    req.flash('success', `Successfully synced ${syncedCount} question banks`);
    return res.redirect('/admin/question-banks/banks');
  } catch (error) {
    console.error('Error syncing question banks:', error);
    req.flash('error', 'Failed to sync question banks');
    return res.redirect('/admin/question-banks/banks');
  }
};

module.exports = {
  // Question Bank Controllers
  getQuestionBanks,
  createQuestionBank,
  getQuestionBank,
  updateQuestionBank,
  deleteQuestionBank,
  
  // Question Controllers
  getQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  deleteQuestion,
  duplicateQuestion,
  
  // Search and Filter Controllers
  searchQuestions,
  getQuestionStats,
  exportQuestions,
  importQuestions,
  
  // Utility Controllers
  syncAllQuestionBanks,
};
