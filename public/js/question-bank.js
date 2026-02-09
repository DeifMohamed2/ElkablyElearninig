/**
 * Question Bank Management JavaScript
 * Handles interactive features for question bank and question management
 */

class QuestionBankManager {
    constructor() {
        this.optionCount = 2;
        this.isLoading = false; // Prevent double-clicks
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeComponents();
    }

    setupEventListeners() {
        // Form validation
        document.addEventListener('DOMContentLoaded', () => {
            this.setupFormValidation();
            this.setupSearchFilters();
            this.setupModalHandlers();
        });

        // Auto-save functionality
        this.setupAutoSave();
    }

    initializeComponents() {
        // Initialize tooltips
        this.initializeTooltips();
        
        // Initialize animations
        this.initializeAnimations();
        
        // Setup drag and drop for question reordering
        this.setupDragAndDrop();
    }

    setupFormValidation() {
        const forms = document.querySelectorAll('.admin-form');
        forms.forEach(form => {
            form.addEventListener('submit', (e) => {
                if (!this.validateForm(form)) {
                    e.preventDefault();
                }
            });
        });
    }

    validateForm(form) {
        let isValid = true;
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                this.showFieldError(field, 'This field is required');
                isValid = false;
            } else {
                this.clearFieldError(field);
            }
        });

        // Special validation for question forms
        if (form.id === 'createQuestionForm') {
            isValid = this.validateQuestionForm(form) && isValid;
        }

        return isValid;
    }

    validateQuestionForm(form) {
        let isValid = true;
        
        // Check if at least 2 options are provided
        const options = form.querySelectorAll('input[name="optionText"]');
        if (options.length < 2) {
            this.showNotification('Please add at least 2 answer options', 'error');
            isValid = false;
        }

        // Check if correct answer is selected
        const correctAnswer = form.querySelector('input[name="correctAnswer"]:checked');
        if (!correctAnswer) {
            this.showNotification('Please select the correct answer', 'error');
            isValid = false;
        }

        // Validate option text
        options.forEach((option, index) => {
            if (!option.value.trim()) {
                this.showFieldError(option, 'Option text cannot be empty');
                isValid = false;
            }
        });

        return isValid;
    }

    showFieldError(field, message) {
        this.clearFieldError(field);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'admin-field-error';
        errorDiv.textContent = message;
        
        field.classList.add('is-invalid');
        field.parentNode.appendChild(errorDiv);
    }

    clearFieldError(field) {
        field.classList.remove('is-invalid');
        const existingError = field.parentNode.querySelector('.admin-field-error');
        if (existingError) {
            existingError.remove();
        }
    }

    setupSearchFilters() {
        const searchInputs = document.querySelectorAll('.admin-search-input');
        searchInputs.forEach(input => {
            let timeout;
            input.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.performSearch(e.target.value, e.target.closest('form'));
                }, 500);
            });
        });

        const filterSelects = document.querySelectorAll('.admin-filter-select');
        filterSelects.forEach(select => {
            select.addEventListener('change', (e) => {
                this.applyFilters(e.target.closest('form'));
            });
        });
    }

    performSearch(query, form) {
        if (query.length >= 2 || query.length === 0) {
            form.submit();
        }
    }

    applyFilters(form) {
        form.submit();
    }

    setupModalHandlers() {
        // Question creation modal
        const createModal = document.getElementById('createQuestionModal');
        if (createModal) {
            createModal.addEventListener('show.bs.modal', () => {
                this.resetQuestionForm();
            });
        }

        // Bank creation modal
        const bankModal = document.getElementById('createQuestionBankModal');
        if (bankModal) {
            bankModal.addEventListener('show.bs.modal', () => {
                this.resetBankForm();
            });
        }
    }

    resetQuestionForm() {
        const form = document.getElementById('createQuestionForm');
        if (form) {
            form.reset();
            this.resetOptions();
        }
    }

    resetBankForm() {
        const form = document.querySelector('#createQuestionBankModal form');
        if (form) {
            form.reset();
        }
    }

    resetOptions() {
        const container = document.getElementById('optionsContainer');
        if (container) {
            container.innerHTML = `
                <div class="option-item mb-3">
                    <div class="d-flex align-items-center">
                        <input type="radio" name="correctAnswer" value="0" class="form-check-input me-2">
                        <input type="text" class="form-control admin-form-control" name="optionText" 
                               placeholder="Option A" required>
                        <button type="button" class="btn btn-outline-danger btn-sm ms-2" onclick="questionBankManager.removeOption(this)">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="option-item mb-3">
                    <div class="d-flex align-items-center">
                        <input type="radio" name="correctAnswer" value="1" class="form-check-input me-2">
                        <input type="text" class="form-control admin-form-control" name="optionText" 
                               placeholder="Option B" required>
                        <button type="button" class="btn btn-outline-danger btn-sm ms-2" onclick="questionBankManager.removeOption(this)">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            this.optionCount = 2;
        }
    }

    addOption() {
        const container = document.getElementById('optionsContainer');
        if (container) {
            const optionItem = document.createElement('div');
            optionItem.className = 'option-item mb-3';
            optionItem.innerHTML = `
                <div class="d-flex align-items-center">
                    <input type="radio" name="correctAnswer" value="${this.optionCount}" class="form-check-input me-2">
                    <input type="text" class="form-control admin-form-control" name="optionText" 
                           placeholder="Option ${String.fromCharCode(65 + this.optionCount)}" required>
                    <button type="button" class="btn btn-outline-danger btn-sm ms-2" onclick="questionBankManager.removeOption(this)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(optionItem);
            this.optionCount++;
            this.animateElement(optionItem);
        }
    }

    removeOption(button) {
        const optionItem = button.closest('.option-item');
        const container = document.getElementById('optionsContainer');
        
        if (container.children.length > 2) {
            this.animateElement(optionItem, 'out', () => {
                optionItem.remove();
                this.updateOptionLabels();
            });
        } else {
            this.showNotification('At least 2 options are required', 'warning');
        }
    }

    updateOptionLabels() {
        const options = document.querySelectorAll('#optionsContainer input[name="optionText"]');
        options.forEach((input, index) => {
            input.placeholder = `Option ${String.fromCharCode(65 + index)}`;
            const radio = input.parentNode.querySelector('input[name="correctAnswer"]');
            if (radio) {
                radio.value = index;
            }
        });
    }

    setupAutoSave() {
        const autoSaveForms = document.querySelectorAll('[data-autosave]');
        autoSaveForms.forEach(form => {
            const inputs = form.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                let timeout;
                input.addEventListener('input', () => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        this.autoSave(form);
                    }, 2000);
                });
            });
        });
    }

    autoSave(form) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Show auto-save indicator
        this.showAutoSaveIndicator();
        
        // Simulate auto-save (replace with actual API call)
        setTimeout(() => {
            this.hideAutoSaveIndicator();
            this.showNotification('Changes saved automatically', 'success', 2000);
        }, 1000);
    }

    showAutoSaveIndicator() {
        let indicator = document.getElementById('autoSaveIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'autoSaveIndicator';
            indicator.className = 'admin-auto-save-indicator';
            indicator.innerHTML = '<i class="fas fa-save me-2"></i>Saving...';
            document.body.appendChild(indicator);
        }
        indicator.style.display = 'block';
    }

    hideAutoSaveIndicator() {
        const indicator = document.getElementById('autoSaveIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    setupDragAndDrop() {
        const questionList = document.querySelector('.admin-questions-list');
        if (questionList) {
            this.makeSortable(questionList);
        }
    }

    makeSortable(container) {
        let draggedElement = null;

        container.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('question-item')) {
                draggedElement = e.target;
                e.target.style.opacity = '0.5';
            }
        });

        container.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('question-item')) {
                e.target.style.opacity = '1';
                draggedElement = null;
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedElement && e.target.classList.contains('question-item')) {
                const rect = e.target.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                
                if (e.clientY < midpoint) {
                    container.insertBefore(draggedElement, e.target);
                } else {
                    container.insertBefore(draggedElement, e.target.nextSibling);
                }
                
                this.updateQuestionOrder();
            }
        });
    }

    updateQuestionOrder() {
        const questions = document.querySelectorAll('.question-item');
        const order = Array.from(questions).map((item, index) => ({
            id: item.dataset.questionId,
            order: index + 1
        }));

        // Send order update to server
        fetch('/admin/question-banks/reorder', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ order })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showNotification('Question order updated', 'success');
            }
        })
        .catch(error => {
            console.error('Error updating question order:', error);
            this.showNotification('Failed to update question order', 'error');
        });
    }

    initializeTooltips() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }

    initializeAnimations() {
        // Intersection Observer for scroll animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, observerOptions);

        document.querySelectorAll('.admin-slide-in').forEach(el => {
            observer.observe(el);
        });
    }

    animateElement(element, direction = 'in', callback = null) {
        if (direction === 'in') {
            element.style.opacity = '0';
            element.style.transform = 'translateY(20px)';
            element.style.transition = 'all 0.3s ease';
            
            requestAnimationFrame(() => {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            });
        } else {
            element.style.transition = 'all 0.3s ease';
            element.style.opacity = '0';
            element.style.transform = 'translateY(-20px)';
            
            setTimeout(() => {
                if (callback) callback();
            }, 300);
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `admin-notification admin-notification-${type}`;
        notification.innerHTML = `
            <div class="admin-notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)} me-2"></i>
                <span>${message}</span>
                <button class="admin-notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        document.body.appendChild(notification);

        // Auto remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    showLoadingIndicator() {
        // Create or show a global loading overlay for immediate feedback
        let loader = document.getElementById('globalLoadingOverlay');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'globalLoadingOverlay';
            loader.className = 'loading-overlay';
            loader.innerHTML = `
                <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
                    <span class="visually-hidden">Loading...</span>
                </div>
            `;
            loader.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                backdrop-filter: blur(2px);
            `;
            document.body.appendChild(loader);
        } else {
            loader.style.display = 'flex';
        }
        // Add class to body to prevent scrolling
        document.body.style.overflow = 'hidden';
    }

    hideLoadingIndicator() {
        const loader = document.getElementById('globalLoadingOverlay');
        if (loader) {
            loader.style.display = 'none';
        }
        document.body.style.overflow = '';
    }

    // Utility methods for global functions
    deleteQuestionBank(bankCode, bankName) {
        if (confirm(`Are you sure you want to delete the question bank "${bankName}"? This action cannot be undone and will delete all questions in this bank.`)) {
            this.submitDeleteForm(`/admin/question-banks/banks/${bankCode}`);
        }
    }

    deleteQuestion(questionId, questionText) {
        if (confirm(`Are you sure you want to delete this question?\n\n"${questionText}"\n\nThis action cannot be undone.`)) {
            this.submitDeleteForm(`/admin/question-banks/banks/${this.getCurrentBankCode()}/questions/${questionId}`);
        }
    }

    duplicateQuestion(questionId) {
        if (confirm('Are you sure you want to duplicate this question?')) {
            this.submitPostForm(`/admin/question-banks/banks/${this.getCurrentBankCode()}/questions/${questionId}/duplicate`);
        }
    }

    editQuestion(questionId) {
        // Prevent double-clicks
        if (this.isLoading) {
            return;
        }
        
        // Check if the modal-based editQuestion exists (from EJS), use it
        if (typeof window.editQuestion === 'function' && window.editQuestion !== this.editQuestion) {
            window.editQuestion(questionId);
            return;
        }
        
        // Set loading state
        this.isLoading = true;
        
        // Fallback: show loading immediately and open modal with AJAX
        this.showLoadingIndicator();
        
        const modal = document.getElementById('editQuestionModal');
        if (!modal) {
            // If no modal exists, fall back to page navigation
            window.location.href = `/admin/question-banks/banks/${this.getCurrentBankCode()}/questions/${questionId}/edit`;
            return;
        }
        
        // Clear and show modal with loader
        const loader = document.getElementById('editQuestionLoader');
        const formContent = document.getElementById('editQuestionFormContent');
        if (loader) loader.style.display = 'block';
        if (formContent) formContent.style.display = 'none';
        
        // Disable buttons
        const footerButtons = document.querySelectorAll('#editQuestionModal .modal-footer button');
        footerButtons.forEach(btn => btn.disabled = true);
        
        // Show modal
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
        
        // Fetch question data with optimized headers
        fetch(`/admin/question-banks/banks/${this.getCurrentBankCode()}/questions/${questionId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            cache: 'no-store'
        })
        .then(response => {
            this.hideLoadingIndicator();
            this.isLoading = false;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data.success && data.question && typeof window.populateEditFormFields === 'function') {
                if (loader) loader.style.display = 'none';
                if (formContent) formContent.style.display = 'block';
                footerButtons.forEach(btn => btn.disabled = false);
                window.populateEditFormFields(data.question, questionId);
            } else {
                throw new Error('Failed to load question data');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            this.hideLoadingIndicator();
            this.isLoading = false;
            if (loader) loader.style.display = 'none';
            this.showNotification('Failed to load question: ' + error.message, 'error');
            bootstrapModal.hide();
        });
    }

    exportQuestions() {
        window.location.href = `/admin/question-banks/banks/${this.getCurrentBankCode()}/export`;
    }

    importQuestions() {
        this.showNotification('Import functionality will be implemented soon!', 'info');
    }

    getCurrentBankCode() {
        const path = window.location.pathname;
        const match = path.match(/\/banks\/([^\/]+)/);
        return match ? match[1] : '';
    }

    submitDeleteForm(url) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        
        const methodInput = document.createElement('input');
        methodInput.type = 'hidden';
        methodInput.name = '_method';
        methodInput.value = 'DELETE';
        form.appendChild(methodInput);
        
        document.body.appendChild(form);
        form.submit();
    }

    submitPostForm(url) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        
        document.body.appendChild(form);
        form.submit();
    }
}

// Initialize the question bank manager
const questionBankManager = new QuestionBankManager();

// Global functions for inline event handlers
function addOption() {
    questionBankManager.addOption();
}

function removeOption(button) {
    questionBankManager.removeOption(button);
}

function deleteQuestionBank(bankCode, bankName) {
    questionBankManager.deleteQuestionBank(bankCode, bankName);
}

function deleteQuestion(questionId, questionText) {
    questionBankManager.deleteQuestion(questionId, questionText);
}

function duplicateQuestion(questionId) {
    questionBankManager.duplicateQuestion(questionId);
}

function editQuestion(questionId) {
    questionBankManager.editQuestion(questionId);
}

function exportQuestions() {
    questionBankManager.exportQuestions();
}

function importQuestions() {
    questionBankManager.importQuestions();
}
