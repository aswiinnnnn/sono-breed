// --- Main Orchestrator Module ---
import { state, elements, initializeElements } from './state.js';
import { fetchSystemInfo, connectProbe, createScanRecord } from './api.js';
import { showView, updateStatusIndicator, applyFilters, resetReadyView } from './ui.js';
import { startWebSocketStream, handleStopScan, submitDiagnosis } from './stream.js';
import { setupCustomDatePickers } from './datepicker.js';

async function loadTemplate(containerId, filepath) {
    const response = await fetch(filepath);
    if (!response.ok) {
        throw new Error(`Failed to load template ${filepath}: ${response.statusText}`);
    }
    const html = await response.text();
    document.getElementById(containerId).innerHTML = html;
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load dynamic templates
    try {
        await Promise.all([
            loadTemplate('sidebar-container', 'components/sidebar.html'),
            loadTemplate('tab-dashboard', 'components/tab-dashboard.html'),
            loadTemplate('tab-records', 'components/tab-records.html'),
            loadTemplate('tab-settings', 'components/tab-settings.html'),
            loadTemplate('diagnosis-modal', 'components/diagnosis-modal.html')
        ]);
        initializeElements();
    } catch (err) {
        console.error("Failed to load components:", err);
        return;
    }

    // 2. Initial loads
    try {
        await applyFilters(true);
        const sysInfo = await fetchSystemInfo();
        updateSystemInfoUI(sysInfo);
    } catch (err) {
        console.error("Initial load failed:", err);
    }

    // 2. Setup Connect button trigger
    updateStatusIndicator('connecting');
    const connectProbeBtn = document.getElementById('connect-probe-btn');
    const connectionPrompt = document.getElementById('connection-prompt');
    const connectionLoading = document.getElementById('connection-loading');
    
    if (connectProbeBtn) {
        connectProbeBtn.addEventListener('click', async () => {
            if (connectionPrompt) connectionPrompt.style.display = 'none';
            if (connectionLoading) connectionLoading.style.display = 'block';
            
            try {
                const data = await connectProbe();
                if (data.probe_connected) {
                    showView(elements.viewReady);
                    elements.sheepIdInput.focus();
                    updateStatusIndicator('ready');
                } else {
                    alert("Failed to connect probe.");
                    if (connectionPrompt) connectionPrompt.style.display = 'block';
                    if (connectionLoading) connectionLoading.style.display = 'none';
                }
            } catch (err) {
                console.error("Probe connection failed:", err);
                alert("Probe connection failed: " + err.message);
                if (connectionPrompt) connectionPrompt.style.display = 'block';
                if (connectionLoading) connectionLoading.style.display = 'none';
            }
        });
    }

    // 3. Setup Scan Actions Event Listeners
    elements.startScanBtn.addEventListener('click', handleStartScan);
    
    elements.sheepIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleStartScan();
        }
    });

    elements.stopScanBtn.addEventListener('click', handleStopScan);

    // 4. Tab Navigation Events
    elements.navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = btn.getAttribute('data-tab');
            
            elements.navButtons.forEach(b => {
                b.className = "nav-btn w-full flex items-center gap-md px-md py-sm font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors duration-100 active:scale-95";
            });
            btn.className = "nav-btn w-full flex items-center gap-md px-md py-sm font-label-md text-label-md text-secondary font-bold bg-surface-container-high border-r-2 border-secondary transition-colors duration-100 active:scale-95";
            
            elements.tabContents.forEach(tab => {
                if (tab.id === targetTab) {
                    tab.style.display = targetTab === 'tab-dashboard' || targetTab === 'tab-records' ? 'flex' : 'block';
                    tab.classList.add('active');
                } else {
                    tab.style.display = 'none';
                    tab.classList.remove('active');
                }
            });
            
            if (targetTab === 'tab-records') {
                applyFilters(true);
            }
        });
    });

    // 5. Settings Configuration Listeners
    if (elements.settingsConfidenceThreshold) {
        elements.settingsConfidenceThreshold.addEventListener('input', (e) => {
            state.selectedConfidenceThreshold = parseFloat(e.target.value);
            if (elements.thresholdVal) {
                elements.thresholdVal.textContent = state.selectedConfidenceThreshold.toFixed(2);
            }
        });
    }

    if (elements.settingsFpsCap) {
        elements.settingsFpsCap.addEventListener('change', (e) => {
            state.selectedFpsCap = parseInt(e.target.value);
        });
    }

    // 6. Diagnosis Modal Events
    if (elements.cancelDiagnosisBtn) {
        elements.cancelDiagnosisBtn.addEventListener('click', () => {
            elements.diagnosisModal.style.display = 'none';
            resetReadyView();
        });
    }

    if (elements.saveDiagnosisBtn) {
        elements.saveDiagnosisBtn.addEventListener('click', submitDiagnosis);
    }

    // 7. Custom Dropdown & Date Filter Setup
    const nativeSelect = document.getElementById('records-date-filter');
    if (nativeSelect) {
        nativeSelect.addEventListener('change', () => {
            applyFilters(true);
        });
    }

    // 8. Search Input & Date Inputs Listeners
    if (elements.recordsSearchInput) {
        elements.recordsSearchInput.addEventListener('input', () => {
            applyFilters(false); // Live filtering without refetching from DB
        });
    }

    const startInput = document.getElementById('records-date-start');
    const endInput = document.getElementById('records-date-end');
    if (startInput) {
        startInput.addEventListener('change', () => {
            applyFilters(true); // Fetch filtered database records
        });
    }
    if (endInput) {
        endInput.addEventListener('change', () => {
            applyFilters(true);
        });
    }

    setupCustomDropdown();
    setupCustomDatePickers();
});

function setupCustomDropdown() {
    const trigger = document.getElementById('custom-dropdown-trigger');
    const menu = document.getElementById('custom-dropdown-menu');
    const nativeSelect = document.getElementById('records-date-filter');
    const selectedText = document.getElementById('custom-dropdown-selected-text');
    const items = document.querySelectorAll('.dropdown-item');

    if (!trigger || !menu || !nativeSelect) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
            menu.classList.remove('hidden');
            trigger.classList.add('border-primary');
        } else {
            menu.classList.add('hidden');
            trigger.classList.remove('border-primary');
        }
    });

    document.addEventListener('click', () => {
        menu.classList.add('hidden');
        trigger.classList.remove('border-primary');
    });

    items.forEach(item => {
        item.addEventListener('click', () => {
            const val = item.getAttribute('data-value');
            const text = item.textContent;

            selectedText.textContent = text;
            nativeSelect.value = val;
            nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));

            menu.classList.add('hidden');
            trigger.classList.remove('border-primary');
        });
    });
}

async function handleStartScan() {
    const rfid = elements.sheepIdInput.value.trim();
    if (!rfid) {
        alert("Please enter or scan a Sheep ID first.");
        elements.sheepIdInput.focus();
        return;
    }

    state.currentSheepId = rfid;
    elements.startScanBtn.disabled = true;
    elements.startScanBtn.textContent = "Initializing...";

    try {
        const data = await createScanRecord(state.currentSheepId);
        state.currentScanId = data.scan_id;

        elements.currentSheepIdSpan.textContent = state.currentSheepId;
        state.uniqueDetections.clear();
        state.serverDetectedStage = null;
        state.serverConfirmedFeatures = [];
        elements.detectionsBody.innerHTML = '<tr><td colspan="3" class="no-data">No active detections</td></tr>';
        elements.wsFpsVal.textContent = "0.0";
        elements.detectionsCountVal.textContent = "0";
        elements.inferenceTimeVal.innerHTML = `0.0 <span class="unit">ms</span>`;
        elements.frameCounterVal.textContent = "0";
        elements.timeElapsedVal.textContent = "0.00s";
        elements.modelFpsVal.textContent = "0.0";

        // Show positioning transition screen first
        showView(elements.viewPositioning);
        updateStatusIndicator('positioning');
        
        if (elements.positioningProgressBar) {
            elements.positioningProgressBar.style.width = '0%';
        }
        if (elements.positioningStatusText) {
            elements.positioningStatusText.textContent = "Initializing model & video...";
        }

        // Animate the progress bar over 5 seconds (5000ms)
        const startTime = Date.now();
        const duration = 5000;
        const progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const percentage = Math.min((elapsed / duration) * 100, 100);
            
            if (elements.positioningProgressBar) {
                elements.positioningProgressBar.style.width = `${percentage}%`;
            }
            if (elements.positioningStatusText) {
                if (percentage < 40) {
                    elements.positioningStatusText.textContent = "Initializing model & video...";
                } else if (percentage < 80) {
                    elements.positioningStatusText.textContent = "Loading neural network weights...";
                } else {
                    elements.positioningStatusText.textContent = "Establishing live scanner link...";
                }
            }

            if (elapsed >= duration) {
                clearInterval(progressInterval);
                // Switch to live scan screen once loading is complete
                if (elements.viewPositioning.classList.contains('active')) {
                    showView(elements.viewScanning);
                    updateStatusIndicator('scanning');
                    // Start loading of model and video feed (Websocket connection)
                    startWebSocketStream();
                }
            }
        }, 50);

    } catch (err) {
        console.error(err);
        alert("Error starting scan: " + err.message);
        elements.startScanBtn.disabled = false;
        elements.startScanBtn.textContent = "Start Scan";
    }
}

function updateSystemInfoUI(data) {
    const hostCpu = document.getElementById('host-cpu');
    const hostRam = document.getElementById('host-ram');
    const hostGpu = document.getElementById('host-gpu');

    if (hostCpu) {
        hostCpu.textContent = `${data.cores} Cores`;
        hostCpu.title = data.cpu;
    }
    if (hostRam) hostRam.textContent = data.ram;
    if (hostGpu) {
        hostGpu.textContent = data.gpu;
        hostGpu.title = data.gpu;
    }

    const settingsGpuName = document.getElementById('settings-gpu-name');
    const settingsRamLoad = document.getElementById('settings-ram-load');
    const settingsRamBar = document.getElementById('settings-ram-bar');

    if (settingsGpuName) {
        settingsGpuName.textContent = data.gpu;
        settingsGpuName.title = data.gpu;
    }
    if (settingsRamLoad) {
        settingsRamLoad.textContent = `${data.ram_load}%`;
    }
    if (settingsRamBar) {
        settingsRamBar.style.width = `${data.ram_load}%`;
    }
}
