// --- API Interaction Module ---

export async function fetchSystemInfo() {
    const res = await fetch('/api/system-info');
    const data = await res.json();
    if (data.error) {
        throw new Error(data.error);
    }
    return data;
}

export async function connectProbe() {
    const res = await fetch('/api/probe/connect', { method: 'POST' });
    if (!res.ok) {
        throw new Error(`Probe connection failed: HTTP ${res.status}`);
    }
    return await res.json();
}

export async function fetchScans(startDate = null, endDate = null) {
    let url = '/api/scans';
    const params = [];
    if (startDate) params.push(`start_date=${startDate}`);
    if (endDate) params.push(`end_date=${endDate}`);
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch scan history: HTTP ${res.status}`);
    }
    return await res.json();
}

export async function createScanRecord(sheepId) {
    const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheep_id: sheepId })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to create scan record in DB");
    }
    return await res.json();
}

export async function updateScanRecord(scanId, payload) {
    const res = await fetch(`/api/scans/${scanId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
    }
    return await res.json();
}

export async function deleteScanRecord(scanId) {
    const res = await fetch(`/api/scans/${scanId}`, { method: 'DELETE' });
    if (!res.ok) {
        throw new Error(`Failed to delete record: HTTP ${res.status}`);
    }
    return await res.json();
}
