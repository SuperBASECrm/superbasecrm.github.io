// Paste your Supabase project information below.
// Sign in to supabase.com, open your project, and copy the API URL + anon key.
const SUPABASE_URL = 'https://seuwchtebapvuylkgcoc.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNldXdjaHRlYmFwdnV5bGtnY29jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNTg0NTgsImV4cCI6MjA3ODkzNDQ1OH0.uQTHBQgDAqR8NUPt358XdYj53gvY7Qw139bl4Kj9DyE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const COMPANY_PAGE_SIZE = 50;

const state = {
  companies: [],
  contacts: [],
  tasks: [],
  opportunities: [],
  pipelines: [], // [{id,name}]
  pipelineStages: {}, // { pipelineId: [{id,name,position}] }
  sequences: [], // [{id,name}]
  sequenceSteps: {}, // design-time steps { sequenceId: [{id,name,step_type,template_id,position}] }
  sequenceLatestVersions: {}, // { sequenceId: sequence_version row }
  sequenceVersionSteps: {}, // { sequenceVersionId: [{id,...}] }
  templates: [],
  taskFilter: '',
  taskFilterStart: null,
  taskFilterEnd: null,
  taskFilterCompanyId: '',
  taskFilterSequenceId: '',
  taskFilterType: '',
  taskFilterOpportunityOnly: false,
  selectedContactId: '',
  opportunitiesLoaded: false,
  selectedPipelineId: '',
  selectedSequenceId: '',
  isEditingSequence: false,
  editingSequenceId: null,
  sequenceEditingSteps: [],
  sequenceEditingDelays: [],
  isEditingPipeline: false,
  editingStages: [],
  editingDeletedStageIds: [],
  editingPipelineName: '',
  selectedTemplateIndex: null,
  selectedTemplateId: null,
  lastTemplateInputId: '',
  currentOpportunityDetailId: null,
  isEditingCompanyInfo: false,
  isEditingContactInfo: false,
  sequenceWeekdayPrefs: {}, // { `${sequenceId}:${contactId}`: boolean }
  companyPage: 1,
  companySearchQuery: '',
  templateSearchQuery: '',
  opportunityFormPipelineId: '',
  opportunityFormCompanyLocked: false,
};

const LOGIN_USERNAME = 'TerryOakley';
const LOGIN_PASSWORD = 'CintasPassword';
const SESSION_KEY = 'crmSession';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
let appInitialized = false;

function readSessionValid() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return typeof data.expiresAt === 'number' && data.expiresAt > Date.now();
  } catch (err) {
    console.warn('Unable to read session data', err);
    return false;
  }
}

function startSession() {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ expiresAt }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function toggleAuthUI(isAuthed) {
  const overlay = document.getElementById('loginOverlay');
  const shell = document.getElementById('appShell');
  if (overlay) overlay.classList.toggle('hidden', isAuthed);
  if (shell) shell.classList.toggle('hidden', !isAuthed);
}

function bootstrapApp() {
  if (appInitialized) return;
  appInitialized = true;
  setupNavigation();
  wireFormHandlers();
  populateOpportunityStageSelect();
  initializeData();
  restoreLastSection();
}


document.addEventListener('DOMContentLoaded', () => {
  if (SUPABASE_URL.includes('YOUR-PROJECT')) {
    console.warn('Update SUPABASE_URL and SUPABASE_ANON_KEY with your project credentials.');
  }

  const hasSession = readSessionValid();
  toggleAuthUI(hasSession);
  if (hasSession) {
    bootstrapApp();
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const usernameInput = document.getElementById('loginUser');
      const passwordInput = document.getElementById('loginPass');
      const errorEl = document.getElementById('loginError');

      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (username === LOGIN_USERNAME && password === LOGIN_PASSWORD) {
        startSession();
        toggleAuthUI(true);
        bootstrapApp();
        if (errorEl) {
          errorEl.classList.add('hidden');
          errorEl.textContent = '';
        }
      } else {
        if (errorEl) {
          errorEl.textContent = 'Invalid credentials';
          errorEl.classList.remove('hidden');
        }
        clearSession();
      }
    });
  }
});

async function initializeData() {
  await loadPipelinesAndStages();
  await loadCompanies();
  await loadContacts();
  await loadOpportunities();
  await loadTemplates();
  await loadSequencesAndSteps();
}

function setupNavigation() {
  const buttons = document.querySelectorAll('.tab-button');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });
}

function buildCompanyPageList(totalPages, currentPage) {
  const pages = [];
  if (totalPages <= 10) {
    for (let i = 1; i <= totalPages; i += 1) pages.push(i);
  } else {
    pages.push(1);
    const start = Math.max(2, currentPage - 3);
    const end = Math.min(totalPages - 1, currentPage + 3);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
  }
  return pages;
}

function renderCompanyPagination(totalPages) {
  const container = document.getElementById('companyPagination');
  if (!container) return;
  const safeTotal = totalPages && totalPages > 0 ? totalPages : 1;
  const currentPage = Math.min(Math.max(1, state.companyPage || 1), safeTotal);
  const pages = buildCompanyPageList(safeTotal, currentPage);
  const html = [
    `<button type="button" data-action="prev" ${currentPage === 1 ? 'disabled' : ''}>&laquo;</button>`,
    ...pages.map((p) =>
      p === '...'
        ? `<span class="dots">...</span>`
        : `<button type="button" data-page="${p}" class="${p === currentPage ? 'active' : ''}">${p}</button>`
    ),
    `<button type="button" data-action="next" ${currentPage === safeTotal ? 'disabled' : ''}>&raquo;</button>`,
  ].join('');
  container.innerHTML = html;

  container.querySelectorAll('button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = Number(btn.dataset.page);
      if (!Number.isNaN(page)) {
        state.companyPage = page;
        renderCompanyList();
      }
    });
  });
  container.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const total = Math.max(1, Math.ceil(state.companies.length / COMPANY_PAGE_SIZE));
      if (action === 'prev') {
        state.companyPage = Math.max(1, currentPage - 1);
      } else if (action === 'next') {
        state.companyPage = Math.min(total, currentPage + 1);
      }
      renderCompanyList();
    });
  });
}

function switchSection(target) {
  if (!target) return;
  try {
    localStorage.setItem('lastSection', target);
  } catch (e) {
    // ignore persistence errors (private mode, etc.)
  }
  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === target);
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    const isTarget = panel.dataset.section === target;
    panel.classList.toggle('active', isTarget);
    panel.classList.toggle('hidden', !isTarget);
  });

  if (target === 'pipeline') {
    if (state.opportunitiesLoaded) {
      renderPipelineBoard();
    } else {
      loadOpportunities();
    }
  } else if (target === 'sequences') {
    if (state.sequences.length === 0) {
      loadSequencesAndSteps();
    } else {
      renderSequenceBoard();
    }
  } else if (target === 'templates') {
    if (state.templates.length === 0) {
      loadTemplates();
    } else {
      renderTemplateList();
    }
  }
}

function restoreLastSection() {
  let last = 'companies';
  try {
    const stored = localStorage.getItem('lastSection');
    if (stored) last = stored;
  } catch (e) {
    last = 'companies';
  }
  switchSection(last);
}

function wireFormHandlers() {
  document.getElementById('companyForm').addEventListener('submit', handleCompanySubmit);
  document.getElementById('contactForm').addEventListener('submit', handleContactSubmit);
  document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);
  document.getElementById('opportunityForm').addEventListener('submit', handleOpportunitySubmit);
  document.getElementById('templateForm').addEventListener('submit', handleTemplateSubmit);
  document.getElementById('showTemplateFormBtn').addEventListener('click', () => {
    state.selectedTemplateIndex = null;
    toggleTemplateModal(true);
  });
  const templateSearchInput = document.getElementById('templateSearchInput');
  if (templateSearchInput) {
    templateSearchInput.addEventListener('input', () => {
      state.templateSearchQuery = (templateSearchInput.value || '').trim();
      renderTemplateList();
    });
  }
  const closeTemplateModalX = document.getElementById('closeTemplateModalX');
  if (closeTemplateModalX) {
    closeTemplateModalX.addEventListener('click', () => toggleTemplateModal(false));
  }
  document.getElementById('deleteTemplateBtn').addEventListener('click', () => toggleTemplateDeleteModal(true));
  document
    .getElementById('confirmTemplateDeleteBtn')
    .addEventListener('click', deleteTemplate);
  document
    .getElementById('cancelTemplateDeleteBtn')
    .addEventListener('click', () => toggleTemplateDeleteModal(false));
  const templateContactInput = document.getElementById('templateContactSelect');
  if (templateContactInput) {
    templateContactInput.addEventListener('input', () => renderContactSuggestions(templateContactInput));
    templateContactInput.addEventListener('focus', () => renderContactSuggestions(templateContactInput));
    templateContactInput.addEventListener('blur', () => {
      setTimeout(() => hideContactSuggestionBox(), 150);
    });
  }
  document.querySelectorAll('.placeholder-btn').forEach((btn) => {
    btn.addEventListener('click', () => insertPlaceholder(btn.dataset.placeholder));
  });
  ['templateSubject', 'templateBody'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('focus', () => {
        state.lastTemplateInputId = id;
      });
    }
  });
  document.getElementById('templateContactSelect').addEventListener('change', handleTemplatePreviewContact);
  const closeTemplatePreviewX = document.getElementById('closeTemplatePreviewX');
  if (closeTemplatePreviewX) {
    closeTemplatePreviewX.addEventListener('click', () => toggleTemplatePreviewModal(false));
  }
  const templatePreviewModal = document.getElementById('templatePreviewModal');
  if (templatePreviewModal) {
    templatePreviewModal.addEventListener('click', (event) => {
      if (event.target === templatePreviewModal) toggleTemplatePreviewModal(false);
    });
  }
  const copySubjectBtn = document.getElementById('copySubjectBtn');
  const copyBodyBtn = document.getElementById('copyBodyBtn');
  if (copySubjectBtn) copySubjectBtn.addEventListener('click', copyTemplateSubject);
  if (copyBodyBtn) copyBodyBtn.addEventListener('click', copyTemplateBody);
  const copyTemplateContactEmailBtn = document.getElementById('copyTemplateContactEmailBtn');
  if (copyTemplateContactEmailBtn) {
    copyTemplateContactEmailBtn.addEventListener('click', copyTemplateContactEmail);
  }
  document.getElementById('addCompanyBtn').addEventListener('click', () => toggleCompanyModal(true));
  const closeCompanyModalX = document.getElementById('closeCompanyModalX');
  if (closeCompanyModalX) {
    closeCompanyModalX.addEventListener('click', () => toggleCompanyModal(false));
  }
  const cancelCompanyBtn = document.getElementById('cancelCompanyBtn');
  if (cancelCompanyBtn) {
    cancelCompanyBtn.addEventListener('click', () => toggleCompanyModal(false));
  }
  const companySearchBtn = document.getElementById('companySearchBtn');
  const companySearchInput = document.getElementById('companySearchInput');
  if (companySearchBtn && companySearchInput) {
    companySearchBtn.addEventListener('click', () => {
      state.companySearchQuery = companySearchInput.value || '';
      state.companyPage = 1;
      renderCompanyList();
    });
    companySearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        state.companySearchQuery = companySearchInput.value || '';
        state.companyPage = 1;
        renderCompanyList();
      }
    });
  }
  document.getElementById('closeCompanyDetailX').addEventListener('click', closeCompanyDetail);
  // Delete button now only appears inside edit view; listener is attached in startCompanyInfoEdit.
  const closeContactDetailBtn = document.getElementById('closeContactDetailBtn');
  if (closeContactDetailBtn) {
    closeContactDetailBtn.addEventListener('click', closeContactDetail);
  }
  const contactDetailModal = document.getElementById('contactDetailModal');
  if (contactDetailModal) {
    contactDetailModal.addEventListener('click', handleContactModalBackdrop);
  }
  const contactEnrollBtn = document.getElementById('contactEnrollBtn');
  if (contactEnrollBtn) {
    contactEnrollBtn.addEventListener('click', openContactSequenceEnrollModal);
  }
  const closeContactSequenceEnrollBtn = document.getElementById('closeContactSequenceEnrollBtn');
  if (closeContactSequenceEnrollBtn) {
    closeContactSequenceEnrollBtn.addEventListener('click', closeContactSequenceEnrollModal);
  }
  const contactSequenceEnrollModal = document.getElementById('contactSequenceEnrollModal');
  if (contactSequenceEnrollModal) {
    contactSequenceEnrollModal.addEventListener('click', handleContactSequenceEnrollBackdrop);
  }
  const contactSequenceEnrollSubmit = document.getElementById('contactSequenceEnrollSubmit');
  if (contactSequenceEnrollSubmit) {
    contactSequenceEnrollSubmit.addEventListener('click', handleContactSequenceEnroll);
  }
  const contactSequenceInput = document.getElementById('contactSequenceEnrollInput');
  if (contactSequenceInput) {
    contactSequenceInput.addEventListener('input', () => {
      contactSequenceInput.dataset.sequenceId = '';
      const hidden = document.getElementById('contactSequenceEnrollSequenceId');
      if (hidden) hidden.value = '';
      renderSequenceSuggestions(contactSequenceInput);
    });
    contactSequenceInput.addEventListener('focus', () => renderSequenceSuggestions(contactSequenceInput));
    contactSequenceInput.addEventListener('blur', () => {
      setTimeout(() => hideSequenceSuggestionBox(), 150);
    });
  }
  const contactSequenceStartNow = document.getElementById('contactSequenceStartNow');
  if (contactSequenceStartNow) {
    contactSequenceStartNow.addEventListener('change', toggleContactSequenceStartNow);
  }
  const contactSequenceStartDateTime = document.getElementById('contactSequenceStartDateTime');
  if (contactSequenceStartDateTime) {
    contactSequenceStartDateTime.addEventListener('change', () => {
      const startNow = document.getElementById('contactSequenceStartNow');
      if (startNow) startNow.checked = false;
      toggleContactSequenceStartNow();
    });
  }
  const deleteContactBtn = document.getElementById('deleteContactBtn');
  // Delete contact only available inline during edit; listener set in startContactInfoEdit.
  const editCompanyInfoBtn = document.getElementById('editCompanyInfoBtn');
  if (editCompanyInfoBtn) {
    editCompanyInfoBtn.addEventListener('click', startCompanyInfoEdit);
  }
  const saveCompanyInfoBtn = document.getElementById('saveCompanyInfoBtn');
  if (saveCompanyInfoBtn) {
    saveCompanyInfoBtn.addEventListener('click', saveCompanyInfoEdit);
  }
  const cancelCompanyInfoBtn = document.getElementById('cancelCompanyInfoBtn');
  if (cancelCompanyInfoBtn) {
    cancelCompanyInfoBtn.addEventListener('click', cancelCompanyInfoEdit);
  }
  const companyInfoCompetitorSelect = document.getElementById('companyInfoCompetitorSelect');
  if (companyInfoCompetitorSelect) {
    companyInfoCompetitorSelect.addEventListener('change', updateCompanyInfoCompetitorOther);
  }
  const addContactSecondary = document.getElementById('addContactFromCompanyBtnSecondary');
  if (addContactSecondary) {
    addContactSecondary.addEventListener('click', openCompanyContactModal);
  }
  const companyNewTaskBtn = document.getElementById('companyDetailNewTaskBtn');
  if (companyNewTaskBtn) {
    companyNewTaskBtn.addEventListener('click', () => {
      toggleTaskModal(true);
      const taskCompanyInput = document.getElementById('taskModalCompanyInput');
      if (taskCompanyInput && state.selectedCompanyId) {
        const selected = state.companies.find(
          (c) => String(c.id) === String(state.selectedCompanyId)
        );
        if (selected) taskCompanyInput.value = selected.name || '';
      }
    });
  }
  const companyAddOpportunityBtn = document.getElementById('companyAddOpportunityBtn');
  if (companyAddOpportunityBtn) {
    companyAddOpportunityBtn.addEventListener('click', () => {
      state.opportunityFormCompanyLocked = true;
      toggleOpportunityForm(true);
    });
  }
  const companyContactsList = document.getElementById('companyContactsList');
  if (companyContactsList) {
    companyContactsList.addEventListener('click', handleCompanyContactCardClick);
  }
  const companyTasksList = document.getElementById('companyTasksList');
  if (companyTasksList) {
    companyTasksList.addEventListener('click', handleCompanyTaskCardClick);
  }
  const companyOpportunitiesList = document.getElementById('companyOpportunitiesList');
  if (companyOpportunitiesList) {
    companyOpportunitiesList.addEventListener('click', handleCompanyOpportunityClick);
  }
  const contactActivityList = document.getElementById('contactActivityList');
  if (contactActivityList) {
    contactActivityList.addEventListener('click', handleContactActivityClick);
  }
  const addContactPrimary = document.getElementById('addContactFromCompanyBtn');
  if (addContactPrimary) {
    addContactPrimary.addEventListener('click', openCompanyContactModal);
  }
  const contactActivityNewTaskBtn = document.getElementById('contactActivityNewTaskBtn');
  if (contactActivityNewTaskBtn) {
    contactActivityNewTaskBtn.addEventListener('click', handleContactNewTask);
  }
  const editContactInfoBtn = document.getElementById('editContactInfoBtn');
  if (editContactInfoBtn) {
    editContactInfoBtn.addEventListener('click', startContactInfoEdit);
  }
  const saveContactInfoBtn = document.getElementById('saveContactInfoBtn');
  if (saveContactInfoBtn) {
    saveContactInfoBtn.addEventListener('click', saveContactInfoEdit);
  }
  const cancelContactInfoBtn = document.getElementById('cancelContactInfoBtn');
  if (cancelContactInfoBtn) {
    cancelContactInfoBtn.addEventListener('click', cancelContactInfoEdit);
  }
  document.getElementById('companyContactForm').addEventListener('submit', handleCompanyContactSubmit);
  const closeCompanyContactX = document.getElementById('closeCompanyContactX');
  if (closeCompanyContactX) {
    closeCompanyContactX.addEventListener('click', () => toggleCompanyContactModal(false));
  }
  const companyContactModal = document.getElementById('companyContactModal');
  if (companyContactModal) {
    companyContactModal.addEventListener('click', (e) => {
      if (e.target === companyContactModal) toggleCompanyContactModal(false);
    });
  }

  document
    .getElementById('companyList')
    .addEventListener('click', handleCompanyListAction);
  document
    .getElementById('contactList')
    .addEventListener('click', handleContactListAction);
  document.getElementById('taskList').addEventListener('click', handleTaskListAction);
  setupTaskChips();
  setupClearFilterChip();

  const taskFilterForm = document.getElementById('taskFilterForm');
  const clearTaskFilterBtn = document.getElementById('clearTaskFilterBtn');
  const closeTaskFilterModalBtn = document.getElementById('closeTaskFilterModalBtn');
  if (taskFilterForm) {
    taskFilterForm.addEventListener('submit', handleTaskFilterApply);
    taskFilterForm.addEventListener('change', handleTaskFilterOptionChange);
  }
  if (clearTaskFilterBtn) {
    clearTaskFilterBtn.addEventListener('click', clearTaskFilter);
  }
  if (closeTaskFilterModalBtn) {
    closeTaskFilterModalBtn.addEventListener('click', () => toggleTaskFilterModal(false));
  }
  const taskFilterCompanyInput = document.getElementById('taskFilterCompanyInput');
  if (taskFilterCompanyInput) {
    // Use native datalist only to avoid duplicate suggestion overlays.
    taskFilterCompanyInput.addEventListener('blur', () => {
      setTimeout(() => hideCompanySuggestionBox(), 150);
    });
  }

  const openTaskModalBtn = document.getElementById('openTaskModalBtn');
  if (openTaskModalBtn) openTaskModalBtn.addEventListener('click', () => toggleTaskModal(true));
  const closeTaskModalBtn = document.getElementById('closeTaskModalBtn');
  if (closeTaskModalBtn) closeTaskModalBtn.addEventListener('click', () => toggleTaskModal(false));
  const taskModalCompanyInput = document.getElementById('taskModalCompanyInput');
  if (taskModalCompanyInput) {
    taskModalCompanyInput.addEventListener('input', () => {
      populateTaskModalContacts(taskModalCompanyInput.value);
      renderCompanySuggestionsForTask(taskModalCompanyInput);
    });
    taskModalCompanyInput.addEventListener('focus', () => {
      populateTaskModalContacts(taskModalCompanyInput.value);
      renderCompanySuggestionsForTask(taskModalCompanyInput);
    });
    taskModalCompanyInput.addEventListener('blur', () => {
      setTimeout(() => hideTaskCompanySuggestionBox(), 150);
    });
  }
  const taskTemplateInput = document.getElementById('taskTemplateInput');
  if (taskTemplateInput) {
    taskTemplateInput.addEventListener('input', () => {
      taskTemplateInput.dataset.templateId = '';
      renderTemplateSuggestions(taskTemplateInput);
    });
    taskTemplateInput.addEventListener('focus', () => renderTemplateSuggestions(taskTemplateInput));
    taskTemplateInput.addEventListener('blur', () => {
      setTimeout(() => hideTemplateSuggestionBox(), 150);
    });
  }
  const taskTypeSelect = document.getElementById('taskTypeSelect');
  if (taskTypeSelect) {
    taskTypeSelect.addEventListener('change', handleTaskTypeChange);
  }

  document.getElementById('addOpportunityBtn').addEventListener('click', () => {
    state.opportunityFormCompanyLocked = false;
    toggleOpportunityForm(true);
  });
  const closeOpportunityModalX = document.getElementById('closeOpportunityModalX');
  if (closeOpportunityModalX) {
    closeOpportunityModalX.addEventListener('click', () => toggleOpportunityForm(false));
  }
  const opportunityCompanyInput = document.getElementById('opportunityCompanyInput');
  if (opportunityCompanyInput) {
    populateOpportunityCompanySelect('');
    opportunityCompanyInput.addEventListener('input', (event) => {
      const companyId = resolveCompanyId(event.target.value);
      populateOpportunityCompanySelect(event.target.value);
      refreshOpportunityCompanyDatalist(opportunityCompanyInput);
      populateOpportunityContactSelect(companyId);
      renderCompanySuggestions(opportunityCompanyInput);
      autoFillOpportunityName(event.target.value);
    });
    opportunityCompanyInput.addEventListener('focus', () => {
      populateOpportunityCompanySelect(opportunityCompanyInput.value);
      refreshOpportunityCompanyDatalist(opportunityCompanyInput);
      renderCompanySuggestions(opportunityCompanyInput);
    });
    opportunityCompanyInput.addEventListener('blur', () => {
      setTimeout(() => hideCompanySuggestionBox(), 150);
    });
  }
  const opportunityNameInput = document.getElementById('opportunityName');
  if (opportunityNameInput) {
    opportunityNameInput.readOnly = true;
    opportunityNameInput.dataset.userTyped = 'false';
  }
  function autoFillOpportunityName(companyVal) {
    const nameInput = document.getElementById('opportunityName');
    const companyName = (companyVal || '').trim();
    if (!nameInput || !companyName) return;
    nameInput.value = `${companyName} - Opportunity`;
  }
  const opportunityValueInput = document.getElementById('opportunityValue');
  normalizeMoneyInput(opportunityValueInput);
  document
    .getElementById('addPipelineStageBtn')
    .addEventListener('click', openPipelineModal);
  document.getElementById('addPipelineStepBtn').addEventListener('click', openStepModal);
  document.getElementById('editPipelineBtn').addEventListener('click', startPipelineEdit);
  document.getElementById('savePipelineEditBtn').addEventListener('click', savePipelineEdit);
  document.getElementById('cancelPipelineEditBtn').addEventListener('click', cancelPipelineEdit);
  const pipelineNameEditInput = document.getElementById('pipelineNameEditInput');
  if (pipelineNameEditInput) {
    pipelineNameEditInput.addEventListener('input', (event) => {
      state.editingPipelineName = event.target.value || '';
    });
  }
  document.getElementById('pipelineSelect').addEventListener('change', (event) => {
    setSelectedPipelineId(event.target.value);
    cancelPipelineEdit();
    renderPipelineBoard();
  });
  const opportunityPipelineSelect = document.getElementById('opportunityPipelineSelect');
  if (opportunityPipelineSelect) {
    opportunityPipelineSelect.addEventListener('change', handleOpportunityPipelineChange);
  }
  document.getElementById('pipelineForm').addEventListener('submit', handlePipelineFormSubmit);
  const closePipelineModalX = document.getElementById('closePipelineModalX');
  if (closePipelineModalX) closePipelineModalX.addEventListener('click', closePipelineModal);
  const pipelineModal = document.getElementById('pipelineModal');
  if (pipelineModal) pipelineModal.addEventListener('click', handlePipelineModalBackdrop);
  document.getElementById('pipelineStepForm').addEventListener('submit', handlePipelineStepFormSubmit);
  document.getElementById('cancelPipelineStepBtn').addEventListener('click', closeStepModal);
  document.getElementById('closeCompanyDetailX').addEventListener('click', closeCompanyDetail);
  const deletePipelineBtn = document.getElementById('deletePipelineBtn');
  if (deletePipelineBtn) {
    deletePipelineBtn.addEventListener('click', handlePipelineDelete);
  }
  const closeTaskDetailBtn = document.getElementById('closeTaskDetailBtn');
  if (closeTaskDetailBtn) closeTaskDetailBtn.addEventListener('click', closeTaskDetail);
  const sequenceStepEditForm = document.getElementById('sequenceStepEditForm');
  if (sequenceStepEditForm) {
    sequenceStepEditForm.addEventListener('submit', handleSequenceStepEditSave);
  }
  const templateEditSearch = document.getElementById('sequenceStepEditTemplateSearch');
  if (templateEditSearch) {
    templateEditSearch.addEventListener('input', () => {
      templateEditSearch.dataset.templateId = '';
      const hidden = document.getElementById('sequenceStepEditTemplateId');
      if (hidden) hidden.value = '';
      renderTemplateSuggestions(templateEditSearch);
    });
    templateEditSearch.addEventListener('focus', () => renderTemplateSuggestions(templateEditSearch));
    templateEditSearch.addEventListener('blur', () => {
      setTimeout(() => hideTemplateSuggestionBox(), 150);
    });
  }
  const generateEmailBtn = document.getElementById('generateEmailBtn');
  if (generateEmailBtn) {
    generateEmailBtn.addEventListener('click', handleGenerateEmail);
  }
  const deleteSequenceBtn = document.getElementById('deleteSequenceBtn');
  if (deleteSequenceBtn) {
    deleteSequenceBtn.addEventListener('click', handleSequenceDelete);
  }

  const sequenceTypeSelect = document.getElementById('sequenceStepTypeSelect');
  if (sequenceTypeSelect) {
    sequenceTypeSelect.addEventListener('change', updateSequenceStepTemplateVisibility);
  }
  const sequenceTemplateSearch = document.getElementById('sequenceStepTemplateSearch');
  if (sequenceTemplateSearch) {
    sequenceTemplateSearch.addEventListener('input', () => {
      sequenceTemplateSearch.dataset.templateId = '';
      const hidden = document.getElementById('sequenceStepTemplateId');
      if (hidden) hidden.value = '';
      renderTemplateSuggestions(sequenceTemplateSearch);
    });
    sequenceTemplateSearch.addEventListener('focus', () => renderTemplateSuggestions(sequenceTemplateSearch));
    sequenceTemplateSearch.addEventListener('blur', () => {
      setTimeout(() => hideTemplateSuggestionBox(), 150);
    });
  }
  const addSequenceBtn = document.getElementById('addSequenceBtn');
  if (addSequenceBtn) addSequenceBtn.addEventListener('click', openSequenceModal);
  const closeSequenceModalX = document.getElementById('closeSequenceModalX');
  if (closeSequenceModalX) closeSequenceModalX.addEventListener('click', closeSequenceModal);
  const sequenceModal = document.getElementById('sequenceModal');
  if (sequenceModal) {
    sequenceModal.addEventListener('click', (event) => {
      if (event.target === sequenceModal) closeSequenceModal();
    });
  }
  const sequenceForm = document.getElementById('sequenceForm');
  if (sequenceForm) sequenceForm.addEventListener('submit', handleSequenceFormSubmit);
  const closeSequenceStepModalX = document.getElementById('closeSequenceStepModalX');
  if (closeSequenceStepModalX) closeSequenceStepModalX.addEventListener('click', closeSequenceStepModal);
  const sequenceStepModal = document.getElementById('sequenceStepModal');
  if (sequenceStepModal) {
    sequenceStepModal.addEventListener('click', (event) => {
      if (event.target === sequenceStepModal) closeSequenceStepModal();
    });
  }
  const sequenceStepForm = document.getElementById('sequenceStepForm');
  if (sequenceStepForm) sequenceStepForm.addEventListener('submit', handleSequenceStepFormSubmit);
  const closeSequencePreviewBtn = document.getElementById('closeSequencePreviewBtn');
  if (closeSequencePreviewBtn) {
    closeSequencePreviewBtn.addEventListener('click', () => toggleSequencePreviewModal(false));
  }
  const sequencePreviewModal = document.getElementById('sequencePreviewModal');
  if (sequencePreviewModal) {
    sequencePreviewModal.addEventListener('click', (event) => {
      if (event.target === sequencePreviewModal) toggleSequencePreviewModal(false);
    });
  }
  const addSequenceStepInModalBtn = document.getElementById('addSequenceStepInModalBtn');
  if (addSequenceStepInModalBtn) {
    addSequenceStepInModalBtn.addEventListener('click', openSequenceStepModal);
  }
  const editSequenceBtn = document.getElementById('editSequenceBtn');
  if (editSequenceBtn) {
    editSequenceBtn.addEventListener('click', startSequenceEdit);
  }
  const saveSequenceEditBtn = document.getElementById('saveSequenceEditBtn');
  if (saveSequenceEditBtn) {
    saveSequenceEditBtn.addEventListener('click', saveSequenceEdit);
  }
  const cancelSequenceEditBtn = document.getElementById('cancelSequenceEditBtn');
  if (cancelSequenceEditBtn) {
    cancelSequenceEditBtn.addEventListener('click', cancelSequenceEdit);
  }
  const sequenceEnrollBtn = document.getElementById('sequenceEnrollBtn');
  if (sequenceEnrollBtn) {
    sequenceEnrollBtn.addEventListener('click', handleSequenceEnroll);
  }
  const sequenceEnrollmentListBtn = document.getElementById('sequenceEnrollmentListBtn');
  if (sequenceEnrollmentListBtn) {
    sequenceEnrollmentListBtn.addEventListener('click', openSequenceEnrollmentsModal);
  }
  const closeSequenceEnrollmentsBtn = document.getElementById('closeSequenceEnrollmentsBtn');
  if (closeSequenceEnrollmentsBtn) {
    closeSequenceEnrollmentsBtn.addEventListener('click', closeSequenceEnrollmentsModal);
  }
  const sequenceEnrollmentsModal = document.getElementById('sequenceEnrollmentsModal');
  if (sequenceEnrollmentsModal) {
    sequenceEnrollmentsModal.addEventListener('click', (event) => {
      if (event.target === sequenceEnrollmentsModal) closeSequenceEnrollmentsModal();
    });
  }
  const cancelSequenceUnenrollBtn = document.getElementById('cancelSequenceUnenrollBtn');
  if (cancelSequenceUnenrollBtn) {
    cancelSequenceUnenrollBtn.addEventListener('click', closeSequenceUnenrollConfirmModal);
  }
  const confirmSequenceUnenrollBtn = document.getElementById('confirmSequenceUnenrollBtn');
  if (confirmSequenceUnenrollBtn) {
    confirmSequenceUnenrollBtn.addEventListener('click', confirmSequenceUnenroll);
  }
  const confirmContactDeleteBtn = document.getElementById('confirmContactDeleteBtn');
  if (confirmContactDeleteBtn) {
    confirmContactDeleteBtn.addEventListener('click', handleContactDelete);
  }
  const cancelContactDeleteBtn = document.getElementById('cancelContactDeleteBtn');
  if (cancelContactDeleteBtn) {
    cancelContactDeleteBtn.addEventListener('click', closeContactDeleteConfirm);
  }
  const closeSequenceTaskBtn = document.getElementById('closeSequenceTaskBtn');
  if (closeSequenceTaskBtn) {
    closeSequenceTaskBtn.addEventListener('click', closeSequenceTaskModal);
  }
  const closeSequenceStepEditModalX = document.getElementById('closeSequenceStepEditModalX');
  if (closeSequenceStepEditModalX) {
    closeSequenceStepEditModalX.addEventListener('click', closeSequenceStepEditModal);
  }
  const sequenceStepEditModal = document.getElementById('sequenceStepEditModal');
  if (sequenceStepEditModal) {
    sequenceStepEditModal.addEventListener('click', (event) => {
      if (event.target === sequenceStepEditModal) closeSequenceStepEditModal();
    });
  }
  const sequenceStartNow = document.getElementById('sequenceStartNow');
  const sequenceStartDateTime = document.getElementById('sequenceStartDateTime');
  if (sequenceStartNow && sequenceStartDateTime) {
    sequenceStartNow.addEventListener('change', () => {
      const immediate = sequenceStartNow.checked;
      sequenceStartDateTime.disabled = immediate;
      if (immediate) sequenceStartDateTime.value = '';
    });
  }
  const quickSequenceEnrollBtn = document.getElementById('quickSequenceEnrollBtn');
  if (quickSequenceEnrollBtn) {
    quickSequenceEnrollBtn.addEventListener('click', openSequenceQuickEnrollModal);
  }
  const closeSequenceQuickEnrollX = document.getElementById('closeSequenceQuickEnrollX');
  if (closeSequenceQuickEnrollX) {
    closeSequenceQuickEnrollX.addEventListener('click', closeSequenceQuickEnrollModal);
  }
  const sequenceQuickEnrollModal = document.getElementById('sequenceQuickEnrollModal');
  if (sequenceQuickEnrollModal) {
    sequenceQuickEnrollModal.addEventListener('click', (event) => {
      if (event.target === sequenceQuickEnrollModal) closeSequenceQuickEnrollModal();
    });
  }
  const quickEnrollStartNow = document.getElementById('quickEnrollStartNow');
  const quickEnrollStartDate = document.getElementById('quickEnrollStartDate');
  if (quickEnrollStartNow && quickEnrollStartDate) {
    quickEnrollStartNow.addEventListener('change', () => {
      quickEnrollStartDate.disabled = !!quickEnrollStartNow.checked;
      if (quickEnrollStartNow.checked) quickEnrollStartDate.value = '';
    });
  }
  const quickEnrollSequenceInput = document.getElementById('quickEnrollSequenceInput');
  if (quickEnrollSequenceInput) {
    quickEnrollSequenceInput.addEventListener('input', () => renderSequenceSuggestions(quickEnrollSequenceInput));
    quickEnrollSequenceInput.addEventListener('focus', () => renderSequenceSuggestions(quickEnrollSequenceInput));
    quickEnrollSequenceInput.addEventListener('blur', () => {
      setTimeout(() => hideSequenceSuggestionBox(), 150);
    });
  }
  const quickEnrollContactInput = document.getElementById('quickEnrollContactInput');
  if (quickEnrollContactInput) {
    quickEnrollContactInput.addEventListener('input', () => renderContactSuggestions(quickEnrollContactInput));
    quickEnrollContactInput.addEventListener('focus', () => renderContactSuggestions(quickEnrollContactInput));
    quickEnrollContactInput.addEventListener('blur', () => {
      setTimeout(() => hideContactSuggestionBox(), 150);
    });
  }
  const sequenceQuickEnrollForm = document.getElementById('sequenceQuickEnrollForm');
  if (sequenceQuickEnrollForm) {
    sequenceQuickEnrollForm.addEventListener('submit', handleSequenceQuickEnroll);
  }
  const sequenceEnrollInput = document.getElementById('sequenceEnrollInput');
  if (sequenceEnrollInput) {
    sequenceEnrollInput.addEventListener('input', () => renderContactSuggestions(sequenceEnrollInput));
    sequenceEnrollInput.addEventListener('focus', () => renderContactSuggestions(sequenceEnrollInput));
    sequenceEnrollInput.addEventListener('blur', () => {
      setTimeout(() => hideContactSuggestionBox(), 150);
    });
  }
  const closeOpportunityDetailBtn = document.getElementById('closeOpportunityDetailBtn');
  if (closeOpportunityDetailBtn) {
    closeOpportunityDetailBtn.addEventListener('click', closeOpportunityDetail);
  }
  const editOpportunityBtn = document.getElementById('editOpportunityBtn');
  if (editOpportunityBtn) {
    editOpportunityBtn.addEventListener('click', startOpportunityEdit);
  }
  const deleteOpportunityBtn = document.getElementById('deleteOpportunityBtn');
  if (deleteOpportunityBtn) {
    deleteOpportunityBtn.addEventListener('click', showOpportunityDeleteConfirm);
  }
  const cancelOpportunityDeleteBtn = document.getElementById('cancelOpportunityDeleteBtn');
  if (cancelOpportunityDeleteBtn) {
    cancelOpportunityDeleteBtn.addEventListener('click', hideOpportunityDeleteConfirm);
  }
  const confirmOpportunityDeleteBtn = document.getElementById('confirmOpportunityDeleteBtn');
  if (confirmOpportunityDeleteBtn) {
    confirmOpportunityDeleteBtn.addEventListener('click', handleOpportunityDelete);
  }
  const opportunityEditForm = document.getElementById('opportunityEditForm');
  if (opportunityEditForm) {
    opportunityEditForm.addEventListener('submit', handleOpportunityEditSubmit);
  }
  const cancelOpportunityEditBtn = document.getElementById('cancelOpportunityEditBtn');
  if (cancelOpportunityEditBtn) {
    cancelOpportunityEditBtn.addEventListener('click', cancelOpportunityEdit);
  }
  const competitorSelect = document.getElementById('companyCompetitor');
  if (competitorSelect) {
    competitorSelect.addEventListener('change', updateCompetitorOtherVisibility);
  }
  const opportunityEditValueInput = document.getElementById('opportunityEditValue');
  normalizeMoneyInput(opportunityEditValueInput);
}

function showStatus(element, message, type = '') {
  element.textContent = message;
  element.classList.remove('error', 'success');
  if (type) {
    element.classList.add(type);
  }
}

function setButtonLoading(button, isLoading, loadingText = 'Saving...') {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
  button.disabled = isLoading;
}

async function loadCompanies() {
  const statusEl = document.getElementById('companyStatus');
  showStatus(statusEl, 'Loading companies...');
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to load companies', error);
    showStatus(statusEl, 'Could not load companies.', 'error');
    return;
  }

  state.companies = data || [];
  state.companyPage = 1;
  renderCompanyList();
  populateCompanySelect();
  renderContactList();
  populateContactSelect();
  populateOpportunityCompanySelect();
  renderPipelineBoard();
  showStatus(statusEl, `${state.companies.length} companies loaded.`, 'success');
}

async function loadContacts() {
  const statusEl = document.getElementById('contactStatus');
  showStatus(statusEl, 'Loading contacts...');
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load contacts', error);
    showStatus(statusEl, 'Could not load contacts.', 'error');
    return;
  }

  state.contacts = data || [];
  renderContactList();
  populateContactSelect();
  populateOpportunityContactSelect(
    resolveCompanyId(document.getElementById('opportunityCompanyInput')?.value || '')
  );
  renderPipelineBoard();
  showStatus(statusEl, `${state.contacts.length} contacts loaded.`, 'success');
  loadTasksForContact();
}

async function loadTasksForContact(contactId) {
  const statusEl = document.getElementById('taskStatus');
  showStatus(statusEl, 'Loading tasks...');
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load tasks', error);
    showStatus(statusEl, 'Could not load tasks.', 'error');
    return;
  }

  state.tasks = data || [];
  const versionIds = Array.from(
    new Set((state.tasks || []).map((t) => t.sequence_version_id).filter(Boolean))
  );
  await loadSequenceVersionSteps(versionIds);
  renderTaskList();
  const companyModal = document.getElementById('companyDetailModal');
  const contactModal = document.getElementById('contactDetailModal');
  const companyOpen = companyModal && !companyModal.classList.contains('hidden');
  const contactOpen = contactModal && !contactModal.classList.contains('hidden');
  if (companyOpen && state.selectedCompanyId) {
    openCompanyDetail(state.selectedCompanyId);
  }
  if (contactOpen && state.selectedContactId) {
    openContactDetail(state.selectedContactId);
  }
  showStatus(statusEl, `${state.tasks.length} task(s) loaded.`, 'success');
}

async function refreshTaskViews() {
  await loadTasksForContact(state.selectedContactId);
  const companyModal = document.getElementById('companyDetailModal');
  const contactModal = document.getElementById('contactDetailModal');
  const companyOpen = companyModal && !companyModal.classList.contains('hidden');
  const contactOpen = contactModal && !contactModal.classList.contains('hidden');
  if (companyOpen && state.selectedCompanyId) {
    openCompanyDetail(state.selectedCompanyId);
  }
  if (contactOpen && state.selectedContactId) {
    openContactDetail(state.selectedContactId);
  }
}

async function isContactEnrolledInSequence(sequenceId, contactId) {
  if (!sequenceId || !contactId) return false;
  const { data, error } = await supabase
    .from('contact_sequence_enrollments')
    .select('id')
    .eq('sequence_id', sequenceId)
    .eq('contact_id', contactId)
    .in('status', ['active', 'paused'])
    .limit(1)
    .maybeSingle?.();

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to check existing enrollment', error);
  }
  return !!data;
}

async function openSequenceEnrollmentsModal() {
  if (!state.selectedSequenceId) {
    alert('Select a sequence first.');
    return;
  }
  const modal = document.getElementById('sequenceEnrollmentsModal');
  const body = document.getElementById('sequenceEnrollmentsBody');
  if (!modal || !body) return;
  body.innerHTML = '<tr><td colspan="5" class="muted">Loading...</td></tr>';
  await renderSequenceEnrollmentsTable(state.selectedSequenceId);
  modal.classList.remove('hidden');
}

function closeSequenceEnrollmentsModal() {
  const modal = document.getElementById('sequenceEnrollmentsModal');
  if (modal) modal.classList.add('hidden');
}

function openSequenceUnenrollConfirmModal(sequenceId, contactId) {
  const modal = document.getElementById('sequenceUnenrollConfirmModal');
  if (!modal) return;
  modal.dataset.sequenceId = sequenceId;
  modal.dataset.contactId = contactId;
  modal.addEventListener('click', handleSequenceUnenrollBackdrop);
  modal.classList.remove('hidden');
}

function closeSequenceUnenrollConfirmModal() {
  const modal = document.getElementById('sequenceUnenrollConfirmModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.removeEventListener('click', handleSequenceUnenrollBackdrop);
  }
}

async function confirmSequenceUnenroll() {
  const modal = document.getElementById('sequenceUnenrollConfirmModal');
  if (!modal) return;
  const sequenceId = modal.dataset.sequenceId;
  const contactId = modal.dataset.contactId;
  if (!sequenceId || !contactId) {
    closeSequenceUnenrollConfirmModal();
    return;
  }
  await unenrollSequenceContact(sequenceId, contactId);
  closeSequenceUnenrollConfirmModal();
  await renderSequenceEnrollmentsTable(state.selectedSequenceId);
  closeSequenceTaskModal();
}

function handleSequenceUnenrollBackdrop(event) {
  const modal = document.getElementById('sequenceUnenrollConfirmModal');
  const content = modal ? modal.querySelector('.modal-content') : null;
  if (!modal || !content) return;
  if (event.target === modal) {
    closeSequenceUnenrollConfirmModal();
  }
}

async function renderSequenceEnrollmentsTable(sequenceId) {
  const body = document.getElementById('sequenceEnrollmentsBody');
  if (!body) return;
  const { data, error } = await supabase
    .from('contact_sequence_enrollments')
    .select('*')
    .eq('sequence_id', sequenceId)
    .in('status', ['active', 'paused']);
  if (error) {
    console.error('Failed to load enrollments', error);
    body.innerHTML = '<tr><td colspan="5" class="muted">Could not load enrollments.</td></tr>';
    return;
  }
  const enrollments = data || [];
  if (enrollments.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="muted">No contacts currently enrolled.</td></tr>';
    return;
  }

  const rows = await Promise.all(
    enrollments.map(async (enroll) => {
      const contact = state.contacts.find((c) => String(c.id) === String(enroll.contact_id));
      const company =
        contact && state.companies.find((co) => String(co.id) === String(contact.company_id));
      if (enroll.sequence_version_id && !state.sequenceVersionSteps[enroll.sequence_version_id]) {
        await loadSequenceVersionSteps([enroll.sequence_version_id]);
      }
      const steps = getSequenceVersionSteps(enroll.sequence_id, enroll.sequence_version_id);
      const nextStepOrder = enroll.current_step || 1;
      const nextStep =
        steps.find((s) => String(s.step_order || s.position) === String(nextStepOrder)) || null;

      const openTasks = (state.tasks || [])
        .filter(
          (t) =>
            String(t.sequence_id) === String(enroll.sequence_id) &&
            String(t.contact_id) === String(enroll.contact_id) &&
            (t.status || t.task_status || '').toLowerCase() !== 'done'
        )
        .sort((a, b) => {
          const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return da - db;
        });
      const nextTask = openTasks[0];
      const dueDate = nextTask?.due_date || '';
      const dueLabel = dueDate
        ? new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : 'Not scheduled';
      const stepLabel = nextStep
        ? `${nextStep.step_order || nextStep.position || nextStepOrder}: ${nextStep.name || 'Step'}`
        : `Step ${nextStepOrder}`;

      return `
        <tr>
          <td>${company?.name || '-'}</td>
          <td>${buildContactLabel(contact) || '-'}</td>
          <td>${stepLabel}</td>
          <td>${dueLabel}</td>
          <td><button type="button" class="danger-btn tertiary unenroll-sequence-btn" data-sequence-id="${enroll.sequence_id}" data-contact-id="${enroll.contact_id}">Unenroll</button></td>
        </tr>
      `;
    })
  );

  body.innerHTML = rows.join('');
  body.querySelectorAll('.unenroll-sequence-btn').forEach((btn) => {
    btn.addEventListener('click', () =>
      openSequenceUnenrollConfirmModal(btn.dataset.sequenceId, btn.dataset.contactId)
    );
  });
}

async function unenrollSequenceContact(sequenceId, contactId) {
  await supabase
    .from('contact_sequence_enrollments')
    .delete()
    .eq('sequence_id', sequenceId)
    .eq('contact_id', contactId);
  await supabase
    .from('tasks')
    .delete()
    .eq('sequence_id', sequenceId)
    .eq('contact_id', contactId)
    .neq('status', 'done');
  state.tasks = state.tasks.filter(
    (t) =>
      !(
        String(t.sequence_id) === String(sequenceId) &&
        String(t.contact_id) === String(contactId) &&
        (t.status || t.task_status || '').toLowerCase() !== 'done'
      )
  );
  renderTaskList();
  const contact = state.contacts.find((c) => String(c.id) === String(contactId));
  const companyId = contact?.company_id || null;
  const companyModal = document.getElementById('companyDetailModal');
  const contactModal = document.getElementById('contactDetailModal');
  const companyOpen = companyModal && !companyModal.classList.contains('hidden');
  const contactOpen = contactModal && !contactModal.classList.contains('hidden');
  if (contactOpen) state.selectedContactId = contactId;
  if (companyOpen && companyId) state.selectedCompanyId = companyId;
  await refreshTaskViews();
}

async function loadTasksForCompany(companyId) {
  const contacts = state.contacts.filter((c) => String(c.company_id) === String(companyId));
  const contactIds = contacts.map((c) => c.id);
  const inMemory = (state.tasks || []).filter((t) => {
    const status = (t.status || t.task_status || '').toLowerCase();
    if (status === 'done') return false;
    if (t.company_id && String(t.company_id) === String(companyId)) return true;
    if (t.contact_id && contactIds.some((id) => String(id) === String(t.contact_id))) return true;
    return false;
  });
  if (inMemory.length > 0) return inMemory;

  if (contactIds.length === 0) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .or(
      [
        `company_id.eq.${companyId}`,
        contactIds.length ? `contact_id.in.(${contactIds.join(',')})` : 'contact_id.eq.null',
      ].join(',')
    )
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Failed to load company tasks', error);
    return [];
  }

  const tasks = data || [];
  const versionIds = Array.from(
    new Set(tasks.map((t) => t.sequence_version_id).filter(Boolean))
  );
  await loadSequenceVersionSteps(versionIds);
  return tasks;
}

async function loadPipelinesAndStages() {
  const { data, error } = await supabase
    .from('pipelines')
    .select('id,name,pipeline_stages(id,name,position)')
    .order('name', { ascending: true })
    .order('position', { foreignTable: 'pipeline_stages', ascending: true, nullsFirst: true });

  if (error) {
    console.error('Error loading pipelines:', error);
    return;
  }

  state.pipelines = data || [];
  state.pipelineStages = {};
  state.pipelines.forEach((pipeline) => {
    state.pipelineStages[pipeline.id] = (pipeline.pipeline_stages || []).sort(
      (a, b) => (a.position || 0) - (b.position || 0)
    );
  });

  if (!state.selectedPipelineId && state.pipelines.length > 0) {
    try {
      const stored = localStorage.getItem('selectedPipelineId');
      if (stored && state.pipelines.some((p) => String(p.id) === stored)) {
        state.selectedPipelineId = stored;
      } else {
        state.selectedPipelineId = String(state.pipelines[0].id);
      }
    } catch (e) {
      state.selectedPipelineId = String(state.pipelines[0].id);
    }
  }

  populateOpportunityPipelineSelect();
  populateOpportunityStageSelect(state.opportunityFormPipelineId || state.selectedPipelineId);
  renderPipelineBoard();
}

async function loadOpportunities() {
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading opportunities:', error);
    return;
  }

  state.opportunities = (data || []).map((opp) => {
    const stageName = getStageName(opp.pipeline_id, opp.stage_id);
    return { ...opp, stage: opp.stage || stageName || null };
  });
  state.opportunitiesLoaded = true;
  renderPipelineBoard();
}

function renderCompanyList() {
  const body = document.getElementById('companyList');
  const query = (state.companySearchQuery || '').trim().toLowerCase();
  const openTasksByCompany = {};
  (state.tasks || []).forEach((task) => {
    const status = (task.status || '').toLowerCase();
    if (status === 'done') return;
    const companyId = task.company_id;
    if (!companyId) return;
    openTasksByCompany[companyId] = (openTasksByCompany[companyId] || 0) + 1;
  });
  const filtered = query
    ? state.companies.filter((c) => {
        const fields = [c.name, c.phone, c.address].map((v) => (v || '').toLowerCase());
        return fields.some((f) => f.includes(query));
      })
    : state.companies;

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="3">No companies yet.</td></tr>';
    renderCompanyPagination(1);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / COMPANY_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, state.companyPage || 1), totalPages);
  state.companyPage = currentPage;
  const start = (currentPage - 1) * COMPANY_PAGE_SIZE;
  const pageCompanies = filtered.slice(start, start + COMPANY_PAGE_SIZE);

  body.innerHTML = pageCompanies
    .map(
      (company) => `
      <tr class="company-row" data-company-id="${company.id}">
        <td>
          <div class="company-title">${company.name || ''}</div>
        </td>
        <td>${company.competitor || '-'}</td>
        <td>${company.phone || '-'}</td>
        <td>${company.city || '-'}</td>
        <td>${company.postal_code || '-'}</td>
        <td>
          <span class="${
            openTasksByCompany[company.id]
              ? 'company-task-pill open'
              : 'company-task-pill muted'
          }">
            ${
              openTasksByCompany[company.id]
                ? `${openTasksByCompany[company.id]} open task${
                    openTasksByCompany[company.id] > 1 ? 's' : ''
                  }`
                : 'No open tasks'
            }
          </span>
        </td>
      </tr>
    `
    )
    .join('');

  body.querySelectorAll('.company-row').forEach((row) => {
    row.addEventListener('click', () => {
      const companyId = row.dataset.companyId;
      if (companyId) openCompanyDetail(companyId);
    });
    row.addEventListener('mouseover', () => row.classList.add('company-row-hover'));
    row.addEventListener('mouseleave', () => row.classList.remove('company-row-hover'));
  });

  renderCompanyPagination(totalPages);
}

function renderContactList() {
  const body = document.getElementById('contactList');
  if (state.contacts.length === 0) {
    body.innerHTML = '<tr><td colspan="3">No contacts yet.</td></tr>';
    return;
  }

  body.innerHTML = state.contacts
    .map((contact) => {
      const company = state.companies.find((c) => c.id === contact.company_id);
      const companyName = company ? company.name : 'Unknown company';
      return `
        <tr class="contact-row" data-contact-id="${contact.id}">
          <td>${contact.first_name || ''} ${contact.last_name || ''}</td>
          <td>${companyName}</td>
          <td>
            <button class="inline-btn primary" data-action="viewTasks" data-contact-id="${contact.id}">
              View Tasks
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  body.querySelectorAll('.contact-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      const isButton = e.target.closest('button');
      if (isButton) return;
      const contactId = row.dataset.contactId;
      if (contactId) {
        state.selectedContactId = contactId;
        openContactDetail(contactId);
      }
    });
  });
}

function renderTaskList() {
  const container = document.getElementById('taskList');
  if (!container) return;
  if (!state.tasks || state.tasks.length === 0) {
    container.innerHTML = '<div class="empty-tasks-state">No open tasks. Add one above.</div>';
    updateTaskCounters();
    updateTaskChipActiveState();
    return;
  }

  const filteredTasks = applyTaskFilter(state.tasks);
  if (filteredTasks.length === 0) {
    container.innerHTML = '<div class="empty-tasks-state">No tasks match this filter.</div>';
    updateTaskCounters();
    updateTaskChipActiveState();
    return;
  }

  const grouped = groupTasksByDay(filteredTasks);
  container.innerHTML = grouped
    .map(
      (group) => `
        <div class="task-day-card" data-task-day="${group.key}">
          <div class="task-day-header">
            <div>
              <p class="task-day-title">${group.label}</p>
            </div>
            <div class="task-day-count">${group.tasks.length} task(s)</div>
          </div>
          <div class="task-table-head">
            <div>Title</div>
            <div>Company</div>
            <div>Contact</div>
            <div>Sequence</div>
            <div>Step</div>
            <div>Status</div>
          </div>
          ${group.tasks.map(renderTaskRow).join('')}
        </div>
      `
    )
    .join('');

  container.querySelectorAll('.task-row-card').forEach((row) => {
    row.addEventListener('click', () => {
      const id = row.dataset.taskId;
      openTaskDetail(id);
    });
  });
  updateTaskCounters();
  updateTaskChipActiveState();
  // Refresh company list so open task counts stay in sync.
  renderCompanyList();
}

function groupTasksByDay(tasks) {
  const buckets = {};
  tasks.forEach((task) => {
    const parsed = parseTaskDate(task.due_date);
    const key = parsed ? formatDateKey(parsed) : 'no-date';
    if (!buckets[key]) {
      buckets[key] = {
        key,
        label: parsed ? formatTaskDate(parsed) : 'No due date',
        tasks: [],
      };
    }
    buckets[key].tasks.push(task);
  });

  const keys = Object.keys(buckets).sort((a, b) => {
    if (a === 'no-date') return 1;
    if (b === 'no-date') return -1;
    return new Date(a) - new Date(b);
  });

  return keys.map((k) => buckets[k]);
}

function renderTaskRow(task) {
  return `
    <div class="task-row-card" data-task-id="${task.id}">
      <div class="task-cell task-title">${task.title || 'Untitled task'}</div>
      <div class="task-cell">${getCompanyName(task.company_id) || ''}</div>
      <div class="task-cell task-muted">${getContactName(task.contact_id) || ''}</div>
      <div class="task-cell task-muted">${getSequenceName(task.sequence_id) || ''}</div>
      <div class="task-cell task-muted">${getSequenceStepName(task.sequence_step_id, task.sequence_id, task.sequence_version_id) || ''}</div>
      <div class="task-cell status-cell">${renderTaskStatus(task)}</div>
    </div>
  `;
}

function renderTaskStatus(task) {
  const status = (task.status || 'open').toLowerCase();
  const overdue = isTaskOverdue(task);
  const pillClass = overdue ? 'status-pill overdue' : status === 'done' ? 'status-pill done' : 'status-pill open';
  const label = overdue ? 'Overdue' : status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="${pillClass}">${label}</span>`;
}

function applyTaskFilter(tasks) {
  const hasAnyFilter =
    !!state.taskFilter ||
    state.taskFilterCompanyId ||
    state.taskFilterSequenceId ||
    state.taskFilterType ||
    state.taskFilterOpportunityOnly;
  if (!hasAnyFilter) return tasks;

  const today = startOfDay(new Date());
  const weekEnd = startOfDay(new Date());
  weekEnd.setDate(weekEnd.getDate() + 7);

  let filtered = tasks;

  if (state.taskFilter) {
    filtered = filtered.filter((task) => {
      const dateObj = parseTaskDate(task.due_date);
      if (state.taskFilter === 'closed') {
        return (task.status || '').toLowerCase() !== 'open';
      }
      if (state.taskFilter === 'today') {
        return dateObj && dateObj.getTime() === today.getTime();
      }
      if (state.taskFilter === 'overdue') {
        return isTaskOverdue(task);
      }
      if (state.taskFilter === 'week') {
        return dateObj && dateObj >= today && dateObj <= weekEnd;
      }
      if (state.taskFilter === 'next7') {
        const end = startOfDay(new Date());
        end.setDate(end.getDate() + 7);
        return dateObj && dateObj >= today && dateObj <= end;
      }
      if (state.taskFilter === 'last7') {
        const start = startOfDay(new Date());
        start.setDate(start.getDate() - 7);
        return dateObj && dateObj <= today && dateObj >= start;
      }
      if (state.taskFilter === 'range') {
        const start = state.taskFilterStart ? parseTaskDate(state.taskFilterStart) : null;
        const end = state.taskFilterEnd ? parseTaskDate(state.taskFilterEnd) : null;
        if (!start || !end) return true;
        return dateObj && dateObj >= start && dateObj <= end;
      }
      return true;
    });
  }

  filtered = filtered.filter((task) => {
    if (state.taskFilterCompanyId && String(task.company_id) !== String(state.taskFilterCompanyId)) {
      return false;
    }
    if (state.taskFilterSequenceId && String(task.sequence_id) !== String(state.taskFilterSequenceId)) {
      return false;
    }
    if (state.taskFilterType) {
      const taskType = (task.task_type || task.type || '').toLowerCase();
      if (taskType !== state.taskFilterType.toLowerCase()) return false;
    }
    if (state.taskFilterOpportunityOnly && !task.opportunity_id) {
      return false;
    }
    return true;
  });

  return filtered;
}

function parseTaskDate(dueDate) {
  if (!dueDate) return null;
  const parsed = new Date(`${dueDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKey(dateObj) {
  if (!dateObj) return 'no-date';
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTaskDate(dateObj) {
  if (!dateObj) return 'No due date';
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isTaskOverdue(task) {
  const dateObj = parseTaskDate(task.due_date);
  if (!dateObj) return false;
  const today = startOfDay(new Date());
  return dateObj < today && (task.status || '').toLowerCase() !== 'done';
}

function startOfDay(dateObj) {
  const copy = new Date(dateObj);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function populateFilterDropdowns() {
  const sequenceSelect = document.getElementById('taskFilterSequenceSelect');
  const companyOptionsList = document.getElementById('taskFilterCompanyOptions');
  if (companyOptionsList) {
    const options = [];
    state.companies.forEach((company) => {
      options.push(`<option value="${company.name || ''}"></option>`);
    });
    companyOptionsList.innerHTML = options.join('');
  }
  if (sequenceSelect) {
    const seqOptions = ['<option value="">Any sequence</option>'];
    state.sequences.forEach((seq) => {
      seqOptions.push(`<option value="${seq.id}">${seq.name || 'Untitled sequence'}</option>`);
    });
    sequenceSelect.innerHTML = seqOptions.join('');
    sequenceSelect.value = state.taskFilterSequenceId || '';
  }
}

function setupTaskChips() {
  document.querySelectorAll('.task-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.filter || '';
      if (key === 'custom') {
        openTaskFilterModal();
        return;
      }
      toggleTaskFilter(key);
    });
    chip.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const key = chip.dataset.filter || '';
        if (key === 'custom') {
          openTaskFilterModal();
          return;
        }
        toggleTaskFilter(key);
      }
    });
  });
}

function setupClearFilterChip() {
  const chip = document.getElementById('clearFilterChip');
  if (!chip) return;
  chip.addEventListener('click', clearTaskFilter);
  chip.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      clearTaskFilter();
    }
  });
}

function toggleTaskFilter(filterKey) {
  const next = state.taskFilter === filterKey ? '' : filterKey;
  state.taskFilter = next;
  state.taskFilterStart = null;
  state.taskFilterEnd = null;
  renderTaskList();
}

function updateTaskChipActiveState() {
  const clearChip = document.getElementById('clearFilterChip');
  document.querySelectorAll('.task-chip').forEach((chip) => {
    const key = chip.dataset.filter || '';
    if (key === 'custom') {
      const hasAny =
        (state.taskFilter && state.taskFilter !== '') ||
        state.taskFilterStart ||
        state.taskFilterEnd ||
        state.taskFilterCompanyId ||
        state.taskFilterSequenceId ||
        state.taskFilterType ||
        state.taskFilterOpportunityOnly;
      const isQuick = ['today', 'overdue', 'week'].includes(state.taskFilter);
      const isCustom = hasAny && (!state.taskFilter || !isQuick);
      chip.classList.toggle('active', isCustom);
    } else {
      chip.classList.toggle('active', key && key === state.taskFilter);
    }
  });
  if (clearChip) {
    const hasFilter =
      (state.taskFilter && state.taskFilter !== '') ||
      state.taskFilterStart ||
      state.taskFilterEnd ||
      state.taskFilterCompanyId ||
      state.taskFilterSequenceId ||
      state.taskFilterType ||
      state.taskFilterOpportunityOnly;
    clearChip.classList.toggle('hidden', !hasFilter);
  }
}

function openTaskFilterModal() {
  const modal = document.getElementById('taskFilterModal');
  const select = document.getElementById('taskFilterSelect');
  const startInput = document.getElementById('taskFilterStart');
  const endInput = document.getElementById('taskFilterEnd');
  const rangeInputs = document.getElementById('customRangeInputs');
  const companyInput = document.getElementById('taskFilterCompanyInput');
  const sequenceSelect = document.getElementById('taskFilterSequenceSelect');
  const typeSelect = document.getElementById('taskFilterTypeSelect');
  const oppCheckbox = document.getElementById('taskFilterOpportunity');
  if (!modal || !select || !startInput || !endInput || !rangeInputs || !companyInput || !sequenceSelect || !typeSelect || !oppCheckbox) return;

  populateFilterDropdowns();

  const current = state.taskFilter || '';
  select.value = current;
  startInput.value = state.taskFilterStart || '';
  endInput.value = state.taskFilterEnd || '';
  rangeInputs.classList.toggle('hidden', current !== 'range');
  companyInput.value = state.taskFilterCompanyId ? getCompanyName(state.taskFilterCompanyId) || '' : '';
  sequenceSelect.value = state.taskFilterSequenceId || '';
  typeSelect.value = state.taskFilterType || '';
  oppCheckbox.checked = !!state.taskFilterOpportunityOnly;
  modal.classList.remove('hidden');
  modal.addEventListener('click', handleTaskFilterBackdrop);
}

function toggleTaskFilterModal(show = true) {
  const modal = document.getElementById('taskFilterModal');
  if (!modal) return;
  if (!show) {
    modal.classList.add('hidden');
    modal.removeEventListener('click', handleTaskFilterBackdrop);
  } else {
    modal.classList.remove('hidden');
    modal.addEventListener('click', handleTaskFilterBackdrop);
  }
}

function handleTaskFilterApply(event) {
  event.preventDefault();
  const statusEl = document.getElementById('taskFilterStatus');
  const startInput = document.getElementById('taskFilterStart');
  const endInput = document.getElementById('taskFilterEnd');
  const select = document.getElementById('taskFilterSelect');
  const companyInput = document.getElementById('taskFilterCompanyInput');
  const sequenceSelect = document.getElementById('taskFilterSequenceSelect');
  const typeSelect = document.getElementById('taskFilterTypeSelect');
  const oppCheckbox = document.getElementById('taskFilterOpportunity');
  if (!select) return;
  const choice = select.value || '';
  const rangeInputs = document.getElementById('customRangeInputs');
  if (rangeInputs) rangeInputs.classList.toggle('hidden', choice !== 'range');

  if (choice === 'range') {
    const startVal = startInput.value;
    const endVal = endInput.value;
    if (!startVal || !endVal) {
      showStatus(statusEl, 'Select both start and end dates.', 'error');
      return;
    }
    const start = parseTaskDate(startVal);
    const end = parseTaskDate(endVal);
    if (!start || !end || end < start) {
      showStatus(statusEl, 'End date must be on or after start date.', 'error');
      return;
    }
    state.taskFilter = 'range';
    state.taskFilterStart = startVal;
    state.taskFilterEnd = endVal;
  } else {
    state.taskFilter = choice;
    state.taskFilterStart = null;
    state.taskFilterEnd = null;
  }
  state.taskFilter = choice;
  state.taskFilterCompanyId = resolveCompanyId(companyInput ? companyInput.value : '');
  state.taskFilterSequenceId = sequenceSelect ? sequenceSelect.value : '';
  state.taskFilterType = typeSelect ? typeSelect.value : '';
  state.taskFilterOpportunityOnly = oppCheckbox ? oppCheckbox.checked : false;
  showStatus(statusEl, '');
  toggleTaskFilterModal(false);
  renderTaskList();
}

function handleTaskFilterOptionChange(event) {
  const select = document.getElementById('taskFilterSelect');
  if (!select || event.target !== select) return;
  const choice = select.value;
  const rangeInputs = document.getElementById('customRangeInputs');
  if (!rangeInputs) return;
  rangeInputs.classList.toggle('hidden', choice !== 'range');
}

function clearTaskFilter() {
  state.taskFilter = '';
  state.taskFilterStart = null;
  state.taskFilterEnd = null;
  state.taskFilterCompanyId = '';
  state.taskFilterSequenceId = '';
  state.taskFilterType = '';
  state.taskFilterOpportunityOnly = false;
  toggleTaskFilterModal(false);
  renderTaskList();
}

function handleTaskFilterBackdrop(event) {
  const modal = document.getElementById('taskFilterModal');
  const content = modal ? modal.querySelector('.modal-content') : null;
  if (!modal || !content) return;
  const clickOnBackdrop = event.target === modal;
  if (clickOnBackdrop) {
    toggleTaskFilterModal(false);
  }
}

function updateTaskCounters() {
  const todayEl = document.getElementById('todayCount');
  const overdueEl = document.getElementById('overdueCount');
  const weekEl = document.getElementById('weekCount');
  if (!todayEl || !overdueEl || !weekEl) return;
  let todayCount = 0;
  let overdueCount = 0;
  let weekCount = 0;
  const today = startOfDay(new Date());
  const weekEnd = startOfDay(new Date());
  weekEnd.setDate(weekEnd.getDate() + 7);

  (state.tasks || []).forEach((task) => {
    const dateObj = parseTaskDate(task.due_date);
    if (!dateObj) return;
    if (dateObj < today && (task.status || '').toLowerCase() !== 'done') overdueCount += 1;
    if (dateObj.getTime() === today.getTime()) todayCount += 1;
    if (dateObj >= today && dateObj <= weekEnd) weekCount += 1;
  });

  todayEl.textContent = todayCount;
  overdueEl.textContent = overdueCount;
  weekEl.textContent = weekCount;
}

function toggleTaskModal(show = true) {
  const modal = document.getElementById('taskModal');
  const statusEl = document.getElementById('taskModalStatus');
  const form = document.getElementById('taskForm');
  const contactSelect = document.getElementById('taskModalContactSelect');
  const companyInput = document.getElementById('taskModalCompanyInput');
  const typeSelect = document.getElementById('taskTypeSelect');
  const templateInput = document.getElementById('taskTemplateInput');
  const templateLabel = document.getElementById('taskTemplateLabel');
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
  if (show) {
    populateTaskTemplateSelect();
    modal.addEventListener('click', handleTaskModalBackdrop);
  } else {
    modal.removeEventListener('click', handleTaskModalBackdrop);
  }
  if (statusEl) showStatus(statusEl, '');
  if (show) {
    if (form) form.reset();
    if (companyInput) companyInput.value = '';
    if (contactSelect) {
      contactSelect.innerHTML = '<option value="">Select a contact</option>';
      contactSelect.value = '';
      contactSelect.disabled = true;
    }
    if (typeSelect) typeSelect.value = 'email';
    if (templateInput) templateInput.value = '';
    if (templateLabel) templateLabel.classList.remove('hidden');
  }
}

function populateCompanySelect() {
  const select = document.getElementById('contactCompanySelect');
  const options = ['<option value="">Select a company</option>'];
  state.companies.forEach((company) => {
    options.push(`<option value="${company.id}">${company.name}</option>`);
  });
  select.innerHTML = options.join('');
}

function populateContactSelect() {
  const select = document.getElementById('taskContactSelect');
  const options = ['<option value="">Select a contact</option>'];
  state.contacts.forEach((contact) => {
    const company = state.companies.find((c) => c.id === contact.company_id);
    const companyName = company ? company.name : 'Unknown company';
    options.push(
      `<option value="${contact.id}">${contact.first_name} ${contact.last_name} - ${companyName}</option>`
    );
  });
  if (select) {
    select.innerHTML = options.join('');
    if (state.selectedContactId) {
      select.value = state.selectedContactId;
    }
  }

  const modalCompanyDatalist = document.getElementById('taskModalCompanyOptions');
  if (modalCompanyDatalist) {
    modalCompanyDatalist.innerHTML = '';
  }

  const modalContactSelect = document.getElementById('taskModalContactSelect');
  if (modalContactSelect) {
    modalContactSelect.innerHTML = '<option value="">Select a contact</option>';
  }

  populateTaskTemplateSelect();
}

function populateOpportunityCompanySelect(searchTerm = '') {
  const datalist = document.getElementById('opportunityCompanyOptions');
  if (!datalist) return;
  const term = (searchTerm || '').trim().toLowerCase();
  const filtered = state.companies
    .filter((company) => {
      if (!term) return true;
      const name = company.name || '';
      return name.toLowerCase().includes(term);
    })
    .slice(0, 4);
  const options = [];
  if (filtered.length === 0) {
    options.push('<option value="No company found with that name" disabled>No company found with that name</option>');
  } else {
    filtered.forEach((company) => {
      options.push(`<option value="${company.name}"></option>`);
    });
  }
  datalist.innerHTML = options.join('');
}

function refreshOpportunityCompanyDatalist(inputEl) {
  if (!inputEl) return;
  const currentList = inputEl.getAttribute('list') || '';
  if (!currentList) return;
  inputEl.setAttribute('list', '');
  requestAnimationFrame(() => inputEl.setAttribute('list', currentList));
}

function ensureContactSuggestionBox() {
  let box = document.getElementById('contactSuggestionsBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'contactSuggestionsBox';
    box.style.position = 'absolute';
    box.style.zIndex = '2000';
    box.style.background = '#fff';
    box.style.border = '1px solid #ccc';
    box.style.borderRadius = '6px';
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
    box.style.padding = '6px 0';
    box.style.minWidth = '220px';
    box.style.maxWidth = '480px';
    box.style.maxHeight = '240px';
    box.style.overflowY = 'auto';
    box.style.fontSize = '14px';
    box.style.display = 'none';
    document.body.appendChild(box);
  }
  return box;
}

function hideContactSuggestionBox() {
  const box = document.getElementById('contactSuggestionsBox');
  if (box) box.style.display = 'none';
}

function renderContactSuggestions(anchorInput) {
  if (!anchorInput) return;
  if (!state.contacts || state.contacts.length === 0) {
    loadContacts().then(() => renderContactSuggestions(anchorInput));
    return;
  }
  if (!anchorInput) return;
  const box = ensureContactSuggestionBox();
  const term = (anchorInput.value || '').trim().toLowerCase();
  const matches = state.contacts
    .filter((c) => {
      const label = buildContactLabel(c).toLowerCase();
      return term ? label.includes(term) : true;
    })
    .slice(0, 5);

  if (matches.length === 0) {
    box.innerHTML = `<div style="padding:8px 12px;color:#666;">No contact found</div>`;
  } else {
    box.innerHTML = matches
      .map(
        (c) => `
          <div class="contact-suggestion" data-contact-id="${c.id}" data-contact-label="${buildContactLabel(c)}" style="padding:8px 12px; cursor:pointer;">
            ${buildContactLabel(c)}
          </div>
        `
      )
      .join('');
  }

  const rect = anchorInput.getBoundingClientRect();
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;
  box.style.left = `${rect.left + scrollX}px`;
  box.style.top = `${rect.bottom + scrollY + 4}px`;
  box.style.width = `${rect.width}px`;
  box.style.display = 'block';

  box.querySelectorAll('.contact-suggestion').forEach((el) => {
    el.addEventListener('mouseover', () => {
      el.style.background = '#f0f6ff';
    });
    el.addEventListener('mouseleave', () => {
      el.style.background = 'transparent';
    });
    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const label = el.dataset.contactLabel || '';
      anchorInput.value = label;
      const changeEvent = new Event('change', { bubbles: true });
      anchorInput.dispatchEvent(changeEvent);
      hideContactSuggestionBox();
    });
  });
}

function ensureCompanySuggestionBox() {
  let box = document.getElementById('opportunityCompanySuggestions');
  if (!box) {
    box = document.createElement('div');
    box.id = 'opportunityCompanySuggestions';
    box.style.position = 'absolute';
    box.style.zIndex = '2000';
    box.style.background = '#fff';
    box.style.border = '1px solid #ccc';
    box.style.borderRadius = '6px';
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
    box.style.padding = '6px 0';
    box.style.minWidth = '200px';
    box.style.maxWidth = '420px';
    box.style.maxHeight = '220px';
    box.style.overflowY = 'auto';
    box.style.fontSize = '14px';
    box.style.display = 'none';
    document.body.appendChild(box);
  }
  return box;
}

function hideCompanySuggestionBox() {
  const box = document.getElementById('opportunityCompanySuggestions');
  if (box) box.style.display = 'none';
}

function ensureTaskCompanySuggestionBox() {
  let box = document.getElementById('taskCompanySuggestions');
  if (!box) {
    box = document.createElement('div');
    box.id = 'taskCompanySuggestions';
    box.style.position = 'absolute';
    box.style.zIndex = '2000';
    box.style.background = '#fff';
    box.style.border = '1px solid #ccc';
    box.style.borderRadius = '6px';
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
    box.style.padding = '6px 0';
    box.style.minWidth = '220px';
    box.style.maxWidth = '480px';
    box.style.maxHeight = '240px';
    box.style.overflowY = 'auto';
    box.style.fontSize = '14px';
    box.style.display = 'none';
    document.body.appendChild(box);
  }
  return box;
}

function hideTaskCompanySuggestionBox() {
  const box = document.getElementById('taskCompanySuggestions');
  if (box) box.style.display = 'none';
}

function renderCompanySuggestionsForTask(anchorInput) {
  if (!anchorInput) return;
  if (!state.companies || state.companies.length === 0) {
    loadCompanies().then(() => renderCompanySuggestionsForTask(anchorInput));
    return;
  }
  const box = ensureTaskCompanySuggestionBox();
  const term = (anchorInput.value || '').trim().toLowerCase();
  const matches = state.companies
    .filter((company) => {
      const name = company.name || '';
      return term ? name.toLowerCase().includes(term) : true;
    })
    .slice(0, 5);

  if (matches.length === 0) {
    box.innerHTML = `<div style="padding:8px 12px;color:#666;">No company found</div>`;
  } else {
    box.innerHTML = matches
      .map(
        (company) => `
          <div class="company-suggestion task-company-suggestion" data-company-id="${company.id}" data-company-name="${company.name || ''}" style="padding:8px 12px; cursor:pointer;">
            ${company.name || ''}
          </div>
        `
      )
      .join('');
  }

  const rect = anchorInput.getBoundingClientRect();
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;
  box.style.left = `${rect.left + scrollX}px`;
  box.style.top = `${rect.bottom + scrollY + 4}px`;
  box.style.width = `${rect.width}px`;
  box.style.display = 'block';

  box.querySelectorAll('.task-company-suggestion').forEach((el) => {
    el.addEventListener('mouseover', () => {
      el.style.background = '#f0f6ff';
    });
    el.addEventListener('mouseleave', () => {
      el.style.background = 'transparent';
    });
    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const name = el.dataset.companyName || '';
      anchorInput.value = name;
      populateTaskModalContacts(name);
      hideTaskCompanySuggestionBox();
    });
  });
}

function populateTaskModalContacts(companyEntry) {
  const select = document.getElementById('taskModalContactSelect');
  if (!select) return;
  const companyId = resolveCompanyId(companyEntry || '');
  const options = ['<option value="">Select a contact</option>'];
  const filtered =
    companyId && state.contacts.length > 0
      ? state.contacts.filter((c) => String(c.company_id) === String(companyId))
      : [];
  if (filtered.length === 0) {
    options.push('<option value="">No contacts in company</option>');
  } else {
    filtered.forEach((contact) => {
      options.push(`<option value="${contact.id}">${buildContactLabel(contact)}</option>`);
    });
  }
  select.innerHTML = options.join('');
  select.disabled = false;
  select.value = '';
}

function populateTaskTemplateSelect() {
  const taskTemplateInput = document.getElementById('taskTemplateInput');
  if (taskTemplateInput) taskTemplateInput.value = '';
}

function handleTaskTypeChange() {
  const typeSelect = document.getElementById('taskTypeSelect');
  const templateLabel = document.getElementById('taskTemplateLabel');
  if (!typeSelect || !templateLabel) return;
  const isEmail = typeSelect.value === 'email';
  templateLabel.classList.toggle('hidden', !isEmail);
}

function openTemplatePreviewForTask(task) {
  if (!task) return;
  if (task.template_subject || task.template_body) {
    openTaskTemplateSnapshot(task);
    return;
  }

  const idx =
    task.template_id != null
      ? state.templates.findIndex((t) => String(t.id) === String(task.template_id))
      : -1;
  if (idx >= 0) {
    state.selectedTemplateIndex = idx;
    state.selectedTemplateId = task.template_id;
    const contact = state.contacts.find((c) => String(c.id) === String(task.contact_id));
    if (contact) {
      const input = document.getElementById('templateContactSelect');
      if (input) input.value = buildContactLabel(contact);
      updateTemplatePreview(contact.id);
      updateTemplatePreviewContactEmail(contact.id);
    } else {
      updateTemplatePreview();
      updateTemplatePreviewContactEmail('');
    }
    openTemplatePreview(idx, contact ? contact.id : null);
  }
}

function openTaskTemplateSnapshot(task) {
  const modal = document.getElementById('templatePreviewModal');
  if (!modal) return;
  const titleEl = document.getElementById('templatePreviewTitle');
  const contactInput = document.getElementById('templateContactSelect');
  const subjectEl = document.getElementById('previewSubject');
  const bodyEl = document.getElementById('previewBody');
  const snapshotTpl = { subject: task.template_subject || '', body: task.template_body || '' };
  const contact =
    state.contacts.find((c) => String(c.id) === String(task.contact_id)) || null;
  if (titleEl) {
    titleEl.innerHTML = `Preview of <strong>${task.template_subject || 'Task template'}</strong>`;
  }
  if (contactInput) {
    contactInput.value = contact ? buildContactLabel(contact) : '';
    contactInput.disabled = true;
  }
  const render = renderTemplateForContact(snapshotTpl, contact?.id || null);
  if (subjectEl) subjectEl.innerHTML = render.subjectHtml || '-';
  if (bodyEl) bodyEl.innerHTML = render.bodyHtml || '';
  updateTemplatePreviewContactEmail(contact?.id || '');
  toggleTemplatePreviewModal(true);
}

function handleTaskModalBackdrop(event) {
  const modal = document.getElementById('taskModal');
  const content = document.querySelector('#taskModal .modal-content');
  if (!modal || !content) return;
  const clickOnBackdrop = event.target === modal || !content.contains(event.target);
  if (clickOnBackdrop) toggleTaskModal(false);
}

function renderCompanySuggestions(anchorInput) {
  if (!anchorInput) return;
  const box = ensureCompanySuggestionBox();
  const term = (anchorInput.value || '').trim().toLowerCase();
  const matches = state.companies
    .filter((company) => {
      const name = company.name || '';
      return term ? name.toLowerCase().includes(term) : true;
    })
    .slice(0, 4);

  if (matches.length === 0) {
    box.innerHTML = `<div style="padding:8px 12px;color:#666;">No company found with that name</div>`;
  } else {
    box.innerHTML = matches
      .map(
        (company) => `
          <div class="company-suggestion" data-company-id="${company.id}" data-company-name="${company.name || ''}" style="padding:8px 12px; cursor:pointer;">
            ${company.name || ''}
          </div>
        `
      )
      .join('');
  }

  const rect = anchorInput.getBoundingClientRect();
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;
  box.style.left = `${rect.left + scrollX}px`;
  box.style.top = `${rect.bottom + scrollY + 4}px`;
  box.style.width = `${rect.width}px`;
  box.style.display = 'block';

  box.querySelectorAll('.company-suggestion').forEach((el) => {
    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const name = el.dataset.companyName || '';
      anchorInput.value = name;
      const companyId = resolveCompanyId(name);
      populateOpportunityContactSelect(companyId);
      hideCompanySuggestionBox();
    });
  });
}

function getPipelineSteps(pipelineId) {
  if (!pipelineId) return [];
  const stages = state.pipelineStages[pipelineId] || [];
  return stages;
}

function populateOpportunityStageSelect(pipelineIdOverride = null) {
  const select = document.getElementById('opportunityStageSelect');
  if (!select) return;
  const pipelineId =
    pipelineIdOverride || state.opportunityFormPipelineId || state.selectedPipelineId || '';
  const usingEditingStages = state.isEditingPipeline && String(pipelineId) === String(state.selectedPipelineId);
  const steps = pipelineId
    ? usingEditingStages
      ? state.editingStages
      : getPipelineSteps(pipelineId)
    : [];
  const options = ['<option value="">Select a step</option>'];
  steps.forEach((step) => {
    options.push(`<option value="${step.id}">${step.name}</option>`);
  });
  select.innerHTML = options.join('');
  select.disabled = steps.length === 0;
}

function populateOpportunityContactSelect(companyId) {
  const select = document.getElementById('opportunityContactSelect');
  if (!select) return;
  const options = ['<option value="">Optional contact</option>'];
  const filteredContacts = companyId
    ? state.contacts.filter((contact) => String(contact.company_id) === String(companyId))
    : state.contacts;

  filteredContacts.forEach((contact) => {
    options.push(
      `<option value="${contact.id}">${contact.first_name || ''} ${contact.last_name || ''}</option>`
    );
  });
  select.innerHTML = options.join('');
  select.value = '';
  select.disabled = !companyId;
}

function populateOpportunityPipelineSelect() {
  const select = document.getElementById('opportunityPipelineSelect');
  if (!select) return;
  const options = ['<option value="">Select pipeline</option>'];
  state.pipelines.forEach((p) => {
    options.push(`<option value="${p.id}">${p.name || 'Untitled'}</option>`);
  });
  select.innerHTML = options.join('');
  const defaultPipelineId =
    state.opportunityFormPipelineId ||
    (state.pipelines.length > 0 ? String(state.pipelines[0].id) : '');
  if (defaultPipelineId) {
    select.value = defaultPipelineId;
    state.opportunityFormPipelineId = defaultPipelineId;
  } else {
    select.value = '';
    state.opportunityFormPipelineId = '';
  }
  select.disabled = state.pipelines.length === 0;
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  const nameInput = document.getElementById('companyName');
  const phoneInput = document.getElementById('companyPhone');
  const addressInput = document.getElementById('companyAddress');
  const cityInput = document.getElementById('companyCity');
  const postalInput = document.getElementById('companyPostal');
  const competitorSelect = document.getElementById('companyCompetitor');
  const competitorOtherInput = document.getElementById('companyCompetitorOther');
  const statusEl = document.getElementById('companyStatus');
  const modalStatusEl = document.getElementById('companyModalStatus');
  const submitButton = event.target.querySelector('button[type="submit"]');

  const name = nameInput.value.trim();
  if (!name) {
    showStatus(modalStatusEl || statusEl, 'Company name is required.', 'error');
    return;
  }

  const competitorValue = competitorSelect?.value || '';
  const competitor =
    competitorValue === 'Other'
      ? (competitorOtherInput?.value.trim() || null)
      : competitorValue || null;

  if (competitorValue === 'Other' && !competitor) {
    showStatus(modalStatusEl || statusEl, 'Enter competitor name when selecting Other.', 'error');
    return;
  }

  const newCompany = {
    name,
    phone: phoneInput.value.trim() || null,
    address: addressInput.value.trim() || null,
    city: cityInput.value.trim() || null,
    postal_code: postalInput.value.trim() || null,
    competitor,
    prd: (document.getElementById('companyPrd')?.value.trim() || null),
    industry: (document.getElementById('companyIndustry')?.value.trim() || null),
  };

  setButtonLoading(submitButton, true);
  const { error } = await supabase.from('companies').insert(newCompany);
  setButtonLoading(submitButton, false);

  if (error) {
    console.error('Failed to add company', error);
    showStatus(modalStatusEl || statusEl, 'Could not save company.', 'error');
    return;
  }

  event.target.reset();
  showStatus(modalStatusEl || statusEl, 'Company saved!', 'success');
  toggleCompanyModal(false);
  loadCompanies();
}

async function handleContactSubmit(event) {
  event.preventDefault();
  const companySelect = document.getElementById('contactCompanySelect');
  const firstNameInput = document.getElementById('contactFirstName');
  const lastNameInput = document.getElementById('contactLastName');
  const emailInput = document.getElementById('contactEmail');
  const phoneInput = document.getElementById('contactPhone');
  const spokeToInput = document.getElementById('contactSpokeTo');
  const statusEl = document.getElementById('contactStatus');
  const submitButton = event.target.querySelector('button[type="submit"]');

  const companyId = companySelect.value;
  if (!companyId) {
    showStatus(statusEl, 'Select a company for this contact.', 'error');
    return;
  }

  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  if (!firstName) {
    showStatus(statusEl, 'First name is required.', 'error');
    return;
  }

  const emailRaw = (emailInput.value || '').trim().toLowerCase();
  if (emailRaw) {
    setButtonLoading(submitButton, true);
    const { data: dupMatches, error: dupError } = await supabase
      .from('contacts')
      .select('id,first_name,last_name,company_id,email')
      .ilike('email', emailRaw);
    setButtonLoading(submitButton, false);
    if (dupError) {
      console.error('Failed to check duplicate email', dupError);
      showStatus(statusEl, 'Could not validate email uniqueness.', 'error');
      return;
    }
    const dup = (dupMatches || []).find(
      (c) => (c.email || '').trim().toLowerCase() === emailRaw
    );
    if (dup) {
      const company = state.companies.find((co) => String(co.id) === String(dup.company_id));
      const label =
        buildContactLabel(dup) || `${dup.first_name || ''} ${dup.last_name || ''}`.trim();
      const companyName = company?.name ? ` - ${company.name}` : '';
      showStatus(
        statusEl,
        `Contact already exists with this email: ${label}${companyName}`,
        'error'
      );
      return;
    }
  }

  const newContact = {
    company_id: companyId,
    first_name: firstName,
    last_name: lastName,
    email: emailRaw || null,
    phone: phoneInput.value.trim() || null,
    spoke_to: spokeToInput.value.trim() || null,
  };

  setButtonLoading(submitButton, true);
  const { error } = await supabase.from('contacts').insert(newContact);
  setButtonLoading(submitButton, false);

  if (error) {
    console.error('Failed to add contact', error);
    showStatus(statusEl, 'Could not save contact.', 'error');
    return;
  }

  event.target.reset();
  showStatus(statusEl, 'Contact saved!', 'success');
  loadContacts();
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  const companyInput = document.getElementById('taskModalCompanyInput');
  const contactSelect = document.getElementById('taskModalContactSelect');
  const typeSelect = document.getElementById('taskTypeSelect');
  const templateInput = document.getElementById('taskTemplateInput');
  const dueDateInput = document.getElementById('taskDueDate');
  const statusEl = document.getElementById('taskModalStatus');
  const submitButton = event.target.querySelector('button[type="submit"]');

  const companyId = resolveCompanyId(companyInput ? companyInput.value : '');
  if (!companyId) {
    showStatus(statusEl, 'Select a company before adding a task.', 'error');
    return;
  }

  const contactId = contactSelect && contactSelect.value ? Number(contactSelect.value) : null;

  const companyName =
    state.companies.find((c) => String(c.id) === String(companyId))?.name ||
    companyInput?.value?.trim() ||
    '';
  const typeValue = (typeSelect && typeSelect.value) || 'email';
  const typeLabel = typeValue === 'call' ? 'Call' : 'Email';
  const title = `${typeLabel} - ${companyName || 'Task'}`;
  let templateId = null;
  if (templateInput && templateInput.value) {
    const match =
      state.templates.find((tpl) => (tpl.name || '') === templateInput.value) ||
      state.templates.find((tpl) => String(tpl.id) === templateInput.value);
    if (match) templateId = match.id;
  }
  if (templateId && !contactId) {
    showStatus(statusEl, 'Select a contact when attaching a template.', 'error');
    return;
  }

  const newTask = {
    contact_id: contactId,
    company_id: companyId,
    title,
    due_date: dueDateInput.value || null,
    template_id: templateId,
    task_type: typeValue,
  };

  setButtonLoading(submitButton, true);
  const { error } = await supabase.from('tasks').insert(newTask);
  setButtonLoading(submitButton, false);

  if (error) {
    console.error('Failed to add task', error);
    showStatus(statusEl, 'Could not save task.', 'error');
    return;
  }

  event.target.reset();
  showStatus(statusEl, 'Task saved!', 'success');
  state.selectedContactId = contactId;
  await refreshTaskViews();
  toggleTaskModal(false);
}

function handleOpportunityPipelineChange() {
  const pipelineSelect = document.getElementById('opportunityPipelineSelect');
  const stageSelect = document.getElementById('opportunityStageSelect');
  const pipelineId = pipelineSelect ? pipelineSelect.value : '';
  state.opportunityFormPipelineId = pipelineId || '';
  populateOpportunityStageSelect(pipelineId);
  const steps = getPipelineSteps(pipelineId);
  if (stageSelect) {
    stageSelect.value = steps.length > 0 ? steps[0].id : '';
  }
}

async function handleOpportunitySubmit(event) {
  event.preventDefault();
  const companyInput = document.getElementById('opportunityCompanyInput');
  const contactSelect = document.getElementById('opportunityContactSelect');
  const valueInput = document.getElementById('opportunityValue');
  const stageSelect = document.getElementById('opportunityStageSelect');
  const pipelineSelect = document.getElementById('opportunityPipelineSelect');
  const statusEl = document.getElementById('opportunityStatus');
  const submitButton = event.target.querySelector('button[type="submit"]');

  const companyId = resolveCompanyId(companyInput ? companyInput.value : '');
  const stepValue = stageSelect.value;
  const pipelineId = pipelineSelect ? pipelineSelect.value : state.opportunityFormPipelineId;
  if (!companyId) {
    showStatus(statusEl, 'Select a company for this opportunity.', 'error');
    return;
  }
  if (!pipelineId) {
    showStatus(statusEl, 'Select a pipeline for this opportunity.', 'error');
    return;
  }
  if (!stepValue) {
    showStatus(statusEl, 'Select a step for this opportunity.', 'error');
    return;
  }

  let numericValue = null;
  const rawValue = valueInput ? valueInput.value.trim() : '';
  if (rawValue) {
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed) || parsed < 0) {
      showStatus(statusEl, 'Value must be a number 0 or greater.', 'error');
      return;
    }
    numericValue = Number(parsed.toFixed(2));
    if (valueInput) valueInput.value = numericValue.toFixed(2);
  }

  const companyName =
    state.companies.find((c) => String(c.id) === String(companyId))?.name ||
    (companyInput?.value || '').trim() ||
    'Company';
  const name = `${companyName} - Opportunity`;

  const payload = {
    company_id: companyId,
    contact_id: contactSelect.value || null,
    name,
    stage_id: Number(stepValue),
    pipeline_id: Number(pipelineId),
    value: numericValue,
  };

  setButtonLoading(submitButton, true, 'Creating...');
  const created = await createOpportunity(payload);
  setButtonLoading(submitButton, false);

  if (!created) {
    showStatus(statusEl, 'Could not create opportunity.', 'error');
    return;
  }

  const companyDetailModal = document.getElementById('companyDetailModal');
  const companyWasOpen =
    companyDetailModal && !companyDetailModal.classList.contains('hidden') && state.selectedCompanyId;
  const companyIdToRefresh = companyWasOpen ? state.selectedCompanyId : null;

  event.target.reset();
  if (valueInput) valueInput.value = '';
  state.selectedPipelineId = pipelineId;
  showStatus(statusEl, 'Opportunity added!', 'success');
  toggleOpportunityForm(false);

  await loadOpportunities();
  if (companyIdToRefresh) {
    openCompanyDetail(companyIdToRefresh);
  }
}

async function updateTaskStatus(taskId, newStatus) {
  const statusEl = document.getElementById('taskStatus');
  showStatus(statusEl, 'Updating task...');
  const { error } = await supabase
    .from('tasks')
    .update({ status: newStatus })
    .eq('id', taskId);

  if (error) {
    console.error('Failed to update task', error);
    showStatus(statusEl, 'Could not update task.', 'error');
    return;
  }

  showStatus(statusEl, 'Task updated.', 'success');
  if (state.selectedContactId) {
    loadTasksForContact(state.selectedContactId);
  }
}

function ensureTemplateSuggestionBox() {
  let box = document.getElementById('taskTemplateSuggestions');
  if (!box) {
    box = document.createElement('div');
    box.id = 'taskTemplateSuggestions';
    box.style.position = 'absolute';
    box.style.zIndex = '2000';
    box.style.background = '#fff';
    box.style.border = '1px solid #ccc';
    box.style.borderRadius = '6px';
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
    box.style.padding = '6px 0';
    box.style.minWidth = '220px';
    box.style.maxWidth = '480px';
    box.style.maxHeight = '240px';
    box.style.overflowY = 'auto';
    box.style.fontSize = '14px';
    box.style.display = 'none';
    document.body.appendChild(box);
  }
  return box;
}

function hideTemplateSuggestionBox() {
  const box = document.getElementById('taskTemplateSuggestions');
  if (box) box.style.display = 'none';
}

// Legacy helper to satisfy calls when templates load; add-select no longer used.
function populateSequenceTemplateSelect() {
  const select = document.getElementById('sequenceStepTemplateSelect');
  if (!select) return;
  // Populate if the legacy select exists
  const options = ['<option value="">Select a template</option>'];
  (state.templates || []).forEach((tpl) => {
    options.push(`<option value="${tpl.id}">${tpl.name || 'Untitled'}</option>`);
  });
  select.innerHTML = options.join('');
}

function ensureSequenceSuggestionBox() {
  let box = document.getElementById('sequenceSuggestionsBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'sequenceSuggestionsBox';
    box.style.position = 'absolute';
    box.style.zIndex = '2500';
    box.style.background = '#fff';
    box.style.border = '1px solid #ccc';
    box.style.borderRadius = '6px';
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
    box.style.padding = '6px 0';
    box.style.minWidth = '200px';
    box.style.maxWidth = '420px';
    box.style.maxHeight = '220px';
    box.style.overflowY = 'auto';
    document.body.appendChild(box);
  }
  return box;
}

function hideSequenceSuggestionBox() {
  const box = document.getElementById('sequenceSuggestionsBox');
  if (box) box.style.display = 'none';
}

function renderSequenceSuggestions(anchorInput) {
  if (!anchorInput) return;
  if (!state.sequences || state.sequences.length === 0) {
    loadSequencesAndSteps().then(() => renderSequenceSuggestions(anchorInput));
    return;
  }
  const box = ensureSequenceSuggestionBox();
  const term = (anchorInput.value || '').trim().toLowerCase();
  const matches = state.sequences
    .filter((s) => {
      const name = s.name || 'Untitled';
      return term ? name.toLowerCase().includes(term) : true;
    })
    .slice(0, 8);

  if (matches.length === 0) {
    box.innerHTML = `<div style="padding:8px 12px;color:#666;">No sequence found</div>`;
  } else {
    box.innerHTML = matches
      .map(
        (s) => `
          <div class="sequence-suggestion" data-sequence-id="${s.id}" data-sequence-name="${s.name || 'Untitled'}" style="padding:8px 12px; cursor:pointer;">
            ${s.name || 'Untitled'}
          </div>
        `
      )
      .join('');
  }

  const rect = anchorInput.getBoundingClientRect();
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;
  box.style.left = `${rect.left + scrollX}px`;
  box.style.top = `${rect.bottom + scrollY + 4}px`;
  box.style.width = `${rect.width}px`;
  box.style.display = 'block';

  box.querySelectorAll('.sequence-suggestion').forEach((el) => {
    el.addEventListener('mouseover', () => {
      el.style.background = '#f0f6ff';
    });
    el.addEventListener('mouseleave', () => {
      el.style.background = 'transparent';
    });
    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const name = el.dataset.sequenceName || '';
      const id = el.dataset.sequenceId || '';
      anchorInput.value = name;
      anchorInput.dataset.sequenceId = id;
      hideSequenceSuggestionBox();
    });
  });
}

function renderTemplateSuggestions(anchorInput) {
  if (!anchorInput) return;
  if (!state.templates || state.templates.length === 0) {
    loadTemplates().then(() => renderTemplateSuggestions(anchorInput));
    return;
  }
  const box = ensureTemplateSuggestionBox();
  const term = (anchorInput.value || '').trim().toLowerCase();
  const matches = state.templates
    .filter((tpl) => {
      const name = tpl.name || 'Untitled';
      return term ? name.toLowerCase().includes(term) : true;
    })
    .slice(0, 6);

  if (matches.length === 0) {
    box.innerHTML = `<div style="padding:8px 12px;color:#666;">No template found</div>`;
  } else {
    box.innerHTML = matches
      .map(
        (tpl) => `
          <div class="template-suggestion" data-template-id="${tpl.id}" data-template-name="${tpl.name || 'Untitled'}" style="padding:8px 12px; cursor:pointer;">
            ${tpl.name || 'Untitled'}
          </div>
        `
      )
      .join('');
  }

  const rect = anchorInput.getBoundingClientRect();
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;
  box.style.left = `${rect.left + scrollX}px`;
  box.style.top = `${rect.bottom + scrollY + 4}px`;
  box.style.width = `${rect.width}px`;
  box.style.display = 'block';

  box.querySelectorAll('.template-suggestion').forEach((el) => {
    el.addEventListener('mouseover', () => {
      el.style.background = '#f0f6ff';
    });
    el.addEventListener('mouseleave', () => {
      el.style.background = 'transparent';
    });
    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const name = el.dataset.templateName || '';
      const id = el.dataset.templateId || '';
      anchorInput.value = name;
      anchorInput.dataset.templateId = id;
      if (anchorInput.id === 'sequenceStepEditTemplateSearch' || anchorInput.id === 'sequenceStepTemplateSearch') {
        const hidden = document.getElementById('sequenceStepEditTemplateId');
        if (hidden) hidden.value = id;
        const addHidden = document.getElementById('sequenceStepTemplateId');
        if (addHidden) addHidden.value = id;
      }
      hideTemplateSuggestionBox();
    });
  });
}

async function loadTemplates() {
  const statusEl = document.getElementById('templateStatus');
  if (statusEl) showStatus(statusEl, 'Loading templates...');
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load templates', error);
    if (statusEl) showStatus(statusEl, 'Could not load templates.', 'error');
    return;
  }

  state.templates = data || [];
  renderTemplateList();
  populateSequenceTemplateSelect();
  populateTaskTemplateSelect();
  if (statusEl) showStatus(statusEl, `${state.templates.length} template(s) loaded.`, 'success');
}

function insertPlaceholder(value) {
  const active = document.activeElement;
  let target =
    active && (active.id === 'templateSubject' || active.id === 'templateBody')
      ? active
      : document.getElementById(state.lastTemplateInputId) ||
        document.getElementById('templateSubject') ||
        document.getElementById('templateBody');
  if (!target) return;
  insertAtCursor(target, value);
  target.focus();
}

function insertAtCursor(el, text) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const current = el.value;
  el.value = current.slice(0, start) + text + current.slice(end);
  const newPos = start + text.length;
  el.selectionStart = el.selectionEnd = newPos;
}

function renderTemplateList() {
  const container = document.getElementById('templateList');
  if (!container) return;
  if (state.templates.length === 0) {
    container.innerHTML = '<p class="detail-empty">No templates yet.</p>';
    return;
  }

  const searchQuery = (state.templateSearchQuery || '').trim().toLowerCase();
  const filteredTemplates = searchQuery
    ? state.templates.filter((tpl) => (tpl.name || '').toLowerCase().includes(searchQuery))
    : state.templates;

  if (filteredTemplates.length === 0) {
    container.innerHTML = '<p class="detail-empty">No templates match that title.</p>';
    return;
  }

  container.innerHTML = filteredTemplates
    .map((tpl) => {
      const tplIndex = state.templates.indexOf(tpl);
      const bodyLines = (tpl.body || '').split(/\r?\n/);
      const previewLine = bodyLines[0] || '';
      const bodyPreview = bodyLines.length > 1 ? `${previewLine}...` : previewLine;
      return `
        <div class="template-card" data-template-index="${tplIndex}">
          <div class="template-card-header">
            <h4>${tpl.name || 'Untitled'}</h4>
            <button class="inline-btn primary template-edit-btn" data-template-index="${tplIndex}">Edit</button>
          </div>
          <p><strong>Subject:</strong> ${tpl.subject || '-'}</p>
          <p>${bodyPreview}</p>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.template-card').forEach((card) => {
    card.addEventListener('click', () => {
      const idx = card.dataset.templateIndex;
      openTemplatePreview(Number(idx));
    });
  });

  container.querySelectorAll('.template-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const idx = Number(btn.dataset.templateIndex);
      openTemplateEdit(idx);
    });
  });
}

async function handleTemplateSubmit(event) {
  event.preventDefault();
  const nameInput = document.getElementById('templateName');
  const subjectInput = document.getElementById('templateSubject');
  const bodyInput = document.getElementById('templateBody');
  const statusEl = document.getElementById('templateStatus');

  const name = nameInput.value.trim();
  const subject = subjectInput.value.trim();
  const body = bodyInput.value.trim();

  if (!name || !subject || !body) {
    showStatus(statusEl, 'Name, subject, and body are required.', 'error');
    return;
  }

  const isEdit = state.selectedTemplateId != null;
  if (isEdit) {
    const { error, data } = await supabase
      .from('email_templates')
      .update({ name, subject, body })
      .eq('id', state.selectedTemplateId)
      .select()
      .single();
    if (error) {
      console.error('Failed to update template', error);
      showStatus(statusEl, 'Could not save template.', 'error');
      return;
    }
    const idx = state.templates.findIndex((t) => t.id === state.selectedTemplateId);
    if (idx !== -1) state.templates[idx] = data;
  } else {
    const { data, error } = await supabase
      .from('email_templates')
      .insert({ name, subject, body })
      .select()
      .single();
    if (error) {
      console.error('Failed to save template', error);
      showStatus(statusEl, 'Could not save template.', 'error');
      return;
    }
    state.templates.unshift(data);
  }

  renderTemplateList();
  event.target.reset();
  showStatus(statusEl, 'Template saved!', 'success');
  toggleTemplateModal(false);
}

function toggleTemplateModal(show = true) {
  const modal = document.getElementById('templateModal');
  const statusEl = document.getElementById('templateStatus');
  const deleteBtn = document.getElementById('deleteTemplateBtn');
  const titleEl = document.getElementById('templateModalTitle');
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
  if (show) {
    modal.addEventListener('click', handleTemplateModalBackdrop);
  } else {
    modal.removeEventListener('click', handleTemplateModalBackdrop);
  }
  if (statusEl) showStatus(statusEl, '');
  if (show) {
    const form = document.getElementById('templateForm');
    if (form && state.selectedTemplateIndex == null) {
      form.reset();
    }
    if (deleteBtn) deleteBtn.classList.toggle('hidden', state.selectedTemplateIndex == null);
    if (titleEl) titleEl.textContent = state.selectedTemplateIndex == null ? 'New Template' : 'Edit Template';
    const nameInput = document.getElementById('templateName');
    if (nameInput) nameInput.focus();
  } else {
    state.selectedTemplateIndex = null;
    state.selectedTemplateId = null;
    toggleTemplateDeleteModal(false);
  }
}

function handleTemplateModalBackdrop(event) {
  const modal = document.getElementById('templateModal');
  if (modal && event.target === modal) {
    toggleTemplateModal(false);
  }
}

function openTemplatePreview(index, presetContactId = null) {
  if (index == null || index < 0 || index >= state.templates.length) return;
  state.selectedTemplateIndex = index;
  const modal = document.getElementById('templatePreviewModal');
  if (!modal) return;
  const titleEl = document.getElementById('templatePreviewTitle');
  if (titleEl) {
    const name = state.templates[index]?.name || 'Template';
    titleEl.innerHTML = `Preview of <strong>${name}</strong> template`;
  }
  const contactInput = document.getElementById('templateContactSelect');
  const contactList = document.getElementById('templateContactOptions');
  const emailRow = document.getElementById('templateContactEmailRow');
  if (emailRow) emailRow.classList.add('hidden');
  if (contactInput && !presetContactId) contactInput.value = '';
  if (contactList) {
    const options = [];
    state.contacts.forEach((c) => {
      const label = buildContactLabel(c);
      options.push(`<option value="${label}"></option>`);
    });
    contactList.innerHTML = options.join('');
  }
  if (presetContactId) {
    const contact =
      state.contacts.find((c) => String(c.id) === String(presetContactId)) ||
      state.contacts.find((c) => buildContactLabel(c) === presetContactId);
    if (contact) {
      if (contactInput) contactInput.value = buildContactLabel(contact);
      updateTemplatePreview(contact.id);
      updateTemplatePreviewContactEmail(contact.id);
    } else {
      updateTemplatePreview();
      updateTemplatePreviewContactEmail('');
    }
  } else {
    updateTemplatePreview();
  }
  toggleTemplatePreviewModal(true);
}

function toggleTemplatePreviewModal(show = true) {
  const modal = document.getElementById('templatePreviewModal');
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
  if (show) {
    modal.addEventListener('click', handleTemplatePreviewBackdrop);
  } else {
    modal.removeEventListener('click', handleTemplatePreviewBackdrop);
    const contactInput = document.getElementById('templateContactSelect');
    if (contactInput) contactInput.disabled = false;
  }
}

function handleTemplatePreviewContact(event) {
  const selected = event.target.value;
  updateTemplatePreview(selected);
  updateTemplatePreviewContactEmail(selected);
  renderContactSuggestions(event.target);
}

function handleTemplatePreviewBackdrop(event) {
  const modal = document.getElementById('templatePreviewModal');
  const modalContent = document.querySelector('#templatePreviewModal .modal-content');
  if (!modal || !modalContent) return;
  const clickOnBackdrop = event.target === modal || !modalContent.contains(event.target);
  if (clickOnBackdrop) {
    toggleTemplatePreviewModal(false);
  }
}

function updateTemplatePreview(selectedContactId) {
  const subjectEl = document.getElementById('previewSubject');
  const bodyEl = document.getElementById('previewBody');
  if (subjectEl) subjectEl.innerHTML = '-';
  if (bodyEl) bodyEl.innerHTML = '';
  const tpl = state.templates[state.selectedTemplateIndex];
  if (!tpl) return;

  const render = renderTemplateForContact(tpl, selectedContactId);
  if (subjectEl) subjectEl.innerHTML = render.subjectHtml;
  if (bodyEl) bodyEl.innerHTML = render.bodyHtml;
}

function copyTemplateSubject() {
  const subjectEl = document.getElementById('previewSubject');
  if (!subjectEl) return;
  navigator.clipboard.writeText(subjectEl.textContent || '');
}

function copyTemplateBody() {
  const bodyEl = document.getElementById('previewBody');
  if (!bodyEl) return;
  navigator.clipboard.writeText(bodyEl.textContent || '');
}

function renderTemplateForContact(tpl, selectedContactId) {
  const subjectFallback = { plain: tpl?.subject || '', html: tpl?.subject || '' };
  const bodyFallback = { plain: tpl?.body || '', html: tpl?.body || '' };
  if (!tpl) {
    return {
      subjectPlain: subjectFallback.plain,
      subjectHtml: subjectFallback.html,
      bodyPlain: bodyFallback.plain,
      bodyHtml: bodyFallback.html,
    };
  }
  let contact = null;
  if (selectedContactId) {
    contact =
      state.contacts.find((c) => String(c.id) === String(selectedContactId)) ||
      state.contacts.find((c) => buildContactLabel(c) === selectedContactId) ||
      null;
  }
  const company = contact ? state.companies.find((co) => co.id === contact.company_id) : null;

  const replacements = {
    '{{first_name}}': contact?.first_name || '',
    '{{last_name}}': contact?.last_name || '',
    '{{company_name}}': company?.name || '',
    '{{spoke_to}}': contact?.spoke_to || '',
    '{{competitor}}': company?.competitor || '',
    '{{prd}}': company?.prd || '',
    '{{industry}}': company?.industry || '',
  };

  const escapeHtml = (str) =>
    (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const renderText = (text) => {
    const plain = Object.entries(replacements).reduce(
      (acc, [key, value]) => acc.split(key).join(value || key),
      text || ''
    );
    const html = Object.entries(replacements).reduce((acc, [key, value]) => {
      const replacement =
        value && value.trim()
          ? escapeHtml(value)
          : `<span class="placeholder-missing">${key}</span>`;
      return acc.split(key).join(replacement);
    }, escapeHtml(text || ''));
    return { plain, html };
  };

  const subjectRender = renderText(tpl.subject);
  const bodyRender = renderText(tpl.body);

  return {
    subjectPlain: subjectRender.plain,
    subjectHtml: subjectRender.html,
    bodyPlain: bodyRender.plain,
    bodyHtml: bodyRender.html,
  };
}

function openTemplateEdit(index) {
  if (index == null || index < 0 || index >= state.templates.length) return;
  state.selectedTemplateIndex = index;
  state.selectedTemplateId = state.templates[index]?.id ?? null;
  const tpl = state.templates[index];
  const form = document.getElementById('templateForm');
  if (form) {
    const nameInput = document.getElementById('templateName');
    const subjectInput = document.getElementById('templateSubject');
    const bodyInput = document.getElementById('templateBody');
    if (nameInput) nameInput.value = tpl.name || '';
    if (subjectInput) subjectInput.value = tpl.subject || '';
    if (bodyInput) bodyInput.value = tpl.body || '';
  }
  toggleTemplateModal(true);
}

function deleteTemplate() {
  if (state.selectedTemplateIndex == null) {
    toggleTemplateModal(false);
    return;
  }
  if (state.selectedTemplateId == null) {
    toggleTemplateDeleteModal(false);
    return;
  }
  const tplId = state.selectedTemplateId;
  supabase
    .from('sequence_steps')
    .select('id')
    .eq('template_id', tplId)
    .limit(1)
    .then(({ data: seqSteps }) => {
      if (seqSteps && seqSteps.length > 0) {
        alert('Templates cannot be deleted while used in a sequence.');
        return;
      }
      return supabase
        .from('sequence_step_versions')
        .select('id')
        .eq('template_id', tplId)
        .limit(1);
    })
    .then((versionRes) => {
      if (!versionRes) return null;
      const { data: stepVersions } = versionRes;
      if (stepVersions && stepVersions.length > 0) {
        alert('Templates cannot be deleted while used in a sequence.');
        return null;
      }
      return supabase.from('email_templates').delete().eq('id', tplId);
    })
    .then((deleteRes) => {
      if (!deleteRes) return;
      const { error } = deleteRes;
      if (error) {
        console.error('Failed to delete template', error);
        alert('Could not delete template.');
        return;
      }
      state.templates = state.templates.filter((t) => t.id !== tplId);
      state.selectedTemplateIndex = null;
      state.selectedTemplateId = null;
      renderTemplateList();
      toggleTemplateModal(false);
      toggleTemplateDeleteModal(false);
    })
    .catch((err) => {
      console.error('Error deleting template', err);
      alert('Could not delete template.');
    });
}

function toggleTemplateDeleteModal(show = true) {
  const modal = document.getElementById('templateDeleteModal');
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
}

function handleCompanyListAction(event) {
  const row = event.target.closest('tr');
  if (!row || !row.dataset.companyId) return;
  openCompanyDetail(row.dataset.companyId);
}

function updateTemplatePreviewContactEmail(selectedContactId) {
  const row = document.getElementById('templateContactEmailRow');
  const emailSpan = document.getElementById('templateContactEmailValue');
  if (!row || !emailSpan) return;
  const contact =
    state.contacts.find((c) => String(c.id) === String(selectedContactId)) ||
    state.contacts.find((c) => buildContactLabel(c) === selectedContactId);
  if (!contact || !contact.email) {
    row.classList.add('hidden');
    emailSpan.textContent = '-';
    return;
  }
  row.classList.remove('hidden');
  emailSpan.textContent = contact.email;
  emailSpan.dataset.email = contact.email;
}

function handleGenerateEmail() {
  const tpl = state.templates[state.selectedTemplateIndex];
  if (!tpl) {
    alert('No template selected.');
    return;
  }
  const contactInput = document.getElementById('templateContactSelect');
  const selected = contactInput ? contactInput.value : '';
  const contact =
    state.contacts.find((c) => String(c.id) === String(selected)) ||
    state.contacts.find((c) => buildContactLabel(c) === selected);
  const email = contact?.email || document.getElementById('templateContactEmailValue')?.dataset
    ?.email;
  if (!email) {
    alert('Select a contact with an email address.');
    return;
  }
  const render = renderTemplateForContact(tpl, selected);
  const subject = render.subjectPlain || '';
  const body = render.bodyPlain || '';
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}

function buildTaskDetail(task) {
  const contact =
    state.contacts.find((c) => String(c.id) === String(task.contact_id)) || null;
  const company = contact
    ? state.companies.find((co) => String(co.id) === String(contact.company_id))
    : null;
  const template =
    state.templates.find((t) => String(t.id) === String(task.template_id)) || null;
  const sequence =
    state.sequences.find((s) => String(s.id) === String(task.sequence_id)) || null;
  const seqSteps = getSequenceVersionSteps(task.sequence_id, task.sequence_version_id);
  const seqStep =
    seqSteps.find((s) => String(s.id) === String(task.sequence_step_id)) || null;
  const opp =
    state.opportunities.find((o) => String(o.id) === String(task.opportunity_id)) || null;
  const status = (task.status || 'open').toLowerCase();
  const statusLabel = status === 'done' ? 'Completed' : 'Open';
  const statusChip = `
    <span class="chip ${status === 'done' ? 'muted' : 'success'}">
      <span class="dot ${status === 'done' ? 'dot-amber' : 'dot-green'}"></span>${statusLabel}
    </span>
  `;
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const dueLabel = task.due_date
    ? `Due ${dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'No due date';
  const dueChip = `
    <span class="chip warning">
      <span class="dot dot-amber"></span>${dueLabel}
    </span>
  `;
  const typeChip = `<span class="chip muted">${(task.task_type || task.type || 'Task').toUpperCase()} task</span>`;
  const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : '-';
  const templateName = task.template_subject || template?.name || 'Not set';
  const templatePill = `<span class="pill">${templateName}</span>`;
  const viewTemplateLink =
    (task.template_subject || task.template_body || template?.id || template?.name)
      ? `<button type="button" class="link-btn inline" id="taskViewTemplateBtn">View template</button>`
      : '';

  return `
    <div class="task-detail-header">
      <p class="eyebrow">Task Details</p>
      <div class="task-detail-title-row">
        <h2>${task.title || 'Untitled task'}</h2>
        <div class="task-detail-chips">${statusChip}${dueChip}${typeChip}</div>
      </div>
    </div>
    <div class="task-detail-divider"></div>
    <div class="task-detail-grid">
      <div class="task-detail-left">
        <div class="task-detail-row">
          <span class="task-detail-label">Company</span>
          <span class="task-detail-value">${company?.name || '-'}</span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Contact</span>
          <span class="task-detail-value">${contactName || '-'}</span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Due date</span>
          <span class="task-detail-value">${task.due_date || '-'}</span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Template</span>
          <span class="task-detail-value task-template-row">
            ${templatePill}
            ${viewTemplateLink}
          </span>
        </div>
        <div class="task-notes">
          Use this space for any notes or context you want to remember about this task.
        </div>
      </div>
      <div class="task-detail-right">
        <h4>Next step</h4>
        <p>Choose a follow-up date before marking this task complete.</p>
        <label class="task-detail-label" for="taskFollowUpDate" style="margin-top:0.25rem;">Follow-up date</label>
        <input type="date" id="taskFollowUpDate" />
        <p style="font-size:0.95rem;">When you complete this task, a new follow-up task will be created with the date you select above.</p>
        <div class="task-followup-actions">
          ${
            status !== 'done'
              ? '<button type="button" id="taskCompleteBtn" class="primary">Mark as complete</button>'
              : ''
          }
          <button type="button" id="taskEditBtn" class="secondary">Edit task</button>
        </div>
      </div>
    </div>
  `;
}

function openTaskDetail(taskId, resetBackdrop = true) {
  const task = state.tasks.find((t) => String(t.id) === String(taskId));
  const modal = document.getElementById('taskDetailModal');
  const content = document.getElementById('taskDetailContent');
  if (task?.sequence_id) {
    openSequenceTaskModal(task);
    return;
  }
  if (!task || !modal || !content) return;
  content.innerHTML = buildTaskDetail(task);
  const completeBtn = document.getElementById('taskCompleteBtn');
  if (completeBtn) completeBtn.addEventListener('click', () => markTaskComplete(task.id));
  const editBtn = document.getElementById('taskEditBtn');
  if (editBtn) editBtn.addEventListener('click', () => startTaskEdit(task));
  const viewTplBtn = document.getElementById('taskViewTemplateBtn');
  if (viewTplBtn) viewTplBtn.addEventListener('click', () => openTemplatePreviewForTask(task));
  const deleteBtn = document.getElementById('taskDetailDeleteBtn');
  if (deleteBtn) {
    deleteBtn.onclick = () => handleTaskDelete(task.id);
  }
  if (resetBackdrop) modal.addEventListener('click', handleTaskDetailBackdrop);
  modal.classList.remove('hidden');
}

function closeTaskDetail() {
  const modal = document.getElementById('taskDetailModal');
  if (!modal) return;
  modal.removeEventListener('click', handleTaskDetailBackdrop);
  modal.classList.add('hidden');
}

function getOrderedSequenceSteps(sequenceId, sequenceVersionId = null) {
  const steps = getSequenceVersionSteps(sequenceId, sequenceVersionId);
  if (steps.length) {
    return [...steps].sort((a, b) => {
      const posA = a.step_order || a.position || 0;
      const posB = b.step_order || b.position || 0;
      return posA - posB;
    });
  }
  // Fallback to design-time steps (used for editing/UI when no version data)
  const designSteps = state.sequenceSteps[String(sequenceId)] || [];
  return [...designSteps].sort((a, b) => {
    const posA = a.position || a.step_order || 0;
    const posB = b.position || b.step_order || 0;
    return posA - posB;
  });
}

function findNextSequenceStep(sequenceId, currentStepId, sequenceVersionId = null) {
  const steps = getOrderedSequenceSteps(sequenceId, sequenceVersionId);
  if (!steps.length) return null;
  const idx = steps.findIndex((s) => String(s.id) === String(currentStepId));
  if (idx === -1) return null;
  return steps[idx + 1] || null;
}

async function createNextSequenceTask(currentTask) {
  if (!currentTask.sequence_id) return;
  const versionId = currentTask.sequence_version_id || null;
  const nextStep = findNextSequenceStep(
    currentTask.sequence_id,
    currentTask.sequence_step_id,
    versionId
  );
  const weekdaysOnly = getSequenceWeekdayPref(currentTask.sequence_id, currentTask.contact_id);
  if (!nextStep) {
    await supabase
      .from('contact_sequence_enrollments')
      .update({ status: 'completed' })
      .eq('sequence_id', currentTask.sequence_id)
      .eq('sequence_version_id', versionId || null)
      .eq('contact_id', currentTask.contact_id);
    return;
  }
  await supabase
    .from('contact_sequence_enrollments')
    .update({ current_step: nextStep.step_order || nextStep.position || 1 })
    .eq('sequence_id', currentTask.sequence_id)
    .eq('sequence_version_id', versionId || null)
    .eq('contact_id', currentTask.contact_id);
  const anchor =
    parseDateOnly(currentTask.due_date) ||
    (currentTask.created_at ? new Date(currentTask.created_at) : new Date());
  const dueDate = computeSequenceDueDate(nextStep.delay_days || 0, weekdaysOnly, anchor);
  const nextTask = await createSequenceTask(
    currentTask.sequence_id,
    currentTask.contact_id,
    nextStep,
    weekdaysOnly,
    dueDate,
    versionId || nextStep.sequence_version_id || null
  );
  if (nextTask) {
    openSequenceTaskModal(nextTask);
  }
}

async function markTaskComplete(taskId) {
  if (!taskId) return;
  const followUpInput = document.getElementById('taskFollowUpDate');
  const followUpDate = followUpInput ? followUpInput.value || null : null;

  const { data: existing, error: fetchError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  if (fetchError) {
    console.error('Failed to fetch task for follow up', fetchError);
  }

  const { error } = await supabase.from('tasks').update({ status: 'done' }).eq('id', taskId);
  if (error) {
    console.error('Failed to complete task', error);
    alert('Could not mark task as complete.');
    return;
  }
  state.tasks = state.tasks.map((t) =>
    String(t.id) === String(taskId) ? { ...t, status: 'done' } : t
  );
  renderTaskList();

  if (existing && followUpDate) {
    const clonePayload = {
      title: existing.title,
      contact_id: existing.contact_id || null,
      company_id: existing.company_id || null,
      due_date: followUpDate,
      status: 'open',
      opportunity_id: existing.opportunity_id || null,
      sequence_id: existing.sequence_id || null,
      sequence_step_id: existing.sequence_step_id || null,
      sequence_version_id: existing.sequence_version_id || null,
      template_id: existing.template_id || null,
      template_subject: existing.template_subject || null,
      template_body: existing.template_body || null,
      task_type: existing.task_type || existing.type || null,
    };
    const { error: createError } = await supabase.from('tasks').insert(clonePayload);
    if (createError) {
      console.error('Failed to create follow up task', createError);
      alert('Task completed but follow-up task could not be created.');
    }
  }
  if (existing && existing.sequence_id) {
    await createNextSequenceTask(existing);
  }

  closeTaskDetail();
  closeSequenceTaskModal();
  await refreshTaskViews();
}

function startTaskEdit(task) {
  if (!task) return;
  const content = document.getElementById('taskDetailContent');
  if (!content) return;
  const company = state.companies.find((co) => String(co.id) === String(task.company_id));
  const contacts =
    company && state.contacts.length > 0
      ? state.contacts.filter((c) => String(c.company_id) === String(company.id))
      : [];
  const options = ['<option value="">Select a contact</option>'];
  contacts.forEach((c) => {
      options.push(
        `<option value="${c.id}" ${String(c.id) === String(task.contact_id) ? 'selected' : ''}>${buildContactLabel(c)}</option>`
      );
    });

  const templateName =
    task.template_id && state.templates.length
      ? (state.templates.find((t) => String(t.id) === String(task.template_id))?.name || '')
      : '';

  content.innerHTML = `
    <div class="task-edit-form">
      <p><strong>Company:</strong> ${company?.name || 'Unknown'}</p>
      <label>Title
        <input type="text" id="taskEditTitle" value="${task.title || ''}" />
      </label>
      <label>Due Date
        <input type="date" id="taskEditDue" value="${task.due_date || ''}" />
      </label>
      <label>Contact
        <select id="taskEditContact">${options.join('')}</select>
      </label>
      <label>Template (optional)
        <input type="text" id="taskEditTemplateInput" placeholder="Search template" value="${templateName}" data-template-id="${task.template_id || ''}" autocomplete="off" />
      </label>
      <div class="form-actions" style="margin-top:1rem;">
        <button type="button" class="primary" id="taskEditSaveBtn">Save</button>
        <button type="button" class="secondary" id="taskEditCancelBtn">Cancel</button>
        <button type="button" class="danger" id="taskEditDeleteBtn">Delete</button>
      </div>
      <div id="taskEditStatus" class="status" role="status"></div>
    </div>
  `;

  const saveBtn = document.getElementById('taskEditSaveBtn');
  const cancelBtn = document.getElementById('taskEditCancelBtn');
  const templateInput = document.getElementById('taskEditTemplateInput');
  if (templateInput) {
    templateInput.addEventListener('input', () => {
      templateInput.dataset.templateId = '';
      renderTemplateSuggestions(templateInput);
    });
    templateInput.addEventListener('focus', () => renderTemplateSuggestions(templateInput));
    templateInput.addEventListener('blur', () => {
      setTimeout(() => hideTemplateSuggestionBox(), 150);
    });
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', () => handleTaskEditSave(task.id));
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => openTaskDetail(task.id, false));
  }
  const deleteBtn = document.getElementById('taskEditDeleteBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => handleTaskDelete(task.id));
  }
}

async function handleTaskEditSave(taskId) {
  const titleInput = document.getElementById('taskEditTitle');
  const dueInput = document.getElementById('taskEditDue');
  const contactSelect = document.getElementById('taskEditContact');
  const templateInput = document.getElementById('taskEditTemplateInput');
  const statusEl = document.getElementById('taskEditStatus');
  if (!titleInput || !dueInput || !contactSelect) return;
  const title = titleInput.value.trim();
  const contactId = contactSelect.value ? Number(contactSelect.value) : null;
  let templateId = null;
  if (templateInput && templateInput.value) {
    const match =
      state.templates.find((tpl) => (tpl.name || '') === templateInput.value) ||
      state.templates.find((tpl) => String(tpl.id) === templateInput.value);
    if (match) templateId = match.id;
  }
  if (!title) {
    showStatus(statusEl, 'Title is required.', 'error');
    return;
  }
  if (templateId && !contactId) {
    showStatus(statusEl, 'Select a contact when attaching a template.', 'error');
    return;
  }
  const payload = {
    title,
    due_date: dueInput.value || null,
    contact_id: contactId,
    template_id: templateId,
  };
  const { error } = await supabase.from('tasks').update(payload).eq('id', taskId);
  if (error) {
    console.error('Failed to update task', error);
    showStatus(statusEl, 'Could not save changes.', 'error');
    return;
  }
  showStatus(statusEl, 'Saved.', 'success');
  await loadTasksForContact();
  openTaskDetail(taskId);
}

async function handleTaskDelete(taskId) {
  const confirmed = window.confirm('Are you sure you want to delete this task? This cannot be undone.');
  if (!confirmed) return;
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) {
    console.error('Failed to delete task', error);
    alert('Could not delete task.');
    return;
  }
  await loadTasksForContact();
  closeTaskDetail();
}

function handleTaskDetailBackdrop(event) {
  const modal = document.getElementById('taskDetailModal');
  const content = document.querySelector('#taskDetailModal .modal-content');
  if (!modal || !content) return;
  const clickOnBackdrop = event.target === modal;
  if (clickOnBackdrop) {
    closeTaskDetail();
  }
}

function copyTemplateContactEmail() {
  const emailSpan = document.getElementById('templateContactEmailValue');
  if (!emailSpan) return;
  const email = emailSpan.dataset.email || emailSpan.textContent;
  if (!email) return;
  navigator.clipboard.writeText(email);
}

async function openCompanyDetail(companyId) {
  const modal = document.getElementById('companyDetailModal');
  if (!modal) return;
  modal.removeEventListener('click', handleCompanyDetailBackdrop);
  modal.addEventListener('click', handleCompanyDetailBackdrop);
  state.selectedCompanyId = companyId;
  const company = state.companies.find((c) => String(c.id) === String(companyId));
  const infoEl = document.getElementById('companyInfo');
  const contactsEl = document.getElementById('companyContacts');
  const oppsEl = document.getElementById('companyOpportunities');
  const tasksEl = document.getElementById('companyTasks');

  if (infoEl) {
    infoEl.innerHTML = company
      ? `
        <p><strong>Name:</strong> ${company.name || '-'}</p>
        <p><strong>Phone:</strong> ${company.phone || '-'}</p>
        <p><strong>Address:</strong> ${company.address || '-'}</p>
        <p><strong>City:</strong> ${company.city || '-'}</p>
        <p><strong>Postal Code:</strong> ${company.postal_code || '-'}</p>
      `
      : '<p class="detail-empty">Company not found.</p>';
  }

  if (contactsEl) {
    const contacts = state.contacts.filter((c) => String(c.company_id) === String(companyId));
    contactsEl.innerHTML =
      contacts.length === 0
        ? '<p class="detail-empty">No contacts.</p>'
        : `<ul class="detail-list">${contacts
            .map(
              (c) =>
                `<li>${c.first_name || ''} ${c.last_name || ''} (${c.email || 'no email'})</li>`
            )
            .join('')}</ul>`;
  }

  if (oppsEl) {
    const opps = state.opportunities.filter((o) => String(o.company_id) === String(companyId));
    oppsEl.innerHTML =
      opps.length === 0
        ? '<p class="detail-empty">No opportunities.</p>'
        : `<ul class="detail-list">${opps
            .map(
              (o) =>
                `<li>${o.name || 'Untitled'}${o.stage ? ` — ${o.stage}` : ''}</li>`
            )
            .join('')}</ul>`;
  }

  if (tasksEl) {
    let tasks = getOpenTasksForCompany(companyId);
    if (!tasks.length) {
      tasksEl.innerHTML = '<p class="detail-empty">Loading tasks...</p>';
      tasks = await loadTasksForCompany(companyId);
    }
    renderCompanyTasksList(tasksEl, tasks);
  }

  modal.classList.remove('hidden');
}

// Updated renderer for the refreshed company detail layout.
async function openCompanyDetail(companyId) {
  const modal = document.getElementById('companyDetailModal');
  if (!modal) return;
  modal.removeEventListener('click', handleCompanyDetailBackdrop);
  modal.addEventListener('click', handleCompanyDetailBackdrop);
  state.selectedCompanyId = companyId;
  const company = state.companies.find((c) => String(c.id) === String(companyId));
  const nameEl = document.getElementById('companyDetailName');
  const metaEl = document.getElementById('companyDetailMeta');
  const phoneEl = document.getElementById('companyInfoPhone');
  const cityEl = document.getElementById('companyInfoCity');
  const addressEl = document.getElementById('companyInfoAddress');
  const postalEl = document.getElementById('companyInfoPostal');
  const competitorEl = document.getElementById('companyInfoCompetitor');
  const contactsListEl = document.getElementById('companyContactsList');
  const oppsListEl = document.getElementById('companyOpportunitiesList');
  const tasksListEl = document.getElementById('companyTasksList');
  const summaryContactsEl = document.getElementById('summaryContacts');
  const summaryOppsEl = document.getElementById('summaryOpportunities');
  const summaryTasksEl = document.getElementById('summaryTasks');

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatStageBadge = (stage) =>
    stage ? `<span class="badge badge-amber">${stage}</span>` : '';

  const formatTaskDue = (due) => {
    if (!due) return 'No due date';
    const date = new Date(due);
    if (Number.isNaN(date.getTime())) return due;
    return `Due ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (nameEl) nameEl.textContent = company?.name || 'Company';

  const contacts = state.contacts.filter((c) => String(c.company_id) === String(companyId));
  const opps = state.opportunities.filter((o) => String(o.company_id) === String(companyId));
  let tasks = getOpenTasksForCompany(companyId);
  if (!tasks.length) {
    tasks = await loadTasksForCompany(companyId);
  }

  if (summaryContactsEl) summaryContactsEl.textContent = contacts.length || 0;
  if (summaryOppsEl) summaryOppsEl.textContent = opps.length || 0;
  if (summaryTasksEl) summaryTasksEl.textContent = tasks.length || 0;

  if (metaEl) {
    const created = formatDateShort(company?.created_at);
    metaEl.textContent = created ? `Created ${created} • ${tasks.length} open tasks` : '';
  }
  if (phoneEl) phoneEl.textContent = company?.phone || '-';
  if (cityEl) cityEl.textContent = company?.city || '-';
  if (addressEl) addressEl.textContent = company?.address || '-';
  if (postalEl) postalEl.textContent = company?.postal_code || '-';
  if (competitorEl) competitorEl.textContent = company?.competitor || '-';
  const prdEl = document.getElementById('companyInfoPrd');
  if (prdEl) prdEl.textContent = company?.prd || '-';
  const industryEl = document.getElementById('companyInfoIndustry');
  if (industryEl) industryEl.textContent = company?.industry || '-';

  const nameInput = document.getElementById('companyInfoNameInput');
  const phoneInput = document.getElementById('companyInfoPhoneInput');
  const addressInput = document.getElementById('companyInfoAddressInput');
  const cityInput = document.getElementById('companyInfoCityInput');
  const postalInput = document.getElementById('companyInfoPostalInput');
  const competitorSelect = document.getElementById('companyInfoCompetitorSelect');
  const competitorOther = document.getElementById('companyInfoCompetitorOther');
  const prdInput = document.getElementById('companyInfoPrdInput');
  const industryInput = document.getElementById('companyInfoIndustryInput');
  if (nameInput) nameInput.value = company?.name || '';
  if (phoneInput) phoneInput.value = company?.phone || '';
  if (addressInput) addressInput.value = company?.address || '';
  if (cityInput) cityInput.value = company?.city || '';
  if (postalInput) postalInput.value = company?.postal_code || '';
  if (prdInput) prdInput.value = company?.prd || '';
  if (industryInput) industryInput.value = company?.industry || '';
  if (competitorSelect) {
    const preset = company?.competitor || '';
    const isKnown =
      preset === '' ||
      preset === 'Canadian Linen' ||
      preset === 'Unifirst' ||
      preset === 'Alsco' ||
      preset === 'Executive Mat' ||
      preset === 'Other';
    competitorSelect.value = isKnown ? preset : 'Other';
    if (competitorOther) competitorOther.value = isKnown ? '' : preset;
    updateCompanyInfoCompetitorOther();
  }

  if (contactsListEl) {
    contactsListEl.innerHTML =
      contacts.length === 0
        ? '<p class="detail-empty">No contacts yet.</p>'
        : contacts
            .map(
              (c) => `
                <div class="contact-card clickable" data-contact-id="${c.id}">
                  <h5>${`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed'}</h5>
                  <p>${c.email || 'No email'}</p>
                </div>
              `
            )
            .join('');
  }

  if (oppsListEl) {
    oppsListEl.innerHTML =
      opps.length === 0
        ? '<p class="detail-empty">No opportunities yet.</p>'
        : opps
            .map(
              (o) => `
                <div class="opp-card clickable" data-opp-id="${o.id}">
                  <h5>${o.name || 'Untitled'}</h5>
                  <p>${o.stage ? o.stage : 'No stage set'} ${formatStageBadge(o.stage)}</p>
                </div>
              `
            )
            .join('');
  }

  if (tasksListEl) {
    if (!tasks || tasks.length === 0) {
      tasksListEl.innerHTML = '<p class="detail-empty">No open tasks.</p>';
    } else {
      tasksListEl.innerHTML = tasks
        .map((t) => {
          const dueDate = t.due_date ? new Date(t.due_date) : null;
          const isPastDue = dueDate && dueDate < today;
          const isSoon =
            dueDate && dueDate >= today && dueDate <= new Date(today.getTime() + 3 * 86400000);
          const statusDot = isPastDue
            ? '<span class="dot dot-red"></span>'
            : isSoon
            ? '<span class="dot dot-amber"></span>'
            : '';
          const contact =
            t.contact_id && state.contacts.find((c) => String(c.id) === String(t.contact_id));
          return `
            <div class="task-card clickable" data-task-id="${t.id}">
              <div>
                <span class="task-chip">${(t.task_type || t.type || 'Task').toUpperCase()}</span>
                <p class="meta">${t.title || 'Untitled task'}</p>
                <p class="meta">${contact ? `Contact: ${buildContactLabel(contact)}` : ''}</p>
                <p class="meta">${formatTaskDue(t.due_date)}</p>
              </div>
              <div>${statusDot}</div>
            </div>
          `;
        })
        .join('');
    }
  }

  modal.classList.remove('hidden');
}

function closeCompanyDetail() {
  const modal = document.getElementById('companyDetailModal');
  if (modal) {
    modal.removeEventListener('click', handleCompanyDetailBackdrop);
    modal.classList.add('hidden');
    cancelCompanyInfoEdit();
  }
}

function handleCompanyDetailBackdrop(event) {
  const modal = document.getElementById('companyDetailModal');
  const content = document.querySelector('#companyDetailModal .modal-content');
  if (!modal || !content) return;
  const clickOnBackdrop = event.target === modal;
  if (clickOnBackdrop) {
    closeCompanyDetail();
  }
}

function handleCompanyContactCardClick(event) {
  const card = event.target.closest('.contact-card.clickable');
  if (!card || !card.dataset.contactId) return;
  state.selectedContactId = card.dataset.contactId;
  openContactDetail(card.dataset.contactId);
}

function handleCompanyTaskCardClick(event) {
  const card = event.target.closest('.task-card.clickable');
  if (!card || !card.dataset.taskId) return;
  openTaskDetail(card.dataset.taskId);
}

function handleCompanyOpportunityClick(event) {
  const card = event.target.closest('.opp-card.clickable');
  if (!card || !card.dataset.oppId) return;
  openOpportunityDetail(card.dataset.oppId);
}

function openContactDeleteConfirm() {
  const modal = document.getElementById('contactDeleteConfirmModal');
  const textEl = document.getElementById('contactDeleteConfirmText');
  if (!modal || !textEl || !state.selectedContactId) return;
  const contact = state.contacts.find((c) => String(c.id) === String(state.selectedContactId));
  const name = contact ? buildContactLabel(contact) : 'this contact';
  textEl.textContent = `Are you sure you want to delete ${name}? This will delete their tasks and unassign them from opportunities.`;
  modal.dataset.contactId = state.selectedContactId;
  modal.addEventListener('click', handleContactDeleteBackdrop);
  modal.classList.remove('hidden');
}

function closeContactDeleteConfirm() {
  const modal = document.getElementById('contactDeleteConfirmModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.removeEventListener('click', handleContactDeleteBackdrop);
  }
}

function handleContactDeleteBackdrop(event) {
  const modal = document.getElementById('contactDeleteConfirmModal');
  const content = modal ? modal.querySelector('.modal-content') : null;
  if (!modal || !content) return;
  if (event.target === modal) {
    closeContactDeleteConfirm();
  }
}

function handleContactActivityClick(event) {
  const item = event.target.closest('.activity-item.clickable');
  if (!item || !item.dataset.taskId) return;
  openTaskDetail(item.dataset.taskId);
}

function getOpenTasksForCompany(companyId) {
  const contacts = state.contacts.filter((c) => String(c.company_id) === String(companyId));
  const contactIds = contacts.map((c) => String(c.id));
  return (state.tasks || []).filter((t) => {
    const status = (t.status || t.task_status || '').toLowerCase();
    if (status === 'done') return false;
    if (t.company_id && String(t.company_id) === String(companyId)) return true;
    if (t.contact_id && contactIds.includes(String(t.contact_id))) return true;
    return false;
  });
}

function renderCompanyTasksList(container, tasks) {
  if (!container) return;
  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<p class="detail-empty">No open tasks.</p>';
    return;
  }
  const today = new Date();
  container.innerHTML = tasks
    .sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return da - db;
    })
    .map((t) => {
      const dueDate = t.due_date ? new Date(t.due_date) : null;
      const isPast = dueDate && dueDate < today;
      const isSoon =
        dueDate && dueDate >= today && dueDate <= new Date(today.getTime() + 3 * 86400000);
      const timelineClass = isPast ? 'red' : isSoon ? 'amber' : 'green';
      const dueLabel = dueDate
        ? `${isPast ? 'Past due' : 'Due'} ${dueDate.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}`
        : '';
      return `
        <div class="activity-item clickable" data-task-id="${t.id}">
          <div class="timeline ${timelineClass}"></div>
          <div class="activity-body">
            <div class="activity-text">
              <div class="title-row">
                <span class="task-chip">${(t.task_type || t.type || 'Task').toUpperCase()}</span>
                <span>${t.title || 'Untitled task'}</span>
              </div>
              <div class="meta">
                ${t.sequence_id ? 'From sequence · ' : ''}${t.status === 'done' ? 'Completed' : 'Not completed'}
                ${t.contact_id ? `· ${getContactNameById(t.contact_id) || ''}` : ''}
              </div>
            </div>
            <div class="meta due-label">${dueLabel}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

function getContactNameById(contactId) {
  const contact = state.contacts.find((c) => String(c.id) === String(contactId));
  return contact ? buildContactLabel(contact) : '';
}

async function openContactDetail(contactId) {
  const modal = document.getElementById('contactDetailModal');
  if (!modal) return;
  modal.removeEventListener('click', handleContactModalBackdrop);
  modal.addEventListener('click', handleContactModalBackdrop);
  state.isEditingContactInfo = false;
  const nameEl = document.getElementById('contactDetailName');
  const metaEl = document.getElementById('contactDetailMeta');
  const emailEl = document.getElementById('contactInfoEmail');
  const phoneEl = document.getElementById('contactInfoPhone');
  const spokeToEl = document.getElementById('contactInfoSpokeTo');
  const companyEl = document.getElementById('contactInfoCompany');
  const companyReadonlyEl = document.getElementById('contactInfoCompanyReadonly');
  const sequencesListEl = document.getElementById('contactSequencesList');
  const activityListEl = document.getElementById('contactActivityList');
  const emailInput = document.getElementById('contactInfoEmailInput');
  const phoneInput = document.getElementById('contactInfoPhoneInput');
  const spokeInput = document.getElementById('contactInfoSpokeToInput');
  const firstInput = document.getElementById('contactInfoFirstInput');
  const lastInput = document.getElementById('contactInfoLastInput');
  const view = document.getElementById('contactInfoView');
  const edit = document.getElementById('contactInfoEdit');
  const actions = document.getElementById('contactInfoActions');
  const editBtn = document.getElementById('editContactInfoBtn');

  const contact =
    state.contacts.find((c) => String(c.id) === String(contactId)) ||
    state.contacts.find((c) => buildContactLabel(c) === contactId);
  const company = contact
    ? state.companies.find((co) => String(co.id) === String(contact.company_id))
    : null;

  const tasks = (state.tasks || []).filter(
    (t) => String(t.contact_id) === String(contactId)
  );
  const openTasks = tasks.filter((t) => (t.status || t.task_status || t.state) !== 'done');
  const sortedByDue = [...tasks].sort((a, b) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return da - db;
  });
  const lastActivity = [...tasks]
    .filter((t) => t.updated_at || t.created_at || t.due_date)
    .sort((a, b) => {
      const ta =
        new Date(a.updated_at || a.due_date || a.created_at || 0).getTime() || 0;
      const tb =
        new Date(b.updated_at || b.due_date || b.created_at || 0).getTime() || 0;
      return tb - ta;
    })[0];
  const nextDue = sortedByDue.find(
    (t) => t.due_date && new Date(t.due_date).getTime() >= Date.now()
  );

  const formatDate = (val) => {
    if (!val) return '-';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (nameEl) nameEl.textContent = contact ? buildContactLabel(contact) : 'Contact';
  if (metaEl)
    metaEl.textContent = contact
      ? `${contact.title || ''}${contact.title ? ' · ' : ''}Linked to: ${
          company?.name || 'No company'
        }`
      : '';
  if (emailEl) emailEl.textContent = contact?.email || '-';
  if (phoneEl) phoneEl.textContent = contact?.phone || '-';
  if (spokeToEl) spokeToEl.textContent = contact?.spoke_to || '-';
  if (companyEl) companyEl.textContent = company?.name || '-';
  if (companyReadonlyEl) companyReadonlyEl.textContent = company?.name || '-';
  if (firstInput) firstInput.value = contact?.first_name || '';
  if (lastInput) lastInput.value = contact?.last_name || '';
  if (emailInput) emailInput.value = contact?.email || '';
  if (phoneInput) phoneInput.value = contact?.phone || '';
  if (spokeInput) spokeInput.value = contact?.spoke_to || '';
  if (view) view.classList.remove('hidden');
  if (edit) edit.classList.add('hidden');
  if (actions) actions.classList.add('hidden');
  if (editBtn) editBtn.classList.remove('hidden');

  if (sequencesListEl) {
    sequencesListEl.innerHTML = '<p class="muted">Loading enrollments...</p>';
    const enrollments = await loadActiveContactEnrollments(contactId);
    renderContactSequences(contactId, enrollments);
  }

  if (activityListEl) {
    if (!tasks.length) {
      activityListEl.innerHTML = '<p class="detail-empty">No open tasks yet.</p>';
    } else {
      const today = new Date();
      activityListEl.innerHTML = tasks
        .sort((a, b) => {
          const da = a.due_date ? new Date(a.due_date).getTime() : 0;
          const db = b.due_date ? new Date(b.due_date).getTime() : 0;
          return db - da;
        })
        .map((t) => {
          const dueDate = t.due_date ? new Date(t.due_date) : null;
          const isPast = dueDate && dueDate < today;
          const isSoon =
            dueDate && dueDate >= today && dueDate <= new Date(today.getTime() + 3 * 86400000);
          const timelineClass = isPast ? 'red' : isSoon ? 'amber' : 'green';
          return `
            <div class="activity-item clickable" data-task-id="${t.id}">
              <div class="timeline ${timelineClass}"></div>
              <div class="activity-body">
                <div class="activity-text">
                  <div class="title-row">
                    <span class="task-chip">${(t.task_type || t.type || 'Task').toUpperCase()}</span>
                    <span>${t.title || 'Untitled task'}</span>
                  </div>
                  <div class="meta">
                    ${t.sequence_id ? 'From sequence' : ''} ${t.status === 'done' ? '· Completed' : '· Not completed'}
                  </div>
                </div>
                <div class="meta due-label">${dueDate ? (isPast ? 'Past due' : 'Due') + ' ' + formatDate(t.due_date) : ''}</div>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }

  modal.classList.remove('hidden');
  modal.addEventListener('click', handleContactModalBackdrop);
}

async function loadActiveContactEnrollments(contactId) {
  const { data, error } = await supabase
    .from('contact_sequence_enrollments')
    .select('*')
    .eq('contact_id', contactId)
    .in('status', ['active', 'paused']);
  if (error) {
    console.error('Error loading contact enrollments', error);
    return [];
  }
  return data || [];
}

function renderContactSequences(contactId, enrollments) {
  const listEl = document.getElementById('contactSequencesList');
  if (!listEl) return;
  if (!enrollments || enrollments.length === 0) {
    listEl.innerHTML =
      '<p class="detail-empty">Not enrolled in any sequences. Enroll to start automated follow-ups.</p>';
    return;
  }
  const items = enrollments.map((enroll) => {
    const seq = state.sequences.find((s) => String(s.id) === String(enroll.sequence_id));
    const seqName = seq?.name || 'Sequence';
    const stepName =
      getSequenceStepName(
        enroll.current_step_id || enroll.sequence_step_id,
        enroll.sequence_id,
        enroll.sequence_version_id
      ) || `Step ${enroll.current_step || enroll.current_step_id || 1}`;
  const started = enroll.started_at ? new Date(enroll.started_at) : null;
  const startedLabel =
    started && started.getFullYear() > 2000
      ? started.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '-';
    return `
      <div class="sequence-pill">
        <div>
          <h5>${seqName}</h5>
          <div class="meta"><span class="label">Current step</span><span class="value">${stepName}</span></div>
        </div>
        <div class="meta">
          <span class="label">Started</span><span class="value">${startedLabel}</span>
        </div>
      </div>
    `;
  });
  listEl.innerHTML = items.join('');
}

function openContactSequenceEnrollModal() {
  const modal = document.getElementById('contactSequenceEnrollModal');
  if (!modal) return;
  const startNow = document.getElementById('contactSequenceStartNow');
  const startDateLabel = document.getElementById('contactSequenceStartDateLabel');
  const startDateTime = document.getElementById('contactSequenceStartDateTime');
  const seqInput = document.getElementById('contactSequenceEnrollInput');
  const seqHidden = document.getElementById('contactSequenceEnrollSequenceId');
  if (seqInput) {
    seqInput.value = '';
    seqInput.dataset.sequenceId = '';
    seqInput.name = `contactSequenceEnrollInput_${Date.now()}`;
    seqInput.setAttribute('autocomplete', 'off');
    seqInput.setAttribute('data-autocomplete', 'off');
  }
  if (seqHidden) seqHidden.value = '';
  if (startNow) startNow.checked = true;
  if (startDateTime) {
    startDateTime.value = '';
    startDateTime.disabled = true;
  }
  if (startDateLabel) startDateLabel.classList.remove('hidden');
  const statusEl = document.getElementById('contactSequenceEnrollStatus');
  if (statusEl) showStatus(statusEl, '');
  modal.classList.remove('hidden');
}

function closeContactSequenceEnrollModal() {
  const modal = document.getElementById('contactSequenceEnrollModal');
  if (modal) modal.classList.add('hidden');
}

function handleContactSequenceEnrollBackdrop(event) {
  const modal = document.getElementById('contactSequenceEnrollModal');
  const content = document.querySelector('#contactSequenceEnrollModal .modal-content');
  if (!modal || !content) return;
  if (event.target === modal) {
    closeContactSequenceEnrollModal();
  }
}


function populateContactSequenceOptions() {
  const list = document.getElementById('contactSequenceOptions');
  if (!list) return;
  const options = state.sequences.map((s) => `<option value="${s.name || 'Untitled'}"></option>`);
  list.innerHTML = options.join('');
}

function toggleContactSequenceStartNow() {
  const startNow = document.getElementById('contactSequenceStartNow');
  const startDateLabel = document.getElementById('contactSequenceStartDateLabel');
  const startDateTime = document.getElementById('contactSequenceStartDateTime');
  if (!startNow || !startDateLabel || !startDateTime) return;
  startDateTime.disabled = !!startNow.checked;
  if (startNow.checked) startDateTime.value = '';
}

async function handleContactSequenceEnroll() {
  const statusEl = document.getElementById('contactSequenceEnrollStatus');
  const input = document.getElementById('contactSequenceEnrollInput');
  const seqHidden = document.getElementById('contactSequenceEnrollSequenceId');
  const startNow = document.getElementById('contactSequenceStartNow');
  const startDateTime = document.getElementById('contactSequenceStartDateTime');
  const weekdaysOnlyToggle = document.getElementById('contactSequenceWeekdaysOnly');
  if (!startNow?.checked && startDateTime) {
    startDateTime.disabled = false;
  }
  const contactId = state.selectedContactId;
  if (!contactId) {
    showStatus(statusEl, 'Select a contact first.', 'error');
    return;
  }
  const seqName = (input?.value || '').trim();
  if (!seqName) {
    showStatus(statusEl, 'Choose a sequence.', 'error');
    return;
  }
  const sequence =
    state.sequences.find((s) => String(s.id) === seqHidden?.value) ||
    state.sequences.find((s) => (s.name || '').toLowerCase() === seqName.toLowerCase());
  if (!sequence) {
    showStatus(statusEl, 'Sequence not found.', 'error');
    return;
  }
  const alreadyEnrolled = await isContactEnrolledInSequence(sequence.id, contactId);
  if (alreadyEnrolled) {
    showStatus(statusEl, 'Cannot enroll a contact multiple times in a sequence.', 'error');
    return;
  }
  const latestVersion = getLatestSequenceVersion(sequence.id);
  if (!latestVersion) {
    showStatus(statusEl, 'No published version for this sequence.', 'error');
    return;
  }
  const versionSteps = getSequenceVersionSteps(sequence.id, latestVersion.id);
  if (!versionSteps.length) {
    showStatus(statusEl, 'No steps in the latest version.', 'error');
    return;
  }
  let startedAt = null;
  let startDateOverride = '';
  const immediate = startNow ? startNow.checked : true;
  if (immediate) {
    startedAt = formatTimeOnlyWithTZ(new Date());
  } else {
    const chosen = startDateTime ? startDateTime.value : '';
    const parsed = parseDateOnly(chosen);
    if (!chosen || !parsed) {
      showStatus(statusEl, 'Pick a start date.', 'error');
      return;
    }
    startedAt = formatTimeOnlyWithTZ(
      new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 8, 0, 0)
    );
    startDateOverride = formatDateOnly(parsed);
  }

  const payload = {
    sequence_id: Number(sequence.id),
    sequence_version_id: latestVersion.id,
    contact_id: Number(contactId),
    started_at: startedAt,
    status: 'active',
    current_step: 1,
  };
  const { error } = await supabase.from('contact_sequence_enrollments').insert(payload);
  if (error) {
    console.error('Error enrolling contact:', error);
    const msg = error.message || 'Could not enroll contact.';
    showStatus(statusEl, msg, 'error');
    return;
  }
  const weekdaysOnly = weekdaysOnlyToggle ? weekdaysOnlyToggle.checked : true;
  setSequenceWeekdayPref(sequence.id, contactId, weekdaysOnly);
  const firstStep = versionSteps[0];
  if (firstStep) {
    const newTask = await createSequenceTask(
      sequence.id,
      contactId,
      firstStep,
      weekdaysOnly,
      immediate ? '' : startDateOverride,
      latestVersion.id
    );
    if (newTask) {
      await refreshTaskViews();
      if (immediate) {
        openSequenceTaskModal(newTask);
      }
    }
  }
  showStatus(statusEl, 'Enrolled!', 'success');
  closeContactSequenceEnrollModal();
  const enrollments = await loadActiveContactEnrollments(contactId);
  renderContactSequences(contactId, enrollments);
}

function closeContactDetail() {
  const modal = document.getElementById('contactDetailModal');
  if (!modal) return;
  modal.removeEventListener('click', handleContactModalBackdrop);
  cancelContactInfoEdit(false);
  modal.classList.add('hidden');
}

function handleContactModalBackdrop(event) {
  const modal = document.getElementById('contactDetailModal');
  const content = document.querySelector('#contactDetailModal .modal-content');
  if (!modal || !content) return;
  const clickedClose = event.target.closest && event.target.closest('#closeContactDetailBtn');
  if (event.target === modal || clickedClose) {
    closeContactDetail();
  }
}

function handleContactSendEmail() {
  if (!state.selectedContactId) return;
  const contact = state.contacts.find((c) => String(c.id) === String(state.selectedContactId));
  if (!contact || !contact.email) {
    alert('No email available for this contact.');
    return;
  }
  window.location.href = `mailto:${encodeURIComponent(contact.email)}`;
}

function handleContactNewTask() {
  if (!state.selectedContactId) return;
  const contact = state.contacts.find((c) => String(c.id) === String(state.selectedContactId));
  const company = contact
    ? state.companies.find((co) => String(co.id) === String(contact.company_id))
    : null;
  toggleTaskModal(true);
  const taskCompanyInput = document.getElementById('taskModalCompanyInput');
  const taskContactSelect = document.getElementById('taskModalContactSelect');
  if (taskCompanyInput && company) {
    taskCompanyInput.value = company.name || '';
    populateTaskModalContacts(taskCompanyInput.value);
  }
  if (taskContactSelect && contact) {
    taskContactSelect.value = contact.id;
  }
}

function setSequenceWeekdayPref(sequenceId, contactId, weekdaysOnly) {
  const key = `${sequenceId}:${contactId}`;
  state.sequenceWeekdayPrefs[key] = !!weekdaysOnly;
  try {
    localStorage.setItem(`seqWeekdays:${key}`, weekdaysOnly ? '1' : '0');
  } catch (e) {
    // ignore storage errors
  }
}

function getSequenceWeekdayPref(sequenceId, contactId) {
  const key = `${sequenceId}:${contactId}`;
  if (key in state.sequenceWeekdayPrefs) return !!state.sequenceWeekdayPrefs[key];
  try {
    const saved = localStorage.getItem(`seqWeekdays:${key}`);
    if (saved !== null) {
      state.sequenceWeekdayPrefs[key] = saved === '1';
      return saved === '1';
    }
  } catch (e) {
    // ignore storage errors
  }
  return true;
}

function addDaysWeekdaysOnly(baseDate, days, weekdaysOnly) {
  const date = new Date(baseDate);
  if (!weekdaysOnly) {
    date.setDate(date.getDate() + days);
    return date;
  }

  // If anchor is a weekend, move to next Monday before counting delay days
  const anchorDay = date.getDay();
  if (anchorDay === 0) {
    // Sunday -> Monday
    date.setDate(date.getDate() + 1);
  } else if (anchorDay === 6) {
    // Saturday -> Monday
    date.setDate(date.getDate() + 2);
  }

  let remaining = Number(days || 0);
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return date;
}

function computeSequenceDueDate(delayDays = 0, weekdaysOnly = true, anchorDate = new Date()) {
  const base = startOfDayLocal(anchorDate);
  const nextDate = addDaysWeekdaysOnly(base, Number(delayDays || 0), weekdaysOnly);
  return formatDateOnly(nextDate);
}

function parseDateOnly(dateStr) {
  if (!dateStr) return null;
  // Interpret YYYY-MM-DD in local time to avoid timezone shifts
  const iso = `${dateStr}T00:00:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDayLocal(dateObj) {
  const d = new Date(dateObj);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateOnly(dateObj) {
  const d = startOfDayLocal(dateObj);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function closeSequenceTaskModal() {
  const modal = document.getElementById('sequenceTaskModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSequenceTaskUnenroll(sequenceId, contactId) {
  openSequenceUnenrollConfirmModal(sequenceId, contactId);
}

async function updateSequenceTaskDueDate(taskId, newDate) {
  if (!taskId || !newDate) return;
  const { error } = await supabase.from('tasks').update({ due_date: newDate }).eq('id', taskId);
  if (error) {
    console.error('Failed to update task due date', error);
    alert('Could not update due date.');
    return;
  }
  state.tasks = state.tasks.map((t) =>
    String(t.id) === String(taskId) ? { ...t, due_date: newDate } : t
  );
  renderTaskList();
}

function buildSequenceTaskDetail(task, sequence, step, company, contact) {
  const weekdaysOnly = getSequenceWeekdayPref(task.sequence_id, task.contact_id);
  const headingTitle = `${sequence?.name || 'Sequence'} • ${step?.name || 'Step'} • ${
    company?.name || 'Company'
  }`;
  const dueDate = task.due_date || '';
  const contactName =
    contact && `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
  const nextStep = findNextSequenceStep(
    task.sequence_id,
    task.sequence_step_id,
    task.sequence_version_id
  );
  const currentDueDate = dueDate ? parseDateOnly(dueDate) || new Date() : new Date();
  const nextDue =
    nextStep && computeSequenceDueDate(nextStep.delay_days || 0, weekdaysOnly, currentDueDate);
  const template =
    task.template_id &&
    state.templates.find((t) => String(t.id) === String(task.template_id));
  const templateLabel = task.template_subject || template?.name || 'Template';
  return `
    <div class="task-detail-header">
      <p class="eyebrow">Sequence Task</p>
      <div class="task-detail-title-row">
        <h2>${headingTitle}</h2>
      </div>
    </div>
    <div class="task-detail-divider"></div>
    <div class="task-detail-grid">
      <div class="task-detail-left">
        <div class="task-detail-row">
          <span class="task-detail-label">Sequence</span>
          <span class="task-detail-value">${sequence?.name || '-'}</span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Step</span>
          <span class="task-detail-value">${step?.name || '-'}</span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Company</span>
          <span class="task-detail-value">${company?.name || '-'}</span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Contact</span>
          <span class="task-detail-value">${contactName || '-'}</span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Template</span>
          <span class="task-detail-value">
            ${templateLabel || (task.task_type || task.type || 'Task').toUpperCase()}
            ${
              task.template_subject || task.template_body || template
                ? '<button type="button" class="link-btn inline" id="sequenceTaskViewTemplateBtn">View template</button>'
                : ''
            }
          </span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Task due date</span>
          <span class="task-detail-value">${dueDate || '-'}</span>
        </div>
        <div class="task-detail-row">
          <span class="task-detail-label">Next step</span>
          <span class="task-detail-value">${nextStep ? `${nextStep.name || '-'} (${nextStep.delay_days || 0} day(s) delay)` : 'None'}</span>
        </div>
      </div>
      <div class="task-detail-right">
        <h4>Next step</h4>
        <p>Update the due date or complete to move to the next sequence step.</p>
        <label class="task-detail-label" for="sequenceTaskDueInput" style="margin-top:0.25rem;">Task due date</label>
        <input type="date" id="sequenceTaskDueInput" value="${dueDate}" disabled />
        <label class="task-detail-label" style="margin-top:0.5rem;">Next step will be</label>
        <input type="text" value="${nextDue || '-'}" disabled />
        <label class="task-detail-label" style="margin-top:0.25rem;">
          <input type="checkbox" id="sequenceTaskWeekdaysOnly" ${weekdaysOnly ? 'checked' : ''}/>
          Send only on weekdays
        </label>
        <div class="task-followup-actions">
          <button type="button" id="sequenceTaskCompleteBtn" class="primary">Mark as complete</button>
          <button type="button" id="sequenceTaskEditBtn" class="secondary">Edit due date</button>
          <button type="button" id="sequenceTaskSaveDueBtn" class="primary hidden">Save due date</button>
          <button type="button" id="sequenceTaskUnenrollBtn" class="danger-btn secondary">Unenroll</button>
        </div>
      </div>
    </div>
  `;
}

async function openSequenceTaskModal(task) {
  const modal = document.getElementById('sequenceTaskModal');
  const content = document.getElementById('sequenceTaskContent');
  if (!modal || !content || !task) return;
  if (task.sequence_version_id && !state.sequenceVersionSteps[task.sequence_version_id]) {
    await loadSequenceVersionSteps([task.sequence_version_id]);
  }
  const { step, versionId } = await ensureTaskVersionResolution(task);
  const sequence = state.sequences.find((s) => String(s.id) === String(task.sequence_id));
  const steps = getSequenceVersionSteps(task.sequence_id, versionId);
  const resolvedStep = step || steps.find((s) => String(s.id) === String(task.sequence_step_id));
  const contact = state.contacts.find((c) => String(c.id) === String(task.contact_id));
  const company =
    contact && state.companies.find((co) => String(co.id) === String(contact.company_id));
  const template =
    task.template_id &&
    state.templates.find((t) => String(t.id) === String(task.template_id));
  const hasTemplateContent = !!(task.template_subject || task.template_body || template);
  const taskForRender =
    versionId && !task.sequence_version_id ? { ...task, sequence_version_id: versionId } : task;
  content.innerHTML = buildSequenceTaskDetail(taskForRender, sequence, resolvedStep, company, contact);
  modal.dataset.taskId = task.id;
  modal.dataset.sequenceId = task.sequence_id || '';
  modal.dataset.contactId = task.contact_id || '';
  const editBtn = document.getElementById('sequenceTaskEditBtn');
  const saveBtn = document.getElementById('sequenceTaskSaveDueBtn');
  const dueInput = document.getElementById('sequenceTaskDueInput');
  const completeBtn = document.getElementById('sequenceTaskCompleteBtn');
  const unenrollBtn = document.getElementById('sequenceTaskUnenrollBtn');
  const weekdaysToggle = document.getElementById('sequenceTaskWeekdaysOnly');
  if (weekdaysToggle) {
    weekdaysToggle.addEventListener('change', (e) => {
      setSequenceWeekdayPref(task.sequence_id, task.contact_id, e.target.checked);
    });
  }
  if (editBtn && saveBtn && dueInput) {
    editBtn.onclick = () => {
      dueInput.disabled = false;
      saveBtn.classList.remove('hidden');
    };
    saveBtn.onclick = () => {
      const newDate = dueInput.value;
      dueInput.disabled = true;
      saveBtn.classList.add('hidden');
      updateSequenceTaskDueDate(task.id, newDate);
    };
  }
  if (completeBtn) {
    completeBtn.onclick = () => markTaskComplete(task.id);
  }
  if (unenrollBtn) {
    unenrollBtn.onclick = () =>
      handleSequenceTaskUnenroll(task.sequence_id, task.contact_id);
  }
  const viewTplBtn = document.getElementById('sequenceTaskViewTemplateBtn');
  if (viewTplBtn && hasTemplateContent) {
    viewTplBtn.onclick = () => openTemplatePreviewForTask(task);
  }
  modal.classList.remove('hidden');
}
async function handleCompanyDelete() {
  if (!state.selectedCompanyId) return;
  const companyId = state.selectedCompanyId;
  const company = state.companies.find((c) => String(c.id) === String(companyId));
  const name = company?.name || 'this company';
  const confirmed = window.confirm(
    `Are you sure you want to delete ${name}? This will delete all contacts, opportunities, and tasks for this company.`
  );
  if (!confirmed) return;
  const typed = window.prompt('Type DELETE to confirm. This cannot be undone.');
  if (!typed || typed.trim().toUpperCase() !== 'DELETE') {
    alert('Deletion cancelled.');
    return;
  }
  const deleteBtn = document.getElementById('deleteCompanyBtn');
  setButtonLoading(deleteBtn, true, 'Deleting...');

  const contactIds = state.contacts
    .filter((c) => String(c.company_id) === String(companyId))
    .map((c) => c.id);

  if (contactIds.length > 0) {
    const { error: taskByContactError } = await supabase
      .from('tasks')
      .delete()
      .in('contact_id', contactIds);
    if (taskByContactError) {
      console.error('Failed to delete tasks for contacts', taskByContactError);
      alert('Could not delete tasks for this company.');
      setButtonLoading(deleteBtn, false, 'Delete Company');
      return;
    }
  }

  const { error: taskByCompanyError } = await supabase
    .from('tasks')
    .delete()
    .eq('company_id', companyId);
  if (taskByCompanyError) {
    console.error('Failed to delete tasks for company', taskByCompanyError);
    alert('Could not delete company tasks.');
    setButtonLoading(deleteBtn, false, 'Delete Company');
    return;
  }

  const { error: oppError } = await supabase.from('opportunities').delete().eq('company_id', companyId);
  if (oppError) {
    console.error('Failed to delete opportunities for company', oppError);
    alert('Could not delete opportunities for this company.');
    setButtonLoading(deleteBtn, false, 'Delete Company');
    return;
  }

  const { error: contactError } = await supabase.from('contacts').delete().eq('company_id', companyId);
  if (contactError) {
    console.error('Failed to delete contacts for company', contactError);
    alert('Could not delete contacts for this company.');
    setButtonLoading(deleteBtn, false, 'Delete Company');
    return;
  }

  const { error: companyError } = await supabase.from('companies').delete().eq('id', companyId);
  setButtonLoading(deleteBtn, false, 'Delete Company');
  if (companyError) {
    console.error('Failed to delete company', companyError);
    alert('Could not delete company.');
    return;
  }

  state.companies = state.companies.filter((c) => String(c.id) !== String(companyId));
  state.contacts = state.contacts.filter((c) => String(c.company_id) !== String(companyId));
  state.tasks = state.tasks.filter((t) => {
    const byCompany = String(t.company_id) === String(companyId);
    const byContact = contactIds.includes(t.contact_id);
    return !byCompany && !byContact;
  });
  state.opportunities = state.opportunities.filter((o) => String(o.company_id) !== String(companyId));
  state.selectedCompanyId = '';
  renderCompanyList();
  renderContactList();
  renderTaskList();
  renderPipelineBoard();
  closeCompanyDetail();
}

async function handleContactDelete() {
  const modal = document.getElementById('contactDeleteConfirmModal');
  const contactId = modal?.dataset.contactId || state.selectedContactId;
  if (!contactId) return;
  const deleteBtn = document.getElementById('deleteContactBtn');
  setButtonLoading(deleteBtn, true, 'Deleting...');

  const { error: taskError } = await supabase.from('tasks').delete().eq('contact_id', contactId);
  if (taskError) {
    console.error('Failed to delete contact tasks', taskError);
    alert('Could not delete tasks for this contact.');
    setButtonLoading(deleteBtn, false, 'Delete');
    return;
  }

  const { error: oppError } = await supabase
    .from('opportunities')
    .update({ contact_id: null })
    .eq('contact_id', contactId);
  if (oppError) {
    console.error('Failed to detach contact from opportunities', oppError);
    alert('Could not detach contact from opportunities.');
    setButtonLoading(deleteBtn, false, 'Delete');
    return;
  }

  const { error: contactError } = await supabase.from('contacts').delete().eq('id', contactId);
  setButtonLoading(deleteBtn, false, 'Delete');
  if (contactError) {
    console.error('Failed to delete contact', contactError);
    alert('Could not delete contact.');
    return;
  }

  closeContactDeleteConfirm();
  state.contacts = state.contacts.filter((c) => String(c.id) !== String(contactId));
  state.tasks = state.tasks.filter((t) => String(t.contact_id) !== String(contactId));
  state.opportunities = state.opportunities.map((opp) =>
    String(opp.contact_id) === String(contactId) ? { ...opp, contact_id: null } : opp
  );
  renderContactList();
  renderTaskList();
  renderPipelineBoard();
  const companyModal = document.getElementById('companyDetailModal');
  const companyOpen = companyModal && !companyModal.classList.contains('hidden');
  state.selectedContactId = null;
  if (companyOpen && state.selectedCompanyId) {
    openCompanyDetail(state.selectedCompanyId);
  }
  closeContactDetail();
}

function startContactInfoEdit() {
  if (!state.selectedContactId) return;
  state.isEditingContactInfo = true;
  const view = document.getElementById('contactInfoView');
  const edit = document.getElementById('contactInfoEdit');
  const actions = document.getElementById('contactInfoActions');
  const editBtn = document.getElementById('editContactInfoBtn');
  const deleteBtn = document.getElementById('deleteContactInlineBtn');
  if (view) view.classList.add('hidden');
  if (edit) edit.classList.remove('hidden');
  if (actions) actions.classList.remove('hidden');
  if (editBtn) editBtn.classList.add('hidden');
  if (deleteBtn) {
    deleteBtn.classList.remove('hidden');
    deleteBtn.onclick = openContactDeleteConfirm;
  }
}

function cancelContactInfoEdit(event, refresh = true) {
  if (event && typeof event === 'object' && 'preventDefault' in event) {
    event.preventDefault();
  } else if (typeof event === 'boolean') {
    refresh = event;
  }
  state.isEditingContactInfo = false;
  const view = document.getElementById('contactInfoView');
  const edit = document.getElementById('contactInfoEdit');
  const actions = document.getElementById('contactInfoActions');
  const editBtn = document.getElementById('editContactInfoBtn');
  const deleteBtn = document.getElementById('deleteContactInlineBtn');
  if (view) view.classList.remove('hidden');
  if (edit) edit.classList.add('hidden');
  if (actions) actions.classList.add('hidden');
  if (editBtn) editBtn.classList.remove('hidden');
  if (deleteBtn) {
    deleteBtn.classList.add('hidden');
    deleteBtn.onclick = null;
  }
  if (refresh && state.selectedContactId) openContactDetail(state.selectedContactId);
}

async function saveContactInfoEdit() {
  if (!state.selectedContactId) return;
  const emailInput = document.getElementById('contactInfoEmailInput');
  const phoneInput = document.getElementById('contactInfoPhoneInput');
  const spokeInput = document.getElementById('contactInfoSpokeToInput');
  const firstInput = document.getElementById('contactInfoFirstInput');
  const lastInput = document.getElementById('contactInfoLastInput');
  const saveBtn = document.getElementById('saveContactInfoBtn');
  const email = emailInput?.value.trim().toLowerCase() || null;
  const phone = phoneInput?.value.trim() || null;
  const spoke = spokeInput?.value.trim() || null;
  const first = firstInput?.value.trim() || null;
  const last = lastInput?.value.trim() || null;

  if (email) {
    const { data: dupMatches, error: dupError } = await supabase
      .from('contacts')
      .select('id,first_name,last_name,company_id,email')
      .ilike('email', email);
    if (dupError) {
      console.error('Failed to check duplicate email', dupError);
      alert('Could not validate email uniqueness.');
      return;
    }
    const dup = (dupMatches || []).find(
      (c) =>
        String(c.id) !== String(state.selectedContactId) &&
        (c.email || '').trim().toLowerCase() === email
    );
    if (dup) {
      const company = state.companies.find((co) => String(co.id) === String(dup.company_id));
      const label =
        buildContactLabel(dup) || `${dup.first_name || ''} ${dup.last_name || ''}`.trim();
      const companyName = company?.name ? ` - ${company.name}` : '';
      alert(`Contact already exists with this email: ${label}${companyName}`);
      return;
    }
  }

  setButtonLoading(saveBtn, true, 'Saving...');
  const { error } = await supabase
    .from('contacts')
    .update({
      first_name: first,
      last_name: last,
      email,
      phone,
      spoke_to: spoke,
    })
    .eq('id', state.selectedContactId);
  setButtonLoading(saveBtn, false, 'Save');
  if (error) {
    console.error('Failed to update contact', error);
    alert('Could not save contact info.');
    return;
  }

  state.contacts = state.contacts.map((c) =>
    String(c.id) === String(state.selectedContactId)
      ? { ...c, first_name: first, last_name: last, email, phone, spoke_to: spoke }
      : c
  );
  renderContactList();
  const companyModal = document.getElementById('companyDetailModal');
  const companyOpen = companyModal && !companyModal.classList.contains('hidden');
  openContactDetail(state.selectedContactId);
  if (companyOpen && state.selectedCompanyId) {
    openCompanyDetail(state.selectedCompanyId);
  }
}

function updateCompanyInfoCompetitorOther() {
  const select = document.getElementById('companyInfoCompetitorSelect');
  const otherLabel = document.getElementById('companyInfoCompetitorOtherLabel');
  if (!select || !otherLabel) return;
  const showOther = select.value === 'Other';
  otherLabel.classList.toggle('hidden', !showOther);
}

function startCompanyInfoEdit() {
  if (!state.selectedCompanyId) return;
  state.isEditingCompanyInfo = true;
  const view = document.getElementById('companyInfoView');
  const edit = document.getElementById('companyInfoEdit');
  const actions = document.getElementById('companyInfoActions');
  const editBtn = document.getElementById('editCompanyInfoBtn');
  const deleteBtn = document.getElementById('deleteCompanyInlineBtn');
  if (view) view.classList.add('hidden');
  if (edit) edit.classList.remove('hidden');
  if (actions) actions.classList.remove('hidden');
  if (editBtn) editBtn.classList.add('hidden');
  if (deleteBtn) {
    deleteBtn.classList.remove('hidden');
    deleteBtn.onclick = handleCompanyDelete;
  }
}

function cancelCompanyInfoEdit() {
  state.isEditingCompanyInfo = false;
  const view = document.getElementById('companyInfoView');
  const edit = document.getElementById('companyInfoEdit');
  const actions = document.getElementById('companyInfoActions');
  const editBtn = document.getElementById('editCompanyInfoBtn');
  const deleteBtn = document.getElementById('deleteCompanyInlineBtn');
  if (view) view.classList.remove('hidden');
  if (edit) edit.classList.add('hidden');
  if (actions) actions.classList.add('hidden');
  if (editBtn) editBtn.classList.remove('hidden');
  if (deleteBtn) {
    deleteBtn.classList.add('hidden');
    deleteBtn.onclick = null;
  }
  // reset inputs to current values
  if (state.selectedCompanyId) {
    const company = state.companies.find(
      (c) => String(c.id) === String(state.selectedCompanyId)
    );
    if (company) {
      const nameInput = document.getElementById('companyInfoNameInput');
      const phoneInput = document.getElementById('companyInfoPhoneInput');
      const addressInput = document.getElementById('companyInfoAddressInput');
      const cityInput = document.getElementById('companyInfoCityInput');
      const postalInput = document.getElementById('companyInfoPostalInput');
      const competitorSelect = document.getElementById('companyInfoCompetitorSelect');
      const competitorOther = document.getElementById('companyInfoCompetitorOther');
      if (nameInput) nameInput.value = company.name || '';
      if (phoneInput) phoneInput.value = company.phone || '';
      if (addressInput) addressInput.value = company.address || '';
      if (cityInput) cityInput.value = company.city || '';
      if (postalInput) postalInput.value = company.postal_code || '';
      if (competitorSelect) {
        const preset = company.competitor || '';
        const isKnown =
          preset === '' ||
          preset === 'Canadian Linen' ||
          preset === 'Unifirst' ||
          preset === 'Alsco' ||
          preset === 'Executive Mat' ||
          preset === 'Other';
        competitorSelect.value = isKnown ? preset : 'Other';
        if (competitorOther) competitorOther.value = isKnown ? '' : preset;
        updateCompanyInfoCompetitorOther();
      }
    }
  }
}

async function saveCompanyInfoEdit() {
  if (!state.selectedCompanyId) return;
  const nameInput = document.getElementById('companyInfoNameInput');
  const phoneInput = document.getElementById('companyInfoPhoneInput');
  const addressInput = document.getElementById('companyInfoAddressInput');
  const cityInput = document.getElementById('companyInfoCityInput');
  const postalInput = document.getElementById('companyInfoPostalInput');
  const competitorSelect = document.getElementById('companyInfoCompetitorSelect');
  const competitorOther = document.getElementById('companyInfoCompetitorOther');
  const saveBtn = document.getElementById('saveCompanyInfoBtn');

  const name = nameInput?.value.trim() || '';
  if (!name) {
    alert('Company name is required.');
    return;
  }

  const competitorValue = competitorSelect?.value || '';
  const competitor =
    competitorValue === 'Other'
      ? (competitorOther?.value.trim() || null)
      : competitorValue || null;
  if (competitorValue === 'Other' && !competitor) {
    alert('Enter competitor name when selecting Other.');
    return;
  }

  const payload = {
    name,
    phone: phoneInput?.value.trim() || null,
    address: addressInput?.value.trim() || null,
    city: cityInput?.value.trim() || null,
    postal_code: postalInput?.value.trim() || null,
    competitor,
    prd: document.getElementById('companyInfoPrdInput')?.value.trim() || null,
    industry: document.getElementById('companyInfoIndustryInput')?.value.trim() || null,
  };

  setButtonLoading(saveBtn, true, 'Saving...');
  const { error } = await supabase
    .from('companies')
    .update(payload)
    .eq('id', state.selectedCompanyId);
  setButtonLoading(saveBtn, false, 'Save');
  if (error) {
    console.error('Failed to update company', error);
    alert('Could not save company info.');
    return;
  }

  // Update local state
  state.companies = state.companies.map((c) =>
    String(c.id) === String(state.selectedCompanyId) ? { ...c, ...payload } : c
  );
  // Refresh view with updated data
  openCompanyDetail(state.selectedCompanyId);
  cancelCompanyInfoEdit();
}

function openCompanyContactModal() {
  if (!state.selectedCompanyId) return;
  const modal = document.getElementById('companyContactModal');
  const statusEl = document.getElementById('companyContactStatus');
  if (!modal) return;
  modal.classList.remove('hidden');
  if (statusEl) showStatus(statusEl, '');
  const form = document.getElementById('companyContactForm');
  if (form) form.reset();
  const firstInput = document.getElementById('companyContactFirst');
  if (firstInput) firstInput.focus();
}

function toggleCompanyContactModal(show = true) {
  const modal = document.getElementById('companyContactModal');
  const statusEl = document.getElementById('companyContactStatus');
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
  if (statusEl) showStatus(statusEl, '');
  if (show) {
    const form = document.getElementById('companyContactForm');
    if (form) form.reset();
    const firstInput = document.getElementById('companyContactFirst');
    if (firstInput) firstInput.focus();
    const spokeInput = document.getElementById('companyContactSpokeTo');
    if (spokeInput) spokeInput.value = '';
  }
}

async function handleCompanyContactSubmit(event) {
  event.preventDefault();
  if (!state.selectedCompanyId) return;
  const firstInput = document.getElementById('companyContactFirst');
  const lastInput = document.getElementById('companyContactLast');
  const emailInput = document.getElementById('companyContactEmail');
  const phoneInput = document.getElementById('companyContactPhone');
  const spokeInput = document.getElementById('companyContactSpokeTo');
  const statusEl = document.getElementById('companyContactStatus');
  const submitButton = event.target.querySelector('button[type="submit"]');

  const firstName = firstInput.value.trim();
  if (!firstName) {
    showStatus(statusEl, 'First name is required.', 'error');
    return;
  }
  const email = emailInput.value.trim();
  if (!email) {
    showStatus(statusEl, 'Email is required.', 'error');
    return;
  }
  const emailNormalized = email.toLowerCase();
  setButtonLoading(submitButton, true);
  const { data: dupMatches, error: dupError } = await supabase
    .from('contacts')
    .select('id,first_name,last_name,company_id,email')
    .ilike('email', emailNormalized);
  if (dupError) {
    console.error('Failed to check duplicate email', dupError);
    showStatus(statusEl, 'Could not validate email uniqueness.', 'error');
    setButtonLoading(submitButton, false);
    return;
  }
  const dup = (dupMatches || []).find(
    (c) => (c.email || '').trim().toLowerCase() === emailNormalized
  );
  if (dup) {
    const company = state.companies.find((co) => String(co.id) === String(dup.company_id));
    const label =
      buildContactLabel(dup) || `${dup.first_name || ''} ${dup.last_name || ''}`.trim();
    const companyName = company?.name ? ` - ${company.name}` : '';
    showStatus(
      statusEl,
      `Contact already exists with this email: ${label}${companyName}`,
      'error'
    );
    setButtonLoading(submitButton, false);
    return;
  }

  const payload = {
    company_id: state.selectedCompanyId,
    first_name: firstName,
    last_name: lastInput.value.trim() || null,
    email,
    phone: phoneInput.value.trim() || null,
    spoke_to: spokeInput.value.trim() || null,
  };

  setButtonLoading(submitButton, true, 'Saving...');
  const { error } = await supabase.from('contacts').insert(payload);
  setButtonLoading(submitButton, false);

  if (error) {
    console.error('Failed to add contact', error);
    showStatus(statusEl, 'Could not save contact.', 'error');
    return;
  }

  showStatus(statusEl, 'Contact saved!', 'success');
  await loadContacts();
  populateContactSelect();
  populateOpportunityContactSelect(state.selectedCompanyId);
  toggleCompanyContactModal(false);
  openCompanyDetail(state.selectedCompanyId);
}

function handleContactListAction(event) {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.action === 'viewTasks') {
    const contactId = button.dataset.contactId;
    state.selectedContactId = contactId;
    document.getElementById('taskContactSelect').value = contactId;
    switchSection('tasks');
    loadTasksForContact(contactId);
  }
}

function handleTaskListAction(event) {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.action === 'toggleTask') {
    const currentStatus = button.dataset.currentStatus;
    const nextStatus = currentStatus === 'done' ? 'open' : 'done';
    updateTaskStatus(button.dataset.taskId, nextStatus);
  } else if (button.classList.contains('task-view-btn')) {
    openTaskDetail(button.dataset.taskId);
  }
}

function toggleOpportunityForm(show = true) {
  const modal = document.getElementById('opportunityModal');
  const statusEl = document.getElementById('opportunityStatus');
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
  if (!show) {
    state.opportunityFormCompanyLocked = false;
    state.opportunityFormPipelineId = '';
    const companyFieldReset = document.getElementById('opportunityCompanyInput');
    if (companyFieldReset) {
      companyFieldReset.readOnly = false;
      companyFieldReset.classList.remove('readonly-field');
    }
  }
  if (show) {
    modal.addEventListener(
      'click',
      (e) => {
        if (e.target === modal) {
          toggleOpportunityForm(false);
        }
      },
      { once: true }
    );
  }
  if (statusEl) showStatus(statusEl, '');
  if (show) {
    cancelPipelineEdit();
    populateOpportunityCompanySelect();
    const companyField = document.getElementById('opportunityCompanyInput');
    const shouldLockCompany = state.opportunityFormCompanyLocked && state.selectedCompanyId;
    const companyIdForForm = shouldLockCompany
      ? state.selectedCompanyId
      : resolveCompanyId(companyField ? companyField.value : '');
    if (companyField) {
      if (companyIdForForm && shouldLockCompany) {
        const company = state.companies.find((c) => String(c.id) === String(companyIdForForm));
        companyField.value = company?.name || '';
        companyField.readOnly = true;
        companyField.classList.add('readonly-field');
      } else {
        companyField.value = '';
        companyField.readOnly = false;
        companyField.classList.remove('readonly-field');
      }
    }
    if (!state.opportunityFormPipelineId) {
      state.opportunityFormPipelineId =
        state.pipelines.length > 0 ? String(state.pipelines[0].id) : '';
    }
    populateOpportunityPipelineSelect();
    const pipelineSelect = document.getElementById('opportunityPipelineSelect');
    state.opportunityFormPipelineId = pipelineSelect ? pipelineSelect.value : '';
    populateOpportunityStageSelect(state.opportunityFormPipelineId);
    const stageSelect = document.getElementById('opportunityStageSelect');
    if (stageSelect) {
      const steps = getPipelineSteps(state.opportunityFormPipelineId);
      stageSelect.value = steps.length > 0 ? steps[0].id : '';
    }
    populateOpportunityContactSelect(companyIdForForm);
    const valueInput = document.getElementById('opportunityValue');
    if (valueInput) valueInput.value = '';
    const nameInput = document.getElementById('opportunityName');
    if (nameInput) {
      nameInput.value = '';
      nameInput.dataset.userTyped = 'false';
    }
  }
}

function toggleCompanyModal(show = true) {
  const modal = document.getElementById('companyModal');
  const statusEl = document.getElementById('companyModalStatus');
  if (!modal) return;
  if (show) {
    modal.classList.remove('hidden');
    modal.addEventListener('click', handleCompanyModalBackdrop);
  } else {
    modal.classList.add('hidden');
    modal.removeEventListener('click', handleCompanyModalBackdrop);
  }
  if (statusEl) showStatus(statusEl, '');
  if (show) {
    const form = document.getElementById('companyForm');
    if (form) form.reset();
    const nameInput = document.getElementById('companyName');
    if (nameInput) nameInput.focus();
    updateCompetitorOtherVisibility();
    const competitorOtherInput = document.getElementById('companyCompetitorOther');
    if (competitorOtherInput) competitorOtherInput.value = '';
  }
}

function handleCompanyModalBackdrop(event) {
  const modal = document.getElementById('companyModal');
  const content = modal ? modal.querySelector('.modal-content') : null;
  if (!modal || !content) return;
  if (event.target === modal) {
    toggleCompanyModal(false);
  }
}

async function createOpportunity(payload) {
  const { data, error } = await supabase
    .from('opportunities')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Error creating opportunity:', error);
    return null;
  }

  const record = data || payload;
  const stageName = getStageName(record.pipeline_id, record.stage_id);
  if (!record.stage && stageName) record.stage = stageName;
  state.opportunities.push(record);
  renderPipelineBoard();
  return record;
}

async function updateOpportunityStage(opportunityId, newStage) {
  const { error } = await supabase
    .from('opportunities')
    .update({ stage_id: newStage.id })
    .eq('id', opportunityId);

  if (error) {
    console.error('Error updating opportunity stage:', error);
    return;
  }

  const opp = state.opportunities.find((o) => o.id === opportunityId);
  if (opp) {
    opp.stage = newStage.name || getStageName(opp.pipeline_id, newStage.id);
    opp.stage_id = newStage.id;
  }
}

function renderPipelineBoard() {
  const board = document.getElementById('pipelineBoard');
  if (!board) return;

  board.innerHTML = '';

  const select = document.getElementById('pipelineSelect');
  if (select) {
    if (!state.selectedPipelineId && state.pipelines.length > 0) {
      state.selectedPipelineId = String(state.pipelines[0].id);
    }

    const options = [];
    if (state.pipelines.length === 0) {
      options.push('<option value="">Select a pipeline</option>');
    } else {
      state.pipelines.forEach((pipeline) => {
        options.push(`<option value="${pipeline.id}">${pipeline.name}</option>`);
      });
    }
    select.innerHTML = options.join('');
    if (state.selectedPipelineId) {
      select.value = state.selectedPipelineId;
    }
  }

  if (!state.selectedPipelineId) {
    board.innerHTML = '<p>Select a pipeline to view opportunities, or create one.</p>';
    populateOpportunityStageSelect();
    updatePipelineEditButtons();
    return;
  }

  const steps = state.isEditingPipeline
    ? state.editingStages
    : state.pipelineStages[state.selectedPipelineId] || [];
  if (steps.length === 0) {
    board.innerHTML = '<p>This pipeline has no steps yet. Add steps to see columns.</p>';
    populateOpportunityStageSelect();
    updatePipelineEditButtons();
    return;
  }

  steps.forEach((stepName) => {
    const column = document.createElement('div');
    column.className = 'pipeline-column';
    column.dataset.stage = stepName.id;
    if (state.isEditingPipeline) {
      column.draggable = true;
      column.classList.add('pipeline-stage-draggable');
    }

    const header = document.createElement('div');
    header.className = 'pipeline-column-header';
    const title = document.createElement('span');
    title.textContent = stepName.name;
    if (state.isEditingPipeline) {
      title.contentEditable = 'true';
      title.classList.add('pipeline-stage-editable');
      title.addEventListener('input', (e) => {
        const updated = e.target.textContent || '';
        const stages = state.editingStages.map((s) =>
          String(s.id) === String(stepName.id) ? { ...s, name: updated } : s
        );
        state.editingStages = stages;
      });
    }
    header.appendChild(title);
    if (state.isEditingPipeline) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'inline-btn danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteStageDraft(stepName.id));
      header.appendChild(deleteBtn);
    }

    const items = state.opportunities.filter(
      (o) =>
        String(o.pipeline_id || '') === String(state.selectedPipelineId) &&
        String(o.stage_id || '') === String(stepName.id)
    );
    const totalValue = items.reduce((sum, o) => {
      const val = getOpportunityValue(o);
      return Number.isFinite(Number(val)) ? sum + Number(val) : sum;
    }, 0);
    const count = document.createElement('span');
    count.className = 'pipeline-column-count';
    const countLabel = `${items.length} deal${items.length === 1 ? '' : 's'}`;
    const valueLabel = items.length > 0 ? ` | ${formatOpportunityValue(totalValue)}` : '';
    count.textContent = `${countLabel}${valueLabel}`;
    header.appendChild(count);

    const body = document.createElement('div');
    body.className = 'pipeline-column-body';
    items.forEach((opp) => {
      const card = document.createElement('div');
      card.className = 'pipeline-card';
      card.draggable = !state.isEditingPipeline;
      card.dataset.opportunityId = opp.id;

      const titleEl = document.createElement('div');
      titleEl.className = 'pipeline-card-title';
      const headerRow = document.createElement('div');
      headerRow.style.display = 'flex';
      headerRow.style.justifyContent = 'space-between';
      headerRow.style.gap = '0.5rem';
      headerRow.style.alignItems = 'center';

      titleEl.textContent = opp.name || 'Untitled';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'inline-btn secondary small-btn';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openOpportunityDetail(opp.id);
      });

      headerRow.appendChild(titleEl);
      headerRow.appendChild(viewBtn);

      const company = state.companies.find((c) => c.id === opp.company_id);
      const contact = opp.contact_id
        ? state.contacts.find((c) => c.id === opp.contact_id)
        : null;
      const companyName = company ? company.name : 'Unknown company';
      const contactName = contact
        ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
        : '';

      const meta = document.createElement('div');
      meta.className = 'pipeline-card-meta';
      const parts = [companyName];
      if (contactName) parts.push(contactName);
      const value = getOpportunityValue(opp);
      if (value != null) parts.push(formatOpportunityValue(value));
      if (opp.expected_close_date) parts.push(`Close: ${opp.expected_close_date}`);
      meta.textContent = parts.join(' | ');

      card.appendChild(headerRow);
      card.appendChild(meta);
      body.appendChild(card);
    });
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pipeline-empty';
      empty.innerHTML =
        'No deals in this stage yet. <span class="link-btn">Add one</span> to get started.';
      const addLink = empty.querySelector('.link-btn');
      if (addLink) {
        addLink.addEventListener('click', () => {
          state.opportunityFormPipelineId = state.selectedPipelineId || '';
          state.opportunityFormCompanyLocked = false;
          toggleOpportunityForm(true);
          const stageSelect = document.getElementById('opportunityStageSelect');
          if (stageSelect) stageSelect.value = stepName.id;
        });
      }
      body.appendChild(empty);
    }

    column.appendChild(header);
    column.appendChild(body);
    board.appendChild(column);
  });

  populateOpportunityStageSelect();
  updatePipelineEditButtons();
  if (state.isEditingPipeline) {
    setupStageReorderDrag();
  } else {
    setupPipelineDragAndDrop();
  }
}

async function handleAddPipelineStep() {
  if (!state.selectedPipelineId) {
    alert('Select a pipeline first.');
    return;
  }
  openStepModal();
}

function openPipelineModal() {
  const modal = document.getElementById('pipelineModal');
  const input = document.getElementById('pipelineNameInput');
  const statusEl = document.getElementById('pipelineModalStatus');
  if (!modal) return;
  modal.classList.remove('hidden');
  showStatus(statusEl, '');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function closePipelineModal() {
  const modal = document.getElementById('pipelineModal');
  const statusEl = document.getElementById('pipelineModalStatus');
  if (!modal) return;
  modal.classList.add('hidden');
  if (statusEl) showStatus(statusEl, '');
}

function handlePipelineModalBackdrop(event) {
  const modal = document.getElementById('pipelineModal');
  const content = modal ? modal.querySelector('.modal-content') : null;
  if (!modal || !content) return;
  if (event.target === modal) {
    closePipelineModal();
  }
}

async function handlePipelineFormSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('pipelineNameInput');
  const statusEl = document.getElementById('pipelineModalStatus');
  const name = input.value.trim();
  if (!name) {
    showStatus(statusEl, 'Pipeline name is required.', 'error');
    return;
  }
  const exists = state.pipelines.some(
    (pipeline) => pipeline.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) {
    showStatus(statusEl, 'That pipeline already exists.', 'error');
    return;
  }

  const { data, error } = await supabase
    .from('pipelines')
    .insert({ name })
    .select()
    .single();

  if (error) {
    console.error('Error creating pipeline:', error);
    showStatus(statusEl, 'Could not create pipeline.', 'error');
    return;
  }

  state.pipelines.push(data);
  state.pipelineStages[data.id] = [];
  state.selectedPipelineId = String(data.id);
  populateOpportunityStageSelect();
  renderPipelineBoard();
  closePipelineModal();
}

function openStepModal() {
  if (!state.selectedPipelineId) {
    alert('Select a pipeline first.');
    return;
  }
  const modal = document.getElementById('pipelineStepModal');
  const input = document.getElementById('pipelineStepInput');
  const statusEl = document.getElementById('pipelineStepModalStatus');
  if (!modal) return;
  modal.classList.remove('hidden');
  showStatus(statusEl, '');
  if (input) {
    input.autocomplete = 'off';
    input.value = '';
    input.focus();
  }
}

function closeStepModal() {
  const modal = document.getElementById('pipelineStepModal');
  const statusEl = document.getElementById('pipelineStepModalStatus');
  if (!modal) return;
  modal.classList.add('hidden');
  if (statusEl) showStatus(statusEl, '');
}

async function handlePipelineStepFormSubmit(event) {
  event.preventDefault();
  if (!state.selectedPipelineId) {
    closeStepModal();
    return;
  }
  const input = document.getElementById('pipelineStepInput');
  const statusEl = document.getElementById('pipelineStepModalStatus');
  const name = input.value.trim();
  if (!name) {
    showStatus(statusEl, 'Step name is required.', 'error');
    return;
  }

  const steps = state.isEditingPipeline
    ? state.editingStages
    : state.pipelineStages[state.selectedPipelineId] || [];
  const exists = steps.some((step) => step.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    showStatus(statusEl, 'That step already exists in this pipeline.', 'error');
    return;
  }

  const position = steps.length + 1;
  const { data, error } = await supabase
    .from('pipeline_stages')
    .insert({ name, pipeline_id: Number(state.selectedPipelineId), position })
    .select()
    .single();

  if (error) {
    console.error('Error adding pipeline step:', error);
    showStatus(statusEl, 'Could not add step.', 'error');
    return;
  }

  if (state.isEditingPipeline) {
    state.editingStages = [...steps, data];
  } else {
    state.pipelineStages[state.selectedPipelineId] = [...steps, data];
  }
  populateOpportunityStageSelect();
  renderPipelineBoard();
  closeStepModal();
}

function setupPipelineDragAndDrop() {
  document.querySelectorAll('.pipeline-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', card.dataset.opportunityId);
    });
  });

  document.querySelectorAll('.pipeline-column-body').forEach((column) => {
    column.addEventListener('dragover', (event) => {
      event.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', () => {
      column.classList.remove('drag-over');
    });
    column.addEventListener('drop', async (event) => {
      event.preventDefault();
      column.classList.remove('drag-over');
      const opportunityId = event.dataTransfer.getData('text/plain');
      const stageId = column.parentElement?.dataset.stage;
      if (opportunityId && stageId) {
        const stageObj = (state.pipelineStages[state.selectedPipelineId] || []).find(
          (s) => String(s.id) === String(stageId)
        );
        if (stageObj) {
          await updateOpportunityStage(opportunityId, stageObj);
          window.location.reload();
        }
      }
    });
  });
}

function setupStageReorderDrag() {
  const columns = document.querySelectorAll('.pipeline-column');
  columns.forEach((col) => {
    col.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', col.dataset.stage);
      event.dataTransfer.effectAllowed = 'move';
      col.classList.add('dragging');
    });
    col.addEventListener('dragend', () => {
      col.classList.remove('dragging');
    });
    col.addEventListener('dragover', (event) => {
      event.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });
    col.addEventListener('drop', (event) => {
      event.preventDefault();
      col.classList.remove('drag-over');
      const draggedId = event.dataTransfer.getData('text/plain');
      const targetId = col.dataset.stage;
      if (draggedId && targetId && draggedId !== targetId) {
        reorderStageDraft(draggedId, targetId);
      }
    });
  });
}

function startPipelineEdit() {
  if (!state.selectedPipelineId) return;
  state.isEditingPipeline = true;
  state.editingDeletedStageIds = [];
  state.editingStages = [...(state.pipelineStages[state.selectedPipelineId] || [])];
  const currentPipeline = state.pipelines.find(
    (p) => String(p.id) === String(state.selectedPipelineId)
  );
  state.editingPipelineName = currentPipeline?.name || '';
  togglePipelineNameEdit(true);
  const nameInput = document.getElementById('pipelineNameEditInput');
  if (nameInput) {
    nameInput.value = state.editingPipelineName;
    nameInput.focus();
    nameInput.select();
  }
  renderPipelineBoard();
}

function cancelPipelineEdit() {
  state.isEditingPipeline = false;
  state.editingStages = [];
  state.editingDeletedStageIds = [];
  state.editingPipelineName = '';
  togglePipelineNameEdit(false);
  updatePipelineEditButtons();
  renderPipelineBoard();
}

async function handlePipelineDelete() {
  if (!state.selectedPipelineId) return;
  const pipelineId = Number(state.selectedPipelineId);
  const pipeline = state.pipelines.find((p) => Number(p.id) === pipelineId);
  const pipelineName = pipeline?.name || 'this pipeline';
  const confirmation = window.prompt(
    `Type DELETE to remove "${pipelineName}". This will delete the pipeline, all its stages, and all opportunities in it.`
  );
  if (confirmation !== 'DELETE') {
    alert('Deletion cancelled.');
    return;
  }
  const deleteBtn = document.getElementById('deletePipelineBtn');
  setButtonLoading(deleteBtn, true, 'Deleting...');
  const { error: oppError } = await supabase
    .from('opportunities')
    .delete()
    .eq('pipeline_id', pipelineId);
  if (oppError) {
    console.error('Error deleting pipeline opportunities:', oppError);
    alert('Could not delete opportunities for this pipeline.');
    setButtonLoading(deleteBtn, false, 'Delete');
    return;
  }
  const { error: stageError } = await supabase
    .from('pipeline_stages')
    .delete()
    .eq('pipeline_id', pipelineId);
  if (stageError) {
    console.error('Error deleting pipeline stages:', stageError);
    alert('Could not delete stages for this pipeline.');
    setButtonLoading(deleteBtn, false, 'Delete');
    return;
  }
  const { error: pipeError } = await supabase.from('pipelines').delete().eq('id', pipelineId);
  setButtonLoading(deleteBtn, false, 'Delete');
  if (pipeError) {
    console.error('Error deleting pipeline:', pipeError);
    alert('Could not delete pipeline.');
    return;
  }

  state.pipelines = state.pipelines.filter((p) => Number(p.id) !== pipelineId);
  delete state.pipelineStages[pipelineId];
  state.opportunities = state.opportunities.filter(
    (o) => Number(o.pipeline_id) !== pipelineId
  );
  state.selectedPipelineId = state.pipelines.length > 0 ? String(state.pipelines[0].id) : '';
  cancelPipelineEdit();
  renderPipelineBoard();
}
async function savePipelineEdit() {
  if (!state.isEditingPipeline || !state.selectedPipelineId) return;
  const pipelineId = Number(state.selectedPipelineId);
  const hasEmptyName = state.editingStages.some((stage) => !stage.name || !stage.name.trim());
  if (hasEmptyName) {
    alert('Stage names cannot be empty.');
    return;
  }
  const updates = state.editingStages.map((stage, idx) => ({
    id: stage.id,
    name: stage.name || '',
    position: idx + 1,
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from('pipeline_stages')
      .update({ position: update.position, name: update.name })
      .eq('id', update.id);
    if (error) {
      console.error('Error updating stage position:', error);
      alert('Could not save changes. See console for details.');
      return;
    }
  }

  if (state.editingDeletedStageIds.length > 0) {
    const deletedStageIds = [...state.editingDeletedStageIds];
    const { error: oppDeleteError } = await supabase
      .from('opportunities')
      .delete()
      .in('stage_id', deletedStageIds);
    if (oppDeleteError) {
      console.error('Error deleting opportunities in stage:', oppDeleteError);
      alert('Could not delete opportunities in the stage. See console for details.');
      return;
    }
    const { error: deleteError } = await supabase
      .from('pipeline_stages')
      .delete()
      .in('id', deletedStageIds);
    if (deleteError) {
      console.error('Error deleting stages:', deleteError);
      alert('Could not delete some stages. See console for details.');
      return;
    }
    const deletedIdSet = new Set(deletedStageIds.map((id) => String(id)));
    state.opportunities = state.opportunities.filter(
      (opp) => !deletedIdSet.has(String(opp.stage_id))
    );
  }

  // Update pipeline name if changed
  const currentPipeline = state.pipelines.find((p) => Number(p.id) === pipelineId);
  const newName = (state.editingPipelineName || currentPipeline?.name || '').trim();
  if (!newName) {
    alert('Pipeline name cannot be empty.');
    return;
  }
  const duplicate = state.pipelines.some(
    (p) =>
      Number(p.id) !== pipelineId && p.name && p.name.toLowerCase() === newName.toLowerCase()
  );
  if (duplicate) {
    alert('A pipeline with this name already exists.');
    return;
  }
  if (currentPipeline && currentPipeline.name !== newName) {
    const { error: pipeUpdateError } = await supabase
      .from('pipelines')
      .update({ name: newName })
      .eq('id', pipelineId);
    if (pipeUpdateError) {
      console.error('Error updating pipeline name:', pipeUpdateError);
      alert('Could not update pipeline name.');
      return;
    }
    state.pipelines = state.pipelines.map((p) =>
      Number(p.id) === pipelineId ? { ...p, name: newName } : p
    );
  }

  state.pipelineStages[pipelineId] = state.editingStages.map((s, idx) => ({
    ...s,
    position: idx + 1,
    name: s.name || '',
  }));

  cancelPipelineEdit();
  renderPipelineBoard();
}

function deleteStageDraft(stageId) {
  if (!state.isEditingPipeline) return;
  const idStr = String(stageId);
  const stage = state.editingStages.find((s) => String(s.id) === idStr);
  const stageName = stage?.name || 'this stage';
  const oppsInStage = state.opportunities.filter(
    (opp) =>
      String(opp.pipeline_id || '') === String(state.selectedPipelineId) &&
      String(opp.stage_id || '') === idStr
  );
  const oppCount = oppsInStage.length;
  const confirmMsg = oppCount
    ? `Are you sure you want to delete "${stageName}"? This will delete ${oppCount} deal${oppCount === 1 ? '' : 's'} in this stage.`
    : `Are you sure you want to delete "${stageName}"? All opportunities in this stage will also be deleted.`;
  const confirmed = window.confirm(confirmMsg);
  if (!confirmed) return;
  state.editingStages = state.editingStages.filter((s) => String(s.id) !== idStr);
  if (!state.editingDeletedStageIds.includes(Number(stageId))) {
    state.editingDeletedStageIds.push(Number(stageId));
  }
  renderPipelineBoard();
}

function reorderStageDraft(draggedId, targetId) {
  if (!state.isEditingPipeline) return;
  const stages = [...state.editingStages];
  const fromIdx = stages.findIndex((s) => String(s.id) === String(draggedId));
  const toIdx = stages.findIndex((s) => String(s.id) === String(targetId));
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = stages.splice(fromIdx, 1);
  stages.splice(toIdx, 0, moved);
  state.editingStages = stages;
  renderPipelineBoard();
}

function updatePipelineEditButtons() {
  const editBtn = document.getElementById('editPipelineBtn');
  const saveBtn = document.getElementById('savePipelineEditBtn');
  const cancelBtn = document.getElementById('cancelPipelineEditBtn');
  const addStepBtn = document.getElementById('addPipelineStepBtn');
  const addOppBtn = document.getElementById('addOpportunityBtn');
  const deletePipelineBtn = document.getElementById('deletePipelineBtn');
  const addPipelineBtn = document.getElementById('addPipelineStageBtn');
  const hasPipeline = !!state.selectedPipelineId;
  if (editBtn) editBtn.classList.toggle('hidden', !hasPipeline || state.isEditingPipeline);
  if (saveBtn) saveBtn.classList.toggle('hidden', !state.isEditingPipeline);
  if (cancelBtn) cancelBtn.classList.toggle('hidden', !state.isEditingPipeline);
  if (addStepBtn) {
    addStepBtn.classList.toggle('hidden', !state.isEditingPipeline);
    addStepBtn.disabled = !state.isEditingPipeline || !hasPipeline;
  }
  if (addOppBtn) {
    addOppBtn.disabled = state.isEditingPipeline || !hasPipeline;
    addOppBtn.classList.toggle('hidden', state.isEditingPipeline);
  }
  if (addPipelineBtn) addPipelineBtn.classList.toggle('hidden', state.isEditingPipeline);
  if (deletePipelineBtn) deletePipelineBtn.classList.toggle('hidden', !state.isEditingPipeline);
}

function getStageName(pipelineId, stageId) {
  if (!pipelineId || !stageId) return null;
  const stages = state.pipelineStages[pipelineId] || [];
  const stage = stages.find((s) => String(s.id) === String(stageId));
  return stage ? stage.name : null;
}

function getOpportunityValue(opp) {
  if (!opp) return null;
  if (opp.value != null) return opp.value;
  if (opp.amount != null) return opp.amount;
  return null;
}

function getCompanyName(companyId) {
  if (!companyId) return '';
  const company = state.companies.find((c) => String(c.id) === String(companyId));
  return company ? company.name : '';
}

function getContactName(contactId) {
  if (!contactId) return '';
  const contact = state.contacts.find((c) => String(c.id) === String(contactId));
  if (!contact) return '';
  return `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
}

function getSequenceName(sequenceId) {
  if (!sequenceId) return '';
  const seq = state.sequences.find((s) => String(s.id) === String(sequenceId));
  return seq ? seq.name : '';
}

function getSequenceStepName(stepId, sequenceId, sequenceVersionId = null) {
  if (!stepId || !sequenceId) return '';
  const steps = getSequenceVersionSteps(sequenceId, sequenceVersionId);
  const step = steps.find((s) => String(s.id) === String(stepId));
  if (step) return step.name;
  const designSteps = state.sequenceSteps[String(sequenceId)] || [];
  const designStep = designSteps.find((s) => String(s.id) === String(stepId));
  return designStep ? designStep.name : '';
}

function formatOpportunityValue(val) {
  if (val == null || Number.isNaN(Number(val))) return '';
  return `$${Number(val).toFixed(2)}`;
}

function resetOpportunityEditForm() {
  const form = document.getElementById('opportunityEditForm');
  const statusEl = document.getElementById('opportunityEditStatus');
  if (form) form.reset();
  if (statusEl) showStatus(statusEl, '');
  const contactSelect = document.getElementById('opportunityEditContact');
  if (contactSelect) contactSelect.innerHTML = '<option value="">None</option>';
  const stageSelect = document.getElementById('opportunityEditStage');
  if (stageSelect) stageSelect.innerHTML = '';
}

function openOpportunityDetail(opportunityId) {
  const modal = document.getElementById('opportunityDetailModal');
  const content = document.getElementById('opportunityDetailContent');
  if (!modal || !content) return;
  state.currentOpportunityDetailId = opportunityId;
  renderOpportunityDetailView();
  resetOpportunityEditForm();
  hideOpportunityDeleteConfirm();
  toggleOpportunityEditMode(false);
  modal.addEventListener('click', handleOpportunityDetailBackdrop);
  modal.classList.remove('hidden');
}

function closeOpportunityDetail() {
  const modal = document.getElementById('opportunityDetailModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function renderOpportunityDetailView() {
  const content = document.getElementById('opportunityDetailContent');
  if (!content) return;
  const opp = state.opportunities.find(
    (o) => String(o.id) === String(state.currentOpportunityDetailId)
  );
  if (!opp) {
    content.innerHTML = '<p class="detail-empty">Opportunity not found.</p>';
    return;
  }
  const company = state.companies.find((c) => String(c.id) === String(opp.company_id));
  const contact = opp.contact_id
    ? state.contacts.find((c) => String(c.id) === String(opp.contact_id))
    : null;
  const stageName = opp.stage || getStageName(opp.pipeline_id, opp.stage_id) || '-';
  const value = formatOpportunityValue(getOpportunityValue(opp)) || '-';
  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
      contact.email ||
      'Unnamed'
    : '-';
  content.innerHTML = `
    <div id="opportunityDetailBodyWrapper">
      <div class="opp-detail-header">
        <div>
          <p class="eyebrow">Opportunity Details</p>
          <div class="opp-title-row">
            <h3>${opp.name || 'Untitled'}</h3>
            <span class="opp-detail-badge">${stageName}</span>
          </div>
        </div>
      </div>
      <div class="opp-overview-card compact">
        <div class="opp-overview-row">
          <span class="label">Company</span>
          <span class="value">${company ? company.name : '-'}</span>
        </div>
        <div class="opp-overview-row">
          <span class="label">Contact</span>
          <span class="value">${contactName}</span>
        </div>
        <div class="opp-overview-row">
          <span class="label">Stage</span>
          <span class="value">${stageName}</span>
        </div>
        <div class="opp-overview-row">
          <span class="label">Value</span>
          <span class="value">${value}</span>
        </div>
      </div>
    </div>
  `;
}

function handleOpportunityDetailBackdrop(event) {
  const modal = document.getElementById('opportunityDetailModal');
  const content = modal ? modal.querySelector('.modal-content') : null;
  if (!modal || !content) return;
  if (event.target === modal) {
    closeOpportunityDetail();
  }
}

function populateOpportunityEditForm() {
  const opp = state.opportunities.find(
    (o) => String(o.id) === String(state.currentOpportunityDetailId)
  );
  if (!opp) return;
  const nameInput = document.getElementById('opportunityEditName');
  const valueInput = document.getElementById('opportunityEditValue');
  const contactSelect = document.getElementById('opportunityEditContact');
  const stageSelect = document.getElementById('opportunityEditStage');
  if (nameInput) nameInput.value = opp.name || '';
  if (valueInput) {
    const val = getOpportunityValue(opp);
    valueInput.value = val != null && !Number.isNaN(Number(val)) ? Number(val).toFixed(2) : '';
  }

  if (contactSelect) {
    const options = ['<option value="">None</option>'];
    const filteredContacts = state.contacts.filter(
      (c) => String(c.company_id) === String(opp.company_id)
    );
    filteredContacts.forEach((c) => {
      const label = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Unnamed';
      options.push(`<option value="${c.id}">${label}</option>`);
    });
    contactSelect.innerHTML = options.join('');
    contactSelect.value = opp.contact_id ? String(opp.contact_id) : '';
  }

  if (stageSelect) {
    const options = [];
    const stages = state.pipelineStages[opp.pipeline_id] || [];
    stages.forEach((s) => options.push(`<option value="${s.id}">${s.name}</option>`));
    stageSelect.innerHTML = options.join('');
    stageSelect.value = opp.stage_id ? String(opp.stage_id) : '';
  }
}

function toggleOpportunityEditMode(show) {
  const form = document.getElementById('opportunityEditForm');
  const actions = document.getElementById('opportunityDetailActions');
  const deleteConfirm = document.getElementById('opportunityDeleteConfirm');
  const content = document.getElementById('opportunityDetailBodyWrapper');
  if (form) form.classList.toggle('hidden', !show);
  if (content) content.classList.toggle('hidden', show);
  if (actions) actions.classList.toggle('hidden', show);
  if (deleteConfirm) deleteConfirm.classList.add('hidden');
}

function startOpportunityEdit() {
  populateOpportunityEditForm();
  toggleOpportunityEditMode(true);
}

function cancelOpportunityEdit() {
  resetOpportunityEditForm();
  toggleOpportunityEditMode(false);
}

async function handleOpportunityEditSubmit(event) {
  event.preventDefault();
  const opp = state.opportunities.find(
    (o) => String(o.id) === String(state.currentOpportunityDetailId)
  );
  if (!opp) return;
  const nameInput = document.getElementById('opportunityEditName');
  const contactSelect = document.getElementById('opportunityEditContact');
  const stageSelect = document.getElementById('opportunityEditStage');
  const valueInput = document.getElementById('opportunityEditValue');
  const statusEl = document.getElementById('opportunityEditStatus');
  const name = nameInput.value.trim();
  if (!name) {
    showStatus(statusEl, 'Name is required.', 'error');
    return;
  }
  const stageId = stageSelect?.value;
  if (!stageId) {
    showStatus(statusEl, 'Select a stage.', 'error');
    return;
  }
  let numericValue = null;
  const rawValue = valueInput ? valueInput.value.trim() : '';
  if (rawValue) {
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed) || parsed < 0) {
      showStatus(statusEl, 'Value must be a number 0 or greater.', 'error');
      return;
    }
    numericValue = Number(parsed.toFixed(2));
    if (valueInput) valueInput.value = numericValue.toFixed(2);
  }
  const payload = {
    name,
    contact_id: contactSelect?.value ? Number(contactSelect.value) : null,
    stage_id: Number(stageId),
    value: numericValue,
  };

  const submitButton = document.getElementById('saveOpportunityEditBtn');
  setButtonLoading(submitButton, true, 'Saving...');
  const { data, error } = await supabase
    .from('opportunities')
    .update(payload)
    .eq('id', opp.id)
    .select()
    .single();
  setButtonLoading(submitButton, false);

  if (error) {
    console.error('Error updating opportunity:', error);
    showStatus(statusEl, 'Could not save changes.', 'error');
    return;
  }

  const updated = data || { ...opp, ...payload };
  updated.stage = updated.stage || getStageName(updated.pipeline_id, updated.stage_id);
  const idx = state.opportunities.findIndex((o) => String(o.id) === String(opp.id));
  if (idx !== -1) state.opportunities[idx] = updated;
  const companyDetailModal = document.getElementById('companyDetailModal');
  const companyWasOpen =
    companyDetailModal && !companyDetailModal.classList.contains('hidden') && state.selectedCompanyId;
  const companyIdToRefresh = companyWasOpen ? state.selectedCompanyId : null;

  await loadOpportunities();
  if (companyIdToRefresh) {
    openCompanyDetail(companyIdToRefresh);
  }
  renderPipelineBoard();
  renderOpportunityDetailView();
  showStatus(statusEl, 'Changes saved.', 'success');
  toggleOpportunityEditMode(false);
}

function showOpportunityDeleteConfirm() {
  const deleteConfirm = document.getElementById('opportunityDeleteConfirm');
  const actions = document.getElementById('opportunityDetailActions');
  const form = document.getElementById('opportunityEditForm');
  if (deleteConfirm) deleteConfirm.classList.remove('hidden');
  if (actions) actions.classList.add('hidden');
  if (form) form.classList.add('hidden');
}

function hideOpportunityDeleteConfirm() {
  const deleteConfirm = document.getElementById('opportunityDeleteConfirm');
  const actions = document.getElementById('opportunityDetailActions');
  if (deleteConfirm) deleteConfirm.classList.add('hidden');
  if (actions) actions.classList.remove('hidden');
}

async function handleOpportunityDelete() {
  const oppId = state.currentOpportunityDetailId;
  if (!oppId) return;
  const opp = state.opportunities.find((o) => String(o.id) === String(oppId));
  const companyDetailModal = document.getElementById('companyDetailModal');
  const companyWasOpen =
    companyDetailModal && !companyDetailModal.classList.contains('hidden') && state.selectedCompanyId;
  const companyIdToRefresh = companyWasOpen ? state.selectedCompanyId : null;
  const { error } = await supabase.from('opportunities').delete().eq('id', oppId);
  if (error) {
    console.error('Error deleting opportunity:', error);
    alert('Could not delete opportunity.');
    return;
  }
  state.opportunities = state.opportunities.filter((o) => String(o.id) !== String(oppId));
  await loadOpportunities();
  if (companyIdToRefresh) {
    openCompanyDetail(companyIdToRefresh);
  }
  renderPipelineBoard();
  closeOpportunityDetail();
}

function setSelectedPipelineId(pipelineId) {
  state.selectedPipelineId = pipelineId;
  try {
    if (pipelineId) localStorage.setItem('selectedPipelineId', pipelineId);
  } catch (e) {
    // ignore storage errors
  }
  renderPipelineBoard();
}

function togglePipelineNameEdit(show = false) {
  const selectWrapper = document.getElementById('pipelineSelectWrapper');
  const nameWrapper = document.getElementById('pipelineNameEditWrapper');
  if (selectWrapper) selectWrapper.classList.toggle('hidden', !!show);
  if (nameWrapper) nameWrapper.classList.toggle('hidden', !show);
}

function updateCompetitorOtherVisibility() {
  const select = document.getElementById('companyCompetitor');
  const otherLabel = document.getElementById('companyCompetitorOtherLabel');
  const otherInput = document.getElementById('companyCompetitorOther');
  if (!select || !otherLabel || !otherInput) return;
  const isOther = select.value === 'Other';
  otherLabel.classList.toggle('hidden', !isOther);
  otherInput.required = isOther;
  if (!isOther) {
    otherInput.value = '';
  }
}

function buildContactLabel(contact) {
  if (!contact) return '';
  const company = state.companies.find((co) => co.id === contact.company_id);
  const companyName = company ? company.name : '';
  const namePart = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || '';
  return companyName ? `${namePart} - ${companyName}` : namePart;
}

function resolveCompanyId(entry) {
  if (!entry) return '';
  const trimmed = entry.trim();
  if (!trimmed) return '';
  const matchById = state.companies.find((c) => String(c.id) === trimmed);
  if (matchById) return matchById.id;
  const matchByName = state.companies.find(
    (c) => c.name && c.name.toLowerCase() === trimmed.toLowerCase()
  );
  return matchByName ? matchByName.id : '';
}

function resolveContactId(entry) {
  if (!entry) return '';
  const trimmed = entry.trim();
  if (!trimmed) return '';
  const matchById = state.contacts.find((c) => String(c.id) === trimmed);
  if (matchById) return matchById.id;
  const matchByLabel = state.contacts.find((c) => buildContactLabel(c) === trimmed);
  return matchByLabel ? matchByLabel.id : '';
}

async function loadSequencesAndSteps() {
  const statusEl = document.getElementById('sequenceStatus');
  if (statusEl) showStatus(statusEl, 'Loading sequences...');
  const { data: sequences, error: seqError } = await supabase
    .from('sequences')
    .select('id,name')
    .order('name', { ascending: true });

  if (seqError) {
    console.error('Error loading sequences:', seqError);
    if (statusEl) showStatus(statusEl, 'Could not load sequences.', 'error');
    return;
  }

  // Design-time steps (used for editing)
  const { data: steps, error: stepsError } = await supabase
    .from('sequence_steps')
    .select('id,name,step_type,template_id,step_order,sequence_id,delay_days,position')
    .order('sequence_id', { ascending: true })
    .order('step_order', { ascending: true });

  if (stepsError) {
    console.error('Error loading sequence steps:', stepsError);
    const msg = stepsError.message || 'Could not load sequences.';
    if (statusEl) showStatus(statusEl, msg, 'error');
    state.sequences = sequences || [];
    state.sequenceSteps = {};
    return;
  }

  // Latest published versions per sequence
  const { data: versions, error: versionsError } = await supabase
    .from('sequence_versions')
    .select('id,sequence_id,version_number,name,is_active')
    .order('sequence_id', { ascending: true })
    .order('version_number', { ascending: false });

  if (versionsError) {
    console.error('Error loading sequence versions:', versionsError);
  }

  const latestVersionBySeq = {};
  const latestVersionIds = [];
  (versions || []).forEach((v) => {
    const key = String(v.sequence_id);
    if (!latestVersionBySeq[key]) {
      latestVersionBySeq[key] = v;
      latestVersionIds.push(v.id);
    }
  });

  let versionSteps = [];
  if (latestVersionIds.length > 0) {
    const { data: versionStepsData, error: versionStepsError } = await supabase
      .from('sequence_step_versions')
      .select(
        'id,sequence_version_id,original_step_id,step_order,delay_days,name,step_type,position,template_id,template_subject,template_body'
      )
      .in('sequence_version_id', latestVersionIds)
      .order('sequence_version_id', { ascending: true })
      .order('step_order', { ascending: true });

    if (versionStepsError) {
      console.error('Error loading sequence step versions:', versionStepsError);
    } else {
      versionSteps = versionStepsData || [];
    }
  }

  state.sequences = sequences || [];
  state.sequenceSteps = {};
  state.sequenceLatestVersions = latestVersionBySeq;
  state.sequenceVersionSteps = {};
  state.sequences.forEach((seq) => {
    const seqKey = String(seq.id);
    state.sequenceSteps[seqKey] = (steps || [])
      .filter((step) => String(step.sequence_id) === seqKey)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
    const versionRow = latestVersionBySeq[seqKey];
    if (versionRow) {
      state.sequenceVersionSteps[versionRow.id] = (versionSteps || [])
        .filter((s) => String(s.sequence_version_id) === String(versionRow.id))
        .sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
    }
  });

  if (!state.selectedSequenceId && state.sequences.length > 0) {
    state.selectedSequenceId = String(state.sequences[0].id);
  }

  renderSequenceList();
  renderSequenceBoard();
  if (statusEl) showStatus(statusEl, `${state.sequences.length} sequence(s) loaded.`, 'success');
}

function renderSequenceBoard() {
  const board = document.getElementById('sequenceBoard');
  if (!board) return;

  board.innerHTML = '';

  if (!state.selectedSequenceId) {
    board.innerHTML = '<p>Create a sequence to add steps.</p>';
    return;
  }

  board.innerHTML = '<p>Click a sequence to view its steps.</p>';
}

function renderSequenceList() {
  const list = document.getElementById('sequenceList');
  if (!list) return;
  if (state.sequences.length === 0) {
    list.innerHTML = '<p class="detail-empty">No sequences yet.</p>';
    return;
  }

  list.innerHTML = state.sequences
    .map(
      (seq, idx) => `
        <div class="template-card ${String(seq.id) === String(state.selectedSequenceId) ? 'active' : ''}" data-sequence-id="${seq.id}" data-sequence-index="${idx}">
          <div class="template-card-header">
            <h4>${seq.name || 'Untitled sequence'}</h4>
          </div>
        </div>
      `
    )
    .join('');

  list.querySelectorAll('.template-card').forEach((card) => {
    card.addEventListener('click', () => {
      const seqId = card.dataset.sequenceId;
      setSelectedSequenceId(seqId);
      renderSequenceList();
      renderSequenceBoard();
      openSequencePreview(seqId);
    });
  });
}

function openSequenceModal() {
  const modal = document.getElementById('sequenceModal');
  const statusEl = document.getElementById('sequenceModalStatus');
  if (!modal) return;
  modal.classList.remove('hidden');
  if (statusEl) showStatus(statusEl, '');
  const input = document.getElementById('sequenceNameInput');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function closeSequenceModal() {
  const modal = document.getElementById('sequenceModal');
  const statusEl = document.getElementById('sequenceModalStatus');
  if (!modal) return;
  modal.classList.add('hidden');
  if (statusEl) showStatus(statusEl, '');
}

async function handleSequenceFormSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('sequenceNameInput');
  const statusEl = document.getElementById('sequenceModalStatus');
  const name = input.value.trim();
  if (!name) {
    showStatus(statusEl, 'Sequence name is required.', 'error');
    return;
  }

  const submitButton = event.target.querySelector('button[type="submit"]');
  setButtonLoading(submitButton, true);
  const { data, error } = await supabase.from('sequences').insert({ name }).select().single();
  setButtonLoading(submitButton, false);

  if (error) {
    console.error('Error creating sequence:', error);
    showStatus(statusEl, 'Could not create sequence.', 'error');
    return;
  }

  state.sequences.push(data);
  state.sequenceSteps[String(data.id)] = [];
  state.selectedSequenceId = String(data.id);
  renderSequenceList();
  renderSequenceBoard();
  closeSequenceModal();
}

function openSequenceStepModal() {
  if (!state.selectedSequenceId) {
    alert('Select or create a sequence first.');
    return;
  }
  const modal = document.getElementById('sequenceStepModal');
  const statusEl = document.getElementById('sequenceStepModalStatus');
  if (!modal) return;
  modal.classList.remove('hidden');
  if (statusEl) showStatus(statusEl, '');
  const form = document.getElementById('sequenceStepForm');
  if (form) form.reset();
  updateSequenceStepTemplateVisibility();
  const nameInput = document.getElementById('sequenceStepNameInput');
  if (nameInput) nameInput.focus();
  const delayInput = document.getElementById('sequenceStepDelayInput');
  if (delayInput) delayInput.value = '0';
  const templateSearch = document.getElementById('sequenceStepTemplateSearch');
  const templateIdInput = document.getElementById('sequenceStepTemplateId');
  if (templateSearch) {
    templateSearch.value = '';
    templateSearch.dataset.templateId = '';
    templateSearch.name = `sequenceStepTemplateSearch_${Date.now()}`;
    templateSearch.setAttribute('autocomplete', 'off');
    templateSearch.setAttribute('data-autocomplete', 'off');
  }
  if (templateIdInput) templateIdInput.value = '';
}

function closeSequenceStepModal() {
  const modal = document.getElementById('sequenceStepModal');
  const statusEl = document.getElementById('sequenceStepModalStatus');
  if (!modal) return;
  modal.classList.add('hidden');
  if (statusEl) showStatus(statusEl, '');
}

function updateSequenceStepTemplateVisibility() {
  const typeSelect = document.getElementById('sequenceStepTypeSelect');
  const templateLabel = document.getElementById('sequenceStepTemplateLabel');
  const templateSearch = document.getElementById('sequenceStepTemplateSearch');
  const templateIdInput = document.getElementById('sequenceStepTemplateId');
  if (!typeSelect || !templateLabel || !templateSearch) return;
  const type = typeSelect.value;
  const showTemplate = type === 'email';
  templateLabel.classList.toggle('hidden', !showTemplate);
  templateSearch.required = showTemplate;
  if (!showTemplate) {
    templateSearch.value = '';
    templateSearch.dataset.templateId = '';
    if (templateIdInput) templateIdInput.value = '';
  }
}

async function handleSequenceStepFormSubmit(event) {
  event.preventDefault();
  if (!state.selectedSequenceId) {
    alert('Select or create a sequence first.');
    return;
  }
  const nameInput = document.getElementById('sequenceStepNameInput');
  const typeSelect = document.getElementById('sequenceStepTypeSelect');
  const templateSearch = document.getElementById('sequenceStepTemplateSearch');
  const templateIdInput = document.getElementById('sequenceStepTemplateId');
  const delayInput = document.getElementById('sequenceStepDelayInput');
  const statusEl = document.getElementById('sequenceStepModalStatus');
  const name = nameInput.value.trim();
  const stepType = typeSelect.value;
  if (!name) {
    showStatus(statusEl, 'Step name is required.', 'error');
    return;
  }
  if (!stepType) {
    showStatus(statusEl, 'Select a step type.', 'error');
    return;
  }
  let templateId = null;
  if (stepType === 'email') {
    const storedId = templateIdInput?.value || templateSearch?.dataset.templateId || '';
    if (storedId) {
      templateId = storedId;
    } else if (templateSearch && templateSearch.value) {
      const match = state.templates.find(
        (t) => (t.name || '').toLowerCase() === templateSearch.value.trim().toLowerCase()
      );
      if (match) templateId = match.id;
    }
    if (!templateId) {
      showStatus(statusEl, 'Select a template for email steps.', 'error');
      return;
    }
  }
  const delayDays = delayInput && delayInput.value !== '' ? Number(delayInput.value) : 0;
  if (Number.isNaN(delayDays) || delayDays < 0) {
    showStatus(statusEl, 'Delay must be 0 or more days.', 'error');
    return;
  }

  const seqKey = String(state.selectedSequenceId);
  const seqIdNum = Number(state.selectedSequenceId);
  const steps = state.sequenceSteps[seqKey] || [];
  const position = steps.length + 1;

  const payload = {
    sequence_id: seqIdNum,
    name,
    step_type: stepType,
    template_id: stepType === 'email' ? Number(templateId) : null,
    step_order: position,
    position,
    delay_days: delayDays,
  };

  const submitButton = event.target.querySelector('button[type="submit"]');
  setButtonLoading(submitButton, true);
  const { data, error } = await supabase
    .from('sequence_steps')
    .insert(payload)
    .select()
    .single();
  setButtonLoading(submitButton, false);

  if (error) {
    console.error('Error adding sequence step:', error);
    const msg = error.message || 'Could not add step.';
    showStatus(statusEl, msg, 'error');
    return;
  }

  state.sequenceSteps[seqKey] = [...steps, data].sort(
    (a, b) => (a.position || a.step_order || 0) - (b.position || b.step_order || 0)
  );
  if (state.isEditingSequence && String(state.editingSequenceId) === String(seqKey)) {
    const editingSteps = state.sequenceEditingSteps || [];
    const nextPos = editingSteps.length + 1;
    const newEditingStep = {
      ...data,
      position: nextPos,
      step_order: nextPos,
      delay_days: nextPos === 1 ? 0 : delayDays,
    };
    state.sequenceEditingSteps = [...editingSteps, newEditingStep];
    const delays = Array.isArray(state.sequenceEditingDelays)
      ? [...state.sequenceEditingDelays]
      : [];
    delays[nextPos - 1] = nextPos === 1 ? 0 : delayDays;
    delays[0] = 0;
    state.sequenceEditingDelays = delays;
  }
  renderSequenceBoard();
  openSequencePreview(seqKey);
  closeSequenceStepModal();
}

function setSelectedSequenceId(sequenceId) {
  state.selectedSequenceId = sequenceId;
}

function getLatestSequenceVersion(sequenceId) {
  if (!sequenceId) return null;
  const key = String(sequenceId);
  return state.sequenceLatestVersions[key] || null;
}

function getSequenceVersionSteps(sequenceId, sequenceVersionId) {
  const versionId =
    sequenceVersionId ||
    (sequenceId ? state.sequenceLatestVersions[String(sequenceId)]?.id : null);
  if (!versionId) return [];
  const steps = state.sequenceVersionSteps[versionId] || [];
  return [...steps].sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
}

async function loadSequenceVersionSteps(versionIds = []) {
  const ids = (versionIds || []).filter((id) => id && !state.sequenceVersionSteps[id]);
  if (!ids.length) return;
  const { data, error } = await supabase
    .from('sequence_step_versions')
    .select(
      'id,sequence_version_id,original_step_id,step_order,delay_days,name,step_type,position,template_id,template_subject,template_body'
    )
    .in('sequence_version_id', ids)
    .order('sequence_version_id', { ascending: true })
    .order('step_order', { ascending: true });
  if (error) {
    console.error('Error loading sequence step versions by id', error);
    return;
  }
  (data || []).forEach((row) => {
    if (!state.sequenceVersionSteps[row.sequence_version_id]) {
      state.sequenceVersionSteps[row.sequence_version_id] = [];
    }
    state.sequenceVersionSteps[row.sequence_version_id].push(row);
  });
}

async function ensureTaskVersionResolution(task) {
  if (!task || !task.sequence_step_id) return { step: null, versionId: task?.sequence_version_id || null };

  const currentVersionId = task.sequence_version_id || null;
  const tryGetStepFromCache = (versionId) => {
    if (!versionId) return null;
    const steps = state.sequenceVersionSteps[versionId] || [];
    return steps.find((s) => String(s.id) === String(task.sequence_step_id)) || null;
  };

  let versionId = currentVersionId;
  let step = tryGetStepFromCache(versionId);

  if (!step) {
    // Fetch the step row directly to resolve its version, then load that version's steps.
    const { data: stepRow, error } = await supabase
      .from('sequence_step_versions')
      .select(
        'id,sequence_version_id,original_step_id,step_order,delay_days,name,step_type,position,template_id,template_subject,template_body'
      )
      .eq('id', task.sequence_step_id)
      .single();
    if (error) {
      console.error('Could not resolve sequence_step_versions for task', error);
    } else if (stepRow) {
      versionId = stepRow.sequence_version_id;
      await loadSequenceVersionSteps([versionId]);
      step = tryGetStepFromCache(versionId) || stepRow;
      // Persist the version_id on the task if it was missing.
      if (!task.sequence_version_id && versionId) {
        await supabase.from('tasks').update({ sequence_version_id: versionId }).eq('id', task.id);
        state.tasks = state.tasks.map((t) =>
          String(t.id) === String(task.id) ? { ...t, sequence_version_id: versionId } : t
        );
      }
    }
  }

  return { step, versionId };
}

function getTemplateName(templateId) {
  if (!templateId) return null;
  const tpl = state.templates.find((t) => String(t.id) === String(templateId));
  return tpl ? tpl.name : null;
}

function getTemplateDisplay(templateId, snapshotSubject = null) {
  if (snapshotSubject) return snapshotSubject;
  if (!templateId) return null;
  const tpl = state.templates.find((t) => String(t.id) === String(templateId));
  if (!tpl) return null;
  return tpl.subject || tpl.name || null;
}

function getTemplateDisplayLive(templateId) {
  if (!templateId) return null;
  const tpl = state.templates.find((t) => String(t.id) === String(templateId));
  if (!tpl) return null;
  return tpl.subject || tpl.name || null;
}

function findTemplateIndexById(templateId) {
  if (!templateId) return -1;
  return state.templates.findIndex((t) => String(t.id) === String(templateId));
}

function openSequencePreview(sequenceId) {
  const modal = document.getElementById('sequencePreviewModal');
  const content = document.getElementById('sequencePreviewContent');
  if (!modal || !content) return;
  const seqKey = String(sequenceId || state.selectedSequenceId);
  if (state.isEditingSequence && state.editingSequenceId && state.editingSequenceId !== seqKey) {
    cancelSequenceEdit();
  }
  const sequence = state.sequences.find((s) => String(s.id) === seqKey);
  const steps =
    state.isEditingSequence && state.editingSequenceId === seqKey
      ? state.sequenceEditingSteps
      : state.sequenceSteps[seqKey] || [];
  const renderSteps =
    steps && steps.length
      ? steps
      : getSequenceVersionSteps(seqKey) || [];

  if (!sequence) {
    content.innerHTML = '<p class="detail-empty">Sequence not found.</p>';
  } else if (renderSteps.length === 0) {
    content.innerHTML = '<p class="detail-empty">No steps yet.</p>';
  } else {
    content.innerHTML = `
      <div class="sequence-preview-list">
        ${renderSteps
          .map(
            (step, idx) => `
              ${
                idx > 0
                  ? `<div class="sequence-delay-connector">${step.delay_days ? `${step.delay_days} day(s) delay` : 'No delay between steps'}</div>`
                  : ''
              }
              <div class="template-card sequence-step-card" data-step-id="${step.id}" data-template-id="${step.step_type === 'email' ? step.template_id || '' : ''}">
                <div class="template-card-header">
                  <h4>Step ${idx + 1}: ${step.name || ''}</h4>
                  <span class="pipeline-column-count">${step.step_type ? step.step_type.toUpperCase() : ''}</span>
                  ${
                    state.isEditingSequence && state.editingSequenceId === seqKey
                      ? '<div class="sequence-step-actions"><button type="button" class="inline-btn secondary small-btn sequence-step-edit-btn">Edit</button><button type="button" class="inline-btn danger small-btn sequence-step-delete-btn">Delete</button></div>'
                      : ''
                  }
                </div>
                <p>${
                  step.step_type === 'email'
                    ? `Template: ${getTemplateDisplayLive(step.template_id) || 'Not set'}`
                    : 'Call step'
                }</p>
              </div>
            `
          )
          .join('')}
      </div>
    `;

    content.querySelectorAll('.sequence-step-card').forEach((card) => {
      if (state.isEditingSequence && state.editingSequenceId === seqKey) {
        card.draggable = true;
        const editBtn = card.querySelector('.sequence-step-edit-btn');
        if (editBtn) {
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSequenceStepEdit(card.dataset.stepId);
          });
        }
        const deleteBtn = card.querySelector('.sequence-step-delete-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSequenceStepDraft(seqKey, card.dataset.stepId);
          });
        }
      } else {
        card.addEventListener('click', () => {
          const templateId = card.dataset.templateId;
          const idx = findTemplateIndexById(templateId);
          if (idx >= 0) {
            openTemplatePreview(idx);
          }
        });
      }
    });
  }

  populateSequenceEnrollOptions();
  const enrollInput = document.getElementById('sequenceEnrollInput');
  if (enrollInput) {
    enrollInput.value = '';
    enrollInput.name = `sequenceEnrollInput_${Date.now()}`;
    enrollInput.setAttribute('autocomplete', 'off');
    enrollInput.setAttribute('data-autocomplete', 'off');
  }
  const startNow = document.getElementById('sequenceStartNow');
  const startDate = document.getElementById('sequenceStartDateTime');
  if (startNow) startNow.checked = true;
  if (startDate) {
    startDate.value = '';
    startDate.disabled = true;
  }
  updateSequenceEditButtons(seqKey);
  if (state.isEditingSequence && state.editingSequenceId === seqKey) {
    setupSequenceReorderDrag(content, seqKey);
  }
  modal.classList.remove('hidden');
}

function updateSequenceEditButtons(seqKey = state.selectedSequenceId) {
  const editBtn = document.getElementById('editSequenceBtn');
  const saveBtn = document.getElementById('saveSequenceEditBtn');
  const cancelBtn = document.getElementById('cancelSequenceEditBtn');
  const addStepBtn = document.getElementById('addSequenceStepInModalBtn');
  const deleteSeqBtn = document.getElementById('deleteSequenceBtn');
  const isEditing = state.isEditingSequence && String(state.editingSequenceId) === String(seqKey);
  if (editBtn) editBtn.classList.toggle('hidden', isEditing);
  if (saveBtn) saveBtn.classList.toggle('hidden', !isEditing);
  if (cancelBtn) cancelBtn.classList.toggle('hidden', !isEditing);
  if (addStepBtn) addStepBtn.classList.toggle('hidden', !isEditing);
  if (deleteSeqBtn) deleteSeqBtn.classList.toggle('hidden', !isEditing);
}

function startSequenceEdit() {
  if (!state.selectedSequenceId) return;
  const seqKey = String(state.selectedSequenceId);
  const steps = state.sequenceSteps[seqKey] || [];
  state.isEditingSequence = true;
  state.editingSequenceId = seqKey;
  state.sequenceEditingDelays = steps.map((s, idx) => (idx === 0 ? 0 : s.delay_days || 0));
  state.sequenceEditingDelays[0] = 0;
  state.sequenceEditingSteps = steps.map((s, idx) => ({
    ...s,
    position: idx + 1,
    step_order: idx + 1,
    delay_days: idx === 0 ? 0 : state.sequenceEditingDelays[idx] || 0,
  }));
  updateSequenceEditButtons(seqKey);
  openSequencePreview(seqKey);
}

function cancelSequenceEdit() {
  state.isEditingSequence = false;
  state.editingSequenceId = null;
  state.sequenceEditingSteps = [];
  state.sequenceEditingDelays = [];
  updateSequenceEditButtons();
  if (state.selectedSequenceId) openSequencePreview(state.selectedSequenceId);
  closeSequenceStepEditModal();
}

async function saveSequenceEdit() {
  const seqKey = String(state.selectedSequenceId);
  if (!state.isEditingSequence || state.editingSequenceId !== seqKey) return;
  const steps = state.sequenceEditingSteps || [];
  const existingIds = (state.sequenceSteps[seqKey] || []).map((s) => String(s.id));
  const delays = state.sequenceEditingDelays || [];
  const updatedSteps = steps.map((s, idx) => ({
    ...s,
    position: idx + 1,
    step_order: idx + 1,
    delay_days: idx === 0 ? 0 : delays[idx] || 0,
  }));
  const saveBtn = document.getElementById('saveSequenceEditBtn');
  setButtonLoading(saveBtn, true, 'Saving...');
  for (const step of updatedSteps) {
    const { error } = await supabase
      .from('sequence_steps')
      .update({
        position: step.position,
        step_order: step.position,
        delay_days: step.delay_days,
        name: step.name,
        template_id: step.template_id,
        step_type: step.step_type,
      })
      .eq('id', step.id);
    if (error) {
      console.error('Error saving sequence reorder:', error);
      alert('Could not save sequence order. See console for details.');
      setButtonLoading(saveBtn, false, 'Save');
      return;
    }
  }
  // Delete steps removed during editing
  const updatedIds = updatedSteps.map((s) => String(s.id));
  const removedIds = existingIds.filter((id) => !updatedIds.includes(id));
  if (removedIds.length > 0) {
    const { error: deleteRemovedError } = await supabase
      .from('sequence_steps')
      .delete()
      .in('id', removedIds);
    if (deleteRemovedError) {
      console.error('Error deleting removed steps:', deleteRemovedError);
      alert('Could not delete removed steps.');
      setButtonLoading(saveBtn, false, 'Save');
      return;
    }
  }
  // Create a new published version so existing enrollments keep their old snapshot.
  const latestVersion = getLatestSequenceVersion(seqKey);
  const nextVersionNumber = latestVersion ? (latestVersion.version_number || 0) + 1 : 1;
  const sequence = state.sequences.find((s) => String(s.id) === seqKey);
  const { data: newVersion, error: versionInsertError } = await supabase
    .from('sequence_versions')
    .insert({
      sequence_id: Number(seqKey),
      version_number: nextVersionNumber,
      name: sequence?.name || '',
      is_active: true,
    })
    .select()
    .single();
  if (versionInsertError || !newVersion) {
    console.error('Error creating new sequence version:', versionInsertError);
    alert('Saved steps, but failed to publish new version.');
    setButtonLoading(saveBtn, false, 'Save');
    return;
  }

  const templateById = {};
  state.templates.forEach((tpl) => {
    templateById[String(tpl.id)] = tpl;
  });

  const versionStepsPayload = updatedSteps.map((step) => {
    const tpl = step.template_id ? templateById[String(step.template_id)] : null;
    return {
      sequence_version_id: newVersion.id,
      original_step_id: step.id,
      step_order: step.position,
      position: step.position,
      delay_days: step.delay_days || 0,
      name: step.name,
      step_type: step.step_type,
      template_id: step.template_id || null,
      template_subject: step.template_subject || tpl?.subject || null,
      template_body: step.template_body || tpl?.body || null,
    };
  });

  const { data: versionStepsData, error: versionStepsError } = await supabase
    .from('sequence_step_versions')
    .insert(versionStepsPayload)
    .select();
  if (versionStepsError) {
    console.error('Error creating versioned steps:', versionStepsError);
    alert('Saved steps, but failed to publish new version steps.');
    setButtonLoading(saveBtn, false, 'Save');
    return;
  }

  setButtonLoading(saveBtn, false, 'Save');
  state.sequenceSteps[seqKey] = updatedSteps;
  state.sequenceLatestVersions[seqKey] = newVersion;
  state.sequenceVersionSteps[newVersion.id] = versionStepsData || versionStepsPayload;
  state.isEditingSequence = false;
  state.editingSequenceId = null;
  state.sequenceEditingSteps = [];
  state.sequenceEditingDelays = [];
  updateSequenceEditButtons(seqKey);
  // Ensure the freshly published version steps are available for the preview view
  await loadSequenceVersionSteps([newVersion.id]);
  openSequencePreview(seqKey);
}

async function handleSequenceDelete() {
  if (!state.selectedSequenceId) return;
  const seqId = Number(state.selectedSequenceId);
  const seq = state.sequences.find((s) => Number(s.id) === seqId);
  const name = seq?.name || 'this sequence';
  const confirmed = window.confirm(
    `Are you sure you want to delete "${name}"? This will unenroll all contacts, remove open sequence tasks, and delete all steps.`
  );
  if (!confirmed) return;
  const deleteBtn = document.getElementById('deleteSequenceBtn');
  setButtonLoading(deleteBtn, true, 'Deleting...');
  const { error: taskError } = await supabase
    .from('tasks')
    .delete()
    .eq('sequence_id', seqId);
  if (taskError) {
    console.error('Error deleting sequence tasks:', taskError);
    alert('Could not delete open tasks for this sequence.');
    setButtonLoading(deleteBtn, false, 'Delete');
    return;
  }
  const { error: enrollError } = await supabase
    .from('contact_sequence_enrollments')
    .delete()
    .eq('sequence_id', seqId);
  if (enrollError) {
    console.error('Error deleting enrollments:', enrollError);
    alert('Could not delete enrollments for this sequence.');
    setButtonLoading(deleteBtn, false, 'Delete');
    return;
  }
  // Delete versioned steps explicitly; sequence_versions will cascade from sequences delete.
  const { data: versions, error: versionFetchError } = await supabase
    .from('sequence_versions')
    .select('id')
    .eq('sequence_id', seqId);
  if (versionFetchError) {
    console.error('Error loading sequence versions:', versionFetchError);
  } else {
    const versionIds = (versions || []).map((v) => v.id);
    if (versionIds.length > 0) {
      const { error: versionStepsDeleteError } = await supabase
        .from('sequence_step_versions')
        .delete()
        .in('sequence_version_id', versionIds);
      if (versionStepsDeleteError) {
        console.error('Error deleting step versions:', versionStepsDeleteError);
      }
    }
  }
  const { error: stepError } = await supabase
    .from('sequence_steps')
    .delete()
    .eq('sequence_id', seqId);
  if (stepError) {
    console.error('Error deleting sequence steps:', stepError);
    alert('Could not delete steps for this sequence.');
    setButtonLoading(deleteBtn, false, 'Delete');
    return;
  }
  const { error: seqError } = await supabase.from('sequences').delete().eq('id', seqId);
  setButtonLoading(deleteBtn, false, 'Delete');
  if (seqError) {
    console.error('Error deleting sequence:', seqError);
    alert('Could not delete sequence.');
    return;
  }
  state.sequences = state.sequences.filter((s) => Number(s.id) !== seqId);
  delete state.sequenceSteps[seqId];
  state.selectedSequenceId = state.sequences.length ? String(state.sequences[0].id) : '';
  cancelSequenceEdit();
  renderSequenceList();
  renderSequenceBoard();
  toggleSequencePreviewModal(false);
}

function setupSequenceReorderDrag(container, seqKey) {
  const cards = container.querySelectorAll('.sequence-step-card');
  cards.forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', card.dataset.stepId);
      event.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      card.classList.remove('drag-over');
      const draggedId = event.dataTransfer.getData('text/plain');
      const targetId = card.dataset.stepId;
      if (draggedId && targetId && draggedId !== targetId) {
        reorderSequenceDraft(seqKey, draggedId, targetId);
      }
    });
  });
}

function reorderSequenceDraft(seqKey, draggedId, targetId) {
  if (!state.isEditingSequence || state.editingSequenceId !== seqKey) return;
  const steps = [...state.sequenceEditingSteps];
  const fromIdx = steps.findIndex((s) => String(s.id) === String(draggedId));
  const toIdx = steps.findIndex((s) => String(s.id) === String(targetId));
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = steps.splice(fromIdx, 1);
  steps.splice(toIdx, 0, moved);
  const delays = state.sequenceEditingDelays;
  const adjusted = steps.map((s, idx) => ({
    ...s,
    position: idx + 1,
    step_order: idx + 1,
    delay_days: idx === 0 ? 0 : delays[idx] || 0,
  }));
  state.sequenceEditingSteps = adjusted;
  openSequencePreview(seqKey);
}

function deleteSequenceStepDraft(seqKey, stepId) {
  if (!state.isEditingSequence || state.editingSequenceId !== seqKey) return;
  const confirmDelete = window.confirm(
    'Are you sure you want to delete this step? It will be removed from the sequence.'
  );
  if (!confirmDelete) return;
  const steps = [...state.sequenceEditingSteps];
  const delays = [...state.sequenceEditingDelays];
  const idx = steps.findIndex((s) => String(s.id) === String(stepId));
  if (idx === -1) return;
  steps.splice(idx, 1);
  if (idx < delays.length) delays.splice(idx, 1);
  delays[0] = 0;
  const adjusted = steps.map((s, i) => ({
    ...s,
    position: i + 1,
    step_order: i + 1,
    delay_days: i === 0 ? 0 : delays[i] || 0,
  }));
  state.sequenceEditingSteps = adjusted;
  state.sequenceEditingDelays = delays;
  openSequencePreview(seqKey);
}

function openSequenceStepEdit(stepId) {
  if (!state.isEditingSequence || !state.editingSequenceId) return;
  const seqKey = state.editingSequenceId;
  const steps = state.sequenceEditingSteps || [];
  const step = steps.find((s) => String(s.id) === String(stepId));
  if (!step) return;
  const modal = document.getElementById('sequenceStepEditModal');
  const nameInput = document.getElementById('sequenceStepEditName');
  const delayInput = document.getElementById('sequenceStepEditDelay');
  const templateSearch = document.getElementById('sequenceStepEditTemplateSearch');
  const templateIdInput = document.getElementById('sequenceStepEditTemplateId');
  const templateLabel = document.getElementById('sequenceStepEditTemplateLabel');
  const statusEl = document.getElementById('sequenceStepEditStatus');
  if (!modal || !nameInput || !delayInput || !templateLabel) return;
  nameInput.value = step.name || '';
  delayInput.value = step.position === 1 ? 0 : step.delay_days || 0;
  const isEmail = step.step_type === 'email';
  templateLabel.classList.toggle('hidden', !isEmail);
  if (templateSearch) {
    templateSearch.required = isEmail;
    const tplName = isEmail ? getTemplateName(step.template_id) || '' : '';
    templateSearch.value = tplName;
    templateSearch.name = `sequenceStepEditTemplateSearch_${Date.now()}`;
    templateSearch.setAttribute('autocomplete', 'off');
    templateSearch.setAttribute('data-autocomplete', 'off');
  }
  if (templateIdInput) {
    templateIdInput.value = isEmail && step.template_id ? String(step.template_id) : '';
  }
  modal.dataset.stepId = step.id;
  showStatus(statusEl, '');
  modal.classList.remove('hidden');
}

function populateSequenceEditTemplateOptions() {
  const select = document.getElementById('sequenceStepEditTemplate');
  // Deprecated: replaced by search-driven suggestions in the edit modal.
  if (!select) return;
}

function openSequenceQuickEnrollModal() {
  const modal = document.getElementById('sequenceQuickEnrollModal');
  if (!modal) return;
  const seqInput = document.getElementById('quickEnrollSequenceInput');
  const contactInput = document.getElementById('quickEnrollContactInput');
  const startNow = document.getElementById('quickEnrollStartNow');
  const startDate = document.getElementById('quickEnrollStartDate');
  const weekdaysOnly = document.getElementById('quickEnrollWeekdaysOnly');
  const statusEl = document.getElementById('sequenceQuickEnrollStatus');
  if (seqInput) {
    seqInput.value = '';
    seqInput.dataset.sequenceId = '';
    seqInput.name = `quickEnrollSequenceInput_${Date.now()}`;
    seqInput.setAttribute('autocomplete', 'off');
    seqInput.setAttribute('data-autocomplete', 'off');
  }
  if (contactInput) {
    contactInput.value = '';
    contactInput.name = `quickEnrollContactInput_${Date.now()}`;
    contactInput.setAttribute('autocomplete', 'off');
    contactInput.setAttribute('data-autocomplete', 'off');
  }
  if (startNow) startNow.checked = true;
  if (startDate) {
    startDate.value = '';
    startDate.disabled = true;
  }
  if (weekdaysOnly) weekdaysOnly.checked = true;
  if (statusEl) showStatus(statusEl, '');
  modal.classList.remove('hidden');
}

function closeSequenceQuickEnrollModal() {
  const modal = document.getElementById('sequenceQuickEnrollModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSequenceQuickEnroll(event) {
  event.preventDefault();
  const statusEl = document.getElementById('sequenceQuickEnrollStatus');
  const seqInput = document.getElementById('quickEnrollSequenceInput');
  const contactInput = document.getElementById('quickEnrollContactInput');
  const startNow = document.getElementById('quickEnrollStartNow');
  const startDate = document.getElementById('quickEnrollStartDate');
  const weekdaysOnlyToggle = document.getElementById('quickEnrollWeekdaysOnly');
  const seqVal = (seqInput?.value || '').trim();
  const contactVal = (contactInput?.value || '').trim();
  if (!seqVal) {
    showStatus(statusEl, 'Select a sequence.', 'error');
    return;
  }
  if (!contactVal) {
    showStatus(statusEl, 'Select a contact.', 'error');
    return;
  }
  const sequence =
    state.sequences.find((s) => String(s.id) === seqInput.dataset.sequenceId) ||
    state.sequences.find((s) => (s.name || '').toLowerCase() === seqVal.toLowerCase());
  if (!sequence) {
    showStatus(statusEl, 'Sequence not found.', 'error');
    return;
  }
  const contact =
    state.contacts.find((c) => String(c.id) === contactVal) ||
    state.contacts.find((c) => buildContactLabel(c) === contactVal);
  if (!contact) {
    showStatus(statusEl, 'Contact not found.', 'error');
    return;
  }

  const latestVersion = getLatestSequenceVersion(sequence.id);
  if (!latestVersion) {
    showStatus(statusEl, 'No published version for this sequence.', 'error');
    return;
  }
  const versionSteps = getSequenceVersionSteps(sequence.id, latestVersion.id);
  if (!versionSteps.length) {
    showStatus(statusEl, 'No steps in the latest version.', 'error');
    return;
  }
  const alreadyEnrolled = await isContactEnrolledInSequence(sequence.id, contact.id);
  if (alreadyEnrolled) {
    showStatus(statusEl, 'Cannot enroll a contact multiple times in a sequence.', 'error');
    return;
  }

  let startedAt = null;
  let startDateOverride = '';
  const immediate = startNow ? startNow.checked : true;
  if (immediate) {
    startedAt = formatTimeOnlyWithTZ(new Date());
  } else {
    const chosen = startDate ? startDate.value : '';
    const parsed = parseDateOnly(chosen);
    if (!chosen || !parsed) {
      showStatus(statusEl, 'Pick a start date.', 'error');
      return;
    }
    startedAt = formatTimeOnlyWithTZ(
      new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 8, 0, 0)
    );
    startDateOverride = formatDateOnly(parsed);
  }

  const payload = {
    sequence_id: Number(sequence.id),
    sequence_version_id: latestVersion.id,
    contact_id: Number(contact.id),
    started_at: startedAt,
    status: 'active',
    current_step: 1,
  };
  const { error } = await supabase.from('contact_sequence_enrollments').insert(payload);
  if (error) {
    console.error('Error enrolling contact (quick modal):', error);
    const msg = error.message || 'Could not enroll contact.';
    showStatus(statusEl, msg, 'error');
    return;
  }
  const weekdaysOnly = weekdaysOnlyToggle ? weekdaysOnlyToggle.checked : true;
  setSequenceWeekdayPref(sequence.id, contact.id, weekdaysOnly);
  const firstStep = versionSteps[0];
  if (firstStep) {
    const newTask = await createSequenceTask(
      sequence.id,
      contact.id,
      firstStep,
      weekdaysOnly,
      immediate ? '' : startDateOverride,
      latestVersion.id
    );
    if (newTask) {
      await refreshTaskViews();
      if (immediate) {
        openSequenceTaskModal(newTask);
      }
    }
  }
  showStatus(statusEl, 'Contact enrolled!', 'success');
  seqInput.value = '';
  seqInput.dataset.sequenceId = '';
  contactInput.value = '';
  closeSequenceQuickEnrollModal();
}

function handleSequenceEditTemplateSearch(event) {
  const searchVal = (event.target.value || '').trim().toLowerCase();
  const select = document.getElementById('sequenceStepEditTemplate');
  if (!select) return;
  const found = Array.from(select.options).find(
    (opt) => opt.value && opt.textContent.toLowerCase() === searchVal
  );
  if (found) {
    select.value = found.value;
  }
}

function closeSequenceStepEditModal() {
  const modal = document.getElementById('sequenceStepEditModal');
  const statusEl = document.getElementById('sequenceStepEditStatus');
  if (!modal) return;
  modal.classList.add('hidden');
  if (statusEl) showStatus(statusEl, '');
  modal.dataset.stepId = '';
}

async function handleSequenceStepEditSave(event) {
  event.preventDefault();
  const modal = document.getElementById('sequenceStepEditModal');
  if (!modal) return;
  const stepId = modal.dataset.stepId;
  if (!stepId) return;
  const nameInput = document.getElementById('sequenceStepEditName');
  const delayInput = document.getElementById('sequenceStepEditDelay');
  const templateSearch = document.getElementById('sequenceStepEditTemplateSearch');
  const templateIdInput = document.getElementById('sequenceStepEditTemplateId');
  const templateLabel = document.getElementById('sequenceStepEditTemplateLabel');
  const statusEl = document.getElementById('sequenceStepEditStatus');
  const steps = state.sequenceEditingSteps || [];
  const idx = steps.findIndex((s) => String(s.id) === String(stepId));
  if (idx === -1) return;
  const step = steps[idx];
  const name = nameInput.value.trim();
  if (!name) {
    showStatus(statusEl, 'Step name is required.', 'error');
    return;
  }
  const delayVal = Number(delayInput.value || 0);
  if (Number.isNaN(delayVal) || delayVal < 0) {
    showStatus(statusEl, 'Delay must be 0 or more.', 'error');
    return;
  }
  const isEmail = step.step_type === 'email';
  let templateId = null;
  if (isEmail) {
    const storedId = templateIdInput?.value || templateSearch?.dataset.templateId || '';
    if (storedId) {
      templateId = storedId;
    } else if (templateSearch && templateSearch.value) {
      const match = state.templates.find(
        (t) => (t.name || '').toLowerCase() === templateSearch.value.trim().toLowerCase()
      );
      if (match) {
        templateId = match.id;
      }
    }
    if (!templateId) {
      showStatus(statusEl, 'Select an email template.', 'error');
      return;
    }
  }
  const newSteps = [...steps];
  newSteps[idx] = {
    ...step,
    name,
    template_id: isEmail ? Number(templateId) : null,
    delay_days: step.position === 1 ? 0 : delayVal,
  };
  state.sequenceEditingSteps = newSteps;
  const delays = [...state.sequenceEditingDelays];
  delays[idx] = step.position === 1 ? 0 : delayVal;
  delays[0] = 0;
  state.sequenceEditingDelays = delays;
  showStatus(statusEl, 'Saved locally. Click Save to persist.', 'success');
  openSequencePreview(state.editingSequenceId);
  closeSequenceStepEditModal();
}

function toggleSequencePreviewModal(show = true) {
  const modal = document.getElementById('sequencePreviewModal');
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
  if (show) {
    populateSequenceEnrollOptions();
  }
}

function populateSequenceEnrollOptions() {
  const datalist = document.getElementById('sequenceEnrollOptions');
  if (!datalist) return;
  const options = [];
  state.contacts.forEach((c) => {
    const label = buildContactLabel(c);
    options.push(`<option value="${label}"></option>`);
  });
  datalist.innerHTML = options.join('');
}

function buildSequenceTaskTitle(sequence, step, company) {
  const seqName = sequence?.name || 'Sequence';
  const stepName = step?.name || 'Step';
  const companyName = company?.name || 'Company';
  return `${seqName} • ${stepName} • ${companyName}`;
}

async function createSequenceTask(
  sequenceId,
  contactId,
  step,
  weekdaysOnly,
  dueDateOverride = '',
  sequenceVersionId = null
) {
  const sequence = state.sequences.find((s) => String(s.id) === String(sequenceId));
  const contact = state.contacts.find((c) => String(c.id) === String(contactId));
  const company =
    contact && state.companies.find((co) => String(co.id) === String(contact.company_id));
  if (!step) return null;
  const stepDelay =
    step.step_order === 1 || step.position === 1 ? 0 : Number(step.delay_days || 0);
  const dueDate =
    dueDateOverride ||
    computeSequenceDueDate(stepDelay, weekdaysOnly, new Date());

  // Snapshot template at creation time using latest template content for this enrollment
  let snapshotSubject = step.template_subject || null;
  let snapshotBody = step.template_body || null;
  if (step.step_type === 'email' && step.template_id) {
    const tpl = state.templates.find((t) => String(t.id) === String(step.template_id));
    if (tpl) {
      snapshotSubject = tpl.subject || snapshotSubject || null;
      snapshotBody = tpl.body || snapshotBody || null;
    }
  }

  const payload = {
    title: buildSequenceTaskTitle(sequence, step, company),
    contact_id: contact ? contact.id : null,
    company_id: company ? company.id : null,
    sequence_id: Number(sequenceId),
    sequence_version_id: sequenceVersionId || step.sequence_version_id || null,
    sequence_step_id: step.id,
    due_date: dueDate,
    status: 'open',
    task_type: step.step_type || step.type || 'task',
    template_id: step.template_id || null,
    template_subject: snapshotSubject,
    template_body: snapshotBody,
  };
  const { data, error } = await supabase.from('tasks').insert(payload).select().single();
  if (error) {
    console.error('Failed to create sequence task', error);
    alert('Could not create sequence task.');
    return null;
  }
  const newTask = data;
  state.tasks = [newTask, ...state.tasks];
  renderTaskList();
  return newTask;
}

async function handleSequenceEnroll() {
  const statusEl = document.getElementById('sequenceEnrollStatus');
  const input = document.getElementById('sequenceEnrollInput');
  const startNow = document.getElementById('sequenceStartNow');
  const startDateTime = document.getElementById('sequenceStartDateTime');
  const weekdaysOnlyToggle = document.getElementById('sequenceWeekdaysOnly');
  if (!state.selectedSequenceId) {
    showStatus(statusEl, 'Select a sequence first.', 'error');
    return;
  }
  const userEntry = input.value.trim();
  if (!userEntry) {
    showStatus(statusEl, 'Select a contact to enroll.', 'error');
    return;
  }
  const normalizedEntry = userEntry.toLowerCase();
  let startedAt = null;
  let startDateOverride = '';
  const isImmediate = startNow ? startNow.checked : true;
  if (isImmediate) {
    startedAt = formatTimeOnlyWithTZ(new Date());
  } else {
    const chosen = startDateTime ? startDateTime.value : '';
    const parsed = parseDateOnly(chosen);
    if (!chosen || !parsed) {
      showStatus(statusEl, 'Pick a start date.', 'error');
      return;
    }
    startedAt = formatTimeOnlyWithTZ(
      new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 8, 0, 0)
    );
    startDateOverride = formatDateOnly(parsed);
  }
  let contact =
    state.contacts.find((c) => String(c.id) === userEntry) ||
    state.contacts.find((c) => buildContactLabel(c).toLowerCase() === normalizedEntry);
  if (!contact && normalizedEntry) {
    const partialMatches = state.contacts.filter((c) =>
      buildContactLabel(c).toLowerCase().includes(normalizedEntry)
    );
    if (partialMatches.length === 1) {
      contact = partialMatches[0];
    } else if (partialMatches.length > 1) {
      const names = partialMatches
        .slice(0, 3)
        .map((c) => buildContactLabel(c))
        .join(', ');
      const suffix = partialMatches.length > 3 ? ', ...' : '';
      showStatus(
        statusEl,
        `Multiple contacts match. Type more to narrow: ${names}${suffix}`,
        'error'
      );
      return;
    }
  }
  if (!contact) {
    showStatus(statusEl, 'Contact not found. Please choose a valid contact.', 'error');
    return;
  }
  const contactId = contact.id;
  const alreadyEnrolled = await isContactEnrolledInSequence(state.selectedSequenceId, contactId);
  if (alreadyEnrolled) {
    showStatus(statusEl, 'Cannot enroll a contact multiple times in a sequence.', 'error');
    return;
  }
  const latestVersion = getLatestSequenceVersion(state.selectedSequenceId);
  if (!latestVersion) {
    showStatus(statusEl, 'No published version found for this sequence.', 'error');
    return;
  }
  const versionSteps = getSequenceVersionSteps(state.selectedSequenceId, latestVersion.id);
  if (!versionSteps.length) {
    showStatus(statusEl, 'No steps found for the latest version of this sequence.', 'error');
    return;
  }
  const payload = {
    sequence_id: Number(state.selectedSequenceId),
    sequence_version_id: latestVersion.id,
    contact_id: Number(contactId),
    started_at: startedAt,
    status: 'active',
    current_step: 1,
  };
  const { error } = await supabase.from('contact_sequence_enrollments').insert(payload);
  if (error) {
    console.error('Error enrolling contact:', error);
    const msg = error.message || 'Could not enroll contact.';
    showStatus(statusEl, msg, 'error');
    return;
  }
  const weekdaysOnly = weekdaysOnlyToggle ? weekdaysOnlyToggle.checked : true;
  setSequenceWeekdayPref(state.selectedSequenceId, contactId, weekdaysOnly);
  const firstStep = versionSteps[0];
  if (firstStep) {
    const newTask = await createSequenceTask(
      state.selectedSequenceId,
      contactId,
      firstStep,
      weekdaysOnly,
      isImmediate ? '' : startDateOverride,
      latestVersion.id
    );
    if (newTask) {
      await refreshTaskViews();
      if (isImmediate) {
        openSequenceTaskModal(newTask);
      }
    }
  }
  showStatus(statusEl, 'Contact enrolled!', 'success');
  input.value = '';
}

function formatTimeWithTZ(dateObj) {
  return dateObj.toISOString();
}

function formatTimeOnlyWithTZ(dateObj) {
  const d = new Date(dateObj);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const offsetMin = d.getTimezoneOffset();
  const sign = offsetMin > 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  const offH = String(Math.floor(abs / 60)).padStart(2, '0');
  const offM = String(abs % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}${sign}${offH}:${offM}`;
}

function normalizeMoneyInput(inputEl) {
  if (!inputEl) return;
  inputEl.setAttribute('step', 'any');
  const handler = () => {
    const raw = (inputEl.value || '').trim();
    if (!raw) return;
    const num = Number(raw);
    if (Number.isNaN(num) || num < 0) {
      inputEl.value = '';
      return;
    }
    inputEl.value = Number(num.toFixed(2)).toFixed(2);
  };
  inputEl.addEventListener('blur', handler);
  inputEl.addEventListener('change', handler);
}
