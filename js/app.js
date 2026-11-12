/**
 * app.js - Main Application Controller
 * Daily Devotions - Bible Companion PWA
 */

(function () {
  'use strict';

  // --- App State ---
  const state = {
    activeView: 'home',
    todayDateStr: '2026-11-03', // Local time anchor
    simulatedTodayDay: 3,        // Day 3 of November 2026
    currentDay: 3,               // Day currently selected in devotion view
    activePassageIndex: 'all',
    fontSize: 'normal',          // 'small', 'normal', 'large', 'xlarge'
    fontFamily: 'serif',         // 'serif', 'sans'
    theme: 'dark',
    journalTab: 'entries',       // 'entries', 'gallery' (legacy compatibility)
    journalCategory: 'all',      // 'all', 'devotions', 'sunday', 'highlights', 'gallery'
    selectedTagFilter: null,     // null or tag string (e.g. 'faith')
    selectedVerses: [],          // array of selected verse objects in devotion view
    get selectedVerse() {
      return this.selectedVerses && this.selectedVerses.length > 0 ? this.selectedVerses[0] : null;
    },
    set selectedVerse(v) {
      if (!v) {
        this.selectedVerses = [];
      } else {
        this.selectedVerses = [v];
      }
    },
    activeHighlightFilter: 'all', // 'all', 'gold', 'green', 'blue', 'purple'
    devotionTags: [],            // array of tags for active devotion
    sundayTags: [],              // array of tags for Sunday modal
    activeSundayDateStr: null,   // active date for Sunday modal
    selectedJournalMonth: '2026-11',
    soapFormatEnabled: false,
    isCurrentDayLocked: false,
    cardGen: {
      verseText: '',
      reference: '',
      reflection: '',
      photoDataUrl: null,
      aspect: 'portrait',
      theme: 'midnight',
      includeReflection: false,
      includeWatermark: true
    },
    activeSummaryMonth: '2026-11'
  };

  // DOM Elements cache
  const el = {};

  // --- Init on DOM Ready ---
  document.addEventListener('DOMContentLoaded', async () => {
    cacheDomElements();
    initTheme();
    initDate();
    initServiceWorker();
    
    // Check URL parameters & hash
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('day')) {
      const qDay = Number(urlParams.get('day'));
      if (qDay >= 1 && qDay <= 30) {
        state.currentDay = qDay;
      }
    }
    if (urlParams.has('version')) {
      window.bibleService.setTranslation(urlParams.get('version'));
    }
    if (urlParams.has('view')) {
      const v = urlParams.get('view');
      if (['home', 'devotion', 'calendar', 'journal', 'settings'].includes(v)) {
        state.activeView = v;
      }
    }

    // Initialize services
    await window.bibleService.init();

    // Load SOAP format preference
    state.soapFormatEnabled = window.devotionStore ? !!window.devotionStore.getSetting('soap_format', false) : false;
    applySoapModeUI();
    
    bindEvents();
    setupAlarmCallbacks();
    setupTTSPlayer();

    // Check hash for view
    const initialView = window.location.hash.replace('#', '');
    if (['home', 'devotion', 'calendar', 'journal', 'settings'].includes(initialView)) {
      state.activeView = initialView;
    }

    renderAll();
    switchView(state.activeView);

    window.addEventListener('hashchange', () => {
      const view = window.location.hash.replace('#', '');
      if (['home', 'devotion', 'calendar', 'journal', 'settings'].includes(view)) {
        switchView(view);
      }
    });

    // Check if offline chapters already cached
    updateOfflineStatusBadge();

    // Query param deep links
    if (urlParams.has('modal')) {
      const m = urlParams.get('modal');
      if (m === 'scope') {
        openScopeModal('journal', 'Delete All Journal Entries', 'Choose whether to delete journal entries for this month or all months:');
      } else if (m === 'alarm') {
        if (el.modalAlarmRing) el.modalAlarmRing.classList.add('active');
      }
    }
    if (urlParams.has('scroll')) {
      const targetEl = document.querySelector(urlParams.get('scroll'));
      if (targetEl && el.mainViewport) {
        targetEl.scrollIntoView({ block: 'center' });
      }
    }
  });

  function cacheDomElements() {
    // Navigation
    el.mainViewport = document.getElementById('main-viewport');
    el.navItems = document.querySelectorAll('.bottom-nav .nav-item');
    el.views = document.querySelectorAll('.app-view');

    // Header
    el.btnVersionPicker = document.getElementById('btn-version-picker');
    el.hdrVersionName = document.getElementById('hdr-version-name');
    el.btnThemeToggle = document.getElementById('btn-theme-toggle');
    el.btnHeaderSettings = document.getElementById('btn-header-settings');

    // Home View
    el.homeGreetingTitle = document.getElementById('home-greeting-title');
    el.homeGreetingDate = document.getElementById('home-date-str');
    el.homeRolodexBox = document.getElementById('home-rolodex-box');
    el.homeRolodexText = document.getElementById('home-rolodex-text');
    el.homeRolodexRef = document.getElementById('home-rolodex-ref');
    el.btnShuffleRolodex = document.getElementById('btn-shuffle-rolodex');
    el.heroDayTag = document.getElementById('hero-day-tag');
    el.heroStatusPill = document.getElementById('hero-status-pill');
    el.heroTitle = document.getElementById('hero-title');
    el.heroScriptures = document.getElementById('hero-scriptures');
    el.heroTime = document.getElementById('hero-time');
    el.heroPassagesCount = document.getElementById('hero-passages-count');
    el.heroDayOfYear = document.getElementById('hero-day-of-year');
    el.btnHeroAction = document.getElementById('btn-hero-action');
    el.heroActionIcon = document.getElementById('hero-action-icon');
    el.heroActionText = document.getElementById('hero-action-text');

    // Home Sunday Church Service Card
    el.homeSundayCard = document.getElementById('home-sunday-card');
    el.homeSundayAttendancePill = document.getElementById('home-sunday-attendance-pill');
    el.homeSundayTitle = document.getElementById('home-sunday-title');
    el.homeSundayDesc = document.getElementById('home-sunday-desc');
    el.btnHomeSundayAction = document.getElementById('btn-home-sunday-action');
    el.homeSundayActionIcon = document.getElementById('home-sunday-action-icon');
    el.homeSundayActionText = document.getElementById('home-sunday-action-text');

    // Stats
    el.statStreakCount = document.getElementById('stat-streak-count');
    el.statCompletedCount = document.getElementById('stat-completed-count');
    el.statCompletedPct = document.getElementById('stat-completed-pct');
    el.statMissedCount = document.getElementById('stat-missed-count');
    el.statRecoveredCount = document.getElementById('stat-recovered-count');

    // Quick cards
    el.cardNavCalendar = document.getElementById('card-nav-calendar');
    el.cardNavJournal = document.getElementById('card-nav-journal');
    el.cardNavSettings = document.getElementById('card-nav-settings');
    el.quickOfflineStatus = document.getElementById('quick-offline-status');

    // Devotion View
    el.btnPrevDay = document.getElementById('btn-prev-day');
    el.btnNextDay = document.getElementById('btn-next-day');
    el.devotionDaySubtitle = document.getElementById('devotion-day-subtitle');
    el.devotionDayTitle = document.getElementById('devotion-day-title');
    el.btnFontSmaller = document.getElementById('btn-font-smaller');
    el.btnFontLarger = document.getElementById('btn-font-larger');
    el.btnFontFamily = document.getElementById('btn-font-family');
    el.passageTabs = document.getElementById('passage-tabs');
    el.passagesContainer = document.getElementById('passages-container');

    // Devotion TTS / Read Aloud
    el.devotionTtsBanner = document.getElementById('devotion-tts-banner');
    el.btnReadAllTts = document.getElementById('btn-read-all-tts');
    el.btnReadAllIcon = document.getElementById('btn-read-all-icon');
    el.btnReadAllText = document.getElementById('btn-read-all-text');
    el.floatingTtsPlayer = document.getElementById('floating-tts-player');
    el.ttsPlayerTitle = document.getElementById('tts-player-title');
    el.ttsPlayerStatus = document.getElementById('tts-player-status');
    el.btnTtsPlayPause = document.getElementById('btn-tts-play-pause');
    el.btnTtsStop = document.getElementById('btn-tts-stop');
    el.btnTtsDownload = document.getElementById('btn-tts-download');

    // Notes & Image
    el.devotionNotesSection = document.getElementById('devotion-notes-section');
    el.devotionNotesInput = document.getElementById('devotion-notes-input');
    el.notesSaveBadge = document.getElementById('notes-save-badge');
    el.journalLockBadge = document.getElementById('journal-lock-badge');
    el.journalLockedNotice = document.getElementById('journal-locked-notice');
    el.devotionNotesHeaderText = document.getElementById('devotion-notes-header-text');
    el.btnToggleSoapDevotion = document.getElementById('btn-toggle-soap-devotion');
    el.notesStandardWrap = document.getElementById('notes-standard-wrap');
    el.notesSoapWrap = document.getElementById('notes-soap-wrap');
    el.soapScriptureInput = document.getElementById('soap-scripture-input');
    el.soapObservationInput = document.getElementById('soap-observation-input');
    el.soapApplicationInput = document.getElementById('soap-application-input');
    el.soapPrayerInput = document.getElementById('soap-prayer-input');
    el.devotionImageFile = document.getElementById('devotion-image-file');
    el.devotionImagePreview = document.getElementById('devotion-image-preview');
    el.devotionImagePreviewContainer = document.getElementById('devotion-image-preview-container');
    el.btnRemoveImage = document.getElementById('btn-remove-image');

    // Devotion Tags
    el.devotionTagsSection = document.getElementById('devotion-tags-section');
    el.devotionTagsChips = document.getElementById('devotion-tags-chips');
    el.devotionTagInput = document.getElementById('devotion-tag-input');
    el.btnAddDevotionTag = document.getElementById('btn-add-devotion-tag');
    el.devotionTagSuggestions = document.getElementById('devotion-tag-suggestions');

    // Floating Journal Notepad Sheet Elements (Mobile Portrait)
    el.devotionNotesSection = document.getElementById('devotion-notes-section');
    el.btnFloatingNotepad = document.getElementById('btn-floating-notepad');
    el.devotionJournalBackdrop = document.getElementById('devotion-journal-backdrop');
    el.btnCloseJournalSheet = document.getElementById('btn-close-journal-sheet');
    el.btnDoneJournalSheet = document.getElementById('btn-done-journal-sheet');
    el.notepadHasNotesBadge = document.getElementById('notepad-has-notes-badge');

    // Completion & Study Column
    el.viewDevotion = document.getElementById('view-devotion');
    el.devotionStudyCol = document.querySelector('.devotion-study-col');
    el.devotionCompleteSection = document.getElementById('devotion-complete-section');
    el.btnMarkComplete = document.getElementById('btn-mark-complete');
    el.completedBadgeCard = document.getElementById('completed-badge-card');
    el.completedTimestampText = document.getElementById('completed-timestamp-text');
    el.btnUnmarkComplete = document.getElementById('btn-unmark-complete');

    // Calendar View
    el.calDaysGrid = document.getElementById('cal-days-grid');
    el.calCompletedNum = document.getElementById('cal-completed-num');
    el.calRecoveredNum = document.getElementById('cal-recovered-num');
    el.calMissedNum = document.getElementById('cal-missed-num');

    // Journal View
    el.journalMonthSelect = document.getElementById('journal-month-select');
    el.btnToggleEntries = document.getElementById('btn-toggle-entries');
    el.btnToggleGallery = document.getElementById('btn-toggle-gallery');
    el.journalCategoryToggle = document.getElementById('journal-category-toggle');
    el.btnJournalCatAll = document.getElementById('btn-journal-cat-all');
    el.btnJournalCatDevotions = document.getElementById('btn-journal-cat-devotions');
    el.btnJournalCatSunday = document.getElementById('btn-journal-cat-sunday');
    el.btnJournalCatHighlights = document.getElementById('btn-journal-cat-highlights');
    el.btnJournalCatGallery = document.getElementById('btn-journal-cat-gallery');
    el.journalTagsBarWrap = document.getElementById('journal-tags-bar-wrap');
    el.journalTagsBar = document.getElementById('journal-tags-bar');
    el.journalEntriesTab = document.getElementById('journal-entries-tab');
    el.journalHighlightsTab = document.getElementById('journal-highlights-tab');
    el.journalHighlightsList = document.getElementById('journal-highlights-list');
    el.highlightsColorBar = document.getElementById('highlights-color-bar');
    el.journalGalleryTab = document.getElementById('journal-gallery-tab');
    el.journalEntriesList = document.getElementById('journal-entries-list');
    el.journalGalleryGrid = document.getElementById('journal-gallery-grid');

    // Floating Verse Action Bar (Phase 2 Highlighting)
    el.verseActionBar = document.getElementById('verse-action-bar');
    el.verseActionRefText = document.getElementById('verse-action-ref-text');
    el.verseActionSubText = document.getElementById('verse-action-sub-text');
    el.btnVerseCreateCard = document.getElementById('btn-verse-create-card');
    el.btnVerseCopy = document.getElementById('btn-verse-copy');
    el.btnVerseClear = document.getElementById('btn-verse-clear');
    el.btnVerseClose = document.getElementById('btn-verse-close');

    // Shareable Scripture Card Generator Modal (Phase 3)
    el.modalCardGenerator = document.getElementById('modal-card-generator');
    el.btnCloseCardGenerator = document.getElementById('btn-close-card-generator');
    el.scriptureCardCanvas = document.getElementById('scripture-card-canvas');
    el.canvasAspectFrame = document.getElementById('canvas-aspect-frame');
    el.aspectRatioSelector = document.getElementById('aspect-ratio-selector');
    el.cardThemesGrid = document.getElementById('card-themes-grid');
    el.btnThemePhoto = document.getElementById('btn-theme-photo');
    el.checkIncludeReflection = document.getElementById('check-include-reflection');
    el.checkIncludeWatermark = document.getElementById('check-include-watermark');
    el.btnCardSaveImage = document.getElementById('btn-card-save-image');
    el.btnCardShareNative = document.getElementById('btn-card-share-native');
    el.btnCardCopyClipboard = document.getElementById('btn-card-copy-clipboard');

    // Monthly Summary Infographic Modal (Phase 3)
    el.modalMonthlySummary = document.getElementById('modal-monthly-summary');
    el.btnCloseMonthlySummary = document.getElementById('btn-close-monthly-summary');
    el.summaryMonthSelect = document.getElementById('summary-month-select');
    el.summaryInfographicCard = document.getElementById('summary-infographic-card');
    el.summaryBannerMonthTitle = document.getElementById('summary-banner-month-title');
    el.summaryMetricPct = document.getElementById('summary-metric-pct');
    el.summaryMetricDays = document.getElementById('summary-metric-days');
    el.summaryMetricStreak = document.getElementById('summary-metric-streak');
    el.summaryMetricSunday = document.getElementById('summary-metric-sunday');
    el.summaryMetricNotes = document.getElementById('summary-metric-notes');
    el.summaryMetricHighlights = document.getElementById('summary-metric-highlights');
    el.summaryMetricPhotos = document.getElementById('summary-metric-photos');
    el.summaryTopTagsChips = document.getElementById('summary-top-tags-chips');
    el.summaryBlessingText = document.getElementById('summary-blessing-text');
    el.summaryBlessingVerse = document.getElementById('summary-blessing-verse');
    el.btnSummarySaveImage = document.getElementById('btn-summary-save-image');
    el.btnSummaryShareNative = document.getElementById('btn-summary-share-native');
    el.btnOpenMonthlySummary = document.getElementById('btn-open-monthly-summary');
    el.cardNavMonthlySummary = document.getElementById('card-nav-monthly-summary');

    // Sunday Church Service Modal
    el.modalSundayService = document.getElementById('modal-sunday-service');
    el.sundayModalDate = document.getElementById('sunday-modal-date');
    el.sundaySaveBadge = document.getElementById('sunday-save-badge');
    el.btnCloseSundayModal = document.getElementById('btn-close-sunday-modal');
    el.sundayAttendanceCard = document.getElementById('sunday-attendance-card');
    el.sundayAttendanceToggle = document.getElementById('sunday-attendance-toggle');
    el.sundayTitleInput = document.getElementById('sunday-title-input');
    el.sundaySpeakerInput = document.getElementById('sunday-speaker-input');
    el.sundayNotesInput = document.getElementById('sunday-notes-input');
    el.sundayTagsChips = document.getElementById('sunday-tags-chips');
    el.sundayTagInput = document.getElementById('sunday-tag-input');
    el.btnAddSundayTag = document.getElementById('btn-add-sunday-tag');
    el.sundayTagSuggestions = document.getElementById('sunday-tag-suggestions');
    el.btnDoneSundayModal = document.getElementById('btn-done-sunday-modal');
    el.btnDeleteSundayModal = document.getElementById('btn-delete-sunday-modal');

    // Settings View - Alarms & Notifications
    el.settingsSnoozeCard = document.getElementById('settings-snooze-card');
    el.settingsSnoozeText = document.getElementById('settings-snooze-text');
    el.btnCancelActiveSnooze = document.getElementById('btn-cancel-active-snooze');

    el.settingAlarmToggle = document.getElementById('setting-alarm-toggle');
    el.settingAlarmTime = document.getElementById('setting-alarm-time');
    el.settingAlarmTone = document.getElementById('setting-alarm-tone');
    el.settingSnoozeDuration = document.getElementById('setting-snooze-duration');
    el.btnTestAlarmSound = document.getElementById('btn-test-alarm-sound');
    el.settingEveningToggle = document.getElementById('setting-evening-toggle');
    el.btnRequestNotifPerm = document.getElementById('btn-request-notif-perm');
    el.notifPermStatus = document.getElementById('notif-perm-status');
    el.btnTest7pm = document.getElementById('btn-test-7pm');
    el.btnTest9pm = document.getElementById('btn-test-9pm');

    // Settings View - Data & Storage Management
    el.statDataCompletions = document.getElementById('stat-data-completions');
    el.statDataNotes = document.getElementById('stat-data-notes');
    el.statDataPhotos = document.getElementById('stat-data-photos');
    el.statDataChapters = document.getElementById('stat-data-chapters');
    el.statDataTts = document.getElementById('stat-data-tts');

    el.btnDownloadMonth = document.getElementById('btn-download-month');
    el.btnClearScriptureCache = document.getElementById('btn-clear-scripture-cache');
    el.downloadProgressBar = document.getElementById('download-progress-bar');
    el.downloadProgressPct = document.getElementById('download-progress-pct');
    el.downloadProgressText = document.getElementById('download-progress-text');

    el.btnExportData = document.getElementById('btn-export-data');
    el.btnImportDataTrigger = document.getElementById('btn-import-data-trigger');
    el.inputImportBackup = document.getElementById('input-import-backup');

    // Data Deletion (User Requirement 5)
    el.btnDeleteJournalEntries = document.getElementById('btn-delete-journal-entries');
    el.btnDeleteImages = document.getElementById('btn-delete-images');
    el.btnDeleteScriptures = document.getElementById('btn-delete-scriptures');
    el.btnDeleteTts = document.getElementById('btn-delete-tts');
    el.btnResetDevotionProgress = document.getElementById('btn-reset-devotion-progress');
    el.btnDeleteAllData = document.getElementById('btn-delete-all-data');

    // Deletion Scope Modal
    el.modalScopeDelete = document.getElementById('modal-scope-delete');
    el.scopeDeleteTitle = document.getElementById('scope-delete-title');
    el.scopeDeleteDesc = document.getElementById('scope-delete-desc');
    el.scopeMonthName = document.getElementById('scope-month-name');
    el.radioScopeMonth = document.getElementById('radio-scope-month');
    el.radioScopeAll = document.getElementById('radio-scope-all');
    el.scopeBoxMonth = document.getElementById('scope-box-month');
    el.scopeBoxAll = document.getElementById('scope-box-all');
    el.btnScopeContinue = document.getElementById('btn-scope-continue');
    el.btnScopeCancel = document.getElementById('btn-scope-cancel');

    // Settings View - Preferences
    el.settingSoapToggle = document.getElementById('setting-soap-toggle');
    el.settingVersionDropdown = document.getElementById('setting-version-dropdown');
    el.settingFontFamily = document.getElementById('setting-font-family');
    el.btnSettingsThemeToggle = document.getElementById('btn-settings-theme-toggle');
    el.settingsThemeIcon = document.getElementById('settings-theme-icon');
    el.settingsThemeLabel = document.getElementById('settings-theme-label');

    // TTS Audio Settings
    el.settingTtsRate = document.getElementById('setting-tts-rate');
    el.settingTtsVoice = document.getElementById('setting-tts-voice');
    el.btnTestTtsVoice = document.getElementById('btn-test-tts-voice');
    el.settingGoogleTtsKey = document.getElementById('setting-google-tts-key');
    el.btnSaveGoogleTtsKey = document.getElementById('btn-save-google-tts-key');

    // Modals
    el.modalVersionPicker = document.getElementById('modal-version-picker');
    el.btnCloseVersionModal = document.getElementById('btn-close-version-modal');
    el.versionOptionsList = document.getElementById('version-options-list');

    el.modalAlarmRing = document.getElementById('modal-alarm-ring');
    el.alarmModalTitle = document.getElementById('alarm-modal-title');
    el.alarmModalQuote = document.getElementById('alarm-modal-quote');
    el.btnAlarmStartDevotion = document.getElementById('btn-alarm-start-devotion');
    el.btnDismissAlarm = document.getElementById('btn-dismiss-alarm');
    el.customSnoozeTime = document.getElementById('custom-snooze-time');
    el.btnCustomSnooze = document.getElementById('btn-custom-snooze');

    el.modalLightbox = document.getElementById('modal-lightbox');
    el.btnCloseLightbox = document.getElementById('btn-close-lightbox');
    el.lightboxImg = document.getElementById('lightbox-img');
    el.lightboxDate = document.getElementById('lightbox-date');
    el.lightboxCaption = document.getElementById('lightbox-caption');
    el.lightboxScripture = document.getElementById('lightbox-scripture');
    el.btnLightboxGoto = document.getElementById('btn-lightbox-goto');
    el.btnLightboxDelete = document.getElementById('btn-lightbox-delete');

    // Journal Entry Floating Panel
    el.modalJournalEntry = document.getElementById('modal-journal-entry');
    el.btnCloseJournalPanel = document.getElementById('btn-close-journal-panel');
    el.journalPanelDate = document.getElementById('journal-panel-date');
    el.journalPanelScripture = document.getElementById('journal-panel-scripture');
    el.journalPanelCompBadge = document.getElementById('journal-panel-comp-badge');
    el.journalPanelBody = document.getElementById('journal-panel-body');
    el.btnJournalPanelGoto = document.getElementById('btn-journal-panel-goto');
    el.btnJournalPanelDelete = document.getElementById('btn-journal-panel-delete');

    // Confirmation Modal
    el.modalConfirm = document.getElementById('modal-confirm');
    el.confirmModalIcon = document.getElementById('confirm-modal-icon');
    el.confirmModalTitle = document.getElementById('confirm-modal-title');
    el.confirmModalDesc = document.getElementById('confirm-modal-desc');
    el.btnConfirmProceed = document.getElementById('btn-confirm-proceed');
    el.btnConfirmCancel = document.getElementById('btn-confirm-cancel');

    // Toast & Canvas
    el.appToast = document.getElementById('app-toast');
    el.toastMessage = document.getElementById('toast-message');
    el.confettiCanvas = document.getElementById('confetti-canvas');

    // App Version & Force Update
    el.btnForceUpdate = document.getElementById('btn-force-update');
    el.appUpdateStatusText = document.getElementById('app-update-status-text');
    el.updateBanner = document.getElementById('update-banner');
    el.btnBannerUpdate = document.getElementById('btn-banner-update');
    el.btnBannerDismiss = document.getElementById('btn-banner-dismiss');
  }

  // --- Date Initialization ---
  function initDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    // Anchor to active schedule (November 2026) using device's calendar day
    if (year === 2026 && month === 11) {
      state.simulatedTodayDay = Math.min(30, Math.max(1, day));
    } else {
      state.simulatedTodayDay = (day >= 1 && day <= 30) ? day : 3;
    }
    state.currentDay = state.simulatedTodayDay;
    state.todayDateStr = `2026-11-${String(state.simulatedTodayDay).padStart(2, '0')}`;
  }

  // --- Theme Management ---
  function updateThemeMeta(theme) {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0F172A' : '#FFFFFF');
    }
    if (el.settingsThemeIcon && el.settingsThemeLabel) {
      el.settingsThemeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
      el.settingsThemeLabel.textContent = theme === 'dark' ? 'Dark Midnight' : 'Clean Light';
    }
  }

  function initTheme() {
    const savedTheme = window.devotionStore.getSetting('theme', 'dark');
    state.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (el.btnThemeToggle) {
      el.btnThemeToggle.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
    }
    updateThemeMeta(savedTheme);
  }

  function setTheme(themeName) {
    state.theme = themeName;
    document.documentElement.setAttribute('data-theme', state.theme);
    window.devotionStore.setSetting('theme', state.theme);
    if (el.btnThemeToggle) {
      el.btnThemeToggle.textContent = state.theme === 'dark' ? '🌙' : '☀️';
    }
    updateThemeMeta(state.theme);
  }

  function toggleTheme() {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
    showToast(`Switched to ${state.theme === 'dark' ? 'Dark Midnight' : 'Clean Light'} theme`);
  }

  // --- Navigation & Views ---
  function switchView(viewName) {
    closeJournalSheet();
    closeVerseActionBar();
    state.activeView = viewName;
    el.views.forEach(v => {
      if (v.id === `view-${viewName}`) {
        v.classList.add('active');
      } else {
        v.classList.remove('active');
      }
    });

    el.navItems.forEach(item => {
      if (item.dataset.nav === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Scroll to top of main viewport unless deep link scroll requested
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('scroll') && el.mainViewport) {
      el.mainViewport.scrollTop = 0;
    }

    // View specific renders
    if (viewName === 'home') renderHome();
    if (viewName === 'devotion') {
      if (el.viewDevotion && window.ttsService && window.ttsService.state && window.ttsService.state.track) {
        el.viewDevotion.classList.add('tts-player-active');
      } else if (el.viewDevotion) {
        el.viewDevotion.classList.remove('tts-player-active');
      }
      renderDevotion(state.currentDay);
    }
    if (viewName === 'calendar') renderCalendar();
    if (viewName === 'journal') renderJournal();
    if (viewName === 'settings') renderSettings();

    if (urlParams.has('scroll')) {
      const targetEl = document.querySelector(urlParams.get('scroll'));
      if (targetEl) targetEl.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }

  // --- S.O.A.P. Journal Format Helpers ---
  function parseNoteData(rawNote, defaultScripture = '') {
    if (!rawNote) {
      return {
        format: state.soapFormatEnabled ? 'soap' : 'standard',
        scripture: defaultScripture || '',
        observation: '',
        application: '',
        prayer: '',
        text: ''
      };
    }
    if (typeof rawNote === 'string') {
      try {
        const parsed = JSON.parse(rawNote);
        if (parsed && typeof parsed === 'object' && (parsed.format === 'soap' || ('scripture' in parsed && 'observation' in parsed))) {
          const scripture = (parsed.scripture && parsed.scripture.trim()) ? parsed.scripture : (defaultScripture || '');
          return {
            format: 'soap',
            scripture,
            observation: parsed.observation || '',
            application: parsed.application || '',
            prayer: parsed.prayer || '',
            text: formatSoapAsText({ ...parsed, scripture })
          };
        }
      } catch (e) {
        // Plain text note
      }
      return {
        format: 'standard',
        scripture: defaultScripture || '',
        observation: rawNote, // Allow observation to receive prior standard note on conversion
        application: '',
        prayer: '',
        text: rawNote
      };
    }
    return {
      format: 'standard',
      scripture: defaultScripture || '',
      observation: '',
      application: '',
      prayer: '',
      text: ''
    };
  }

  function formatSoapAsText(soap) {
    const parts = [];
    if (soap.scripture) parts.push(`[SCRIPTURE]\n${soap.scripture}`);
    if (soap.observation) parts.push(`[OBSERVATION]\n${soap.observation}`);
    if (soap.application) parts.push(`[APPLICATION]\n${soap.application}`);
    if (soap.prayer) parts.push(`[PRAYER]\n${soap.prayer}`);
    return parts.join('\n\n');
  }

  function applySoapModeUI() {
    const isSoap = !!state.soapFormatEnabled;
    if (el.notesSoapWrap) el.notesSoapWrap.style.display = isSoap ? 'block' : 'none';
    if (el.notesStandardWrap) el.notesStandardWrap.style.display = isSoap ? 'none' : 'block';
    if (el.btnToggleSoapDevotion) {
      el.btnToggleSoapDevotion.textContent = isSoap ? 'SOAP: On' : 'SOAP: Off';
      if (isSoap) {
        el.btnToggleSoapDevotion.classList.add('active');
        el.btnToggleSoapDevotion.style.background = 'rgba(217, 119, 6, 0.25)';
        el.btnToggleSoapDevotion.style.borderColor = 'var(--accent-gold)';
        el.btnToggleSoapDevotion.style.color = 'var(--accent-gold)';
      } else {
        el.btnToggleSoapDevotion.classList.remove('active');
        el.btnToggleSoapDevotion.style.background = '';
        el.btnToggleSoapDevotion.style.borderColor = '';
        el.btnToggleSoapDevotion.style.color = '';
      }
    }
    if (el.devotionNotesHeaderText) {
      el.devotionNotesHeaderText.textContent = isSoap ? 'S.O.A.P. Devotion Journal' : 'My Notes & Reflection';
    }
    if (el.settingSoapToggle) {
      el.settingSoapToggle.checked = isSoap;
    }

    // Adjust Mark Day as Complete button so it never covers the Prayer section
    if (el.devotionCompleteSection) {
      el.devotionCompleteSection.classList.toggle('soap-active', isSoap);
    }
    if (el.devotionStudyCol) {
      el.devotionStudyCol.classList.toggle('soap-active', isSoap);
    }
    if (el.viewDevotion) {
      el.viewDevotion.classList.toggle('soap-active', isSoap);
    }
  }

  function setSoapFormatEnabled(enabled) {
    state.soapFormatEnabled = !!enabled;
    if (window.devotionStore) {
      window.devotionStore.setSetting('soap_format', state.soapFormatEnabled);
    }
    applySoapModeUI();

    // If on Devotion view, re-sync values so user sees their content seamlessly
    if (state.activeView === 'devotion') {
      const sched = window.bibleService.getDaySchedule(state.currentDay);
      const defaultScripture = sched ? sched.scriptures : '';

      if (state.soapFormatEnabled) {
        // Switching to SOAP
        if (el.soapScriptureInput && (!el.soapScriptureInput.value || !el.soapScriptureInput.value.trim()) && defaultScripture) {
          el.soapScriptureInput.value = defaultScripture;
        }
        if (el.soapObservationInput && !el.soapObservationInput.value && el.devotionNotesInput && el.devotionNotesInput.value) {
          try {
            const parsed = JSON.parse(el.devotionNotesInput.value);
            if (parsed && parsed.format === 'soap') {
              el.soapScriptureInput.value = parsed.scripture || defaultScripture;
              el.soapObservationInput.value = parsed.observation || '';
              el.soapApplicationInput.value = parsed.application || '';
              el.soapPrayerInput.value = parsed.prayer || '';
            } else {
              el.soapObservationInput.value = el.devotionNotesInput.value;
            }
          } catch {
            el.soapObservationInput.value = el.devotionNotesInput.value;
          }
        }
      } else {
        // Switching to Standard
        if (el.devotionNotesInput) {
          const currentSoap = {
            format: 'soap',
            scripture: el.soapScriptureInput ? el.soapScriptureInput.value : '',
            observation: el.soapObservationInput ? el.soapObservationInput.value : '',
            application: el.soapApplicationInput ? el.soapApplicationInput.value : '',
            prayer: el.soapPrayerInput ? el.soapPrayerInput.value : ''
          };
          if (currentSoap.observation || currentSoap.application || currentSoap.prayer) {
            el.devotionNotesInput.value = formatSoapAsText(currentSoap);
          }
        }
      }
    }
  }

  // --- Journal Autosave & Floating Sheet Helpers ---
  let noteSaveTimeout = null;

  function normalizeTag(raw) {
    if (!raw) return '';
    return raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();
  }

  // --- Tag UI Rendering Helpers ---
  function renderTagChips(containerEl, tags, isLocked, onRemove) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    if (!tags || !tags.length) {
      containerEl.style.display = 'none';
      return;
    }
    containerEl.style.display = 'flex';
    tags.forEach((tag, idx) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `<span>#${escapeHtml(tag)}</span>`;
      if (!isLocked) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'tag-chip-del';
        delBtn.title = `Remove #${tag}`;
        delBtn.innerHTML = '✕';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onRemove(idx);
        });
        chip.appendChild(delBtn);
      }
      containerEl.appendChild(chip);
    });
  }

  async function renderTagSuggestions(containerEl, currentTags, isLocked, onSelect) {
    if (!containerEl) return;
    if (isLocked) {
      containerEl.style.display = 'none';
      return;
    }
    const allTags = await window.devotionStore.getAllTags();
    const currentSet = new Set((currentTags || []).map(t => t.toLowerCase()));
    const available = allTags.filter(t => !currentSet.has(t.toLowerCase())).slice(0, 8);

    if (!available.length) {
      containerEl.style.display = 'none';
      containerEl.innerHTML = '';
      return;
    }

    containerEl.style.display = 'flex';
    containerEl.innerHTML = '<span class="tag-suggestion-label">Suggestions:</span>';
    available.forEach(tag => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'tag-suggestion-pill';
      pill.textContent = `+#${tag}`;
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(tag);
      });
      containerEl.appendChild(pill);
    });
  }

  function renderDevotionTagsUI() {
    renderTagChips(el.devotionTagsChips, state.devotionTags, state.isCurrentDayLocked, (idx) => {
      state.devotionTags.splice(idx, 1);
      renderDevotionTagsUI();
      triggerNotesSave(state.soapFormatEnabled);
    });
    renderTagSuggestions(el.devotionTagSuggestions, state.devotionTags, state.isCurrentDayLocked, (tag) => {
      addDevotionTag(tag);
    });
  }

  function addDevotionTag(rawTag) {
    if (state.isCurrentDayLocked) return;
    const clean = normalizeTag(rawTag);
    if (!clean) return;
    if (!state.devotionTags.some(t => t.toLowerCase() === clean)) {
      state.devotionTags.push(clean);
      renderDevotionTagsUI();
      triggerNotesSave(state.soapFormatEnabled);
    }
    if (el.devotionTagInput) el.devotionTagInput.value = '';
  }

  function renderSundayTagsUI() {
    renderTagChips(el.sundayTagsChips, state.sundayTags, false, (idx) => {
      state.sundayTags.splice(idx, 1);
      renderSundayTagsUI();
      triggerSundaySave();
    });
    renderTagSuggestions(el.sundayTagSuggestions, state.sundayTags, false, (tag) => {
      addSundayTag(tag);
    });
  }

  function addSundayTag(rawTag) {
    const clean = normalizeTag(rawTag);
    if (!clean) return;
    if (!state.sundayTags.some(t => t.toLowerCase() === clean)) {
      state.sundayTags.push(clean);
      renderSundayTagsUI();
      triggerSundaySave();
    }
    if (el.sundayTagInput) el.sundayTagInput.value = '';
  }

  async function executeNotesSave(isSoap) {
    if (state.isCurrentDayLocked) return;
    const dateStr = getDayDateStr(state.currentDay);
    const tags = state.devotionTags || [];

    if (isSoap) {
      const obsVal = el.soapObservationInput ? el.soapObservationInput.value.trim() : '';
      const appVal = el.soapApplicationInput ? el.soapApplicationInput.value.trim() : '';
      const prayerVal = el.soapPrayerInput ? el.soapPrayerInput.value.trim() : '';
      const hasUserReflections = Boolean(obsVal || appVal || prayerVal);

      if (!hasUserReflections && tags.length === 0) {
        if (window.devotionStore.deleteNote) {
          await window.devotionStore.deleteNote(dateStr);
        }
        if (el.notesSaveBadge) el.notesSaveBadge.innerHTML = '';
        await updateNotepadBadge();
        return;
      }

      const sched = window.bibleService.getDaySchedule(state.currentDay);
      const defaultScripture = sched ? sched.scriptures : '';
      const scriptureVal = (el.soapScriptureInput && el.soapScriptureInput.value.trim()) ? el.soapScriptureInput.value : defaultScripture;
      const soapObj = {
        format: 'soap',
        scripture: scriptureVal,
        observation: el.soapObservationInput ? el.soapObservationInput.value : '',
        application: el.soapApplicationInput ? el.soapApplicationInput.value : '',
        prayer: el.soapPrayerInput ? el.soapPrayerInput.value : '',
        tags: tags
      };
      await window.devotionStore.saveNote(dateStr, JSON.stringify(soapObj), tags);
    } else {
      const stdText = el.devotionNotesInput ? el.devotionNotesInput.value.trim() : '';
      if (!stdText && tags.length === 0) {
        if (window.devotionStore.deleteNote) {
          await window.devotionStore.deleteNote(dateStr);
        }
        if (el.notesSaveBadge) el.notesSaveBadge.innerHTML = '';
        await updateNotepadBadge();
        return;
      }
      await window.devotionStore.saveNote(dateStr, el.devotionNotesInput ? el.devotionNotesInput.value : '', tags);
    }
    if (el.notesSaveBadge) el.notesSaveBadge.innerHTML = '<span>✓</span> Saved';
    await updateNotepadBadge();
  }

  function triggerNotesSave(isSoap) {
    if (state.isCurrentDayLocked) return;
    clearTimeout(noteSaveTimeout);

    const tags = state.devotionTags || [];
    if (isSoap) {
      const obsVal = el.soapObservationInput ? el.soapObservationInput.value.trim() : '';
      const appVal = el.soapApplicationInput ? el.soapApplicationInput.value.trim() : '';
      const prayerVal = el.soapPrayerInput ? el.soapPrayerInput.value.trim() : '';
      const hasUserReflections = Boolean(obsVal || appVal || prayerVal);

      if (!hasUserReflections && tags.length === 0) {
        if (el.notesSaveBadge) el.notesSaveBadge.innerHTML = '';
        noteSaveTimeout = setTimeout(() => executeNotesSave(true), 300);
        return;
      }
    } else {
      const stdText = el.devotionNotesInput ? el.devotionNotesInput.value.trim() : '';
      if (!stdText && tags.length === 0) {
        if (el.notesSaveBadge) el.notesSaveBadge.innerHTML = '';
        noteSaveTimeout = setTimeout(() => executeNotesSave(false), 300);
        return;
      }
    }

    if (el.notesSaveBadge) el.notesSaveBadge.innerHTML = '⏳ Saving...';
    noteSaveTimeout = setTimeout(() => executeNotesSave(isSoap), 500);
  }

  function flushNotesSave() {
    if (noteSaveTimeout) {
      clearTimeout(noteSaveTimeout);
      noteSaveTimeout = null;
      executeNotesSave(state.soapFormatEnabled);
    }
  }

  async function updateNotepadBadge() {
    if (!el.notepadHasNotesBadge) return;
    try {
      const dateStr = getDayDateStr(state.currentDay);
      const rec = await window.devotionStore.getNoteRecord(dateStr);
      let hasContent = false;
      if (rec) {
        if (rec.tags && rec.tags.length > 0) hasContent = true;
        const note = rec.note;
        if (note && typeof note === 'string') {
          try {
            const parsed = JSON.parse(note);
            if (parsed && typeof parsed === 'object') {
              const obs = (parsed.observation || '').trim();
              const app = (parsed.application || '').trim();
              const pray = (parsed.prayer || '').trim();
              if (obs || app || pray) hasContent = true;
            } else if (note.trim()) {
              hasContent = true;
            }
          } catch (e) {
            if (note.trim()) hasContent = true;
          }
        }
      }
      el.notepadHasNotesBadge.style.display = hasContent ? 'inline-block' : 'none';
    } catch (err) {
      console.warn('Error updating notepad badge:', err);
    }
  }

  // --- Sunday Church Service Controller ---
  let activeSundayDateStr = null;
  let sundaySaveTimeout = null;

  function checkIsSunday(dateVal) {
    if (typeof dateVal === 'number') {
      return new Date(2026, 10, dateVal).getDay() === 0;
    }
    if (typeof dateVal === 'string') {
      const parts = dateVal.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay() === 0;
      }
    }
    return new Date().getDay() === 0;
  }

  async function updateHomeSundayCard() {
    if (!el.homeSundayCard) return;
    const todayNum = state.simulatedTodayDay;
    const todayStr = getDayDateStr(todayNum);
    const isSunday = checkIsSunday(todayNum) || (new Date().getDay() === 0);

    if (!isSunday) {
      el.homeSundayCard.style.display = 'none';
      return;
    }

    el.homeSundayCard.style.display = 'block';
    const rec = await window.devotionStore.getSundayService(todayStr);

    if (rec && rec.attended) {
      if (el.homeSundayAttendancePill) el.homeSundayAttendancePill.style.display = 'inline-flex';
      if (el.homeSundayActionIcon) el.homeSundayActionIcon.textContent = '✍️';
      if (el.homeSundayActionText) el.homeSundayActionText.textContent = 'Edit Sunday Service Notes';
      if (rec.title) {
        el.homeSundayDesc.textContent = `Sermon: "${rec.title}"${rec.speaker ? ' by ' + rec.speaker : ''}`;
      } else {
        el.homeSundayDesc.textContent = 'Attendance recorded for today’s church service.';
      }
    } else if (rec && (rec.title || rec.speaker || rec.notes || (rec.tags && rec.tags.length))) {
      if (el.homeSundayAttendancePill) el.homeSundayAttendancePill.style.display = 'none';
      if (el.homeSundayActionIcon) el.homeSundayActionIcon.textContent = '✍️';
      if (el.homeSundayActionText) el.homeSundayActionText.textContent = 'Edit Sunday Service Notes';
      if (rec.title) {
        el.homeSundayDesc.textContent = `Sermon: "${rec.title}"${rec.speaker ? ' by ' + rec.speaker : ''}`;
      } else {
        el.homeSundayDesc.textContent = 'Continue your sermon takeaways and notes.';
      }
    } else {
      if (el.homeSundayAttendancePill) el.homeSundayAttendancePill.style.display = 'none';
      if (el.homeSundayActionIcon) el.homeSundayActionIcon.textContent = '✍️';
      if (el.homeSundayActionText) el.homeSundayActionText.textContent = 'Record Sunday Service Notes';
      el.homeSundayDesc.textContent = 'Mark your attendance and record sermon notes & takeaways for today.';
    }
  }

  async function openSundayModal(dateStr) {
    activeSundayDateStr = dateStr || getDayDateStr(state.simulatedTodayDay);
    if (el.modalSundayService) {
      el.modalSundayService.classList.add('active');
    }

    const { day, dateObj } = parseDateParts(activeSundayDateStr);
    const dateFormatted = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    if (el.sundayModalDate) {
      el.sundayModalDate.textContent = dateFormatted;
    }

    const rec = await window.devotionStore.getSundayService(activeSundayDateStr);
    const attended = Boolean(rec && rec.attended);
    if (el.sundayAttendanceToggle) {
      el.sundayAttendanceToggle.checked = attended;
    }
    if (el.sundayAttendanceCard) {
      el.sundayAttendanceCard.classList.toggle('attended', attended);
    }
    if (el.sundayTitleInput) el.sundayTitleInput.value = (rec && rec.title) || '';
    if (el.sundaySpeakerInput) el.sundaySpeakerInput.value = (rec && rec.speaker) || '';
    if (el.sundayNotesInput) el.sundayNotesInput.value = (rec && rec.notes) || '';
    state.sundayTags = (rec && Array.isArray(rec.tags)) ? [...rec.tags] : [];

    const hasData = Boolean(rec && (rec.attended || rec.title || rec.speaker || rec.notes || (rec.tags && rec.tags.length)));
    if (el.btnDeleteSundayModal) {
      el.btnDeleteSundayModal.style.display = hasData ? 'inline-flex' : 'none';
    }

    renderSundayTagsUI();
    if (el.sundaySaveBadge) el.sundaySaveBadge.innerHTML = '';
  }

  function triggerSundaySave() {
    clearTimeout(sundaySaveTimeout);
    if (el.sundaySaveBadge) el.sundaySaveBadge.innerHTML = '<span>⏳</span> Saving...';
    sundaySaveTimeout = setTimeout(() => executeSundaySave(), 300);
  }

  async function executeSundaySave() {
    if (!activeSundayDateStr) return;
    const attended = Boolean(el.sundayAttendanceToggle && el.sundayAttendanceToggle.checked);
    const title = el.sundayTitleInput ? el.sundayTitleInput.value.trim() : '';
    const speaker = el.sundaySpeakerInput ? el.sundaySpeakerInput.value.trim() : '';
    const notes = el.sundayNotesInput ? el.sundayNotesInput.value.trim() : '';
    const tags = state.sundayTags || [];

    const hasContent = Boolean(attended || title || speaker || notes || tags.length);

    if (!hasContent) {
      await window.devotionStore.deleteSundayService(activeSundayDateStr);
      if (el.btnDeleteSundayModal) el.btnDeleteSundayModal.style.display = 'none';
      if (el.sundaySaveBadge) el.sundaySaveBadge.innerHTML = '';
    } else {
      await window.devotionStore.saveSundayService(activeSundayDateStr, {
        attended,
        title,
        speaker,
        notes,
        tags
      });
      if (el.btnDeleteSundayModal) el.btnDeleteSundayModal.style.display = 'inline-flex';
      if (el.sundaySaveBadge) el.sundaySaveBadge.innerHTML = '<span>✓</span> Auto-saved';
    }

    await updateHomeSundayCard();
    if (state.activeView === 'calendar') renderCalendar();
    if (state.activeView === 'journal') renderJournal();
  }

  function closeSundayModal() {
    clearTimeout(sundaySaveTimeout);
    executeSundaySave();
    if (el.modalSundayService) {
      el.modalSundayService.classList.remove('active');
    }
    activeSundayDateStr = null;
  }

  function openJournalSheet() {
    if (!el.devotionNotesSection) return;
    el.devotionNotesSection.classList.add('sheet-open');
    if (el.devotionJournalBackdrop) el.devotionJournalBackdrop.style.display = 'block';

    if (!state.isCurrentDayLocked) {
      setTimeout(() => {
        if (state.soapFormatEnabled && el.soapObservationInput) {
          el.soapObservationInput.focus();
        } else if (el.devotionNotesInput) {
          el.devotionNotesInput.focus();
        }
      }, 300);
    }
  }

  function closeJournalSheet() {
    flushNotesSave();
    if (el.devotionNotesSection) el.devotionNotesSection.classList.remove('sheet-open');
    if (el.devotionJournalBackdrop) el.devotionJournalBackdrop.style.display = 'none';
    updateNotepadBadge();
  }

  // --- Event Bindings ---
  function bindEvents() {
    // Navigation bar
    el.navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.nav;
        if (view === 'devotion') {
          // Default to today if switching directly
          renderDevotion(state.currentDay);
        }
        switchView(view);
      });
    });

    // Header buttons
    el.btnThemeToggle.addEventListener('click', toggleTheme);
    el.btnHeaderSettings.addEventListener('click', () => switchView('settings'));
    el.btnVersionPicker.addEventListener('click', openVersionModal);
    el.btnCloseVersionModal.addEventListener('click', closeVersionModal);

    // Shuffle BSB Scripture Rolodex
    if (el.btnShuffleRolodex) {
      el.btnShuffleRolodex.addEventListener('click', () => {
        const verse = window.bibleService.getRandomRolodexVerse();
        if (verse && el.homeRolodexText && el.homeRolodexRef) {
          el.homeRolodexText.textContent = verse.text;
          el.homeRolodexRef.textContent = `${verse.reference} (BSB)`;
          showToast('New verse on God’s Word 📖');
        }
      });
    }

    // Home Quick Navs
    el.btnHeroAction.addEventListener('click', () => {
      state.currentDay = state.simulatedTodayDay;
      switchView('devotion');
    });
    el.cardNavCalendar.addEventListener('click', () => switchView('calendar'));
    el.cardNavJournal.addEventListener('click', () => switchView('journal'));
    if (el.cardNavSettings) {
      el.cardNavSettings.addEventListener('click', () => switchView('settings'));
    }

    // Home Sunday Church Service Action Button
    if (el.btnHomeSundayAction) {
      el.btnHomeSundayAction.addEventListener('click', () => {
        openSundayModal(getDayDateStr(state.simulatedTodayDay));
      });
    }

    // Devotion View Controls
    el.btnPrevDay.addEventListener('click', () => {
      if (state.currentDay > 1) {
        state.currentDay--;
        renderDevotion(state.currentDay);
      }
    });
    el.btnNextDay.addEventListener('click', () => {
      // Allow user to navigate up to simulated today or review days
      if (state.currentDay < 30) {
        state.currentDay++;
        renderDevotion(state.currentDay);
      }
    });

    // Text formatting controls
    el.btnFontSmaller.addEventListener('click', () => adjustFontSize(-1));
    el.btnFontLarger.addEventListener('click', () => adjustFontSize(1));
    el.btnFontFamily.addEventListener('click', toggleFontFamily);

    // Notes auto-save event listeners
    if (el.devotionNotesInput) {
      el.devotionNotesInput.addEventListener('input', () => triggerNotesSave(false));
    }

    [el.soapScriptureInput, el.soapObservationInput, el.soapApplicationInput, el.soapPrayerInput].forEach(inp => {
      if (inp) {
        inp.addEventListener('input', () => triggerNotesSave(true));
      }
    });

    // Devotion Tags Events
    if (el.btnAddDevotionTag) {
      el.btnAddDevotionTag.addEventListener('click', () => {
        if (el.devotionTagInput) addDevotionTag(el.devotionTagInput.value);
      });
    }
    if (el.devotionTagInput) {
      el.devotionTagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          addDevotionTag(el.devotionTagInput.value);
        }
      });
    }

    // Floating Journal Sheet triggers (Mobile Portrait)
    if (el.btnFloatingNotepad) {
      el.btnFloatingNotepad.addEventListener('click', openJournalSheet);
    }
    if (el.btnCloseJournalSheet) {
      el.btnCloseJournalSheet.addEventListener('click', closeJournalSheet);
    }
    if (el.btnDoneJournalSheet) {
      el.btnDoneJournalSheet.addEventListener('click', closeJournalSheet);
    }
    if (el.devotionJournalBackdrop) {
      el.devotionJournalBackdrop.addEventListener('click', closeJournalSheet);
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && el.devotionNotesSection && el.devotionNotesSection.classList.contains('sheet-open')) {
        closeJournalSheet();
      }
    });

    if (el.btnToggleSoapDevotion) {
      el.btnToggleSoapDevotion.addEventListener('click', () => {
        if (state.isCurrentDayLocked) {
          showToast('Devotion is completed. Unmark completion to change journal format 🔒');
          return;
        }
        setSoapFormatEnabled(!state.soapFormatEnabled);
        showToast(state.soapFormatEnabled ? 'SOAP Journal format enabled' : 'Standard notes format enabled');
        triggerNotesSave(state.soapFormatEnabled);
      });
    }

    if (el.settingSoapToggle) {
      el.settingSoapToggle.addEventListener('change', () => {
        setSoapFormatEnabled(el.settingSoapToggle.checked);
        showToast(state.soapFormatEnabled ? 'SOAP Journal format enabled' : 'Standard notes format enabled');
      });
    }

    // Image Upload
    el.devotionImageFile.addEventListener('change', handleImageUpload);
    el.btnRemoveImage.addEventListener('click', handleImageRemove);

    // Completion Button (Requirement 3)
    el.btnMarkComplete.addEventListener('click', handleMarkComplete);
    el.btnUnmarkComplete.addEventListener('click', handleUnmarkComplete);

    // Journal View Category Controls
    const journalCategoryBtns = [
      { btn: el.btnJournalCatAll, cat: 'all' },
      { btn: el.btnJournalCatDevotions, cat: 'devotions' },
      { btn: el.btnJournalCatSunday, cat: 'sunday' },
      { btn: el.btnJournalCatHighlights, cat: 'highlights' },
      { btn: el.btnJournalCatGallery, cat: 'gallery' }
    ];

    journalCategoryBtns.forEach(({ btn, cat }) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        state.journalCategory = cat;
        state.journalTab = (cat === 'gallery') ? 'gallery' : (cat === 'highlights' ? 'highlights' : 'entries');
        journalCategoryBtns.forEach(c => {
          if (c.btn) c.btn.classList.toggle('active', c.cat === cat);
        });
        state.selectedTagFilter = null;
        renderJournal();
      });
    });

    // Highlights Color Filter Pills
    if (el.highlightsColorBar) {
      el.highlightsColorBar.querySelectorAll('.journal-tag-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          el.highlightsColorBar.querySelectorAll('.journal-tag-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.activeHighlightFilter = btn.dataset.highlightFilter || 'all';
          renderJournalHighlights(state.selectedJournalMonth || '2026-11');
        });
      });
    }

    // Verse Action Bar Controls (Phase 2)
    document.querySelectorAll('.verse-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const color = btn.dataset.color;
        if (color) handleVerseColorClick(color);
      });
    });

    if (el.btnVerseCopy) {
      el.btnVerseCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        handleVerseCopyClick();
      });
    }

    if (el.btnVerseClear) {
      el.btnVerseClear.addEventListener('click', (e) => {
        e.stopPropagation();
        handleVerseClearClick();
      });
    }

    if (el.btnVerseClose) {
      el.btnVerseClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeVerseActionBar();
      });
    }

    if (el.btnVerseCreateCard) {
      el.btnVerseCreateCard.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.selectedVerses && state.selectedVerses.length > 0) {
          const comb = getCombinedSelectionData();
          if (comb.isOverCardLimit) {
            showToast(`⚠️ Selected passage is too long for an image card (${comb.totalChars}/${comb.cardCharLimit} chars). Please select fewer verses.`, 3500);
            return;
          }

          openCardGenerator({
            verseText: comb.text,
            reference: comb.reference,
            translation: comb.translation || 'BSB',
            dayNum: comb.dayNum || state.currentDay,
            dateStr: comb.dateStr || getDayDateStr(state.currentDay)
          });

          // Exit selection mode once action is applied
          closeVerseActionBar();
        }
      });
    }

    // Shareable Scripture Card Generator Controls (Phase 3)
    if (el.btnCloseCardGenerator) {
      el.btnCloseCardGenerator.addEventListener('click', closeCardGenerator);
    }
    if (el.modalCardGenerator) {
      el.modalCardGenerator.addEventListener('click', (e) => {
        if (e.target === el.modalCardGenerator) closeCardGenerator();
      });
    }

    if (el.aspectRatioSelector) {
      el.aspectRatioSelector.querySelectorAll('.aspect-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          el.aspectRatioSelector.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.cardGen.aspect = btn.dataset.aspect || 'portrait';
          drawScriptureCard();
        });
      });
    }

    if (el.cardThemesGrid) {
      el.cardThemesGrid.querySelectorAll('.card-theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          el.cardThemesGrid.querySelectorAll('.card-theme-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.cardGen.theme = btn.dataset.theme || 'midnight';
          drawScriptureCard();
        });
      });
    }

    if (el.checkIncludeReflection) {
      el.checkIncludeReflection.addEventListener('change', () => {
        state.cardGen.includeReflection = el.checkIncludeReflection.checked;
        drawScriptureCard();
      });
    }

    if (el.checkIncludeWatermark) {
      el.checkIncludeWatermark.addEventListener('change', () => {
        state.cardGen.includeWatermark = el.checkIncludeWatermark.checked;
        drawScriptureCard();
      });
    }

    if (el.btnCardSaveImage) {
      el.btnCardSaveImage.addEventListener('click', downloadCardImage);
    }
    if (el.btnCardShareNative) {
      el.btnCardShareNative.addEventListener('click', shareCardImage);
    }
    if (el.btnCardCopyClipboard) {
      el.btnCardCopyClipboard.addEventListener('click', copyCardImage);
    }

    // Monthly Summary Infographic Controls (Phase 3)
    if (el.btnOpenMonthlySummary) {
      el.btnOpenMonthlySummary.addEventListener('click', () => {
        openMonthlySummary('2026-11');
      });
    }
    if (el.cardNavMonthlySummary) {
      el.cardNavMonthlySummary.addEventListener('click', () => {
        openMonthlySummary('2026-11');
      });
    }
    if (el.btnCloseMonthlySummary) {
      el.btnCloseMonthlySummary.addEventListener('click', closeMonthlySummary);
    }
    if (el.modalMonthlySummary) {
      el.modalMonthlySummary.addEventListener('click', (e) => {
        if (e.target === el.modalMonthlySummary) closeMonthlySummary();
      });
    }
    if (el.summaryMonthSelect) {
      el.summaryMonthSelect.addEventListener('change', (e) => {
        state.activeSummaryMonth = e.target.value;
        renderMonthlySummary(e.target.value);
      });
    }
    if (el.btnSummarySaveImage) {
      el.btnSummarySaveImage.addEventListener('click', saveMonthlySummaryImage);
    }
    if (el.btnSummaryShareNative) {
      el.btnSummaryShareNative.addEventListener('click', shareMonthlySummaryNative);
    }

    // Dismiss verse toolbar on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeVerseActionBar();
      }
    });

    if (el.btnToggleEntries) {
      el.btnToggleEntries.addEventListener('click', () => {
        state.journalCategory = 'all';
        state.journalTab = 'entries';
        renderJournal();
      });
    }
    if (el.btnToggleGallery) {
      el.btnToggleGallery.addEventListener('click', () => {
        state.journalCategory = 'gallery';
        state.journalTab = 'gallery';
        renderJournal();
      });
    }
    el.journalMonthSelect.addEventListener('change', (e) => {
      state.selectedJournalMonth = e.target.value;
      renderJournal();
    });

    // Sunday Church Service Modal Controls
    if (el.btnCloseSundayModal) {
      el.btnCloseSundayModal.addEventListener('click', closeSundayModal);
    }
    if (el.btnDoneSundayModal) {
      el.btnDoneSundayModal.addEventListener('click', closeSundayModal);
    }
    if (el.modalSundayService) {
      el.modalSundayService.addEventListener('click', (e) => {
        if (e.target === el.modalSundayService) {
          closeSundayModal();
        }
      });
    }

    if (el.sundayAttendanceToggle) {
      el.sundayAttendanceToggle.addEventListener('change', () => {
        if (el.sundayAttendanceCard) {
          el.sundayAttendanceCard.classList.toggle('attended', el.sundayAttendanceToggle.checked);
        }
        triggerSundaySave();
      });
    }

    if (el.sundayTitleInput) el.sundayTitleInput.addEventListener('input', triggerSundaySave);
    if (el.sundaySpeakerInput) el.sundaySpeakerInput.addEventListener('input', triggerSundaySave);
    if (el.sundayNotesInput) el.sundayNotesInput.addEventListener('input', triggerSundaySave);

    if (el.btnAddSundayTag) {
      el.btnAddSundayTag.addEventListener('click', () => {
        if (el.sundayTagInput) addSundayTag(el.sundayTagInput.value);
      });
    }
    if (el.sundayTagInput) {
      el.sundayTagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          addSundayTag(el.sundayTagInput.value);
        }
      });
    }

    if (el.btnDeleteSundayModal) {
      el.btnDeleteSundayModal.addEventListener('click', () => {
        showConfirmModal(
          'Delete Sunday Service Entry',
          'Are you sure you want to delete this Sunday service entry and attendance record?',
          '🗑️',
          async () => {
            if (activeSundayDateStr) {
              await window.devotionStore.deleteSundayService(activeSundayDateStr);
              closeConfirmModal();
              closeSundayModal();
              showToast('Sunday service entry deleted 🗑️');
            }
          },
          'Yes, Delete Entry',
          true
        );
      });
    }

    // Settings inputs
    el.settingAlarmToggle.addEventListener('change', saveAlarmSettings);
    el.settingAlarmTime.addEventListener('change', saveAlarmSettings);
    el.settingAlarmTone.addEventListener('change', saveAlarmSettings);
    el.settingSnoozeDuration.addEventListener('change', saveAlarmSettings);
    el.settingEveningToggle.addEventListener('change', saveAlarmSettings);

    el.btnTestAlarmSound.addEventListener('click', () => {
      const tone = el.settingAlarmTone.value;
      window.alarmService.playTone(tone);
      showToast('Playing tone preview 🔔');
    });

    el.btnRequestNotifPerm.addEventListener('click', async () => {
      const perm = await window.alarmService.requestNotificationPermission();
      updateNotifPermBadge(perm);
      if (perm === 'granted') {
        showToast('Push notifications enabled!');
      } else {
        showToast('Push notifications not allowed');
      }
    });

    el.btnTest7pm.addEventListener('click', () => {
      window.alarmService.triggerReminder(
        '7:00 PM Devotion Reminder',
        'You haven’t completed today’s devotion yet! Take 10 minutes to reflect on Scripture tonight.',
        '7pm'
      );
      showToast('Simulated 7:00 PM Reminder triggered!');
    });

    el.btnTest9pm.addEventListener('click', () => {
      window.alarmService.triggerReminder(
        '9:00 PM Night Reminder',
        'Keep your devotion streak alive! Complete today’s reading before winding down for sleep.',
        '9pm'
      );
      showToast('Simulated 9:00 PM Reminder triggered!');
    });

    el.btnDownloadMonth.addEventListener('click', handleDownloadMonthOffline);

    // Cancel Active Snooze
    if (el.btnCancelActiveSnooze) {
      el.btnCancelActiveSnooze.addEventListener('click', () => {
        window.alarmService.clearSnooze();
        if (el.settingsSnoozeCard) el.settingsSnoozeCard.style.display = 'none';
        showToast('Active snooze cancelled');
      });
    }

    // Clear Offline Scripture Cache
    if (el.btnClearScriptureCache) {
      el.btnClearScriptureCache.addEventListener('click', () => {
        showConfirmModal(
          'Clear Scripture Cache',
          'This will remove all downloaded chapters from local offline storage to free space. Your reflections, notes, and completions will NOT be affected.',
          '🗑️',
          async () => {
            await window.devotionStore.clearOfflineChapters();
            await renderSettings();
            showToast('Offline scripture cache cleared');
          }
        );
      });
    }

    // Export Data (JSON Backup)
    if (el.btnExportData) {
      el.btnExportData.addEventListener('click', async () => {
        try {
          const backup = await window.devotionStore.exportAllData();
          const jsonStr = JSON.stringify(backup, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `daily_devotions_backup_${state.todayDateStr}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('Devotions backup downloaded! 💾');
        } catch (e) {
          showToast('Failed to export backup');
        }
      });
    }

    // Import / Restore Backup
    if (el.btnImportDataTrigger && el.inputImportBackup) {
      el.btnImportDataTrigger.addEventListener('click', () => {
        el.inputImportBackup.click();
      });

      el.inputImportBackup.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const parsed = JSON.parse(evt.target.result);
            const dateNotice = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleDateString() : 'a previous backup';
            showConfirmModal(
              'Restore Devotions Backup',
              `Restore data from ${dateNotice}? This will merge completed devotions, notes, photos, and preferences into your app.`,
              '📥',
              async () => {
                await window.devotionStore.importData(parsed);
                await renderAll();
                showToast('Data successfully restored from backup! ✓');
              }
            );
          } catch (err) {
            showToast('Invalid backup file. Must be valid JSON.');
          }
        };
        reader.readAsText(file);
        el.inputImportBackup.value = '';
      });
    }

    // --- Data Deletion (User Requirement 5) ---
    if (el.scopeBoxMonth) {
      el.scopeBoxMonth.addEventListener('click', () => {
        if (el.radioScopeMonth) el.radioScopeMonth.checked = true;
        el.scopeBoxMonth.classList.add('selected');
        if (el.scopeBoxAll) el.scopeBoxAll.classList.remove('selected');
      });
    }

    if (el.scopeBoxAll) {
      el.scopeBoxAll.addEventListener('click', () => {
        if (el.radioScopeAll) el.radioScopeAll.checked = true;
        el.scopeBoxAll.classList.add('selected');
        if (el.scopeBoxMonth) el.scopeBoxMonth.classList.remove('selected');
      });
    }

    if (el.btnScopeCancel) {
      el.btnScopeCancel.addEventListener('click', closeScopeModal);
    }

    if (el.btnScopeContinue) {
      el.btnScopeContinue.addEventListener('click', () => {
        const isCurrentMonth = el.radioScopeMonth && el.radioScopeMonth.checked;
        const scopeMonth = isCurrentMonth ? '2026-11' : null;
        const scopeLabel = isCurrentMonth ? 'November 2026' : 'ALL months';
        closeScopeModal();

        const actionConfig = {
          journal: {
            title: 'Delete All Journal Entries',
            desc: `Are you sure you want to delete all journal entries for ${scopeLabel}? This cannot be undone.`,
            icon: '✍️',
            fn: () => window.devotionStore.deleteJournalEntries(scopeMonth),
            toast: `Journal entries for ${scopeLabel} deleted.`
          },
          images: {
            title: 'Delete All Images',
            desc: `Are you sure you want to delete all attached devotion photos for ${scopeLabel}? This cannot be undone.`,
            icon: '📷',
            fn: () => window.devotionStore.deleteImages(scopeMonth),
            toast: `Images for ${scopeLabel} deleted.`
          },
          scriptures: {
            title: 'Delete Scripture Data',
            desc: `Are you sure you want to delete cached scripture data for ${scopeLabel}? You can re-download scriptures anytime.`,
            icon: '📖',
            fn: () => window.devotionStore.deleteScriptureData(scopeMonth),
            toast: `Scripture data for ${scopeLabel} deleted.`
          },
          tts: {
            title: 'Delete Text-to-speech Data',
            desc: `Are you sure you want to delete stored read-aloud audio files for ${scopeLabel}?`,
            icon: '🔊',
            fn: () => window.devotionStore.deleteTTSData(scopeMonth),
            toast: `Text-to-speech data for ${scopeLabel} deleted.`
          },
          progress: {
            title: 'Reset Devotion Progress',
            desc: `Are you sure you want to reset devotion progress for ${scopeLabel}? This will delete completion history and streaks, and will delete journal entries and images as well.`,
            icon: '🔄',
            fn: () => window.devotionStore.resetDevotionProgress(scopeMonth),
            toast: `Devotion progress for ${scopeLabel} reset.`
          }
        };

        const conf = actionConfig[pendingDeleteAction];
        if (conf) {
          showConfirmModal(conf.title, conf.desc, conf.icon, async () => {
            await conf.fn();
            await renderAll();
            await renderSettings();
            showToast(conf.toast);
          });
        }
      });
    }

    if (el.btnDeleteJournalEntries) {
      el.btnDeleteJournalEntries.addEventListener('click', () => {
        openScopeModal('journal', 'Delete All Journal Entries', 'Choose whether to delete journal entries for this month or all months:');
      });
    }

    if (el.btnDeleteImages) {
      el.btnDeleteImages.addEventListener('click', () => {
        openScopeModal('images', 'Delete All Images', 'Choose whether to delete devotional photos for this month or all months:');
      });
    }

    if (el.btnDeleteScriptures) {
      el.btnDeleteScriptures.addEventListener('click', () => {
        openScopeModal('scriptures', 'Delete Scripture Data', 'Choose whether to delete cached scripture verses for this month or all months:');
      });
    }

    if (el.btnDeleteTts) {
      el.btnDeleteTts.addEventListener('click', () => {
        openScopeModal('tts', 'Delete Text-to-speech Data', 'Choose whether to delete stored read-aloud audio files for this month or all months:');
      });
    }

    if (el.btnResetDevotionProgress) {
      el.btnResetDevotionProgress.addEventListener('click', () => {
        openScopeModal('progress', 'Reset Devotion Progress', 'Choose whether to reset devotion progress (including journal entries & images) for this month or all months:');
      });
    }

    if (el.btnDeleteAllData) {
      el.btnDeleteAllData.addEventListener('click', () => {
        showConfirmModal(
          'Delete All Data',
          'Are you sure you want to delete ALL data? This will permanently erase all devotion completions, streaks, journal reflections, attached photos, cached scripture chapters, and text-to-speech audio files across all months. The app will return to initial fresh state.',
          '⚠️',
          async () => {
            await window.devotionStore.deleteAllData();
            if (window.ttsService) window.ttsService.stop();
            await renderAll();
            await renderSettings();
            showToast('All app data has been deleted.');
          }
        );
      });
    }

    // Version dropdown in settings
    if (el.settingVersionDropdown) {
      el.settingVersionDropdown.addEventListener('change', (e) => {
        window.bibleService.setTranslation(e.target.value);
        updateHeaderVersion();
        showToast(`Active version: ${e.target.value}`);
        if (state.activeView === 'devotion') {
          renderDevotion(state.currentDay);
        }
      });
    }

    // Font style in settings
    if (el.settingFontFamily) {
      el.settingFontFamily.addEventListener('change', (e) => {
        state.fontFamily = e.target.value;
        if (el.btnFontFamily) el.btnFontFamily.textContent = state.fontFamily === 'serif' ? 'Serif' : 'Sans';
        document.querySelectorAll('.scripture-body').forEach(b => {
          b.className = `scripture-body ${state.fontFamily}`;
        });
        showToast(`Font style: ${state.fontFamily === 'serif' ? 'Serif' : 'Sans-Serif'}`);
      });
    }

    // Visual theme toggle in settings
    if (el.btnSettingsThemeToggle) {
      el.btnSettingsThemeToggle.addEventListener('click', () => {
        toggleTheme();
        if (el.settingsThemeIcon && el.settingsThemeLabel) {
          el.settingsThemeIcon.textContent = state.theme === 'dark' ? '🌙' : '☀️';
          el.settingsThemeLabel.textContent = state.theme === 'dark' ? 'Dark Midnight' : 'Clean Light';
        }
      });
    }

    // TTS Audio Settings Listeners
    if (el.settingTtsRate) {
      el.settingTtsRate.addEventListener('change', (e) => {
        window.ttsService.setRate(e.target.value);
        showToast(`Reading pace set to ${e.target.value}x`);
      });
    }
    if (el.settingTtsVoice) {
      el.settingTtsVoice.addEventListener('change', (e) => {
        window.ttsService.setPreferredVoice(e.target.value);
        showToast('Preferred voice updated');
      });
    }
    if (el.btnTestTtsVoice) {
      el.btnTestTtsVoice.addEventListener('click', () => {
        if ('speechSynthesis' in window) window.speechSynthesis.resume();
        window.ttsService.testVoice();
        showToast('Playing voice preview... 🔊');
      });
    }
    if (el.btnSaveGoogleTtsKey && el.settingGoogleTtsKey) {
      el.btnSaveGoogleTtsKey.addEventListener('click', () => {
        const val = el.settingGoogleTtsKey.value.trim();
        window.devotionStore.setSetting('google_tts_api_key', val);
        showToast(val ? 'Google Cloud API key saved!' : 'API key cleared (using built-in free TTS)');
      });
    }

    // Force Update & Reload from Server
    if (el.btnForceUpdate) {
      el.btnForceUpdate.addEventListener('click', forceAppUpdate);
    }
    if (el.btnBannerDismiss && el.updateBanner) {
      el.btnBannerDismiss.addEventListener('click', () => {
        el.updateBanner.style.display = 'none';
      });
    }

    // Confirmation Modal handlers
    if (el.btnConfirmProceed) {
      el.btnConfirmProceed.addEventListener('click', async (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (confirmCallback) {
          const fn = confirmCallback;
          confirmCallback = null;
          try {
            await fn();
          } catch (err) {
            console.error('Error executing confirmed action:', err);
          }
        }
        closeConfirmModal();
      });
    }
    if (el.btnConfirmCancel) {
      el.btnConfirmCancel.addEventListener('click', (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        closeConfirmModal();
      });
    }
    if (el.modalConfirm) {
      el.modalConfirm.addEventListener('click', (e) => {
        if (e.target === el.modalConfirm) closeConfirmModal();
      });
    }

    // Alarm Modal Actions
    el.btnAlarmStartDevotion.addEventListener('click', () => {
      window.alarmService.dismissAlarm();
      closeAlarmModal();
      state.currentDay = state.simulatedTodayDay;
      switchView('devotion');
    });

    el.btnDismissAlarm.addEventListener('click', () => {
      window.alarmService.dismissAlarm();
      closeAlarmModal();
      showToast('Alarm dismissed for today');
    });

    // Snooze buttons in alarm modal
    document.querySelectorAll('.btn-snooze-opt[data-snooze]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mins = Number(btn.dataset.snooze);
        const until = window.alarmService.snooze(mins);
        closeAlarmModal();
        showToast(`Alarm snoozed until ${until} ⏰`);
      });
    });

    el.btnCustomSnooze.addEventListener('click', () => {
      const timeVal = el.customSnoozeTime.value;
      if (!timeVal) {
        showToast('Please select a snooze time');
        return;
      }
      const [hh, mm] = timeVal.split(':').map(Number);
      const target = new Date();
      target.setHours(hh, mm, 0, 0);
      if (target.getTime() <= Date.now()) {
        target.setDate(target.getDate() + 1); // next day
      }
      const until = window.alarmService.snooze(null, target);
      closeAlarmModal();
      showToast(`Alarm snoozed until ${until} ⏰`);
    });

    // Lightbox modal close & actions
    if (el.btnCloseLightbox) {
      el.btnCloseLightbox.addEventListener('click', closeLightbox);
    }
    if (el.modalLightbox) {
      el.modalLightbox.addEventListener('click', (e) => {
        if (e.target === el.modalLightbox) {
          closeLightbox();
        }
      });
    }

    if (el.btnLightboxGoto) {
      el.btnLightboxGoto.addEventListener('click', () => {
        if (!activeImageItem) return;
        const targetDay = activeImageItem.day;
        closeLightbox();
        state.currentDay = targetDay;
        switchView('devotion');
      });
    }

    if (el.btnLightboxDelete) {
      el.btnLightboxDelete.addEventListener('click', (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (!activeImageItem) return;
        const itemToDelete = activeImageItem;
        showConfirmModal(
          'Delete Devotion Photo?',
          `Are you sure you want to permanently delete this photo from Day ${itemToDelete.day}?`,
          '🗑️',
          async () => {
            await window.devotionStore.removeImage(itemToDelete.dateStr);
            closeLightbox();
            await renderJournal();
            if (state.currentDay === itemToDelete.day) {
              renderDevotion(itemToDelete.day);
            }
            showToast('Photo deleted 🗑️');
          }
        );
      });
    }

    // Journal Entry Floating Panel close & actions
    if (el.btnCloseJournalPanel) {
      el.btnCloseJournalPanel.addEventListener('click', closeJournalEntryModal);
    }
    if (el.modalJournalEntry) {
      el.modalJournalEntry.addEventListener('click', (e) => {
        if (e.target === el.modalJournalEntry) {
          closeJournalEntryModal();
        }
      });
    }

    if (el.btnJournalPanelGoto) {
      el.btnJournalPanelGoto.addEventListener('click', () => {
        if (!activeJournalItem) return;
        const targetDay = activeJournalItem.day;
        closeJournalEntryModal();
        state.currentDay = targetDay;
        switchView('devotion');
      });
    }

    if (el.btnJournalPanelDelete) {
      el.btnJournalPanelDelete.addEventListener('click', (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (!activeJournalItem) return;
        const itemToDelete = activeJournalItem;
        showConfirmModal(
          'Delete Journal Entry?',
          `Are you sure you want to permanently delete your journal entry for Day ${itemToDelete.day}? This action cannot be undone.`,
          '🗑️',
          async () => {
            await window.devotionStore.deleteNote(itemToDelete.dateStr);
            if (itemToDelete.img) {
              await window.devotionStore.removeImage(itemToDelete.dateStr);
            }
            closeJournalEntryModal();
            await renderJournal();
            if (state.currentDay === itemToDelete.day) {
              renderDevotion(itemToDelete.day);
            }
            showToast('Journal entry deleted 🗑️');
          }
        );
      });
    }

    // Global keyboard Escape key to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (el.modalSundayService && el.modalSundayService.classList.contains('active')) {
          closeSundayModal();
        } else if (el.modalJournalEntry && el.modalJournalEntry.classList.contains('active')) {
          closeJournalEntryModal();
        } else if (el.modalLightbox && el.modalLightbox.classList.contains('active')) {
          closeLightbox();
        } else if (el.modalConfirm && el.modalConfirm.classList.contains('active')) {
          closeConfirmModal();
        }
      }
    });
  }

  // --- Alarm Service Callbacks ---
  function setupAlarmCallbacks() {
    window.alarmService.onAlarmTriggeredCallback = (info) => {
      el.alarmModalTitle.textContent = info.title || 'Time for Your Devotion!';
      el.modalAlarmRing.classList.add('active');
    };

    window.alarmService.onReminderTriggeredCallback = (info) => {
      showToast(`🔔 ${info.title}: ${info.message}`);
    };
  }

  function closeAlarmModal() {
    el.modalAlarmRing.classList.remove('active');
  }

  // --- Text-To-Speech (TTS) Player Controller ---
  function setupTTSPlayer() {
    if (!window.ttsService) return;

    window.ttsService.onStateChange((info) => {
      if (!el.floatingTtsPlayer) return;

      if (!info.track) {
        el.floatingTtsPlayer.style.display = 'none';
        if (el.viewDevotion) el.viewDevotion.classList.remove('tts-player-active');
        if (el.btnReadAllIcon) el.btnReadAllIcon.textContent = '▶️';
        if (el.btnReadAllText) el.btnReadAllText.textContent = 'Read All';
        document.querySelectorAll('.passage-listen-btn').forEach(btn => {
          btn.classList.remove('active-reading');
          btn.innerHTML = '<span>🔊</span> Listen';
        });
        return;
      }

      el.floatingTtsPlayer.style.display = 'flex';
      if (el.viewDevotion) el.viewDevotion.classList.add('tts-player-active');
      el.ttsPlayerTitle.textContent = info.track.label || 'Daily Devotion Reading';

      if (info.track.loading) {
        el.ttsPlayerStatus.textContent = 'Preparing peaceful audio...';
        el.btnTtsPlayPause.textContent = '⏳';
      } else if (info.isPlaying) {
        el.ttsPlayerStatus.textContent = info.progressText ? `Reading softly (${info.progressText})...` : 'Reading softly & peacefully...';
        el.btnTtsPlayPause.textContent = '⏸️';
        if (el.btnReadAllIcon) el.btnReadAllIcon.textContent = '⏸️';
        if (el.btnReadAllText) el.btnReadAllText.textContent = 'Pause';
      } else {
        el.ttsPlayerStatus.textContent = info.progressText ? `Paused at ${info.progressText}` : 'Paused';
        el.btnTtsPlayPause.textContent = '▶️';
        if (el.btnReadAllIcon) el.btnReadAllIcon.textContent = '▶️';
        if (el.btnReadAllText) el.btnReadAllText.textContent = 'Resume';
      }

      // Sync passage listen buttons
      document.querySelectorAll('.passage-listen-btn').forEach(btn => {
        if (btn.dataset.passageCacheKey === info.track.cacheKey) {
          if (info.isPlaying) {
            btn.classList.add('active-reading');
            btn.innerHTML = '<span>⏸️</span> Pause';
          } else {
            btn.classList.remove('active-reading');
            btn.innerHTML = '<span>▶️</span> Resume';
          }
        } else {
          btn.classList.remove('active-reading');
          btn.innerHTML = '<span>🔊</span> Listen';
        }
      });
    });

    if (el.btnTtsPlayPause) {
      el.btnTtsPlayPause.addEventListener('click', () => {
        if (window.ttsService.isPlayingState) {
          window.ttsService.pause();
        } else {
          window.ttsService.resume();
        }
      });
    }

    if (el.btnTtsStop) {
      el.btnTtsStop.addEventListener('click', () => {
        window.ttsService.stop();
      });
    }

    if (el.btnTtsDownload) {
      el.btnTtsDownload.addEventListener('click', async () => {
        const current = window.ttsService.currentTrack;
        if (!current || !current.cacheKey) {
          showToast('No active speech audio playing.');
          return;
        }
        const safeName = (current.label || 'devotion_audio')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_') + '.mp3';
        const downloaded = await window.ttsService.downloadStoredAudio(current.cacheKey, safeName);
        if (downloaded) {
          showToast('Stored audio file (MP3) downloaded! 💾');
        } else {
          showToast('Audio file not ready to download yet.');
        }
      });
    }
  }

  // --- Render All ---
  async function renderAll() {
    updateHeaderVersion();
    await renderHome();
    if (state.activeView === 'devotion') await renderDevotion(state.currentDay);
    if (state.activeView === 'calendar') await renderCalendar();
    if (state.activeView === 'journal') await renderJournal();
    if (state.activeView === 'settings') renderSettings();
  }

  // --- Header Version Pill ---
  function updateHeaderVersion() {
    const active = window.bibleService.getActiveTranslation();
    const shortLabel = active.id === 'tgl_bib' ? 'ASD (Filipino)' : active.id;
    el.hdrVersionName.textContent = `${shortLabel}`;
  }

  // --- View 1: Home Screen ---
  async function renderHome() {
    const todayNum = state.simulatedTodayDay;
    const todaySched = window.bibleService.getDaySchedule(todayNum);
    const dateStr = getDayDateStr(todayNum);

    // Format date header
    const dateObj = new Date(2026, 10, todayNum); // Month 10 is November (0-indexed)
    const dateOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    el.homeGreetingDate.textContent = dateObj.toLocaleDateString('en-US', dateOptions);

    // Greeting according to time of day
    const hour = new Date().getHours();
    let greeting = 'Good Morning, Champion!';
    if (hour >= 12 && hour < 17) greeting = 'Good Afternoon, Champion!';
    if (hour >= 17) greeting = 'Good Evening, Champion!';
    el.homeGreetingTitle.textContent = greeting;

    // Random BSB Rolodex Verse on the Importance of God's Word
    if (el.homeRolodexText && el.homeRolodexRef) {
      const rolodexVerse = window.bibleService.getRandomRolodexVerse();
      if (rolodexVerse) {
        el.homeRolodexText.textContent = rolodexVerse.text;
        el.homeRolodexRef.textContent = `${rolodexVerse.reference} (BSB)`;
      }
    }

    if (todaySched) {
      el.heroDayTag.textContent = `✨ Day ${todaySched.day} of 30`;
      el.heroScriptures.textContent = todaySched.scriptures;
      el.heroTime.textContent = todaySched.time;
      el.heroPassagesCount.textContent = `${todaySched.count} Passages`;
      el.heroDayOfYear.textContent = `Day ${todaySched.dayOfYear}`;

      // Completion Status
      const completion = await window.devotionStore.getCompletion(dateStr);
      const isCompleted = completion && completion.completed;

      if (isCompleted) {
        el.heroStatusPill.className = 'hero-status-pill completed';
        el.heroStatusPill.textContent = '✓ Completed';
        el.btnHeroAction.className = 'btn-primary-action completed-state';
        el.heroActionIcon.textContent = '✓';
        el.heroActionText.textContent = 'Review Today’s Devotion';
      } else {
        el.heroStatusPill.className = 'hero-status-pill incomplete';
        el.heroStatusPill.textContent = '● Incomplete';
        el.btnHeroAction.className = 'btn-primary-action';
        el.heroActionIcon.textContent = '📖';
        el.heroActionText.textContent = 'Start Today’s Devotion';
      }
    }

    // Calculate Stats
    await updateStatsDashboard();

    // Update Sunday Church Service Card
    await updateHomeSundayCard();
  }

  // --- Completion & Streak Helpers ---
  function isCompletionOnTime(c) {
    if (!c || !c.completed) return false;
    // Explicitly marked as recovered (completed after scheduled date)
    if (c.isRecovered === true) return false;
    if (c.isRecovered === false) return true;
    // Fallback for legacy completion records lacking explicit isRecovered flag
    if (c.scheduledDate && c.completedAt) {
      const completedDayStr = c.completedAt.slice(0, 10);
      if (completedDayStr > c.scheduledDate) {
        return false;
      }
    }
    return true;
  }

  // --- Stats Dashboard (Requirement 12) ---
  async function updateStatsDashboard() {
    const allCompletions = await window.devotionStore.getAllCompletions();
    const completionsMap = new Map();
    allCompletions.forEach(c => {
      if (c.completed) completionsMap.set(c.date, c);
    });

    let completedThisMonth = 0;
    let missedThisMonth = 0;
    let recoveredCount = 0;

    // Evaluate November days
    for (let d = 1; d <= 30; d++) {
      const dStr = getDayDateStr(d);
      const c = completionsMap.get(dStr);

      if (c) {
        completedThisMonth++;
        if (!isCompletionOnTime(c)) {
          recoveredCount++;
        }
      } else {
        // Missed if day is strictly before today
        if (d < state.simulatedTodayDay) {
          missedThisMonth++;
        }
      }
    }

    // Streak Calculation:
    // Only count consecutive days when completed on their own dates and not recovered.
    // The streak breaks as soon as a day is missed or recovered.
    let streak = 0;
    const todayStr = getDayDateStr(state.simulatedTodayDay);
    const todayRecord = completionsMap.get(todayStr);
    const todayCompletedOnTime = isCompletionOnTime(todayRecord);

    if (todayCompletedOnTime) {
      streak = 1;
    }

    // Count backwards starting from yesterday
    let checkDay = state.simulatedTodayDay - 1;
    while (checkDay >= 1) {
      const dStr = getDayDateStr(checkDay);
      const rec = completionsMap.get(dStr);
      if (isCompletionOnTime(rec)) {
        streak++;
        checkDay--;
      } else {
        // Streak breaks as soon as a day was missed or not completed on its date
        break;
      }
    }

    // Render stats
    el.statStreakCount.textContent = streak;
    el.statCompletedCount.textContent = `${completedThisMonth} / 30`;
    const pct = Math.round((completedThisMonth / 30) * 100);
    el.statCompletedPct.textContent = `${pct}%`;
    el.statMissedCount.textContent = missedThisMonth;
    el.statRecoveredCount.textContent = recoveredCount;

    // Calendar summary stats
    if (el.calCompletedNum) el.calCompletedNum.textContent = completedThisMonth;
    if (el.calRecoveredNum) el.calRecoveredNum.textContent = recoveredCount;
    if (el.calMissedNum) el.calMissedNum.textContent = missedThisMonth;
  }

  // --- Journal Lock State ---
  function setJournalLockState(isLocked) {
    state.isCurrentDayLocked = isLocked;

    if (el.devotionNotesSection) {
      el.devotionNotesSection.classList.toggle('journal-locked', isLocked);
    }

    if (el.journalLockBadge) {
      el.journalLockBadge.style.display = isLocked ? 'inline-flex' : 'none';
    }

    if (el.journalLockedNotice) {
      el.journalLockedNotice.style.display = isLocked ? 'flex' : 'none';
    }

    const inputs = [
      el.devotionNotesInput,
      el.soapScriptureInput,
      el.soapObservationInput,
      el.soapApplicationInput,
      el.soapPrayerInput
    ];
    inputs.forEach(inp => {
      if (inp) {
        inp.readOnly = isLocked;
        inp.disabled = isLocked;
      }
    });

    if (el.devotionImageFile) {
      el.devotionImageFile.disabled = isLocked;
    }
    const uploadTrigger = document.querySelector('.image-upload-trigger');
    if (uploadTrigger) {
      uploadTrigger.style.display = isLocked ? 'none' : 'inline-flex';
    }
    if (el.btnRemoveImage) {
      el.btnRemoveImage.style.display = isLocked ? 'none' : 'flex';
    }

    if (el.btnToggleSoapDevotion) {
      el.btnToggleSoapDevotion.disabled = isLocked;
    }

    if (el.devotionTagInput) {
      el.devotionTagInput.disabled = isLocked;
    }
    if (el.btnAddDevotionTag) {
      el.btnAddDevotionTag.disabled = isLocked;
    }
    renderDevotionTagsUI();
  }

  // --- View 2: Devotion Reader ---
  async function renderDevotion(dayNum) {
    const daySched = window.bibleService.getDaySchedule(dayNum);
    if (!daySched) return;

    state.currentDay = dayNum;
    const dateStr = getDayDateStr(dayNum);
    const dateObj = new Date(2026, 10, dayNum);
    const isFuture = (dayNum > state.simulatedTodayDay);

    // Update Top bar
    if (isFuture) {
      el.devotionDaySubtitle.textContent = `November 2026 • Day ${dayNum} of 30 (Preview Mode 👁️)`;
    } else {
      el.devotionDaySubtitle.textContent = `November 2026 • Day ${dayNum} of 30`;
    }
    el.devotionDayTitle.textContent = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    // Prev / Next button states
    el.btnPrevDay.disabled = (dayNum <= 1);
    el.btnNextDay.disabled = (dayNum >= 30);

    // Render Passage Tabs
    renderPassageTabs(daySched);

    // Load & Render Scripture Content
    el.passagesContainer.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-state-icon">📖</div>
        <p>Loading scriptures for ${window.bibleService.getActiveTranslation().name}...</p>
      </div>
    `;

    const activeTransId = window.bibleService.activeTranslation;
    const passageResults = await Promise.all(
      daySched.passages.map(p => window.bibleService.getPassageVerses(activeTransId, p))
    );

    await renderPassagesContent(passageResults, dayNum);

    // Wire Read All TTS button (Requirement 4)
    if (el.btnReadAllTts) {
      const activeTrans = window.bibleService.getActiveTranslation();
      const allCacheKey = `tts_${activeTrans.id}_${dateStr}_all`;
      const allLabel = `Day ${dayNum} - All Readings (${daySched.passages.length} Passages)`;

      if (window.ttsService && window.ttsService.currentTrack && window.ttsService.currentTrack.cacheKey === allCacheKey) {
        if (window.ttsService.isPlayingState) {
          if (el.btnReadAllIcon) el.btnReadAllIcon.textContent = '⏸️';
          if (el.btnReadAllText) el.btnReadAllText.textContent = 'Pause';
        } else {
          if (el.btnReadAllIcon) el.btnReadAllIcon.textContent = '▶️';
          if (el.btnReadAllText) el.btnReadAllText.textContent = 'Resume';
        }
      } else {
        if (el.btnReadAllIcon) el.btnReadAllIcon.textContent = '▶️';
        if (el.btnReadAllText) el.btnReadAllText.textContent = 'Read All';
      }

      el.btnReadAllTts.onclick = async () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.resume();
        }

        if (window.ttsService.currentTrack && window.ttsService.currentTrack.cacheKey === allCacheKey) {
          if (window.ttsService.isPlayingState) {
            window.ttsService.pause();
          } else {
            window.ttsService.resume();
          }
          return;
        }

        const fullDayText = passageResults.map(res => {
          const intro = `${res.bookName} chapter ${res.passage.chapter}.`;
          const passageVerses = (res.content || [])
            .filter(item => item.type === 'verse')
            .map(v => v.text)
            .join(' ');
          return `${intro} ${passageVerses}`;
        }).join(' ... ');

        showToast('Beginning calm scripture reading... 🔊');
        try {
          await window.ttsService.playScripture(allCacheKey, fullDayText, activeTrans.id, allLabel);
        } catch (err) {
          console.warn('TTS playback error:', err);
          showToast('Unable to play audio reading right now.');
        }
      };
    }

    // Load Saved Notes & Image for this day
    applySoapModeUI();
    const noteRec = await window.devotionStore.getNoteRecord(dateStr);
    state.devotionTags = (noteRec && Array.isArray(noteRec.tags)) ? [...noteRec.tags] : [];
    const savedNote = noteRec ? noteRec.note : '';
    const daySchedForNote = window.bibleService.getDaySchedule(dayNum);
    const defaultScripture = daySchedForNote ? daySchedForNote.scriptures : '';
    const parsedNote = parseNoteData(savedNote, defaultScripture);

    if (parsedNote.format === 'soap') {
      if (el.soapScriptureInput) el.soapScriptureInput.value = (parsedNote.scripture && parsedNote.scripture.trim()) || defaultScripture;
      if (el.soapObservationInput) el.soapObservationInput.value = parsedNote.observation || '';
      if (el.soapApplicationInput) el.soapApplicationInput.value = parsedNote.application || '';
      if (el.soapPrayerInput) el.soapPrayerInput.value = parsedNote.prayer || '';
      if (el.devotionNotesInput) el.devotionNotesInput.value = formatSoapAsText(parsedNote);
    } else {
      if (el.devotionNotesInput) el.devotionNotesInput.value = parsedNote.text || '';
      if (el.soapScriptureInput) el.soapScriptureInput.value = defaultScripture;
      if (el.soapObservationInput) el.soapObservationInput.value = parsedNote.text || '';
      if (el.soapApplicationInput) el.soapApplicationInput.value = '';
      if (el.soapPrayerInput) el.soapPrayerInput.value = '';
    }
    if (parsedNote.format === 'soap') {
      const hasContent = Boolean(
        (parsedNote.observation && parsedNote.observation.trim()) ||
        (parsedNote.application && parsedNote.application.trim()) ||
        (parsedNote.prayer && parsedNote.prayer.trim())
      );
      if (el.notesSaveBadge) el.notesSaveBadge.innerHTML = hasContent ? '<span>✓</span> Saved' : '';
    } else {
      const hasContent = Boolean(parsedNote.text && parsedNote.text.trim());
      if (el.notesSaveBadge) el.notesSaveBadge.innerHTML = hasContent ? '<span>✓</span> Saved' : '';
    }

    const savedImg = await window.devotionStore.getImage(dateStr);
    if (savedImg && savedImg.dataUrl) {
      el.devotionImagePreview.src = savedImg.dataUrl;
      el.devotionImagePreviewContainer.style.display = 'block';
    } else {
      el.devotionImagePreview.src = '';
      el.devotionImagePreviewContainer.style.display = 'none';
    }

    // Render Completion State & Lock Journal Section if Completed
    const completion = await window.devotionStore.getCompletion(dateStr);
    const isCompleted = Boolean(completion && completion.completed);
    setJournalLockState(isCompleted);

    if (isCompleted) {
      el.btnMarkComplete.style.display = 'none';
      el.completedBadgeCard.style.display = 'block';
      const timeStr = completion.completedAt ? new Date(completion.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      el.completedTimestampText.textContent = `Completed on ${completion.date}${timeStr ? ' at ' + timeStr : ''}${completion.isRecovered ? ' (Recovered ✨)' : ''}`;
    } else if (isFuture) {
      el.btnMarkComplete.style.display = 'flex';
      el.btnMarkComplete.disabled = true;
      el.btnMarkComplete.classList.add('disabled-future');
      el.btnMarkComplete.innerHTML = '<span>🔒</span> Preview Only (Available on Day ' + dayNum + ')';
      el.btnMarkComplete.title = 'Future devotions can be previewed, but cannot be completed until Day ' + dayNum + '.';
      el.completedBadgeCard.style.display = 'none';
    } else {
      el.btnMarkComplete.style.display = 'flex';
      el.btnMarkComplete.disabled = false;
      el.btnMarkComplete.classList.remove('disabled-future');
      el.btnMarkComplete.innerHTML = '<span>✓</span> Mark Day as Complete';
      el.btnMarkComplete.title = 'Mark this devotion as completed';
      el.completedBadgeCard.style.display = 'none';
    }

    // Refresh floating notepad badge indicator for today's devotion
    await updateNotepadBadge();
  }

  function renderPassageTabs(daySched) {
    el.passageTabs.innerHTML = '';

    // "All Readings" tab
    const allTab = document.createElement('button');
    allTab.className = `passage-tab ${state.activePassageIndex === 'all' ? 'active' : ''}`;
    allTab.dataset.target = 'all';
    allTab.textContent = `All Readings (${daySched.passages.length})`;
    allTab.addEventListener('click', () => {
      state.activePassageIndex = 'all';
      filterPassageView();
    });
    el.passageTabs.appendChild(allTab);

    // Individual passage tabs
    daySched.passages.forEach((p, idx) => {
      const tab = document.createElement('button');
      tab.className = `passage-tab ${state.activePassageIndex === String(idx) ? 'active' : ''}`;
      tab.dataset.target = String(idx);
      tab.textContent = p.label;
      tab.addEventListener('click', () => {
        state.activePassageIndex = String(idx);
        filterPassageView();
      });
      el.passageTabs.appendChild(tab);
    });
  }

  function filterPassageView() {
    // Update active tab styles
    document.querySelectorAll('.passage-tab').forEach(tab => {
      if (tab.dataset.target === state.activePassageIndex) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Show / hide passage cards
    document.querySelectorAll('.passage-card').forEach(card => {
      if (state.activePassageIndex === 'all' || card.dataset.passageIndex === state.activePassageIndex) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  async function renderPassagesContent(passageResults, dayNum = 3) {
    el.passagesContainer.innerHTML = '';
    closeVerseActionBar();

    const dateStr = getDayDateStr(dayNum);
    const activeTransId = window.bibleService.activeTranslation;
    const allHighlights = await window.devotionStore.getAllHighlights();
    const highlightsMap = new Map(allHighlights.map(h => [h.id, h]));

    passageResults.forEach((res, idx) => {
      const card = document.createElement('div');
      card.className = 'passage-card';
      card.dataset.passageIndex = String(idx);

      // Section tag class
      let secClass = 'wisdom';
      if (res.section === 'New Testament') secClass = 'nt';
      if (res.section === 'Old Testament') secClass = 'ot';

      // Header
      const header = document.createElement('div');
      header.className = 'passage-header';
      header.innerHTML = `
        <div>
          <span class="passage-section-tag ${secClass}">${res.section}</span>
          <h3 class="passage-reference" style="margin-top: 4px;">${res.bookName} ${res.passage.chapter}${res.passage.fromVerse ? ':' + res.passage.fromVerse + (res.passage.toVerse ? '-' + res.passage.toVerse : '') : ''}</h3>
        </div>
      `;

      // Header Right: Listen Button & Index
      const headerRight = document.createElement('div');
      headerRight.style.display = 'flex';
      headerRight.style.alignItems = 'center';
      headerRight.style.gap = '8px';

      const passageCacheKey = `tts_${window.bibleService.activeTranslation}_${getDayDateStr(dayNum)}_p${idx}`;
      const passageLabel = `${res.bookName} ${res.passage.chapter}${res.passage.fromVerse ? ':' + res.passage.fromVerse : ''}`;

      const listenBtn = document.createElement('button');
      listenBtn.className = 'btn-tts-listen passage-listen-btn';
      listenBtn.dataset.passageCacheKey = passageCacheKey;

      if (window.ttsService && window.ttsService.currentTrack && window.ttsService.currentTrack.cacheKey === passageCacheKey && window.ttsService.isPlayingState) {
        listenBtn.classList.add('active-reading');
        listenBtn.innerHTML = '<span>⏸️</span> Pause';
      } else {
        listenBtn.innerHTML = '<span>🔊</span> Listen';
      }

      listenBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if ('speechSynthesis' in window) {
          window.speechSynthesis.resume();
        }
        if (window.ttsService.currentTrack && window.ttsService.currentTrack.cacheKey === passageCacheKey) {
          if (window.ttsService.isPlayingState) {
            window.ttsService.pause();
          } else {
            window.ttsService.resume();
          }
          return;
        }

        const passageVerses = (res.content || [])
          .filter(item => item.type === 'verse')
          .map(v => v.text)
          .join(' ');
        const fullText = `${res.bookName} chapter ${res.passage.chapter}. ${passageVerses}`;
        showToast(`Reading ${res.bookName}... 🔊`);
        try {
          await window.ttsService.playScripture(passageCacheKey, fullText, window.bibleService.activeTranslation, passageLabel);
        } catch (err) {
          console.warn('TTS playback error:', err);
          showToast('Unable to play audio reading right now.');
        }
      });

      const idxSpan = document.createElement('span');
      idxSpan.style.cssText = 'font-size: 0.75rem; color: var(--text-muted); font-weight: 600;';
      idxSpan.textContent = `#${idx + 1} of ${passageResults.length}`;

      headerRight.appendChild(listenBtn);
      headerRight.appendChild(idxSpan);
      header.appendChild(headerRight);
      card.appendChild(header);

      // Body
      const body = document.createElement('div');
      body.className = `scripture-body ${state.fontFamily}`;

      if (res.content && res.content.length > 0) {
        const bookId = res.passage.bookId || res.passage.book || res.bookName;

        res.content.forEach(item => {
          if (item.type === 'heading') {
            const h = document.createElement('div');
            h.className = 'scripture-heading';
            h.textContent = item.text || (Array.isArray(item.content) ? item.content.join(' ') : '');
            body.appendChild(h);
          } else if (item.type === 'verse') {
            const verseId = `${bookId}_${res.passage.chapter}_${item.number}`;
            const verseRef = `${res.bookName} ${res.passage.chapter}:${item.number}`;
            const verseText = item.text || '';
            const existingHl = highlightsMap.get(verseId);

            const vDiv = document.createElement('div');
            vDiv.className = 'verse-item';
            vDiv.id = `verse-${verseId}`;
            vDiv.dataset.verseId = verseId;
            vDiv.dataset.bookId = bookId;
            vDiv.dataset.bookName = res.bookName;
            vDiv.dataset.chapter = String(res.passage.chapter);
            vDiv.dataset.verseNum = String(item.number);
            vDiv.dataset.verseRef = verseRef;
            vDiv.dataset.verseText = verseText;
            vDiv.dataset.dayNum = String(dayNum);
            vDiv.dataset.dateStr = dateStr;

            if (existingHl && existingHl.color) {
              vDiv.classList.add('verse-highlighted', `highlight-${existingHl.color}`);
            }

            // Check if verse has poem lines
            if (item.poem && item.poem.length > 0) {
              const lines = (item.text || '').split('\n');
              let html = `<span class="verse-num">${item.number}</span>`;
              lines.forEach((line, lineIdx) => {
                const poemMeta = item.poem[lineIdx] || { level: 1 };
                html += `<div class="verse-poem-line level-${poemMeta.level || 1}">${line}</div>`;
              });
              vDiv.innerHTML = html;
            } else {
              vDiv.innerHTML = `<span class="verse-num">${item.number}</span><span class="verse-text">${item.text || ''}</span>`;
            }

            vDiv.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleVerseSelection(vDiv, {
                id: verseId,
                reference: verseRef,
                bookId,
                bookName: res.bookName,
                chapter: Number(res.passage.chapter),
                verse: Number(item.number),
                text: verseText,
                translation: activeTransId,
                dayNum,
                dateStr
              });
            });

            body.appendChild(vDiv);
          }
        });
      } else {
        body.innerHTML = `<p style="color: var(--text-muted); font-style: italic;">No verses found for this range.</p>`;
      }

      card.appendChild(body);
      el.passagesContainer.appendChild(card);
    });

    filterPassageView();
  }

  // --- Multi-Verse Selection & Action Bar Controller ---
  function getCombinedSelectionData(verses = state.selectedVerses) {
    if (!verses || verses.length === 0) {
      return {
        sorted: [],
        reference: '',
        shortRef: '',
        text: '',
        translation: 'BSB',
        count: 0,
        totalChars: 0,
        isOverCardLimit: false,
        cardCharLimit: 450,
        ids: [],
        dayNum: state.currentDay,
        dateStr: getDayDateStr(state.currentDay)
      };
    }

    // Sort verses in canonical biblical reading order
    const sorted = [...verses].sort((a, b) => {
      if (a.bookId !== b.bookId) return a.bookId.localeCompare(b.bookId);
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });

    const first = sorted[0];
    const allSameBookAndChapter = sorted.every(v => v.bookId === first.bookId && v.chapter === first.chapter);

    let reference = '';
    if (allSameBookAndChapter) {
      const verseNums = sorted.map(v => v.verse);
      if (verseNums.length === 1) {
        reference = `${first.bookName} ${first.chapter}:${first.verse}`;
      } else {
        // Build contiguous ranges or cluster lists: e.g. "15–16", "15, 17", "15–17, 20"
        const clusters = [];
        let start = verseNums[0];
        let prev = start;
        for (let i = 1; i < verseNums.length; i++) {
          const cur = verseNums[i];
          if (cur === prev + 1) {
            prev = cur;
          } else {
            clusters.push(start === prev ? `${start}` : `${start}–${prev}`);
            start = cur;
            prev = cur;
          }
        }
        clusters.push(start === prev ? `${start}` : `${start}–${prev}`);
        reference = `${first.bookName} ${first.chapter}:${clusters.join(', ')}`;
      }
    } else {
      const refs = sorted.map(v => `${v.bookName} ${v.chapter}:${v.verse}`);
      if (refs.length <= 2) {
        reference = refs.join(' & ');
      } else {
        reference = `${refs[0]} (+${refs.length - 1} verses)`;
      }
    }

    const text = sorted.map(v => (v.text || '').trim()).join(' ');
    const totalChars = text.length;
    const translation = first.translation || (window.bibleService ? window.bibleService.activeTranslation : 'BSB');
    const CARD_CHAR_LIMIT = 450;

    return {
      sorted,
      reference,
      text,
      translation,
      count: sorted.length,
      totalChars,
      isOverCardLimit: totalChars > CARD_CHAR_LIMIT,
      cardCharLimit: CARD_CHAR_LIMIT,
      ids: sorted.map(v => v.id),
      dayNum: first.dayNum,
      dateStr: first.dateStr
    };
  }

  async function toggleVerseSelection(verseEl, verseData) {
    const existingIndex = state.selectedVerses.findIndex(v => v.id === verseData.id);

    if (existingIndex >= 0) {
      // Toggle off
      state.selectedVerses.splice(existingIndex, 1);
      verseEl.classList.remove('verse-selected');
    } else {
      // Toggle on
      verseEl.classList.add('verse-selected');
      state.selectedVerses.push({
        ...verseData,
        el: verseEl,
        currentHl: null
      });
    }

    if (state.selectedVerses.length === 0) {
      closeVerseActionBar();
      return;
    }

    await updateVerseActionBar();
  }

  // Alias for backward compatibility & test harnesses
  async function openVerseActionBar(verseEl, verseData) {
    await toggleVerseSelection(verseEl, verseData);
  }

  async function updateVerseActionBar() {
    const comb = getCombinedSelectionData();
    if (comb.count === 0) {
      closeVerseActionBar();
      return;
    }

    // Set selection mode class on container
    if (el.passagesContainer) {
      el.passagesContainer.classList.add('selection-mode-active');
    }

    // Show toolbar immediately
    if (el.verseActionBar) {
      el.verseActionBar.style.display = 'flex';
    }

    // Update reference header
    if (el.verseActionRefText) {
      if (comb.count === 1) {
        el.verseActionRefText.innerHTML = escapeHtml(comb.reference);
      } else {
        el.verseActionRefText.innerHTML = `${escapeHtml(comb.reference)} <span class="verse-count-badge">${comb.count} verses</span>`;
      }
    }

    // Update subtitle & character count warning
    if (el.verseActionSubText) {
      if (comb.isOverCardLimit) {
        el.verseActionSubText.innerHTML = `<span class="verse-char-warning">⚠️ ${comb.totalChars} chars (Too long for Card)</span> • Tap color to highlight`;
      } else if (comb.count === 1) {
        el.verseActionSubText.textContent = 'Tap more verses to add • Tap color to highlight';
      } else {
        el.verseActionSubText.textContent = `${comb.count} verses (${comb.totalChars} chars) • Tap color to highlight`;
      }
    }

    // Guardrail on Card button
    if (el.btnVerseCreateCard) {
      if (comb.isOverCardLimit) {
        el.btnVerseCreateCard.classList.add('btn-card-disabled');
        el.btnVerseCreateCard.title = `Text too long for an image card (${comb.totalChars}/${comb.cardCharLimit} chars max)`;
      } else {
        el.btnVerseCreateCard.classList.remove('btn-card-disabled');
        el.btnVerseCreateCard.title = `Create Shareable Scripture Card (${comb.totalChars} chars)`;
      }
    }

    // Fetch highlight statuses from IndexedDB for active color buttons and clear button
    const allHighlights = await window.devotionStore.getAllHighlights();
    const hlMap = new Map(allHighlights.map(h => [h.id, h]));

    let anyHighlighted = false;
    const selectedColors = new Set();
    state.selectedVerses.forEach(v => {
      const hl = hlMap.get(v.id);
      v.currentHl = hl || null;
      if (hl && hl.color) {
        anyHighlighted = true;
        selectedColors.add(hl.color);
      }
    });

    // Color buttons active state
    document.querySelectorAll('.verse-color-btn').forEach(btn => {
      const color = btn.dataset.color;
      if (selectedColors.size === 1 && selectedColors.has(color) && state.selectedVerses.every(v => v.currentHl && v.currentHl.color === color)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Clear button display
    if (el.btnVerseClear) {
      if (anyHighlighted) {
        el.btnVerseClear.style.display = 'inline-flex';
        el.btnVerseClear.title = comb.count > 1 ? `Clear highlights on ${comb.count} verses` : 'Clear highlight';
      } else {
        el.btnVerseClear.style.display = 'none';
      }
    }
  }

  function closeVerseActionBar() {
    if (el.verseActionBar) {
      el.verseActionBar.style.display = 'none';
    }
    if (el.passagesContainer) {
      el.passagesContainer.classList.remove('selection-mode-active');
    }
    document.querySelectorAll('.verse-item.verse-selected').forEach(elem => elem.classList.remove('verse-selected'));
    state.selectedVerses = [];
  }

  async function handleVerseColorClick(color) {
    if (!state.selectedVerses || state.selectedVerses.length === 0) return;
    const comb = getCombinedSelectionData();

    // Immediate optimistic DOM updates for all selected verses
    state.selectedVerses.forEach(v => {
      if (v.el) {
        v.el.classList.remove('highlight-gold', 'highlight-green', 'highlight-blue', 'highlight-purple');
        v.el.classList.add('verse-highlighted', `highlight-${color}`);
      }
    });

    // Save each verse to IndexedDB
    for (const v of state.selectedVerses) {
      const record = {
        id: v.id,
        reference: v.reference,
        bookId: v.bookId,
        bookName: v.bookName,
        chapter: v.chapter,
        verse: v.verse,
        color,
        text: v.text,
        translation: v.translation,
        dayNum: v.dayNum,
        dateStr: v.dateStr
      };
      await window.devotionStore.saveHighlight(record);
    }

    showToast(`Highlighted ${comb.reference} in ${color.toUpperCase()} ✨`);

    // Exit selection mode once action is applied
    closeVerseActionBar();
  }

  function handleVerseCopyClick() {
    if (!state.selectedVerses || state.selectedVerses.length === 0) return;
    const comb = getCombinedSelectionData();
    const copyText = `"${comb.text}" — ${comb.reference} (${comb.translation || 'BSB'})`;

    const done = () => {
      showToast(`Copied ${comb.reference} to clipboard 📋`);
      // Exit selection mode once action is applied
      closeVerseActionBar();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(copyText).then(done).catch(() => {
        copyFallback(copyText);
        done();
      });
    } else {
      copyFallback(copyText);
      done();
    }
  }

  async function handleVerseClearClick() {
    if (!state.selectedVerses || state.selectedVerses.length === 0) return;
    const comb = getCombinedSelectionData();

    // Immediate optimistic DOM update
    state.selectedVerses.forEach(v => {
      if (v.el) {
        v.el.classList.remove('verse-highlighted', 'highlight-gold', 'highlight-green', 'highlight-blue', 'highlight-purple');
      }
    });

    for (const v of state.selectedVerses) {
      await window.devotionStore.deleteHighlight(v.id);
    }

    showToast(`Cleared highlights from ${comb.reference}`);

    // Exit selection mode once action is applied
    closeVerseActionBar();
  }

  function copyFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Copied to clipboard 📋');
    } catch (err) {
      showToast('Please copy text manually');
    }
    document.body.removeChild(ta);
  }

  // --- Typography controls ---
  function adjustFontSize(delta) {
    const sizes = ['0.92rem', '1.05rem', '1.18rem', '1.32rem'];
    let idx = Number(window.devotionStore.getSetting('reader_font_size_idx', 1));
    idx = Math.max(0, Math.min(sizes.length - 1, idx + delta));
    window.devotionStore.setSetting('reader_font_size_idx', idx);
    document.documentElement.style.setProperty('--reader-font-size', sizes[idx]);
    showToast(`Font size adjusted`);
  }

  function toggleFontFamily() {
    state.fontFamily = state.fontFamily === 'serif' ? 'sans' : 'serif';
    el.btnFontFamily.textContent = state.fontFamily === 'serif' ? 'Serif' : 'Sans';
    document.querySelectorAll('.scripture-body').forEach(b => {
      b.className = `scripture-body ${state.fontFamily}`;
    });
    showToast(`Font: ${state.fontFamily === 'serif' ? 'Serif (Charter/Merriweather)' : 'Sans-Serif (Modern)'}`);
  }

  // --- Image Upload Handler ---
  function handleImageUpload(e) {
    if (state.isCurrentDayLocked) {
      showToast('Journal is locked because this day is completed 🔒');
      return;
    }
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target.result;
      const dateStr = getDayDateStr(state.currentDay);

      // Downscale if very large
      const compressedDataUrl = await compressImage(dataUrl, 1024, 0.85);
      await window.devotionStore.saveImage(dateStr, compressedDataUrl, file.name);

      el.devotionImagePreview.src = compressedDataUrl;
      el.devotionImagePreviewContainer.style.display = 'block';
      showToast('Photo attached to devotion 📷');
    };
    reader.readAsDataURL(file);
  }

  async function handleImageRemove(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (state.isCurrentDayLocked) {
      showToast('Journal is locked because this day is completed 🔒');
      return;
    }
    const dateStr = getDayDateStr(state.currentDay);
    await window.devotionStore.removeImage(dateStr);
    el.devotionImagePreview.src = '';
    el.devotionImagePreviewContainer.style.display = 'none';
    el.devotionImageFile.value = '';
    showToast('Photo removed');
  }

  function compressImage(dataUrl, maxDim, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // --- Mark as Complete (Requirement 3 & 12) ---
  async function handleMarkComplete() {
    if (state.currentDay > state.simulatedTodayDay) {
      showToast(`Day ${state.currentDay} is a future devotion. Preview only! Completion unlocks on its date. 🔒`);
      return;
    }

    const dateStr = getDayDateStr(state.currentDay);
    const dateObj = new Date(2026, 10, state.currentDay);
    const dateText = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const isRecovered = (state.currentDay < state.simulatedTodayDay);

    showConfirmModal(
      `Mark Day ${state.currentDay} as Complete?`,
      `Are you sure you want to mark your devotion for ${dateText} (Day ${state.currentDay}) as complete? Once completed, the journal section for this day will be locked.`,
      '🎉',
      async () => {
        const scheduledDateStr = dateStr;
        const completionData = {
          completed: true,
          completedAt: new Date().toISOString(),
          scheduledDate: scheduledDateStr,
          isRecovered: isRecovered
        };

        await window.devotionStore.setCompletion(dateStr, completionData);

        // Audio chime & Confetti celebration
        window.alarmService.playTone('harp', 2.0);
        triggerCelebrationConfetti();

        showToast(isRecovered ? 'Day Recovered! Great job catching up! ✨' : 'Day Completed! Great devotion! 🎉');

        // Re-render devotion (locks journal section) & stats
        renderDevotion(state.currentDay);
        updateStatsDashboard();
      },
      '✓ Mark Day as Complete',
      false
    );
  }

  async function handleUnmarkComplete() {
    const dateStr = getDayDateStr(state.currentDay);
    const dateObj = new Date(2026, 10, state.currentDay);
    const dateText = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    showConfirmModal(
      `Mark Day ${state.currentDay} as Incomplete?`,
      `Are you sure you want to unmark your devotion for ${dateText} (Day ${state.currentDay})? This will unlock your journal reflections for editing.`,
      '↩️',
      async () => {
        await window.devotionStore.removeCompletion(dateStr);
        showToast('Devotion marked as incomplete. Journal unlocked 🔓');
        renderDevotion(state.currentDay);
        updateStatsDashboard();
      },
      'Yes, Mark as Incomplete',
      true
    );
  }

  // --- View 3: Calendar View (Requirement 9) ---
  async function renderCalendar() {
    el.calDaysGrid.innerHTML = '';

    // November 2026 starts on Sunday (day 0)
    // 2026-11-01 is Sunday
    const startDayOfWeek = new Date(2026, 10, 1).getDay(); // 0 = Sunday
    const daysInMonth = 30;

    // Fill leading empty cells
    for (let i = 0; i < startDayOfWeek; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'cal-day-cell empty';
      el.calDaysGrid.appendChild(emptyCell);
    }

    const cellMap = new Map();
    // Render 30 days immediately (progressive rendering)
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = (d === state.simulatedTodayDay);
      const isFuture = (d > state.simulatedTodayDay);

      const cell = document.createElement('div');
      cell.className = 'cal-day-cell';

      if (isToday) cell.classList.add('today');
      if (isFuture) {
        cell.classList.add('future');
        cell.title = `Day ${d} (Preview devotion readings)`;
      } else if (!isToday) {
        cell.classList.add('missed');
      }

      cell.innerHTML = `
        <span class="day-num">${d}</span>
        <span class="day-indicator"></span>
      `;

      // Users can preview future dates as well as current/past dates
      cell.addEventListener('click', () => {
        state.currentDay = d;
        switchView('devotion');
      });

      el.calDaysGrid.appendChild(cell);
      cellMap.set(d, cell);
    }

    // Now async update with any saved completions in IndexedDB
    const allCompletions = await window.devotionStore.getAllCompletions();
    allCompletions.forEach(c => {
      if (c.completed) {
        const d = Number(c.date.slice(-2));
        const cell = cellMap.get(d);
        if (cell) {
          cell.classList.remove('missed');
          if (!isCompletionOnTime(c)) {
            cell.classList.add('recovered');
          } else {
            cell.classList.add('completed');
          }
        }
      }
    });

    // Update Sunday service attendance indicators
    const allSundayServices = await window.devotionStore.getAllSundayServices();
    const sundayMap = new Map((allSundayServices || []).map(s => [s.date, s]));
    cellMap.forEach((cell, dayNum) => {
      const dStr = `2026-11-${String(dayNum).padStart(2, '0')}`;
      const sunRec = sundayMap.get(dStr);
      if (sunRec && sunRec.attended) {
        if (!cell.querySelector('.cal-church-dot')) {
          const churchDot = document.createElement('span');
          churchDot.className = 'cal-church-dot';
          churchDot.title = `Attended Sunday Church Service on Nov ${dayNum}`;
          churchDot.textContent = '⛪';
          cell.appendChild(churchDot);
        }
      }
    });

    updateStatsDashboard();
  }

  // --- View 4: Journal Page (Requirement 14) ---
  let activeJournalItem = null;
  let activeImageItem = null;

  function parseDateParts(dateStr) {
    const parts = (dateStr || '').split('-');
    const y = parseInt(parts[0], 10) || 2026;
    const m = parseInt(parts[1], 10) || 11;
    const d = parseInt(parts[2], 10) || 1;
    const dateObj = new Date(y, m - 1, d);
    return { year: y, month: m, day: d, dateObj };
  }

  async function renderJournal() {
    const selectedMonth = state.selectedJournalMonth; // e.g. "2026-11" or "all"
    const activeCategory = state.journalCategory || 'all';

    // If gallery category selected:
    if (activeCategory === 'gallery') {
      if (el.journalEntriesTab) el.journalEntriesTab.style.display = 'none';
      if (el.journalGalleryTab) el.journalGalleryTab.style.display = 'block';
      if (el.journalHighlightsTab) el.journalHighlightsTab.style.display = 'none';
      if (el.journalTagsBarWrap) el.journalTagsBarWrap.style.display = 'none';
      const allImages = await window.devotionStore.getAllImages();
      const allNotes = await window.devotionStore.getAllNotes();
      const imagesMap = new Map(allImages.map(img => [img.date, img]));
      const notesMap = new Map(allNotes.map(n => [n.date, n.note]));
      renderJournalGallery(selectedMonth, imagesMap, notesMap, allImages);
      return;
    }

    // If highlights category selected:
    if (activeCategory === 'highlights') {
      if (el.journalEntriesTab) el.journalEntriesTab.style.display = 'none';
      if (el.journalGalleryTab) el.journalGalleryTab.style.display = 'none';
      if (el.journalHighlightsTab) el.journalHighlightsTab.style.display = 'block';
      if (el.journalTagsBarWrap) el.journalTagsBarWrap.style.display = 'none';
      await renderJournalHighlights(selectedMonth);
      return;
    }

    // Otherwise entries tab is visible
    if (el.journalEntriesTab) el.journalEntriesTab.style.display = 'block';
    if (el.journalGalleryTab) el.journalGalleryTab.style.display = 'none';
    if (el.journalHighlightsTab) el.journalHighlightsTab.style.display = 'none';

    const allNotes = await window.devotionStore.getAllNotes();
    const allImages = await window.devotionStore.getAllImages();
    const allCompletions = await window.devotionStore.getAllCompletions();
    const allSundayServices = await window.devotionStore.getAllSundayServices();

    renderJournalEntriesList(selectedMonth, activeCategory, allNotes, allImages, allCompletions, allSundayServices);
  }

  function renderJournalEntriesList(monthStr, category, allNotes, allImages, allCompletions, allSundayServices) {
    el.journalEntriesList.innerHTML = '';

    // Map by date
    const notesMap = new Map(allNotes.map(n => [n.date, n]));
    const imagesMap = new Map(allImages.map(img => [img.date, img]));
    const completionsMap = new Map(allCompletions.map(c => [c.date, c]));

    const candidateEntries = [];

    // 1. Devotion Entries
    if (category === 'all' || category === 'devotions') {
      const dateSet = new Set();
      if (monthStr === 'all') {
        allNotes.forEach(n => dateSet.add(n.date));
        allImages.forEach(img => dateSet.add(img.date));
      } else {
        const [yStr, mStr] = monthStr.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const daysInMonth = (m === 2) ? 28 : (([4, 6, 9, 11].includes(m)) ? 30 : 31);
        for (let d = 1; d <= daysInMonth; d++) {
          dateSet.add(`${monthStr}-${String(d).padStart(2, '0')}`);
        }
        allNotes.forEach(n => { if (n.date && n.date.startsWith(monthStr)) dateSet.add(n.date); });
        allImages.forEach(img => { if (img.date && img.date.startsWith(monthStr)) dateSet.add(img.date); });
      }

      dateSet.forEach(dStr => {
        const { day, dateObj } = parseDateParts(dStr);
        const noteRec = notesMap.get(dStr);
        const note = noteRec ? noteRec.note : null;
        const tags = (noteRec && Array.isArray(noteRec.tags)) ? noteRec.tags : [];
        const img = imagesMap.get(dStr);
        const comp = completionsMap.get(dStr);
        const sched = window.bibleService.getDaySchedule(day);

        let hasValidNote = false;
        let parsedNote = null;
        if (note && note.trim()) {
          parsedNote = parseNoteData(note, sched ? sched.scriptures : '');
          if (parsedNote.format === 'soap') {
            hasValidNote = Boolean(
              (parsedNote.observation && parsedNote.observation.trim()) ||
              (parsedNote.application && parsedNote.application.trim()) ||
              (parsedNote.prayer && parsedNote.prayer.trim())
            );
          } else {
            hasValidNote = Boolean(parsedNote.text && parsedNote.text.trim());
          }
        }

        if (hasValidNote || img || tags.length > 0) {
          candidateEntries.push({
            type: 'devotion',
            day,
            dateStr: dStr,
            dateObj,
            note: hasValidNote ? note : null,
            parsedNote,
            tags,
            img,
            comp,
            sched
          });
        }
      });
    }

    // 2. Sunday Service Entries
    if (category === 'all' || category === 'sunday') {
      (allSundayServices || []).forEach(s => {
        if (!s || !s.date) return;
        if (monthStr !== 'all' && !s.date.startsWith(monthStr)) return;

        const hasContent = Boolean(s.attended || s.title || s.speaker || s.notes || (s.tags && s.tags.length));
        if (hasContent) {
          const { day, dateObj } = parseDateParts(s.date);
          candidateEntries.push({
            type: 'sunday',
            day,
            dateStr: s.date,
            dateObj,
            attended: Boolean(s.attended),
            title: s.title || '',
            speaker: s.speaker || '',
            notes: s.notes || '',
            tags: Array.isArray(s.tags) ? s.tags : [],
            serviceRecord: s
          });
        }
      });
    }

    // --- Tag Aggregation & Filter Bar ---
    const tagCountMap = new Map();
    candidateEntries.forEach(item => {
      if (item.tags && item.tags.length) {
        item.tags.forEach(t => {
          const clean = t.trim().toLowerCase();
          if (clean) {
            tagCountMap.set(clean, (tagCountMap.get(clean) || 0) + 1);
          }
        });
      }
    });

    if (tagCountMap.size === 0 || !el.journalTagsBarWrap || !el.journalTagsBar) {
      if (el.journalTagsBarWrap) el.journalTagsBarWrap.style.display = 'none';
      state.selectedTagFilter = null;
    } else {
      el.journalTagsBarWrap.style.display = 'flex';
      el.journalTagsBar.innerHTML = '';

      // All Tags Pill
      const allPill = document.createElement('button');
      allPill.type = 'button';
      allPill.className = `journal-tag-filter-pill ${!state.selectedTagFilter ? 'active' : ''}`;
      allPill.innerHTML = `<span>All Tags</span> <span class="journal-tag-filter-count">${candidateEntries.length}</span>`;
      allPill.addEventListener('click', () => {
        state.selectedTagFilter = null;
        renderJournal();
      });
      el.journalTagsBar.appendChild(allPill);

      // Sorted Tag Pills
      const sortedTags = Array.from(tagCountMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      sortedTags.forEach(([tag, count]) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        const isActive = (state.selectedTagFilter === tag);
        pill.className = `journal-tag-filter-pill ${isActive ? 'active' : ''}`;
        pill.innerHTML = `<span>#${escapeHtml(tag)}</span> <span class="journal-tag-filter-count">${count}</span>`;
        pill.addEventListener('click', () => {
          state.selectedTagFilter = isActive ? null : tag;
          renderJournal();
        });
        el.journalTagsBar.appendChild(pill);
      });
    }

    // Filter by active tag if selected
    let entriesToRender = candidateEntries;
    if (state.selectedTagFilter) {
      entriesToRender = candidateEntries.filter(item => 
        item.tags && item.tags.some(t => t.trim().toLowerCase() === state.selectedTagFilter)
      );
    }

    if (entriesToRender.length === 0) {
      let emptyMsg = `No journal entries found ${monthStr === 'all' ? 'yet' : `for ${monthStr}`}.`;
      if (state.selectedTagFilter) {
        emptyMsg = `No entries found matching tag #${state.selectedTagFilter}.`;
      } else if (category === 'sunday') {
        emptyMsg = `No Sunday church service notes found ${monthStr === 'all' ? 'yet' : `for ${monthStr}`}.`;
      } else if (category === 'devotions') {
        emptyMsg = `No daily devotion notes found ${monthStr === 'all' ? 'yet' : `for ${monthStr}`}.`;
      }

      el.journalEntriesList.innerHTML = `
        <div class="empty-state-box" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">${category === 'sunday' ? '⛪' : '✍️'}</div>
          <p>${escapeHtml(emptyMsg)}</p>
          <p style="font-size: 0.8rem; margin-top: 6px;">
            ${category === 'sunday' ? 'Record sermon notes & mark attendance on Sundays!' : 'Start reading today’s devotion to write notes and attach photos!'}
          </p>
        </div>
      `;
      return;
    }

    // Sort descending by dateStr
    entriesToRender.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    entriesToRender.forEach(item => {
      const card = document.createElement('div');

      if (item.type === 'sunday') {
        // Sunday Service Entry Card
        card.className = 'journal-entry-card sunday-service-entry';
        const dateText = item.dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

        let cardHtml = `
          <div class="entry-card-top">
            <span class="entry-date-badge">⛪ ${dateText}</span>
            ${item.attended ? '<span class="sunday-attendance-pill">✓ Attended</span>' : '<span class="stat-tag">Notes Only</span>'}
          </div>
          <div class="entry-scriptures-title">${escapeHtml(item.title || 'Sunday Church Service')}</div>
        `;

        if (item.speaker) {
          cardHtml += `<div class="sunday-card-speaker">👤 Speaker: ${escapeHtml(item.speaker)}</div>`;
        }

        if (item.notes) {
          cardHtml += `<div class="entry-note-preview">“${escapeHtml(item.notes.trim())}”</div>`;
        }

        if (item.tags && item.tags.length) {
          cardHtml += `
            <div class="card-tags-row">
              ${item.tags.map(t => `<span class="card-tag-pill">#${escapeHtml(t)}</span>`).join('')}
            </div>
          `;
        }

        cardHtml += `
          <div class="entry-card-footer">
            <span class="entry-card-action-hint">Open service notes ↗</span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">Sunday Service</span>
          </div>
        `;

        card.innerHTML = cardHtml;
        card.addEventListener('click', () => {
          openSundayModal(item.dateStr);
        });
      } else {
        // Daily Devotion Entry Card
        card.className = 'journal-entry-card';
        const dateText = item.dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const scriptureTitle = item.sched ? item.sched.scriptures : 'Daily Devotion';

        let cardHtml = `
          <div class="entry-card-top">
            <span class="entry-date-badge">📅 ${dateText} • Day ${item.day}</span>
            ${item.comp ? '<span class="stat-tag green">✓ Completed</span>' : '<span class="stat-tag">Incomplete</span>'}
          </div>
          <div class="entry-scriptures-title">${escapeHtml(scriptureTitle)}</div>
        `;

        if (item.parsedNote) {
          if (item.parsedNote.format === 'soap') {
            cardHtml += `
              <div class="soap-entry-card-content">
                <div class="soap-tag-pill">S.O.A.P. Journal Reflection</div>
                ${item.parsedNote.observation ? `
                <div class="soap-preview-row">
                  <span class="soap-preview-badge soap-letter-o">O</span>
                  <div class="soap-preview-body"><strong>Observation:</strong> ${escapeHtml(item.parsedNote.observation)}</div>
                </div>` : ''}
                ${item.parsedNote.application ? `
                <div class="soap-preview-row">
                  <span class="soap-preview-badge soap-letter-a">A</span>
                  <div class="soap-preview-body"><strong>Application:</strong> ${escapeHtml(item.parsedNote.application)}</div>
                </div>` : ''}
                ${item.parsedNote.prayer ? `
                <div class="soap-preview-row">
                  <span class="soap-preview-badge soap-letter-p">P</span>
                  <div class="soap-preview-body"><strong>Prayer:</strong> ${escapeHtml(item.parsedNote.prayer)}</div>
                </div>` : ''}
              </div>
            `;
          } else {
            cardHtml += `<div class="entry-note-preview">“${escapeHtml(item.parsedNote.text.trim())}”</div>`;
          }
        }

        if (item.tags && item.tags.length) {
          cardHtml += `
            <div class="card-tags-row">
              ${item.tags.map(t => `<span class="card-tag-pill">#${escapeHtml(t)}</span>`).join('')}
            </div>
          `;
        }

        if (item.img && item.img.dataUrl) {
          cardHtml += `
            <div style="position: relative;">
              <img src="${item.img.dataUrl}" alt="Devotion photo" class="entry-thumbnail">
              <span style="position: absolute; bottom: 12px; right: 8px; background: rgba(0,0,0,0.75); color: #fff; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;">📷 Attached</span>
            </div>
          `;
        }

        cardHtml += `
          <div class="entry-card-footer">
            <span class="entry-card-action-hint">Open full entry ↗</span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${item.parsedNote ? (item.parsedNote.format === 'soap' ? 'S.O.A.P.' : 'Reflection') : 'Photo'}</span>
          </div>
        `;

        card.innerHTML = cardHtml;
        card.addEventListener('click', () => {
          openJournalEntryPanel(item);
        });
      }

      el.journalEntriesList.appendChild(card);
    });
  }

  function renderJournalGallery(monthStr, imagesMap, notesMap, allImages) {
    el.journalGalleryGrid.innerHTML = '';

    const photos = [];
    const sourceImages = (monthStr === 'all')
      ? allImages
      : allImages.filter(img => img.date && img.date.startsWith(monthStr));

    sourceImages.forEach(img => {
      const { day, dateObj } = parseDateParts(img.date);
      const sched = window.bibleService.getDaySchedule(day);
      const note = notesMap.get(img.date);
      photos.push({ day, dateStr: img.date, dateObj, img, sched, note });
    });

    if (photos.length === 0) {
      el.journalGalleryGrid.innerHTML = `
        <div class="empty-state-box" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">📷</div>
          <p>No photos uploaded ${monthStr === 'all' ? 'yet' : `for ${monthStr}`}.</p>
          <p style="font-size: 0.8rem; margin-top: 6px;">Tap "+ Add Photo" in your daily devotion to attach photos and build your visual gallery!</p>
        </div>
      `;
      return;
    }

    // Sort descending by dateStr
    photos.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    photos.forEach(item => {
      const tile = document.createElement('div');
      tile.className = 'gallery-tile';

      const dateText = item.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const bookTitle = item.sched ? item.sched.passages[0].bookName : 'Devotion';

      tile.innerHTML = `
        <img src="${item.img.dataUrl}" alt="Devotion photo for Day ${item.day}">
        <div class="gallery-tile-caption">
          <span class="gallery-tile-date">📅 ${dateText} • Day ${item.day}</span>
          <span class="gallery-tile-scripture">${escapeHtml(bookTitle)}</span>
        </div>
      `;

      tile.addEventListener('click', () => {
        openImageDetailPanel(item);
      });

      el.journalGalleryGrid.appendChild(tile);
    });
  }

  // --- Highlights Catalog in Journal Tab (Phase 2) ---
  async function renderJournalHighlights(monthStr = 'all') {
    if (!el.journalHighlightsList) return;
    el.journalHighlightsList.innerHTML = '';

    const allHighlights = await window.devotionStore.getAllHighlights();

    // Filter by month if monthStr !== 'all'
    let filtered = allHighlights;
    if (monthStr !== 'all') {
      filtered = filtered.filter(h => h.dateStr && h.dateStr.startsWith(monthStr));
    }

    // Counts for filter pills
    const countAll = filtered.length;
    const countGold = filtered.filter(h => h.color === 'gold').length;
    const countGreen = filtered.filter(h => h.color === 'green').length;
    const countBlue = filtered.filter(h => h.color === 'blue').length;
    const countPurple = filtered.filter(h => h.color === 'purple').length;

    // Update count labels in filter bar
    const cAll = document.getElementById('count-hl-all');
    if (cAll) cAll.textContent = countAll;
    const cGold = document.getElementById('count-hl-gold');
    if (cGold) cGold.textContent = countGold;
    const cGreen = document.getElementById('count-hl-green');
    if (cGreen) cGreen.textContent = countGreen;
    const cBlue = document.getElementById('count-hl-blue');
    if (cBlue) cBlue.textContent = countBlue;
    const cPurple = document.getElementById('count-hl-purple');
    if (cPurple) cPurple.textContent = countPurple;

    // Apply color filter
    const activeFilter = state.activeHighlightFilter || 'all';
    let displayList = filtered;
    if (activeFilter !== 'all') {
      displayList = displayList.filter(h => h.color === activeFilter);
    }

    // Sort by date / day descending
    displayList.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.dateStr || 0).getTime();
      const timeB = new Date(b.updatedAt || b.dateStr || 0).getTime();
      return timeB - timeA;
    });

    if (displayList.length === 0) {
      el.journalHighlightsList.innerHTML = `
        <div class="empty-state-box" style="padding: 40px 20px; text-align: center;">
          <div class="empty-state-icon" style="font-size: 2.5rem; margin-bottom: 12px;">✨</div>
          <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No Highlights Yet</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 340px; margin: 0 auto 16px;">
            Tap any verse while reading your daily devotion to highlight in Gold, Emerald, Sky, or Purple.
          </p>
          <button class="btn-primary" id="btn-empty-hl-goto-devotion" style="padding: 8px 18px; font-size: 0.82rem; border-radius: var(--radius-full);">
            📖 Go to Today's Devotion
          </button>
        </div>
      `;
      const btnGo = el.journalHighlightsList.querySelector('#btn-empty-hl-goto-devotion');
      if (btnGo) {
        btnGo.addEventListener('click', () => {
          switchView('devotion');
        });
      }
      return;
    }

    displayList.forEach(hl => {
      const card = document.createElement('div');
      card.className = `journal-highlight-card border-color-${hl.color || 'gold'}`;
      card.dataset.id = hl.id;

      let dateLabel = '';
      if (hl.dateStr) {
        const parts = hl.dateStr.split('-');
        if (parts.length === 3) {
          const d = new Date(parts[0], parts[1] - 1, parts[2]);
          dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      } else if (hl.dayNum) {
        dateLabel = `Day ${hl.dayNum}`;
      }

      card.innerHTML = `
        <div class="highlight-card-header">
          <div class="highlight-ref-group">
            <span class="highlight-color-indicator ${hl.color || 'gold'}"></span>
            <span class="highlight-reference">${hl.reference}</span>
            <span class="highlight-trans-tag">${hl.translation || 'BSB'}</span>
          </div>
          ${dateLabel ? `<div class="highlight-date-badge">${dateLabel}</div>` : ''}
        </div>
        <blockquote class="highlight-scripture-quote">
          "${escapeHtml(hl.text)}"
        </blockquote>
        <div class="highlight-card-actions">
          <button class="btn-highlight-action btn-read-context" data-id="${hl.id}" data-day="${hl.dayNum || ''}" data-ref="${hl.reference}">
            <span>📖</span> Read in Context
          </button>
          <button class="btn-highlight-action btn-card-highlight" data-id="${hl.id}">
            <span>🎨</span> Card
          </button>
          <button class="btn-highlight-action btn-copy-highlight" data-id="${hl.id}">
            <span>📋</span> Copy
          </button>
          <button class="btn-highlight-action btn-remove-highlight" data-id="${hl.id}">
            <span>🗑️</span> Remove
          </button>
        </div>
      `;

      // Read in context button
      const btnRead = card.querySelector('.btn-read-context');
      btnRead.addEventListener('click', async () => {
        let targetDay = hl.dayNum;
        if (!targetDay && hl.dateStr) {
          const parts = hl.dateStr.split('-');
          if (parts.length === 3) targetDay = parseInt(parts[2], 10);
        }
        if (!targetDay) targetDay = state.currentDay || 3;

        switchView('devotion');
        await loadDevotionDay(targetDay);

        // Scroll to verse after DOM updates
        setTimeout(() => {
          const targetEl = document.getElementById(`verse-${hl.id}`) || document.querySelector(`[data-verse-id="${hl.id}"]`);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.classList.add('verse-pulse-flash');
            setTimeout(() => targetEl.classList.remove('verse-pulse-flash'), 3000);
          }
        }, 150);

        showToast(`Viewing ${hl.reference} in context 📖`);
      });

      // Create card button
      const btnCard = card.querySelector('.btn-card-highlight');
      if (btnCard) {
        btnCard.addEventListener('click', () => {
          openCardGenerator({
            verseText: hl.text,
            reference: hl.reference,
            translation: hl.translation || 'BSB',
            dayNum: hl.dayNum,
            dateStr: hl.dateStr
          });
        });
      }

      // Copy button
      const btnCopy = card.querySelector('.btn-copy-highlight');
      btnCopy.addEventListener('click', () => {
        const textToCopy = `"${hl.text}" — ${hl.reference} (${hl.translation || 'BSB'})`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(`Copied ${hl.reference} 📋`);
          }).catch(() => {
            copyFallback(textToCopy);
          });
        } else {
          copyFallback(textToCopy);
        }
      });

      // Remove button
      const btnRemove = card.querySelector('.btn-remove-highlight');
      btnRemove.addEventListener('click', async () => {
        if (confirm(`Remove highlight for ${hl.reference}?`)) {
          await window.devotionStore.deleteHighlight(hl.id);
          showToast(`Highlight removed`);
          await renderJournalHighlights(monthStr);
        }
      });

      el.journalHighlightsList.appendChild(card);
    });
  }

  function openJournalEntryPanel(item) {
    activeJournalItem = item;
    const fullDateText = item.dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

    el.journalPanelDate.textContent = `📅 Day ${item.day} • ${fullDateText}`;
    el.journalPanelScripture.textContent = item.sched ? item.sched.scriptures : 'Daily Devotion';

    if (item.comp) {
      el.journalPanelCompBadge.className = 'stat-tag green';
      el.journalPanelCompBadge.textContent = '✓ Completed';
      el.journalPanelCompBadge.style.display = 'inline-block';
    } else {
      el.journalPanelCompBadge.className = 'stat-tag';
      el.journalPanelCompBadge.textContent = 'Incomplete';
      el.journalPanelCompBadge.style.display = 'inline-block';
    }

    let bodyHtml = '';

    if (item.parsedNote) {
      if (item.parsedNote.format === 'soap') {
        const scripText = item.parsedNote.scripture || (item.sched ? item.sched.scriptures : '');
        bodyHtml += `
          <div class="soap-panel-section soap-panel-s">
            <div class="soap-section-badge"><span class="soap-letter-badge soap-letter-s">S</span> Scripture Reference</div>
            <div class="soap-section-content">${escapeHtml(scripText)}</div>
          </div>
          <div class="soap-panel-section soap-panel-o">
            <div class="soap-section-badge"><span class="soap-letter-badge soap-letter-o">O</span> Observation</div>
            <div class="soap-section-content">${item.parsedNote.observation ? escapeHtml(item.parsedNote.observation) : '<em style="color: var(--text-muted);">No observation recorded.</em>'}</div>
          </div>
          <div class="soap-panel-section soap-panel-a">
            <div class="soap-section-badge"><span class="soap-letter-badge soap-letter-a">A</span> Application</div>
            <div class="soap-section-content">${item.parsedNote.application ? escapeHtml(item.parsedNote.application) : '<em style="color: var(--text-muted);">No application recorded.</em>'}</div>
          </div>
          <div class="soap-panel-section soap-panel-p">
            <div class="soap-section-badge"><span class="soap-letter-badge soap-letter-p">P</span> Prayer</div>
            <div class="soap-section-content">${item.parsedNote.prayer ? escapeHtml(item.parsedNote.prayer) : '<em style="color: var(--text-muted);">No prayer recorded.</em>'}</div>
          </div>
        `;
      } else {
        bodyHtml += `
          <div class="standard-panel-section">
            <div class="soap-section-badge">✍️ Personal Reflection & Notes</div>
            <div class="standard-section-content">${escapeHtml(item.parsedNote.text)}</div>
          </div>
        `;
      }
    } else {
      bodyHtml += `
        <div class="standard-panel-section">
          <div class="soap-section-badge">✍️ Personal Reflection</div>
          <div class="standard-section-content" style="color: var(--text-muted); font-style: italic;">No written notes recorded for this day.</div>
        </div>
      `;
    }

    if (item.img && item.img.dataUrl) {
      bodyHtml += `
        <div class="panel-attached-photo-wrap">
          <div class="soap-section-badge">📷 Attached Devotional Photo</div>
          <img src="${item.img.dataUrl}" alt="Devotion photo" class="panel-attached-img" id="panel-attached-img" title="Click to inspect full photo">
        </div>
      `;
    }

    if (item.tags && item.tags.length) {
      bodyHtml += `
        <div style="margin: 14px 0 6px 0;">
          <div class="soap-section-badge">🏷️ Tags &amp; Themes</div>
          <div class="card-tags-row">
            ${item.tags.map(t => `<span class="card-tag-pill">#${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      `;
    }

    el.journalPanelBody.innerHTML = bodyHtml;

    // Click photo to open full image detail modal
    const panelImg = el.journalPanelBody.querySelector('#panel-attached-img');
    if (panelImg) {
      panelImg.addEventListener('click', () => {
        closeJournalEntryModal();
        openImageDetailPanel(item);
      });
    }

    el.modalJournalEntry.classList.add('active');
  }

  function closeJournalEntryModal() {
    activeJournalItem = null;
    if (el.modalJournalEntry) {
      el.modalJournalEntry.classList.remove('active');
    }
  }

  function openImageDetailPanel(item) {
    activeImageItem = item;
    const fullDateText = item.dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

    el.lightboxImg.src = item.img.dataUrl;
    el.lightboxDate.textContent = `📅 Day ${item.day} • ${fullDateText}`;
    if (el.lightboxScripture) {
      el.lightboxScripture.textContent = item.sched ? item.sched.scriptures : 'Daily Devotion';
    }

    // Show note snippet if available
    if (item.note && item.note.trim()) {
      const parsed = parseNoteData(item.note, item.sched ? item.sched.scriptures : '');
      let snippet = '';
      if (parsed.format === 'soap') {
        snippet = parsed.observation || parsed.application || parsed.prayer || '';
      } else {
        snippet = parsed.text || '';
      }
      if (snippet && snippet.trim()) {
        el.lightboxCaption.innerHTML = `<span style="font-weight: 700; color: var(--accent-gold-light);">Reflection:</span> “${escapeHtml(snippet.slice(0, 160))}${snippet.length > 160 ? '...' : ''}”`;
        el.lightboxCaption.style.display = 'block';
      } else {
        el.lightboxCaption.style.display = 'none';
      }
    } else {
      el.lightboxCaption.style.display = 'none';
    }

    el.modalLightbox.classList.add('active');
  }

  function closeLightbox() {
    activeImageItem = null;
    if (el.modalLightbox) {
      el.modalLightbox.classList.remove('active');
    }
  }

  // --- Confirmation Modal Helpers ---
  let confirmCallback = null;
  function showConfirmModal(title, desc, icon, onProceed, proceedLabel = 'Yes, Proceed', isDanger = true) {
    if (!el.modalConfirm) return;
    el.confirmModalTitle.textContent = title;
    el.confirmModalDesc.textContent = desc;
    el.confirmModalIcon.textContent = icon || '⚠️';
    if (el.btnConfirmProceed) {
      el.btnConfirmProceed.textContent = proceedLabel;
      if (isDanger) {
        el.btnConfirmProceed.className = 'btn-danger-action';
        el.btnConfirmProceed.style.cssText = 'padding: 13px; font-size: 0.9rem; justify-content: center; font-weight: 700; width: 100%;';
      } else {
        el.btnConfirmProceed.className = 'btn-primary';
        el.btnConfirmProceed.style.cssText = 'padding: 13px; font-size: 0.9rem; justify-content: center; font-weight: 700; width: 100%;';
      }
    }
    confirmCallback = onProceed;
    el.modalConfirm.classList.add('active');
  }

  function closeConfirmModal() {
    confirmCallback = null;
    if (el.modalConfirm) {
      el.modalConfirm.classList.remove('active');
    }
  }

  // --- Deletion Scope Modal Helpers ---
  let pendingDeleteAction = null; // 'journal', 'images', 'scriptures', 'tts', 'progress'

  function openScopeModal(actionType, title, desc) {
    pendingDeleteAction = actionType;
    if (el.scopeDeleteTitle) el.scopeDeleteTitle.textContent = title;
    if (el.scopeDeleteDesc) el.scopeDeleteDesc.textContent = desc;
    if (el.scopeMonthName) el.scopeMonthName.textContent = 'Currently Selected Month (November 2026)';

    if (el.radioScopeMonth) el.radioScopeMonth.checked = true;
    if (el.scopeBoxMonth) el.scopeBoxMonth.classList.add('selected');
    if (el.scopeBoxAll) el.scopeBoxAll.classList.remove('selected');

    if (el.modalScopeDelete) el.modalScopeDelete.classList.add('active');
  }

  function closeScopeModal() {
    if (el.modalScopeDelete) el.modalScopeDelete.classList.remove('active');
  }

  // --- View 5: Settings, Alarms & Data Management ---
  async function renderSettings() {
    // Alarms settings
    el.settingAlarmToggle.checked = window.alarmService.enabled;
    el.settingAlarmTime.value = window.alarmService.alarmTime;
    el.settingAlarmTone.value = window.alarmService.alarmTone;
    el.settingSnoozeDuration.value = String(window.alarmService.snoozeMinutes);
    el.settingEveningToggle.checked = window.alarmService.eveningRemindersEnabled;

    // Check if snooze is active
    if (el.settingsSnoozeCard) {
      if (window.alarmService.isSnoozed()) {
        el.settingsSnoozeCard.style.display = 'flex';
        el.settingsSnoozeText.textContent = `Alarm snoozed until ${window.alarmService.getFormattedSnoozeTime()}`;
      } else {
        el.settingsSnoozeCard.style.display = 'none';
      }
    }

    // Push notification status
    if ('Notification' in window) {
      updateNotifPermBadge(Notification.permission);
    } else {
      updateNotifPermBadge('unsupported');
    }

    // Data Management & Storage counts
    try {
      const counts = await window.devotionStore.getDataCounts();
      if (el.statDataCompletions) el.statDataCompletions.textContent = counts.completionsCount;
      if (el.statDataNotes) el.statDataNotes.textContent = counts.notesCount;
      if (el.statDataPhotos) el.statDataPhotos.textContent = counts.imagesCount;
      if (el.statDataChapters) el.statDataChapters.textContent = counts.offlineChaptersCount;
      if (el.statDataTts) el.statDataTts.textContent = counts.ttsAudioCount || 0;
    } catch (err) {
      console.warn('Error loading storage counts', err);
    }

    // Reading & App Preferences
    if (el.settingSoapToggle) {
      el.settingSoapToggle.checked = !!state.soapFormatEnabled;
    }
    if (el.settingVersionDropdown) {
      el.settingVersionDropdown.value = window.bibleService.activeTranslation;
    }
    if (el.settingFontFamily) {
      el.settingFontFamily.value = state.fontFamily;
    }
    if (el.settingsThemeIcon && el.settingsThemeLabel) {
      el.settingsThemeIcon.textContent = state.theme === 'dark' ? '🌙' : '☀️';
      el.settingsThemeLabel.textContent = state.theme === 'dark' ? 'Dark Midnight' : 'Clean Light';
    }
    // TTS Audio Settings
    if (el.settingTtsRate && window.ttsService) {
      el.settingTtsRate.value = String(window.ttsService.rate.toFixed(2));
    }
    if (el.settingTtsVoice && window.ttsService) {
      const currentVoiceUri = window.ttsService.preferredVoiceURI;
      const voices = window.ttsService.getAvailableVoices('en');
      el.settingTtsVoice.innerHTML = '<option value="">Default: Google UK English Male (Auto)</option>';
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI || v.name;
        const isMale = !/female/i.test(v.name) && (/daniel|guy|david|oliver|mark|alex|fred|\bmale\b/i.test(v.name));
        const isFemale = /female|samantha|karen|ava|serena|moira|flo|shelley|sandy/i.test(v.name);
        const tag = isMale ? ' ♂ (Male)' : (isFemale ? ' ♀ (Female)' : '');
        opt.textContent = `${v.name} (${v.lang})${tag}`;
        if (opt.value === currentVoiceUri) opt.selected = true;
        el.settingTtsVoice.appendChild(opt);
      });
    }
    if (el.settingGoogleTtsKey && window.devotionStore) {
      el.settingGoogleTtsKey.value = window.devotionStore.getSetting('google_tts_api_key', '');
    }

    updateOfflineStatusBadge();
  }

  function saveAlarmSettings() {
    window.alarmService.setAlarmSettings(
      el.settingAlarmToggle.checked,
      el.settingAlarmTime.value,
      el.settingAlarmTone.value,
      Number(el.settingSnoozeDuration.value),
      el.settingEveningToggle.checked
    );
    showToast('Alarm preferences saved');
  }

  function updateNotifPermBadge(perm) {
    if (perm === 'granted') {
      el.notifPermStatus.textContent = 'Status: Active ✓';
      el.notifPermStatus.style.color = '#34d399';
      el.btnRequestNotifPerm.style.display = 'none';
    } else if (perm === 'denied') {
      el.notifPermStatus.textContent = 'Status: Blocked in browser';
      el.notifPermStatus.style.color = '#f87171';
      el.btnRequestNotifPerm.style.display = 'inline-block';
    } else {
      el.notifPermStatus.textContent = 'Status: Default (Tap to enable)';
      el.btnRequestNotifPerm.style.display = 'inline-block';
    }
  }

  async function updateOfflineStatusBadge() {
    const count = await window.devotionStore.countOfflineChapters();
    const readyEl = document.getElementById('offline-badge-ready');
    const summaryEl = document.getElementById('offline-summary-text');
    const fillEl = document.getElementById('download-progress-bar');
    const pctEl = document.getElementById('download-progress-pct');
    const textEl = document.getElementById('download-progress-text');

    if (count >= 100) {
      if (readyEl) {
        readyEl.textContent = '✓ Ready (105 Chapters)';
        readyEl.style.background = 'rgba(16, 185, 129, 0.2)';
        readyEl.style.color = '#34d399';
      }
      if (summaryEl) {
        summaryEl.textContent = 'All 105 chapters ready in offline storage';
      }
      if (fillEl) fillEl.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      if (textEl) textEl.textContent = 'Offline storage ready';
      if (el.quickOfflineStatus) {
        el.quickOfflineStatus.textContent = '✓ 100% Ready for Offline Use (105 Chapters)';
      }
    } else {
      if (readyEl) {
        readyEl.textContent = `${count}/105 Ch.`;
        readyEl.style.background = 'rgba(245, 158, 11, 0.2)';
        readyEl.style.color = 'var(--accent-gold-light)';
      }
      if (summaryEl) {
        summaryEl.textContent = `${count} chapters cached offline`;
      }
      const pct = Math.round((count / 105) * 100);
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (textEl) textEl.textContent = `${count} of 105 chapters downloaded`;
      if (el.quickOfflineStatus) {
        el.quickOfflineStatus.textContent = `${count} of 105 chapters ready offline`;
      }
    }
  }

  // --- Offline Download Handler (Requirement 10) ---
  async function handleDownloadMonthOffline() {
    el.btnDownloadMonth.disabled = true;
    el.downloadProgressBar.style.width = '0%';
    el.downloadProgressPct.textContent = '0%';
    el.downloadProgressText.textContent = 'Connecting to HelloAO API...';

    const activeTransId = window.bibleService.activeTranslation;

    const res = await window.bibleService.downloadMonthForOffline(activeTransId, (p) => {
      el.downloadProgressBar.style.width = `${p.percent}%`;
      el.downloadProgressPct.textContent = `${p.percent}%`;
      el.downloadProgressText.textContent = `Downloaded ${p.completed}/${p.total} chapters (${p.currentItem})`;
    });

    el.btnDownloadMonth.disabled = false;
    if (res.success) {
      el.downloadProgressBar.style.width = '100%';
      el.downloadProgressPct.textContent = '100%';
      el.downloadProgressText.textContent = `Completed! ${res.completed} chapters stored for offline use.`;
      showToast('November Devotion Verses Ready Offline! 📥');
      updateOfflineStatusBadge();
    } else {
      el.downloadProgressText.textContent = 'Download failed. Check network connection.';
    }
  }

  // --- Version Picker Modal (Requirement 13) ---
  function openVersionModal() {
    el.versionOptionsList.innerHTML = '';
    const active = window.bibleService.activeTranslation;

    window.bibleService.translations.forEach(t => {
      const opt = document.createElement('div');
      opt.className = `version-option ${t.id === active ? 'selected' : ''}`;
      opt.innerHTML = `
        <div>
          <div class="version-option-title">${t.name} (${t.id})</div>
          <div class="version-option-desc">${t.description}</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span class="version-lang-badge">${t.langLabel}</span>
          ${t.id === active ? '<span style="color: var(--accent-gold-light); font-size: 0.8rem; font-weight: 700;">✓ Selected</span>' : ''}
        </div>
      `;

      opt.addEventListener('click', () => {
        window.bibleService.setTranslation(t.id);
        updateHeaderVersion();
        closeVersionModal();
        showToast(`Switched to ${t.name}`);
        if (state.activeView === 'devotion') {
          renderDevotion(state.currentDay);
        }
      });

      el.versionOptionsList.appendChild(opt);
    });

    el.modalVersionPicker.classList.add('active');
  }

  function closeVersionModal() {
    el.modalVersionPicker.classList.remove('active');
  }

  // --- Confetti Celebration Animation ---
  function triggerCelebrationConfetti() {
    const canvas = el.confettiCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#fbbf24'];

    for (let i = 0; i < 75; i++) {
      pieces.push({
        x: canvas.width / 2,
        y: canvas.height * 0.7,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.8) * 18,
        r: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
        alpha: 1
      });
    }

    let animationId;
    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      pieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.45; // gravity
        p.vx *= 0.98;
        p.rotation += p.vr;
        p.alpha -= 0.012;

        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
          ctx.restore();
        }
      });

      if (alive) {
        animationId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animationId);
      }
    }
    render();
  }

  // --- Toast Notification Helper ---
  let toastTimer = null;
  function showToast(msg) {
    if (!el.appToast) return;
    el.toastMessage.textContent = msg;
    el.appToast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.appToast.classList.remove('visible');
    }, 2800);
  }

  // --- Service Worker Registration, Auto-Updates & Force Reload ---
  let swRegistration = null;

  function initServiceWorker() {
    // Check for query param '?updated=' after a force update
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('updated')) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      setTimeout(() => {
        showToast('App successfully updated to latest version! 🚀');
      }, 500);
    }

    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        swRegistration = reg;
        console.log('PWA ServiceWorker registered successfully:', reg.scope);

        // 1. Check for newer version on initial app launch if online
        if (navigator.onLine) {
          reg.update().catch(() => {});
        }

        // 2. Listen for newly found updates
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (!installingWorker) return;
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // A newer version has been cached and is ready
              notifyUpdateAvailable(installingWorker);
            }
          };
        };
      })
      .catch((err) => {
        console.warn('PWA ServiceWorker registration failed:', err);
      });

    // 3. Auto-check whenever the app is brought back to the foreground (e.g. mobile Homescreen switch)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine && swRegistration) {
        swRegistration.update().catch(() => {});
      }
    });

    // 4. Auto-check whenever internet connection is restored
    window.addEventListener('online', () => {
      if (swRegistration) {
        swRegistration.update().catch(() => {});
      }
    });

    // 5. When the new Service Worker activates and claims clients, reload smoothly
    let isRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isRefreshing) return;
      isRefreshing = true;
      window.location.reload();
    });
  }

  function notifyUpdateAvailable(worker) {
    if (el.updateBanner) {
      el.updateBanner.style.display = 'flex';
      if (el.btnBannerUpdate) {
        el.btnBannerUpdate.onclick = () => {
          worker.postMessage({ action: 'skipWaiting' });
        };
      }
    } else {
      showToast('A newer version of Daily Devotions is available! 🚀');
    }
  }

  async function forceAppUpdate() {
    if (!navigator.onLine) {
      showToast('You are offline. Connect to the internet to check for updates. 📡');
      return;
    }

    if (el.btnForceUpdate) {
      el.btnForceUpdate.disabled = true;
      el.btnForceUpdate.innerHTML = '<span>⏳</span> Fetching Latest Version...';
    }
    if (el.appUpdateStatusText) {
      el.appUpdateStatusText.textContent = 'Contacting server...';
    }
    showToast('Checking server for updates... 🔄');

    try {
      // 1. Purge HTTP asset caches in CacheStorage
      // NOTE: This clears ONLY the cached HTML/CSS/JS asset files!
      // IndexedDB (all notes, photos, completions, streaks) is NEVER touched and 100% preserved.
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      }

      // 2. Unregister all existing Service Workers so the fresh version installs immediately
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }

      if (el.appUpdateStatusText) {
        el.appUpdateStatusText.textContent = 'Reloading fresh version...';
      }
      showToast('Reloading fresh app version... 🚀');

      // 3. Reload with cache-busting timestamp parameter to bypass browser disk cache
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname + '?updated=' + Date.now();
      }, 400);
    } catch (err) {
      console.warn('Force update error:', err);
      window.location.href = window.location.origin + window.location.pathname + '?updated=' + Date.now();
    }
  }

  // ==========================================================================
  // Phase 3: Shareable Scripture Card Generator & Monthly Walk Infographic
  // ==========================================================================

  // --- Scripture Card Generator Controller ---
  async function openCardGenerator(opts = {}) {
    let text = opts.verseText || (state.selectedVerse ? state.selectedVerse.text : '');
    let ref = opts.reference || (state.selectedVerse ? state.selectedVerse.reference : 'Scripture');
    const translation = opts.translation || (window.bibleService ? window.bibleService.activeTranslation : 'BSB');
    const dateStr = opts.dateStr || (opts.dayNum ? getDayDateStr(opts.dayNum) : getDayDateStr(state.currentDay));

    // If no text given, take first verse of current day
    if (!text && el.passagesContainer) {
      const firstVerseEl = el.passagesContainer.querySelector('.verse-item');
      if (firstVerseEl) {
        text = firstVerseEl.dataset.verseText || firstVerseEl.innerText;
        ref = firstVerseEl.dataset.verseRef || ref;
      }
    }

    state.cardGen.verseText = text;
    state.cardGen.reference = `${ref} • ${translation}`;

    // Open modal immediately for instant UI responsiveness
    if (el.modalCardGenerator) {
      el.modalCardGenerator.style.display = 'flex';
    }

    drawScriptureCard();

    let reflectionText = '';
    let photoDataUrl = null;
    if (dateStr) {
      const noteRec = await window.devotionStore.getNoteRecord(dateStr);
      if (noteRec && noteRec.note) {
        try {
          const parsed = JSON.parse(noteRec.note);
          if (parsed.format === 'soap') {
            reflectionText = parsed.application || parsed.observation || parsed.prayer || '';
          } else {
            reflectionText = parsed.text || noteRec.note;
          }
        } catch {
          reflectionText = noteRec.note;
        }
      }
      const imgRec = await window.devotionStore.getImage(dateStr);
      if (imgRec && imgRec.dataUrl) {
        photoDataUrl = imgRec.dataUrl;
      }
    }

    state.cardGen.reflection = (reflectionText || '').trim();
    state.cardGen.photoDataUrl = photoDataUrl;

    if (el.btnThemePhoto) {
      if (photoDataUrl) {
        el.btnThemePhoto.style.display = 'inline-flex';
      } else {
        el.btnThemePhoto.style.display = 'none';
        if (state.cardGen.theme === 'photo') state.cardGen.theme = 'midnight';
      }
    }

    if (el.checkIncludeReflection) {
      if (reflectionText && reflectionText.trim().length > 0) {
        el.checkIncludeReflection.parentElement.style.display = 'flex';
      } else {
        el.checkIncludeReflection.parentElement.style.display = 'none';
        state.cardGen.includeReflection = false;
        el.checkIncludeReflection.checked = false;
      }
    }

    drawScriptureCard();
  }

  function closeCardGenerator() {
    if (el.modalCardGenerator) {
      el.modalCardGenerator.style.display = 'none';
    }
  }

  function drawScriptureCard() {
    const canvas = el.scriptureCardCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { verseText, reference, reflection, photoDataUrl, aspect, theme, includeReflection, includeWatermark } = state.cardGen;

    let width = 1080;
    let height = 1350; // default portrait (4:5)
    if (aspect === 'story') height = 1920; // 9:16
    if (aspect === 'square') height = 1080; // 1:1

    canvas.width = width;
    canvas.height = height;

    if (el.canvasAspectFrame) {
      el.canvasAspectFrame.style.aspectRatio = `${width} / ${height}`;
    }

    const renderCard = (bgImg = null) => {
      // 1. Background
      if (theme === 'photo' && bgImg) {
        const hRatio = width / bgImg.width;
        const vRatio = height / bgImg.height;
        const ratio = Math.max(hRatio, vRatio);
        const centerShiftX = (width - bgImg.width * ratio) / 2;
        const centerShiftY = (height - bgImg.height * ratio) / 2;
        ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height, centerShiftX, centerShiftY, bgImg.width * ratio, bgImg.height * ratio);

        const vignette = ctx.createLinearGradient(0, 0, 0, height);
        vignette.addColorStop(0, 'rgba(11, 15, 25, 0.7)');
        vignette.addColorStop(0.5, 'rgba(11, 15, 25, 0.6)');
        vignette.addColorStop(1, 'rgba(11, 15, 25, 0.85)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
      } else if (theme === 'dawn') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#4c0519');
        grad.addColorStop(0.4, '#831843');
        grad.addColorStop(1, '#d97706');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      } else if (theme === 'ocean') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#022c43');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#0284c7');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      } else if (theme === 'garden') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#064e3b');
        grad.addColorStop(0.5, '#022c22');
        grad.addColorStop(1, '#059669');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      } else { // midnight
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#070a12');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#1e293b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Decorative Double Border
      const margin = 50;
      ctx.strokeStyle = (theme === 'dawn') ? 'rgba(255, 241, 242, 0.28)' : ((theme === 'garden') ? 'rgba(209, 250, 229, 0.28)' : 'rgba(245, 158, 11, 0.35)');
      ctx.lineWidth = 3;
      roundRect(ctx, margin, margin, width - margin * 2, height - margin * 2, 28);
      ctx.stroke();

      // 3. Header Dove Icon
      ctx.font = '54px "Apple Color Emoji", "Segoe UI Emoji", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🕊️', width / 2, margin + 70);

      // 4. Scripture Verse
      const textMargin = 110;
      const maxTextWidth = width - textMargin * 2;
      const rawText = (verseText || '').trim();

      let fontSize = 42;
      if (rawText.length > 340) fontSize = 24;
      else if (rawText.length > 250) fontSize = 28;
      else if (rawText.length > 140) fontSize = 34;
      else if (rawText.length < 80) fontSize = 48;

      ctx.font = `italic 600 ${fontSize}px "Charter", "Merriweather", "Georgia", serif`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 12;

      const lines = getLines(ctx, `“${rawText}”`, maxTextWidth);
      const lineHeight = fontSize * 1.55;
      const totalTextHeight = lines.length * lineHeight;

      let startY = (height / 2) - (totalTextHeight / 2) - 40;
      if (includeReflection && reflection) {
        startY -= 80;
      }

      lines.forEach((line, idx) => {
        ctx.fillText(line, width / 2, startY + (idx * lineHeight));
      });

      ctx.shadowBlur = 0;

      // 5. Scripture Reference Badge
      const refY = startY + totalTextHeight + 42;
      ctx.font = 'bold 30px "Plus Jakarta Sans", -apple-system, sans-serif';
      const goldColor = (theme === 'dawn') ? '#fde68a' : ((theme === 'garden') ? '#6ee7b7' : '#f59e0b');
      ctx.fillStyle = goldColor;
      ctx.fillText(reference || 'Scripture', width / 2, refY);

      // 6. Optional Reflection Snippet
      if (includeReflection && reflection) {
        const divY = refY + 45;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 120, divY);
        ctx.lineTo(width / 2 + 120, divY);
        ctx.stroke();

        ctx.font = 'italic 25px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#cbd5e1';
        const refLines = getLines(ctx, `My Reflection: "${reflection.slice(0, 180)}${reflection.length > 180 ? '...' : ''}"`, maxTextWidth - 60);
        const refLineHeight = 36;
        refLines.forEach((rLine, rIdx) => {
          ctx.fillText(rLine, width / 2, divY + 38 + (rIdx * refLineHeight));
        });
      }

      // 7. Watermark Footer
      if (includeWatermark) {
        ctx.font = '600 20px "Plus Jakarta Sans", -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fillText('Daily Devotions | Bible Companion App', width / 2, height - margin - 35);
      }
    };

    if (theme === 'photo' && photoDataUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => renderCard(img);
      img.onerror = () => renderCard(null);
      img.src = photoDataUrl;
    } else {
      renderCard(null);
    }
  }

  function downloadCardImage() {
    const canvas = el.scriptureCardCanvas;
    if (!canvas) return;
    const cleanRef = (state.cardGen.reference || 'scripture-card').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${cleanRef}.png`;

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast(`Saved scripture card: ${filename} 📥`);
  }

  async function shareCardImage() {
    const canvas = el.scriptureCardCanvas;
    if (!canvas) return;
    const cleanRef = (state.cardGen.reference || 'scripture-card').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${cleanRef}.png`;

    canvas.toBlob(async (blob) => {
      if (!blob) {
        downloadCardImage();
        return;
      }
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Daily Scripture Reading',
            text: `“${state.cardGen.verseText}” — ${state.cardGen.reference}`
          });
          showToast('Card shared successfully! 📤');
          return;
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.warn('Share error:', err);
          }
        }
      }
      downloadCardImage();
    }, 'image/png');
  }

  function copyCardImage() {
    const canvas = el.scriptureCardCanvas;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      if (navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('Scripture card copied to clipboard 📋!');
        } catch (err) {
          console.warn('Clipboard write error:', err);
          downloadCardImage();
        }
      } else {
        downloadCardImage();
      }
    }, 'image/png');
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function getLines(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + " " + word).width;
      if (width < maxWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  // --- Monthly "Spiritual Walk with God" Infographic Controller ---
  async function openMonthlySummary(monthStr = '2026-11') {
    state.activeSummaryMonth = monthStr;
    if (el.summaryMonthSelect) el.summaryMonthSelect.value = monthStr;
    if (el.modalMonthlySummary) el.modalMonthlySummary.style.display = 'flex';
    await renderMonthlySummary(monthStr);
  }

  function closeMonthlySummary() {
    if (el.modalMonthlySummary) {
      el.modalMonthlySummary.style.display = 'none';
    }
  }

  async function renderMonthlySummary(monthStr = '2026-11') {
    const allCompletions = await window.devotionStore.getAllCompletions();
    const allNotes = await window.devotionStore.getAllNotes();
    const allServices = await window.devotionStore.getAllSundayServices();
    const allHighlights = await window.devotionStore.getAllHighlights();
    const allImages = await window.devotionStore.getAllImages();

    const [yStr, mStr] = monthStr.split('-');
    const y = parseInt(yStr, 10) || 2026;
    const m = parseInt(mStr, 10) || 11;
    const daysInMonth = (m === 2) ? 28 : (([4, 6, 9, 11].includes(m)) ? 30 : 31);

    const monthDate = new Date(y, m - 1, 1);
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (el.summaryBannerMonthTitle) el.summaryBannerMonthTitle.textContent = monthName;

    // Filter completions
    const monthCompletions = allCompletions.filter(c => c.date && c.date.startsWith(monthStr) && c.completed);
    const completedCount = monthCompletions.length;
    const pct = Math.round((completedCount / daysInMonth) * 100);

    if (el.summaryMetricDays) el.summaryMetricDays.textContent = `${completedCount} / ${daysInMonth}`;
    if (el.summaryMetricPct) el.summaryMetricPct.textContent = `${pct}%`;

    // Longest streak this month
    const completedDaysSet = new Set(monthCompletions.map(c => parseInt(c.date.slice(-2), 10)));
    let maxStreak = 0;
    let currStreak = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (completedDaysSet.has(d)) {
        currStreak++;
        if (currStreak > maxStreak) maxStreak = currStreak;
      } else {
        currStreak = 0;
      }
    }
    if (el.summaryMetricStreak) el.summaryMetricStreak.textContent = `${maxStreak} Days`;

    // Sundays in month
    let sundaysCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(y, m - 1, d).getDay() === 0) sundaysCount++;
    }
    const monthServices = allServices.filter(s => s.date && s.date.startsWith(monthStr) && s.attended);
    if (el.summaryMetricSunday) el.summaryMetricSunday.textContent = `${monthServices.length} / ${sundaysCount}`;

    // Notes
    const monthNotes = allNotes.filter(n => n.date && n.date.startsWith(monthStr) && n.note && n.note.trim().length > 0);
    if (el.summaryMetricNotes) el.summaryMetricNotes.textContent = String(monthNotes.length);

    // Highlights
    const monthHighlights = allHighlights.filter(h => h.dateStr && h.dateStr.startsWith(monthStr));
    if (el.summaryMetricHighlights) el.summaryMetricHighlights.textContent = String(monthHighlights.length);

    // Photos
    const monthPhotos = allImages.filter(img => img.date && img.date.startsWith(monthStr));
    if (el.summaryMetricPhotos) el.summaryMetricPhotos.textContent = String(monthPhotos.length);

    // Top Tags Frequency
    const tagCountMap = new Map();
    monthNotes.forEach(n => {
      if (Array.isArray(n.tags)) {
        n.tags.forEach(t => {
          const clean = t.trim().replace(/^#+/, '');
          if (clean) tagCountMap.set(clean, (tagCountMap.get(clean) || 0) + 1);
        });
      }
    });
    monthServices.forEach(s => {
      if (Array.isArray(s.tags)) {
        s.tags.forEach(t => {
          const clean = t.trim().replace(/^#+/, '');
          if (clean) tagCountMap.set(clean, (tagCountMap.get(clean) || 0) + 1);
        });
      }
    });

    const sortedTags = Array.from(tagCountMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (el.summaryTopTagsChips) {
      el.summaryTopTagsChips.innerHTML = '';
      if (sortedTags.length === 0) {
        el.summaryTopTagsChips.innerHTML = `<span style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">No tags recorded this month yet.</span>`;
      } else {
        sortedTags.forEach(([tag, count]) => {
          const chip = document.createElement('span');
          chip.className = 'card-tag-pill';
          chip.textContent = `#${tag} (${count})`;
          el.summaryTopTagsChips.appendChild(chip);
        });
      }
    }

    // Dynamic Pastoral Encouragement
    if (el.summaryBlessingText && el.summaryBlessingVerse) {
      if (completedCount >= 20) {
        el.summaryBlessingText.textContent = "Well done, faithful servant! Your daily consistency in God's Word has planted deep spiritual roots this month. Continue walking closely in His grace.";
        el.summaryBlessingVerse.textContent = "— Psalm 1:2-3";
      } else if (completedCount >= 10) {
        el.summaryBlessingText.textContent = "Grace upon grace! You are building an inspiring habit of morning reflection and prayer. Keep pressing on toward the prize.";
        el.summaryBlessingVerse.textContent = "— Philippians 3:14";
      } else {
        el.summaryBlessingText.textContent = "Every moment spent listening to God's voice matters. Remember that His mercies are new every morning, and His faithfulness is great.";
        el.summaryBlessingVerse.textContent = "— Lamentations 3:22-23";
      }
    }
  }

  function saveMonthlySummaryImage() {
    const monthStr = state.activeSummaryMonth || '2026-11';
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 1350);
    grad.addColorStop(0, '#090d16');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1350);

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 3;
    roundRect(ctx, 40, 40, 1000, 1270, 24);
    ctx.stroke();

    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText('✨ MY SPIRITUAL WALK WITH GOD', 540, 110);

    const titleText = (el.summaryBannerMonthTitle ? el.summaryBannerMonthTitle.textContent : 'November 2026') + ' Summary';
    ctx.font = 'bold 50px "Charter", "Georgia", serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(titleText, 540, 175);

    ctx.font = 'italic 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('"Your word is a lamp to my feet and a light to my path." — Psalm 119:105', 540, 225);

    const metrics = [
      { icon: '📖', label: 'Days in Scripture', val: el.summaryMetricDays ? el.summaryMetricDays.textContent : '0 / 30' },
      { icon: '🔥', label: 'Day Streak', val: el.summaryMetricStreak ? el.summaryMetricStreak.textContent : '0' },
      { icon: '⛪', label: 'Sunday Services', val: el.summaryMetricSunday ? el.summaryMetricSunday.textContent : '0' },
      { icon: '✍️', label: 'Journal Reflections', val: el.summaryMetricNotes ? el.summaryMetricNotes.textContent : '0' },
      { icon: '✨', label: 'Scriptures Highlighted', val: el.summaryMetricHighlights ? el.summaryMetricHighlights.textContent : '0' },
      { icon: '📷', label: 'Devotional Photos', val: el.summaryMetricPhotos ? el.summaryMetricPhotos.textContent : '0' }
    ];

    const gridStartX = 90;
    const gridStartY = 280;
    const boxWidth = 430;
    const boxHeight = 160;
    const gapX = 40;
    const gapY = 30;

    metrics.forEach((m, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = gridStartX + col * (boxWidth + gapX);
      const by = gridStartY + row * (boxHeight + gapY);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      roundRect(ctx, bx, by, boxWidth, boxHeight, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '40px "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(m.icon, bx + 24, by + 56);

      ctx.font = 'bold 42px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(m.val, bx + 24, by + 115);

      ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(m.label, bx + 80, by + 54);
    });

    const blessY = 920;
    ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
    roundRect(ctx, 90, blessY, 900, 230, 16);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'italic 28px "Charter", "Georgia", serif';
    ctx.fillStyle = '#fef3c7';
    ctx.textAlign = 'center';
    const bLines = getLines(ctx, el.summaryBlessingText ? el.summaryBlessingText.textContent : "Well done, faithful servant! Every moment spent in God's presence deepens your faith.", 820);
    bLines.forEach((l, lIdx) => {
      ctx.fillText(l, 540, blessY + 70 + lIdx * 42);
    });

    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(el.summaryBlessingVerse ? el.summaryBlessingVerse.textContent : '— Psalm 1:2', 540, blessY + 185);

    ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('DAILY DEVOTIONS | BIBLE COMPANION APP • 100% PRIVATE OFFLINE', 540, 1260);

    const link = document.createElement('a');
    link.download = `spiritual-walk-summary-${monthStr}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast(`Saved infographic: spiritual-walk-summary-${monthStr}.png 🖼️`);
  }

  function shareMonthlySummaryNative() {
    saveMonthlySummaryImage();
  }

  // --- Utility Helpers ---
  function getDayDateStr(dayNum) {
    return `2026-11-${String(dayNum).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose for testing & deep-linking
  window.switchView = switchView;
  window.openSundayModal = openSundayModal;
  window.closeSundayModal = closeSundayModal;
  window.openCardGenerator = openCardGenerator;
  window.closeCardGenerator = closeCardGenerator;
  window.drawScriptureCard = drawScriptureCard;
  window.downloadCardImage = downloadCardImage;
  window.openMonthlySummary = openMonthlySummary;
  window.closeMonthlySummary = closeMonthlySummary;
  window.renderMonthlySummary = renderMonthlySummary;
  window.saveMonthlySummaryImage = saveMonthlySummaryImage;
  window.renderDevotion = renderDevotion;
  window.renderJournal = renderJournal;
  window.renderJournalHighlights = renderJournalHighlights;
  window.openVerseActionBar = openVerseActionBar;
  window.closeVerseActionBar = closeVerseActionBar;
  window.handleVerseColorClick = handleVerseColorClick;
  window.renderCalendar = renderCalendar;
  window.renderHome = renderHome;
  window.setTheme = setTheme;
  window.getDayDateStr = getDayDateStr;
  window.appState = state;

})();
