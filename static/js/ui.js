// --- UI View & Rendering Module ---
import { state, elements } from './state.js';
import { fetchScans, deleteScanRecord } from './api.js';

export function showView(viewElement) {
    elements.viewConnecting.classList.remove('active');
    elements.viewReady.classList.remove('active');
    if (elements.viewPositioning) elements.viewPositioning.classList.remove('active');
    elements.viewScanning.classList.remove('active');
    
    elements.viewConnecting.style.display = 'none';
    elements.viewReady.style.display = 'none';
    if (elements.viewPositioning) elements.viewPositioning.style.display = 'none';
    elements.viewScanning.style.display = 'none';

    viewElement.style.display = 'flex';
    viewElement.classList.add('active');
}

export function updateStatusIndicator(stateName) {
    const indicator = document.getElementById('connection-indicator');
    const statusText = document.getElementById('connection-status-text');
    if (!indicator || !statusText) return;
    
    if (stateName === 'connecting') {
        indicator.className = "w-2 h-2 rounded-full bg-error animate-pulse";
        statusText.textContent = "Scanner Connecting";
    } else if (stateName === 'ready') {
        indicator.className = "w-2 h-2 rounded-full bg-tertiary-fixed-dim animate-pulse";
        statusText.textContent = "Scanner Ready";
    } else if (stateName === 'positioning') {
        indicator.className = "w-2 h-2 rounded-full bg-secondary animate-pulse";
        statusText.textContent = "Positioning Probe";
    } else if (stateName === 'scanning') {
        indicator.className = "w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse";
        statusText.textContent = "Live Diagnostic";
    }
}

export function resetReadyView() {
    elements.sheepIdInput.value = '';
    elements.startScanBtn.disabled = false;
    elements.startScanBtn.textContent = "Start Scan";
    elements.stopScanBtn.disabled = false;
    elements.stopScanBtn.textContent = "Stop Scan & Save";
    
    showView(elements.viewReady);
    updateStatusIndicator('ready');
    elements.sheepIdInput.focus();
}

export function updateStatistics(records) {
    const { statsTotalScans, statsPregnant, statsNonPregnant, statsRate, statsPregnancyRate, statsPregnancyBar, statsAvgScanTime } = elements;
    if (!statsTotalScans || !statsPregnant || !statsNonPregnant || !statsRate) return;

    const total = records.length;
    let pregnantCount = 0;
    let nonPregnantCount = 0;
    let totalDuration = 0;
    let validDurationCount = 0;

    records.forEach(r => {
        const diagnosis = r.final_diagnosis || (r.detections ? (Array.isArray(r.detections) ? r.detections[0] : r.detections) : null);
        if (diagnosis) {
            if (diagnosis.toLowerCase().includes('pregnant') && !diagnosis.toLowerCase().includes('non')) {
                pregnantCount++;
            } else if (diagnosis.toLowerCase().includes('non-pregnant')) {
                nonPregnantCount++;
            }
        }
        if (r.duration && r.duration > 0) {
            totalDuration += r.duration;
            validDurationCount++;
        }
    });

    statsTotalScans.innerHTML = `${total}<span class="text-headline-sm"> scans</span>`;
    statsPregnant.textContent = pregnantCount;
    statsNonPregnant.textContent = nonPregnantCount;
    
    const rate = total > 0 ? ((pregnantCount / total) * 100).toFixed(1) : "0.0";
    statsRate.textContent = `${rate}%`;

    if (statsPregnancyRate) {
        statsPregnancyRate.innerHTML = `${rate}<span class="text-headline-sm">%</span>`;
    }
    if (statsPregnancyBar) {
        statsPregnancyBar.style.width = `${rate}%`;
    }
    if (statsAvgScanTime) {
        const avgTime = validDurationCount > 0 ? (totalDuration / validDurationCount).toFixed(1) : "0.0";
        statsAvgScanTime.innerHTML = `${avgTime}<span class="text-headline-sm">s</span>`;
    }
}

export function renderRecordsTable(records) {
    const { recordsTableBody } = elements;
    if (!recordsTableBody) return;
    
    if (records.length === 0) {
        recordsTableBody.innerHTML = '<tr><td colspan="5" class="no-data text-center p-md text-on-surface-variant">No records found</td></tr>';
        return;
    }
    
    recordsTableBody.innerHTML = '';
    records.forEach(r => {
        const row = document.createElement('tr');
        row.className = "hover:bg-surface-container-low transition-colors";
        
        // ID
        const idCell = document.createElement('td');
        idCell.className = 'p-md font-mono text-on-surface-variant';
        idCell.textContent = `#${r.id}`;
        row.appendChild(idCell);
        
        // Sheep RFID
        const rfidCell = document.createElement('td');
        rfidCell.className = 'p-md font-bold';
        rfidCell.textContent = r.sheep_id;
        row.appendChild(rfidCell);
        
        // Scan Date (format creation date)
        const dateCell = document.createElement('td');
        dateCell.className = 'p-md text-on-surface-variant';
        const date = new Date(r.created_at + 'Z');
        dateCell.textContent = date.toLocaleString();
        row.appendChild(dateCell);
        
        // Gestational Diagnosis
        const detectionsCell = document.createElement('td');
        detectionsCell.className = 'p-md flex flex-col gap-1';
        
        const badgesContainer = document.createElement('div');
        badgesContainer.className = 'flex gap-1 flex-wrap items-center';

        const det = r.final_diagnosis || (r.detections ? (Array.isArray(r.detections) ? r.detections[0] : r.detections) : null);
        const aiDet = r.detected_stage;
        
        if (det) {
            const badge = document.createElement('span');
            if (det.toLowerCase().includes('pregnant') && !det.toLowerCase().includes('non')) {
                badge.className = 'px-2 py-0.5 bg-tertiary-fixed-dim/20 border border-on-tertiary-container/30 rounded text-[11px] font-semibold text-on-tertiary-container';
            } else {
                badge.className = 'px-2 py-0.5 bg-error/10 border border-error/30 rounded text-[11px] font-semibold text-error';
            }
            badge.textContent = det;
            badgesContainer.appendChild(badge);

            if (aiDet && aiDet !== det) {
                const aiBadge = document.createElement('span');
                aiBadge.className = 'px-2 py-0.5 bg-surface-variant border border-outline rounded text-[11px] font-semibold text-on-surface-variant';
                aiBadge.textContent = `AI: ${aiDet}`;
                badgesContainer.appendChild(aiBadge);
            }
        } else {
            badgesContainer.innerHTML = '<span class="px-2 py-0.5 bg-surface-variant border border-outline rounded text-[11px] text-on-surface-variant">Unclassified</span>';
        }
        detectionsCell.appendChild(badgesContainer);

        if (r.features_detected && r.features_detected.length > 0) {
            const featuresContainer = document.createElement('div');
            featuresContainer.className = 'flex gap-1 flex-wrap mt-1';
            r.features_detected.forEach(feat => {
                const featTag = document.createElement('span');
                featTag.className = 'px-1.5 py-0.5 bg-surface-container border border-outline-variant/60 rounded text-[10px] text-on-surface-variant capitalize';
                featTag.textContent = feat.replace('_', ' ');
                featuresContainer.appendChild(featTag);
            });
            detectionsCell.appendChild(featuresContainer);
        }
        row.appendChild(detectionsCell);
        
        // Action (Delete Button)
        const actionCell = document.createElement('td');
        actionCell.className = 'p-md';
        const delBtn = document.createElement('button');
        delBtn.className = 'bg-error/10 text-error hover:bg-error hover:text-white px-3 py-1 text-xs font-bold rounded transition-colors';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => handleDeleteScan(r.id));
        actionCell.appendChild(delBtn);
        row.appendChild(actionCell);
        
        recordsTableBody.appendChild(row);
    });
}

export function updateDetectionsTable(detections) {
    if (!detections || detections.length === 0) {
        elements.detectionsBody.innerHTML = '<tr><td colspan="3" class="no-data text-center p-md text-on-surface-variant">No active detections</td></tr>';
        return;
    }

    elements.detectionsBody.innerHTML = '';
    detections.forEach(det => {
        const row = document.createElement('tr');
        
        const nameCell = document.createElement('td');
        nameCell.className = 'p-sm font-semibold';
        nameCell.textContent = det.class_name;
        
        const confCell = document.createElement('td');
        confCell.className = 'p-sm text-on-tertiary-container font-bold';
        confCell.textContent = `${(det.confidence * 100).toFixed(1)}%`;
        
        const bboxCell = document.createElement('td');
        const box = det.bbox.map(val => Math.round(val));
        bboxCell.className = 'p-sm font-mono text-[10px] text-on-surface-variant';
        bboxCell.textContent = `[${box.join(', ')}]`;
        
        row.appendChild(nameCell);
        row.appendChild(confCell);
        row.appendChild(bboxCell);
        elements.detectionsBody.appendChild(row);
    });
}

export async function handleDeleteScan(scanId) {
    if (!confirm("Are you sure you want to delete this scan record?")) {
        return;
    }
    try {
        await deleteScanRecord(scanId);
        state.allRecords = state.allRecords.filter(r => r.id !== scanId);
        applyFilters(false);
    } catch (err) {
        console.error("Error deleting record:", err);
        alert("Error deleting record: " + err.message);
    }
}

export async function loadScanHistory(startDate = null, endDate = null) {
    try {
        const data = await fetchScans(startDate, endDate);
        state.allRecords = Array.isArray(data) ? data : (data.records || []);
        
        const query = elements.recordsSearchInput ? elements.recordsSearchInput.value.toLowerCase().trim() : "";
        let filtered = state.allRecords;
        if (query) {
            filtered = filtered.filter(r => r.sheep_id.toLowerCase().includes(query));
        }
        renderRecordsTable(filtered);
        updateStatistics(state.allRecords);

        // Dynamically populate "Latest Diagnostic Log" with the most recent scan on load
        if (state.allRecords.length > 0 && elements.previousResultsCard) {
            const lastScan = state.allRecords[0];
            if (elements.prevSheepIdSpan) elements.prevSheepIdSpan.textContent = lastScan.sheep_id;
            
            const timeEl = document.getElementById('prev-process-time');
            if (timeEl) timeEl.textContent = `${lastScan.duration ? lastScan.duration.toFixed(1) : "0.0"}s`;
            
            const fpsEl = document.getElementById('prev-fps');
            if (fpsEl) fpsEl.textContent = "30.0 FPS";
            
            if (elements.prevGestationalStageSpan) {
                elements.prevGestationalStageSpan.innerHTML = '';
                const stage = lastScan.final_diagnosis || (lastScan.detections ? (Array.isArray(lastScan.detections) ? lastScan.detections[0] : lastScan.detections) : null);
                const aiStage = lastScan.detected_stage;
                if (stage) {
                    const badge = document.createElement('span');
                    if (stage.toLowerCase().includes('pregnant') && !stage.toLowerCase().includes('non')) {
                        badge.className = 'px-2 py-0.5 bg-tertiary-fixed-dim/20 border border-on-tertiary-container/30 rounded text-[11px] font-semibold text-on-tertiary-container';
                    } else {
                        badge.className = 'px-2 py-0.5 bg-error/10 border border-error/30 rounded text-[11px] font-semibold text-error';
                    }
                    badge.textContent = stage;
                    elements.prevGestationalStageSpan.appendChild(badge);

                    if (aiStage && aiStage !== stage) {
                        const aiBadge = document.createElement('span');
                        aiBadge.className = 'px-2 py-0.5 bg-surface-variant border border-outline rounded text-[11px] font-semibold text-on-surface-variant ml-1';
                        aiBadge.textContent = `AI: ${aiStage}`;
                        elements.prevGestationalStageSpan.appendChild(aiBadge);
                    }

                    if (lastScan.features_detected && lastScan.features_detected.length > 0) {
                        lastScan.features_detected.forEach(feat => {
                            const featTag = document.createElement('span');
                            featTag.className = 'px-1.5 py-0.5 bg-surface-container border border-outline-variant/60 rounded text-[10px] text-on-surface-variant capitalize ml-1';
                            featTag.textContent = feat.replace('_', ' ');
                            elements.prevGestationalStageSpan.appendChild(featTag);
                        });
                    }
                } else {
                    elements.prevGestationalStageSpan.innerHTML = '<span class="px-2 py-0.5 bg-surface-variant border border-outline rounded text-[11px] text-on-surface-variant">Unclassified</span>';
                }
            }
            elements.previousResultsCard.style.display = 'block';
        }
    } catch (err) {
        console.error("Failed to fetch scan history:", err);
        if (elements.recordsTableBody) {
            elements.recordsTableBody.innerHTML = '<tr><td colspan="5" class="no-data text-center p-md text-on-surface-variant">Failed to load scan records</td></tr>';
        }
    }
}

export function formatLocalYYYYMMDD(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

export async function applyFilters(forceFetch = false) {
    const dateFilterEl = document.getElementById('records-date-filter');
    const dateStartEl = document.getElementById('records-date-start');
    const dateEndEl = document.getElementById('records-date-end');
    const customDateContainer = document.getElementById('records-custom-date-container');

    const dateFilterVal = dateFilterEl ? dateFilterEl.value : "all";
    const dateStartVal = dateStartEl ? dateStartEl.value : "";
    const dateEndVal = dateEndEl ? dateEndEl.value : "";

    if (customDateContainer) {
        customDateContainer.style.display = dateFilterVal === 'custom' ? 'flex' : 'none';
    }

    let startDate = null;
    let endDate = null;

    if (dateFilterVal !== 'all') {
        const now = new Date();
        if (dateFilterVal === 'today') {
            const str = formatLocalYYYYMMDD(now);
            startDate = str;
            endDate = str;
        } else if (dateFilterVal === 'yesterday') {
            const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const str = formatLocalYYYYMMDD(yesterday);
            startDate = str;
            endDate = str;
        } else if (dateFilterVal === 'this-week') {
            const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
            startDate = formatLocalYYYYMMDD(startOfWeek);
            endDate = formatLocalYYYYMMDD(now);
        } else if (dateFilterVal === 'this-month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate = formatLocalYYYYMMDD(startOfMonth);
            endDate = formatLocalYYYYMMDD(now);
        } else if (dateFilterVal === 'custom') {
            startDate = dateStartVal || null;
            endDate = dateEndVal || null;
        }
    }

    if (startDate !== state.lastStartDate || endDate !== state.lastEndDate || forceFetch) {
        state.lastStartDate = startDate;
        state.lastEndDate = endDate;
        await loadScanHistory(startDate, endDate);
    } else {
        const query = elements.recordsSearchInput ? elements.recordsSearchInput.value.toLowerCase().trim() : "";
        let filtered = state.allRecords;
        if (query) {
            filtered = filtered.filter(r => r.sheep_id.toLowerCase().includes(query));
        }
        renderRecordsTable(filtered);
    }
}
