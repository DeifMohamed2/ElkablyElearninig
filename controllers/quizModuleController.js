const QuizModule = require('../models/QuizModule');
const Quiz = require('../models/Quiz');
const { validationResult } = require('express-validator');
const { createLog } = require('../middlewares/adminLogger');

// Get all modules with pagination and filtering
const getAllModules = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const {
      status,
      testType,
      search,
      sortBy = 'order',
      sortOrder = 'asc',
    } = req.query;

    // Build filter object
    const filter = { isDeleted: false };
    if (status) filter.status = status;
    if (testType) filter.testType = testType;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const modules = await QuizModule.find(filter)
      .populate('createdBy', 'userName email')
      .populate('quizCount')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true });

    const total = await QuizModule.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Get statistics
    const stats = await QuizModule.getModuleStats();

    res.render('admin/quiz-modules', {
      title: 'Quiz Modules Management | ELKABLY',
      theme: req.cookies.theme || 'light',
      currentPage: 'quiz-modules',
      modules,
      pagination: {
        currentPage: page,
        totalPages,
        total,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
      },
      filters: { status, testType, search, sortBy, sortOrder },
      stats,
    });
  } catch (error) {
    console.error('Error fetching modules:', error);
    req.flash('error', 'Failed to fetch modules');
    res.redirect('/admin/dashboard');
  }
};

// Get module creation page
const getCreateModule = async (req, res) => {
  try {
    const generatedCode = await QuizModule.generateModuleCode();

    res.render('admin/create-quiz-module', {
      title: 'Create New Module | ELKABLY',
      theme: req.cookies.theme || 'light',
      currentPage: 'quiz-modules',
      generatedCode,
      messages: {
        success: req.flash('success')[0],
        error: req.flash('error')[0],
      },
    });
  } catch (error) {
    console.error('Error loading module creation page:', error);
    req.flash('error', 'Failed to load module creation page');
    res.redirect('/admin/quiz-modules');
  }
};

// Create a new module
const createModule = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array(),
      });
    }

    const {
      name,
      testType,
      order,
      status,
    } = req.body;

    // Auto-generate module code
    const code = await QuizModule.generateModuleCode(testType);

    const newModule = new QuizModule({
      name,
      code,
      testType,
      icon: 'fa-layer-group',
      color: '#dc2626',
      order: order || 0,
      status: status || 'active',
      createdBy: req.session.user?.id || null,
    });

    await newModule.save();

    // Log the action
    await createLog(req, {
      action: 'MODULE_CREATED',
      actionCategory: 'MODULE_MANAGEMENT',
      description: `Created new quiz module: ${name}`,
      targetModel: 'QuizModule',
      targetId: newModule._id.toString(),
      targetName: newModule.name,
      metadata: { moduleId: newModule._id, code: newModule.code },
    });

    res.status(201).json({
      success: true,
      message: 'Module created successfully',
      module: newModule,
    });
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create module',
      error: error.message,
    });
  }
};

// Get module edit page
const getEditModule = async (req, res) => {
  try {
    const { id } = req.params;
    
    const module = await QuizModule.findById(id)
      .populate('quizzes')
      .lean({ virtuals: true });

    if (!module) {
      req.flash('error', 'Module not found');
      return res.redirect('/admin/quiz-modules');
    }

    // Get all quizzes for this test type that could be added
    const availableQuizzes = await Quiz.find({
      testType: module.testType,
      isDeleted: false,
      $or: [
        { module: null },
        { module: module._id },
      ],
    })
      .select('title code status difficulty module moduleOrder')
      .sort({ moduleOrder: 1, createdAt: -1 })
      .lean();

    res.render('admin/edit-quiz-module', {
      title: `Edit Module: ${module.name} | ELKABLY`,
      theme: req.cookies.theme || 'light',
      currentPage: 'quiz-modules',
      module,
      availableQuizzes,
      messages: {
        success: req.flash('success')[0],
        error: req.flash('error')[0],
      },
    });
  } catch (error) {
    console.error('Error loading module edit page:', error);
    req.flash('error', 'Failed to load module edit page');
    res.redirect('/admin/quiz-modules');
  }
};

// Update module
const updateModule = async (req, res) => {
  try {
    const { id } = req.params;
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array(),
      });
    }

    const {
      name,
      testType,
      order,
      status,
    } = req.body;

    const module = await QuizModule.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found',
      });
    }

    // Update fields (code is auto-generated and not editable)
    if (name) module.name = name;
    if (testType) module.testType = testType;
    if (order !== undefined) module.order = order;
    if (status) module.status = status;
    module.lastModifiedBy = req.session.user?.id || null;

    await module.save();

    // Log the action
    await createLog(req, {
      action: 'MODULE_UPDATED',
      actionCategory: 'MODULE_MANAGEMENT',
      description: `Updated quiz module: ${module.name}`,
      targetModel: 'QuizModule',
      targetId: module._id.toString(),
      targetName: module.name,
      metadata: { moduleId: module._id, code: module.code },
    });

    res.json({
      success: true,
      message: 'Module updated successfully',
      module,
    });
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update module',
      error: error.message,
    });
  }
};

// Delete module (soft delete)
const deleteModule = async (req, res) => {
  try {
    const { id } = req.params;
    
    const module = await QuizModule.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found',
      });
    }

    // Remove module reference from all quizzes
    await Quiz.updateMany(
      { module: id },
      { $set: { module: null, moduleOrder: 0 } }
    );

    // Soft delete the module
    await module.softDelete(req.session.user?.id || null, req.body?.reason || 'Deleted by admin');

    // Log the action
    await createLog(req, {
      action: 'MODULE_DELETED',
      actionCategory: 'MODULE_MANAGEMENT',
      description: `Deleted quiz module: ${module.name}`,
      targetModel: 'QuizModule',
      targetId: module._id.toString(),
      targetName: module.name,
      metadata: { moduleId: module._id, code: module.code },
    });

    res.json({
      success: true,
      message: 'Module deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete module',
      error: error.message,
    });
  }
};

// Restore module
const restoreModule = async (req, res) => {
  try {
    const { id } = req.params;
    
    const module = await QuizModule.findOne({ _id: id, isDeleted: true });
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found in trash',
      });
    }

    await module.restore();

    // Log the action
    await createLog(req, {
      action: 'MODULE_RESTORED',
      actionCategory: 'MODULE_MANAGEMENT',
      description: `Restored quiz module: ${module.name}`,
      targetModel: 'QuizModule',
      targetId: module._id.toString(),
      targetName: module.name,
      metadata: { moduleId: module._id, code: module.code },
    });

    res.json({
      success: true,
      message: 'Module restored successfully',
      module,
    });
  } catch (error) {
    console.error('Error restoring module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore module',
      error: error.message,
    });
  }
};

// Get trash modules
const getTrashModules = async (req, res) => {
  try {
    const modules = await QuizModule.find({ isDeleted: true })
      .populate('deletedBy', 'userName email')
      .sort({ deletedAt: -1 })
      .lean();

    res.json({
      success: true,
      modules,
    });
  } catch (error) {
    console.error('Error fetching trash modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trash modules',
    });
  }
};

// Add quizzes to module
const addQuizzesToModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { quizIds } = req.body;

    if (!quizIds || !Array.isArray(quizIds) || quizIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one quiz',
      });
    }

    const module = await QuizModule.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found',
      });
    }

    // Get current max order in module
    const maxOrderQuiz = await Quiz.findOne({ module: id })
      .sort({ moduleOrder: -1 })
      .select('moduleOrder');
    let currentOrder = maxOrderQuiz ? maxOrderQuiz.moduleOrder + 1 : 1;

    // Update each quiz (only if test type matches)
    for (const quizId of quizIds) {
      const quiz = await Quiz.findById(quizId);
      if (quiz && quiz.testType === module.testType) {
        await Quiz.findByIdAndUpdate(quizId, {
          module: id,
          moduleOrder: currentOrder++,
          lastModifiedBy: req.session.user?.id || null,
        });
      }
    }

    // Log the action
    await createLog(req, {
      action: 'QUIZZES_ADDED_TO_MODULE',
      actionCategory: 'MODULE_MANAGEMENT',
      description: `Added ${quizIds.length} quizzes to module: ${module.name}`,
      targetModel: 'QuizModule',
      targetId: module._id.toString(),
      targetName: module.name,
      metadata: { moduleId: module._id, quizIds },
    });

    res.json({
      success: true,
      message: `${quizIds.length} quiz(es) added to module successfully`,
    });
  } catch (error) {
    console.error('Error adding quizzes to module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add quizzes to module',
      error: error.message,
    });
  }
};

// Remove quiz from module
const removeQuizFromModule = async (req, res) => {
  try {
    const { id, quizId } = req.params;

    const module = await QuizModule.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found',
      });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    // Remove module reference
    quiz.module = null;
    quiz.moduleOrder = null;
    quiz.lastModifiedBy = req.session.user?.id || null;
    await quiz.save();

    // Log the action
    await createLog(req, {
      action: 'QUIZ_REMOVED_FROM_MODULE',
      actionCategory: 'MODULE_MANAGEMENT',
      description: `Removed quiz "${quiz.title}" from module: ${module.name}`,
      targetModel: 'QuizModule',
      targetId: module._id.toString(),
      targetName: module.name,
      metadata: { moduleId: module._id, quizId },
    });

    res.json({
      success: true,
      message: 'Quiz removed from module successfully',
    });
  } catch (error) {
    console.error('Error removing quiz from module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove quiz from module',
      error: error.message,
    });
  }
};

// Reorder quizzes in module
const reorderModuleQuizzes = async (req, res) => {
  try {
    const { id } = req.params;
    const { quizOrder } = req.body; // Array of { quizId, order }

    if (!quizOrder || !Array.isArray(quizOrder)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quiz order data',
      });
    }

    const module = await QuizModule.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found',
      });
    }

    // Update each quiz's order
    for (const item of quizOrder) {
      await Quiz.findByIdAndUpdate(item.quizId, {
        moduleOrder: item.order,
        lastModifiedBy: req.session.user?.id || null,
      });
    }

    res.json({
      success: true,
      message: 'Quiz order updated successfully',
    });
  } catch (error) {
    console.error('Error reordering quizzes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder quizzes',
      error: error.message,
    });
  }
};

// Get module statistics API
const getModuleStats = async (req, res) => {
  try {
    const stats = await QuizModule.getModuleStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching module stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch module statistics',
    });
  }
};

// Get all modules for dropdown/selection (API)
const getModulesForSelect = async (req, res) => {
  try {
    const { testType } = req.query;
    
    const filter = { isDeleted: false, status: 'active' };
    if (testType) filter.testType = testType;

    const modules = await QuizModule.find(filter)
      .select('name code testType icon color order')
      .sort({ order: 1, name: 1 })
      .lean();

    res.json({
      success: true,
      modules,
    });
  } catch (error) {
    console.error('Error fetching modules for select:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch modules',
    });
  }
};

// Get quizzes grouped by modules for a test type (for student/landing pages)
const getQuizzesByModules = async (req, res) => {
  try {
    const { testType } = req.params;

    // Get all active modules for this test type
    const modules = await QuizModule.find({
      testType,
      status: 'active',
      isDeleted: false,
    })
      .sort({ order: 1, name: 1 })
      .lean();

    // Get all active quizzes for this test type
    const quizzes = await Quiz.find({
      testType,
      status: 'active',
      isDeleted: false,
    })
      .populate('module', 'name code icon color')
      .select('title code description thumbnail difficulty duration passingScore maxAttempts selectedQuestions module moduleOrder createdAt')
      .sort({ moduleOrder: 1, createdAt: -1 })
      .lean({ virtuals: true });

    // Group quizzes by module
    const groupedByModule = {};
    const unassignedQuizzes = [];

    modules.forEach(mod => {
      groupedByModule[mod._id.toString()] = {
        module: mod,
        quizzes: [],
      };
    });

    quizzes.forEach(quiz => {
      if (quiz.module) {
        const moduleId = quiz.module._id.toString();
        if (groupedByModule[moduleId]) {
          groupedByModule[moduleId].quizzes.push(quiz);
        } else {
          unassignedQuizzes.push(quiz);
        }
      } else {
        unassignedQuizzes.push(quiz);
      }
    });

    // Convert to array and add unassigned quizzes
    const result = Object.values(groupedByModule).filter(g => g.quizzes.length > 0);
    
    if (unassignedQuizzes.length > 0) {
      result.push({
        module: {
          _id: 'unassigned',
          name: 'Other Quizzes',
          code: 'OTHER',
          icon: 'fa-question-circle',
          color: '#6b7280',
        },
        quizzes: unassignedQuizzes,
      });
    }

    res.json({
      success: true,
      testType,
      totalQuizzes: quizzes.length,
      totalModules: modules.length,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching quizzes by modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quizzes by modules',
      error: error.message,
    });
  }
};

// Reorder modules (drag and drop)
const reorderModules = async (req, res) => {
  try {
    const { moduleIds } = req.body;

    if (!moduleIds || !Array.isArray(moduleIds)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid module IDs',
      });
    }

    // Update order for each module
    const updatePromises = moduleIds.map((id, index) => 
      QuizModule.findByIdAndUpdate(id, { order: index })
    );

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'Module order updated successfully',
    });
  } catch (error) {
    console.error('Error reordering modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder modules',
      error: error.message,
    });
  }
};

// Permanently delete module
const permanentDeleteModule = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the module in trash
    const module = await QuizModule.findOne({ _id: id, isDeleted: true });
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found in trash',
      });
    }

    const moduleName = module.name;
    const moduleCode = module.code;

    // Permanently delete the module using deleteOne for reliability
    const deleteResult = await QuizModule.deleteOne({ _id: id });
    
    if (deleteResult.deletedCount === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete module from database',
      });
    }

    // Log the action (wrapped in try-catch to not fail the delete)
    try {
      await createLog(req, {
        action: 'MODULE_PERMANENTLY_DELETED',
        actionCategory: 'MODULE_MANAGEMENT',
        description: `Permanently deleted quiz module: ${moduleName}`,
        targetModel: 'QuizModule',
        metadata: { code: moduleCode },
      });
    } catch (logError) {
      console.error('Error logging permanent delete:', logError);
      // Don't fail the request for logging errors
    }

    return res.json({
      success: true,
      message: 'Module permanently deleted successfully',
    });
  } catch (error) {
    console.error('Error permanently deleting module:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to permanently delete module',
      error: error.message,
    });
  }
};

module.exports = {
  getAllModules,
  getCreateModule,
  createModule,
  getEditModule,
  updateModule,
  deleteModule,
  restoreModule,
  getTrashModules,
  permanentDeleteModule,
  addQuizzesToModule,
  removeQuizFromModule,
  reorderModuleQuizzes,
  reorderModules,
  getModuleStats,
  getModulesForSelect,
  getQuizzesByModules,
};
