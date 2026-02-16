let systemData = {};
let allEvents = [];

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

fetch('/api/system/info')
    .then(r => r.json())
    .then(data => {
        systemData = data;

        // Render Version
        document.getElementById('version-json').textContent = JSON.stringify(data.version, null, 2);
        renderVersionTable(data.version);

        // Render DF
        document.getElementById('df-json').textContent = JSON.stringify(data.df, null, 2);
        renderDFTable(data.df);
    });

// Fetch Events (Alerts History)
fetch('/api/alerts/history')
    .then(r => r.json())
    .then(data => {
        allEvents = data;
        filterEvents();
    });

function renderVersionTable(v) {
    let html = '<table style="width:100%; border-collapse:collapse; font-size:0.9rem;">';
    const keys = ['Version', 'ApiVersion', 'MinAPIVersion', 'GitCommit', 'GoVersion', 'Os', 'Arch', 'KernelVersion'];
    keys.forEach(k => {
        if (v[k]) {
            html += `<tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:6px; color:#8b949e; width:150px;">${k}</td>
                    <td style="padding:6px;">${v[k]}</td>
                 </tr>`;
        }
    });
    if (v.Platform) {
        html += `<tr style="border-bottom:1px solid var(--border);"><td style="padding:6px; color:#8b949e;">Platform</td><td style="padding:6px;">${v.Platform.Name || ''}</td></tr>`;
    }
    html += '</table>';
    document.getElementById('version-table-container').innerHTML = html;
}

function renderDFTable(df) {
    let iSize = 0, cSize = 0, vSize = 0;
    if (df.Images) df.Images.forEach(i => iSize += (i.Size || 0));
    if (df.Containers) df.Containers.forEach(c => cSize += (c.SizeRw || 0));
    if (df.Volumes) df.Volumes.forEach(v => vSize += (v.UsageData ? v.UsageData.Size : 0));

    let html = '<table style="width:100%; border-collapse:collapse; font-size:0.9rem;"><thead><tr style="border-bottom:1px solid var(--border); color:#8b949e;"><th style="text-align:left; padding:6px;">Type</th><th style="text-align:left; padding:6px;">Count</th><th style="text-align:left; padding:6px;">Total Size</th></tr></thead><tbody>';
    html += `<tr><td style="padding:6px;">Images</td><td style="padding:6px;">${(df.Images || []).length}</td><td style="padding:6px;">${formatBytes(iSize)}</td></tr>`;
    html += `<tr><td style="padding:6px;">Containers</td><td style="padding:6px;">${(df.Containers || []).length}</td><td style="padding:6px;">${formatBytes(cSize)} (RW)</td></tr>`;
    html += `<tr><td style="padding:6px;">Volumes</td><td style="padding:6px;">${(df.Volumes || []).length}</td><td style="padding:6px;">${formatBytes(vSize)}</td></tr>`;
    html += '</tbody></table>';
    document.getElementById('df-table-container').innerHTML = html;
}

function toggleFormat(id) {
    document.getElementById(id + '-table-container').classList.toggle('hidden');
    document.getElementById(id + '-json').classList.toggle('hidden');
}

function filterEvents() {
    const dateInput = document.getElementById('event-date-filter').value;
    const tbody = document.getElementById('events-body');
    tbody.innerHTML = '';

    let filtered = allEvents;
    if (dateInput) {
        filtered = allEvents.filter(e => e.timestamp.startsWith(dateInput));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="padding:10px; text-align:center; color:#8b949e;">No system activity/events found for this date.</td></tr>';
        return;
    }

    filtered.slice(0, 50).forEach(e => {
        let ts = e.timestamp;
        if (!ts.endsWith('Z')) ts += 'Z';
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        tr.innerHTML = `
                <td style="padding:8px; color:#8b949e;">${new Date(ts).toLocaleString()}</td>
                <td style="padding:8px;">${e.level}</td>
                <td style="padding:8px;">${e.message}</td>
            `;
        tbody.appendChild(tr);
    });
}

function pruneSystem() {
    // Keeping confirm for safety, but removing alert for result
    if (!confirm('This will remove all stopped containers, unused networks, and dangling images. Are you sure?')) return;
    fetch('/api/system/prune', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
            let msg = "Prune complete.";
            if (d.ContainersDeleted) msg += ` Containers: ${d.ContainersDeleted.length}`;
            if (d.ImagesDeleted) msg += ` Images: ${d.ImagesDeleted.length}`;
            showToast(msg, 'success');
            setTimeout(() => location.reload(), 2000);
        })
        .catch(e => showToast("Error: " + e, 'error'));
}
