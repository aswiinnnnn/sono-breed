// --- WebSocket & Live Stream Module ---
import { state, elements } from './state.js';
import { updateDetectionsTable, resetReadyView, applyFilters } from './ui.js';
import { updateScanRecord } from './api.js';

const FEATURE_THRESHOLDS = {
    "urinary_bladder": 1.5,
    "fetal_fluid": 1.0,
    "placentome": 1.0,
    "body": 1.0,
    "head": 0.5,
    "legs": 0.5,
    "eyeorbit": 0.5,
    "abdomen": 0.5,
    "brain": 0.5,
    "ribs": 0.5,
    "umbilicalcord": 0.5
};

export function predictPregnancyStage(featureDurations) {
    const confirmed = Object.keys(featureDurations || {}).filter(cls => {
        const threshold = FEATURE_THRESHOLDS[cls] || 1.0;
        return featureDurations[cls] >= threshold;
    });
    
    const detections = new Set(confirmed.map(d => d.toLowerCase().trim()));
    const gestationalClasses = ["fetal_fluid", "placentome", "body", "head", "legs", "eyeorbit", "abdomen", "brain", "ribs", "umbilicalcord"];
    
    if (detections.size === 0) return "Inconclusive";
    
    const hasGestational = gestationalClasses.some(cls => detections.has(cls));
    if (detections.has("urinary_bladder") && !hasGestational) return "Non-Pregnant";

    const lateClasses = new Set(["body", "head", "abdomen", "ribs", "brain", "legs", "eyeorbit", "umbilicalcord"]);

    let hasLate = false;
    for (const cls of lateClasses) {
        if (detections.has(cls)) {
            hasLate = true;
            break;
        }
    }

    if (hasLate) return "Pregnant (Late)";
    if (detections.has("placentome")) return "Pregnant (Mid)";
    if (detections.has("fetal_fluid")) return "Pregnant (Early)";
    
    // If some other feature was detected but not in hierarchy, default to inconclusive
    return "Inconclusive";
}

export async function handleStopScan() {
    elements.stopScanBtn.disabled = true;
    elements.stopScanBtn.textContent = "Finalizing...";

    state.scanDuration = state.scanStartPerfTime ? ((performance.now() - state.scanStartPerfTime) / 1000).toFixed(2) : "0.00";
    state.scanAvgFps = (state.scanDuration > 0 && state.totalFramesProcessed > 0) ? (state.totalFramesProcessed / state.scanDuration).toFixed(1) : "0.0";

    if (state.ws) {
        try { state.ws.close(); } catch (e) {}
        state.ws = null;
    }
    stopRenderLoop();
    
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }

    const predictedStage = state.serverDetectedStage || predictPregnancyStage(state.featureDurations);
    console.log("Predicted stage:", predictedStage, "from feature durations:", state.featureDurations);

    if (elements.diagnosisModal) {
        const radios = document.getElementsByName('gestational-stage');
        for (const radio of radios) {
            radio.checked = (radio.value === predictedStage);
        }
        
        let predictionBanner = document.getElementById('ai-prediction-banner');
        if (!predictionBanner) {
            predictionBanner = document.createElement('div');
            predictionBanner.id = 'ai-prediction-banner';
            predictionBanner.className = 'p-md bg-secondary-container text-on-secondary-container rounded-lg text-xs font-semibold mb-md text-left flex justify-between items-center border border-outline-variant';
            const modalTitleParent = elements.diagnosisModal.querySelector('.space-y-xs');
            if (modalTitleParent) {
                modalTitleParent.appendChild(predictionBanner);
            }
        }
        predictionBanner.innerHTML = `<span>AI PREDICTION: <strong>${predictedStage}</strong></span><span class="px-2 py-0.5 bg-primary text-white rounded text-[10px] uppercase font-bold">Auto-Selected</span>`;
        elements.diagnosisModal.style.display = 'flex';
    } else {
        await submitDiagnosisData(predictedStage);
    }
}

export async function submitDiagnosis() {
    elements.saveDiagnosisBtn.disabled = true;
    elements.saveDiagnosisBtn.textContent = "Saving...";

    let selectedStage = "Non-Pregnant";
    const radios = document.getElementsByName('gestational-stage');
    for (const radio of radios) {
        if (radio.checked) {
            selectedStage = radio.value;
            break;
        }
    }

    await submitDiagnosisData(selectedStage);

    elements.saveDiagnosisBtn.disabled = false;
    elements.saveDiagnosisBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span> Save Result';
    if (elements.diagnosisModal) {
        elements.diagnosisModal.style.display = 'none';
    }
}

export async function submitDiagnosisData(stage) {
    try {
        if (state.currentScanId) {
            const detectedStage = state.serverDetectedStage || predictPregnancyStage(state.featureDurations);
            const confirmedFeaturesRaw = state.serverConfirmedFeatures.length > 0 ? state.serverConfirmedFeatures : Object.keys(state.featureDurations).filter(cls => state.featureDurations[cls] >= 1.0);
            const allowedFeatures = ["fetal_fluid", "placentome", "body", "head", "heart", "abdomen", "ribs", "brain", "legs", "eyeorbit"];
            const confirmedFeatures = confirmedFeaturesRaw
                .map(f => f.toLowerCase().trim().replace('-', '_'))
                .filter(f => allowedFeatures.includes(f));

            await updateScanRecord(state.currentScanId, { 
                detected_stage: detectedStage,
                final_diagnosis: stage,
                features_detected: confirmedFeatures,
                duration: parseFloat(state.scanDuration)
            });

            await applyFilters(true);
        }
    } catch (err) {
        console.error("Failed to save scan results:", err);
        alert("Warning: Failed to save scan results to DB: " + err.message);
    }

    if (elements.prevSheepIdSpan) elements.prevSheepIdSpan.textContent = state.currentSheepId;
    const processTimeEl = document.getElementById('prev-process-time');
    if (processTimeEl) processTimeEl.textContent = `${state.scanDuration}s (${state.totalFramesProcessed} frames)`;
    const fpsEl = document.getElementById('prev-fps');
    if (fpsEl) fpsEl.textContent = `${state.scanAvgFps} FPS`;
    
    if (elements.prevGestationalStageSpan) {
        elements.prevGestationalStageSpan.innerHTML = '';
        const badge = document.createElement('span');
        if (stage.toLowerCase().includes('pregnant') && !stage.toLowerCase().includes('non')) {
            badge.className = 'px-2 py-0.5 bg-tertiary-fixed-dim/20 border border-on-tertiary-container/30 rounded text-[11px] font-semibold text-on-tertiary-container';
        } else {
            badge.className = 'px-2 py-0.5 bg-error/10 border border-error/30 rounded text-[11px] font-semibold text-error';
        }
        badge.textContent = stage;
        elements.prevGestationalStageSpan.appendChild(badge);

        const detectedStage = state.serverDetectedStage || predictPregnancyStage(state.featureDurations);
        if (detectedStage && detectedStage !== stage) {
            const aiBadge = document.createElement('span');
            aiBadge.className = 'px-2 py-0.5 bg-surface-variant border border-outline rounded text-[11px] font-semibold text-on-surface-variant ml-1';
            aiBadge.textContent = `AI: ${detectedStage}`;
            elements.prevGestationalStageSpan.appendChild(aiBadge);
        }

        const confirmedFeaturesRaw = state.serverConfirmedFeatures.length > 0 ? state.serverConfirmedFeatures : Object.keys(state.featureDurations).filter(cls => state.featureDurations[cls] >= 1.0);
        const allowedFeatures = ["fetal_fluid", "placentome", "body", "head", "heart", "abdomen", "ribs", "brain", "legs", "eyeorbit"];
        const confirmedFeatures = confirmedFeaturesRaw
            .map(f => f.toLowerCase().trim().replace('-', '_'))
            .filter(f => allowedFeatures.includes(f));

        if (confirmedFeatures.length > 0) {
            confirmedFeatures.forEach(feat => {
                const featTag = document.createElement('span');
                featTag.className = 'px-1.5 py-0.5 bg-surface-container border border-outline-variant/60 rounded text-[10px] text-on-surface-variant capitalize ml-1';
                featTag.textContent = feat.replace('_', ' ');
                elements.prevGestationalStageSpan.appendChild(featTag);
            });
        }
    }
    if (elements.previousResultsCard) elements.previousResultsCard.style.display = 'block';

    resetReadyView();
}

export function startWebSocketStream() {
    elements.placeholderOverlay.style.display = 'none';

    if (!state.canvas) {
        state.canvas = document.getElementById('canvas-feed');
        state.ctx = state.canvas.getContext('2d', { willReadFrequently: false });
    }
    state.canvas.style.display = 'block';
    
    const loc = window.location;
    const wsProto = loc.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${loc.host}/ws/stream`;

    state.ws = new WebSocket(wsUrl);
    state.ws.binaryType = 'arraybuffer';

    state.ws.onopen = () => {
        state.frameTimes = [];
        state.lastFrameTime = performance.now();
        state.scanStartTime = Date.now();
        state.scanStartPerfTime = performance.now();
        state.totalFramesProcessed = 0;
        state.lastValidDetectionTime = performance.now();
        state.validDetectionHistory = [];
        state.warningActive = false;
        state.featureDurations = {};
        if (elements.warningOverlay) {
            elements.warningOverlay.style.display = 'none';
        }
        
        startRenderLoop();
        state.ws.send(JSON.stringify({
            confidence_threshold: state.selectedConfidenceThreshold,
            scan_id: state.currentScanId
        }));
    };

    let lastUiUpdateTime = 0;

    state.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);
            if (data.type === 'metadata') {
                state.latestMetadata = data;
                state.totalFramesProcessed = (data.frame_index || 0) + 1;
                const now = performance.now();
                const delta = now - state.lastFrameTime;
                state.lastFrameTime = now;
                state.frameTimes.push(delta);
                if (state.frameTimes.length > 30) {
                    state.frameTimes.shift();
                }

                let hasValidDetection = false;
                data.detections.forEach(d => {
                    if (!state.uniqueDetections.has(d.class_name)) {
                        state.uniqueDetections.add(d.class_name);
                    }
                    if (d.confidence >= state.selectedConfidenceThreshold) {
                        hasValidDetection = true;
                    }
                    if (d.confidence >= 0.75) {
                        state.featureDurations[d.class_name] = (state.featureDurations[d.class_name] || 0.0) + 0.0333;
                    }
                });

                if (hasValidDetection) {
                    state.lastValidDetectionTime = performance.now();
                    state.validDetectionHistory.push(performance.now());
                }
            } else if (data.type === 'summary') {
                state.serverDetectedStage = data.detected_stage;
                state.serverConfirmedFeatures = data.features_detected;
            }
        } else {
            const blob = new Blob([event.data], { type: 'image/jpeg' });
            createImageBitmap(blob).then(imageBitmap => {
                if (state.pendingFrame) {
                    state.pendingFrame.close();
                }
                state.pendingFrame = imageBitmap;
            }).catch(err => {
                console.error("Failed to create ImageBitmap from blob:", err);
            });
        }
    };

    state.ws.onclose = (event) => {
        if (event.code === 4000) {
            alert("Error: Ultrasound probe is not connected.");
            resetReadyView();
            return;
        }
        if (event.code === 4001) {
            alert("Error: YOLO Model failed to process frames.");
            resetReadyView();
            return;
        }
        if (event.code === 4002) {
            alert("Error: Handshake configuration failed.");
            resetReadyView();
            return;
        }

        if (elements.viewScanning.classList.contains('active') || (elements.viewPositioning && elements.viewPositioning.classList.contains('active'))) {
            handleStopScan();
        }
    };
}

export function startRenderLoop() {
    let lastUiUpdateTime = 0;
    function renderFrame() {
        if (state.pendingFrame && state.ctx && state.canvas) {
            const bitmap = state.pendingFrame;
            state.pendingFrame = null;
            state.canvas.width = bitmap.width;
            state.canvas.height = bitmap.height;
            state.ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
        }

        const now = performance.now();
        if (now - lastUiUpdateTime > 100) { // Throttle UI updates to max 10 FPS
            lastUiUpdateTime = now;
            if (state.latestMetadata) {
                const data = state.latestMetadata;
                state.latestMetadata = null;

                const avgDelta = state.frameTimes.reduce((a, b) => a + b, 0) / (state.frameTimes.length || 1);
                const currentFps = (1000.0 / avgDelta).toFixed(1);
                elements.wsFpsVal.textContent = currentFps;

                elements.inferenceTimeVal.innerHTML = `${data.inference_ms} <span class="unit">ms</span>`;
                elements.frameCounterVal.textContent = state.totalFramesProcessed;
                
                const modelFps = data.inference_ms > 0 ? (1000.0 / data.inference_ms).toFixed(1) : "0.0";
                elements.modelFpsVal.textContent = modelFps;

                elements.detectionsCountVal.textContent = data.detections.length;
                updateDetectionsTable(data.detections);

                const elapsed = ((now - state.scanStartPerfTime) / 1000).toFixed(2);
                elements.timeElapsedVal.textContent = `${elapsed}s`;

                // Clean up valid detection history (keep only last 2 seconds)
                state.validDetectionHistory = state.validDetectionHistory.filter(t => now - t <= 2000);

                // Probe warning logic
                if (!state.warningActive && (now - state.lastValidDetectionTime > 3000)) {
                    state.warningActive = true;
                    if (elements.warningOverlay) {
                        elements.warningOverlay.style.display = 'flex';
                    }
                } else if (state.warningActive && state.validDetectionHistory.length >= 5) {
                    state.warningActive = false;
                    if (elements.warningOverlay) {
                        elements.warningOverlay.style.display = 'none';
                    }
                }
            }
        }

        state.renderAnimFrameId = requestAnimationFrame(renderFrame);
    }
    state.renderAnimFrameId = requestAnimationFrame(renderFrame);
}

export function stopRenderLoop() {
    if (state.renderAnimFrameId) {
        cancelAnimationFrame(state.renderAnimFrameId);
        state.renderAnimFrameId = null;
    }
    if (state.pendingFrame) {
        if (typeof state.pendingFrame.close === 'function') {
            state.pendingFrame.close();
        }
        state.pendingFrame = null;
    }
    state.latestMetadata = null;
    if (state.canvas) state.canvas.style.display = 'none';
    elements.placeholderOverlay.style.display = 'flex';
}
