// --- State Management Module ---
export const state = {
    ws: null,
    currentScanId: null,
    currentSheepId: null,
    selectedConfidenceThreshold: 0.50,
    selectedFpsCap: 30,
    allRecords: [],
    uniqueDetections: new Set(),
    scanDuration: "0.00",
    scanAvgFps: "0.0",
    serverDetectedStage: null,
    serverConfirmedFeatures: [],
    
    // Canvas & WS animation state
    canvas: null,
    ctx: null,
    pendingFrame: null,
    renderAnimFrameId: null,
    currentImageUrl: null,
    lastFrameTime: performance.now(),
    frameTimes: [],
    scanStartTime: null,
    scanStartPerfTime: null,
    totalFramesProcessed: 0,
    timerInterval: null,
    
    // Date filter cache
    lastStartDate: null,
    lastEndDate: null,

    // Probe warning state
    lastValidDetectionTime: null,
    validDetectionHistory: [],
    warningActive: false,

    // Feature durations tracker (frontend)
    featureDurations: {}
};

export const elements = {};

export function initializeElements() {
    // Views
    elements.viewConnecting = document.getElementById('view-connecting');
    elements.viewReady = document.getElementById('view-ready');
    elements.viewPositioning = document.getElementById('view-positioning');
    elements.viewScanning = document.getElementById('view-scanning');

    // Positioning elements
    elements.positioningProgressBar = document.getElementById('positioning-progress-bar');
    elements.positioningStatusText = document.getElementById('positioning-status-text');

    // Inputs & Buttons
    elements.sheepIdInput = document.getElementById('sheep-id-input');
    elements.startScanBtn = document.getElementById('start-scan-btn');
    elements.stopScanBtn = document.getElementById('stop-scan-btn');

    // Previous Results
    elements.previousResultsCard = document.getElementById('previous-results');
    elements.prevSheepIdSpan = document.getElementById('prev-sheep-id');
    elements.prevGestationalStageSpan = document.getElementById('prev-gestational-stage');

    // Diagnosis Modal Elements
    elements.diagnosisModal = document.getElementById('diagnosis-modal');
    elements.cancelDiagnosisBtn = document.getElementById('cancel-diagnosis-btn');
    elements.saveDiagnosisBtn = document.getElementById('save-diagnosis-btn');

    // Stats Elements
    elements.statsTotalScans = document.getElementById('stats-total-scans');
    elements.statsPregnant = document.getElementById('stats-pregnant');
    elements.statsNonPregnant = document.getElementById('stats-non-pregnant');
    elements.statsRate = document.getElementById('stats-rate');
    elements.statsPregnancyRate = document.getElementById('stats-pregnancy-rate');
    elements.statsPregnancyBar = document.getElementById('stats-pregnancy-bar');
    elements.statsAvgScanTime = document.getElementById('stats-avg-scan-time');

    // Scanning UI
    elements.currentSheepIdSpan = document.getElementById('current-sheep-id');
    elements.placeholderOverlay = document.getElementById('placeholder-overlay');
    elements.inferenceTimeVal = document.getElementById('inference-time');
    elements.wsFpsVal = document.getElementById('ws-fps');
    elements.detectionsCountVal = document.getElementById('detections-count');
    elements.detectionsBody = document.getElementById('detections-body');
    elements.frameCounterVal = document.getElementById('frame-counter');
    elements.timeElapsedVal = document.getElementById('time-elapsed');
    elements.modelFpsVal = document.getElementById('model-fps');
    elements.warningOverlay = document.getElementById('warning-overlay');

    // Navigation & Tabs Elements
    elements.navButtons = document.querySelectorAll('.nav-btn');
    elements.tabContents = document.querySelectorAll('.tab-content');

    // Settings Elements
    elements.settingsConfidenceThreshold = document.getElementById('settings-confidence-threshold');
    elements.thresholdVal = document.getElementById('threshold-val');
    elements.settingsFpsCap = document.getElementById('settings-fps-cap');

    // History Elements
    elements.recordsSearchInput = document.getElementById('records-search-input');
    elements.recordsTableBody = document.getElementById('records-table-body');
}

