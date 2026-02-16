let currentLogSource = null;
let currentStatSource = null;
let autoScroll = true;
let showStats = true;
let cpuChart = null;
let memChart = null;
let netChart = null;
let diskChart = null;

function initCharts() {
    const commonOptions = {
        type: 'line',
        options: {
            responsive: true, animation: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { beginAtZero: true, grid: { color: '#30363d' }, ticks: { color: '#8b949e', font: { size: 10 } } } },
            elements: { point: { radius: 0 }, line: { tension: 0.2, borderWidth: 2 } }
        }
    };
    cpuChart = new Chart(document.getElementById('cpuChart'), { ...commonOptions, data: { labels: [], datasets: [{ data: [], borderColor: '#58a6ff', backgroundColor: '#58a6ff11', fill: true }] } });
    memChart = new Chart(document.getElementById('memChart'), { ...commonOptions, data: { labels: [], datasets: [{ data: [], borderColor: '#238636', backgroundColor: '#23863611', fill: true }] } });
    netChart = new Chart(document.getElementById('netChart'), { ...commonOptions, data: { labels: [], datasets: [{ data: [], borderColor: '#e3b341', borderWidth: 1, label: 'RX' }, { data: [], borderColor: '#da3633', borderWidth: 1, label: 'TX' }] } });
    diskChart = new Chart(document.getElementById('diskChart'), { ...commonOptions, data: { labels: [], datasets: [{ data: [], borderColor: '#db61a2', borderWidth: 1, label: 'Read' }, { data: [], borderColor: '#a371f7', borderWidth: 1, label: 'Write' }] } });
}

function updateCharts(data) {
    const now = new Date().toLocaleTimeString();
    const pushData = (chart, label, values) => {
        chart.data.labels.push(label);
        if (Array.isArray(values)) { values.forEach((v, i) => chart.data.datasets[i].data.push(v)); } else { chart.data.datasets[0].data.push(values); }
        if (chart.data.labels.length > 20) { chart.data.labels.shift(); chart.data.datasets.forEach(d => d.data.shift()); }
        chart.update();
    };
    pushData(cpuChart, now, data.cpu); document.getElementById('cpu-text').innerText = data.cpu + '%';
    pushData(memChart, now, data.memory); document.getElementById('mem-text').innerText = data.memory + ' MB / ' + data.memory_limit + ' MB';
    pushData(netChart, now, [data.net_rx, data.net_tx]); document.getElementById('net-text').innerHTML = `↓${data.net_rx} MB <span style="color:#484f58">|</span> ↑${data.net_tx} MB`;
    pushData(diskChart, now, [data.disk_read, data.disk_write]); document.getElementById('disk-text').innerHTML = `R:${data.disk_read} MB <span style="color:#484f58">|</span> W:${data.disk_write} MB`;
}

function selectContainer(el) {
    const id = el.getAttribute('data-id');
    document.querySelectorAll('.container-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('selected-name').textContent = el.getAttribute('data-name');
    document.getElementById('selected-name').style.visibility = 'visible';
    document.getElementById('selected-id').textContent = id.substring(0, 12);
    document.getElementById('details-row').style.visibility = 'visible';
    document.getElementById('selected-image').textContent = el.getAttribute('data-image');
    document.getElementById('selected-uptime').textContent = el.getAttribute('data-uptime');
    const statusText = el.getAttribute('data-status');
    const statusEl = document.getElementById('selected-status');
    statusEl.textContent = statusText;
    statusEl.style.display = 'inline-block';
    if (statusText.toLowerCase().includes('up')) { statusEl.style.borderColor = 'var(--success)'; statusEl.style.color = 'var(--success)'; } else { statusEl.style.borderColor = 'var(--danger)'; statusEl.style.color = 'var(--danger)'; }

    const logView = document.getElementById('logs-view');
    logView.innerHTML = '<div style="color:#8b949e; padding:10px;">Connecting...</div>';
    if (showStats) {
        document.getElementById('stats-panel').style.display = 'flex';
        if (!cpuChart) initCharts();
        [cpuChart, memChart, netChart, diskChart].forEach(c => { if (c) { c.data.labels = []; c.data.datasets.forEach(d => d.data = []); c.update(); } });
    }
    if (currentLogSource) currentLogSource.close();
    if (currentStatSource) currentStatSource.close();

    currentLogSource = new EventSource(`/api/logs/${id}`);
    currentLogSource.onmessage = function (event) {
        if (logView.innerHTML.includes('Connecting...')) logView.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'log-line';
        div.textContent = event.data;
        const query = document.getElementById('log-search').value.toLowerCase();
        if (query && !event.data.toLowerCase().includes(query)) div.classList.add('hidden-by-filter');
        logView.appendChild(div);
        if (logView.childElementCount > 2000) logView.removeChild(logView.firstChild);
        if (autoScroll) logView.scrollTop = logView.scrollHeight;
    };

    if (showStats) fetchVolumeUsage(id);

    currentStatSource = new EventSource(`/api/stats/${id}`);
    currentStatSource.onmessage = function (event) {
        try {
            const data = JSON.parse(event.data);
            if (data.error) { handleStoppedState(); return; }
            document.getElementById('stats-overlay').style.display = 'none';
            updateCharts(data);
        } catch (e) { }
    };

    if (statusText.toLowerCase() !== 'running' && !statusText.toLowerCase().includes('up')) handleStoppedState();
    else document.getElementById('stats-overlay').style.display = 'none';
}

function handleStoppedState() {
    if (currentStatSource) currentStatSource.close();
    document.getElementById('stats-overlay').style.display = 'flex';
}

function fetchVolumeUsage(id) {
    document.getElementById('vol-text').textContent = 'Calculating...';
    document.getElementById('vol-details').innerHTML = '';
    fetch(`/api/volume/${id}`).then(r => r.json()).then(data => {
        if (data.error) { document.getElementById('vol-text').textContent = 'Error'; return; }
        if (data.status === 'stopped') { document.getElementById('vol-text').textContent = 'N/A (Stopped)'; return; }
        document.getElementById('vol-text').textContent = data.total_mb + ' MB';
        let html = '';
        if (data.mounts && data.mounts.length > 0) { data.mounts.forEach(m => { html += `<div>${m.path}: ${m.size_mb || '?'} MB</div>`; }); }
        else { html = 'No binds/volumes found.'; }
        document.getElementById('vol-details').innerHTML = html;
    }).catch(e => { document.getElementById('vol-text').textContent = 'Error'; });
}

function filterStatus(status) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    document.getElementById('filter-' + status).classList.add('active');
    const query = document.getElementById('container-search').value.toLowerCase();
    document.querySelectorAll('.container-item').forEach(item => {
        const name = item.getAttribute('data-name').toLowerCase();
        const state = item.getAttribute('data-state').toLowerCase();
        let statusMatch = true;
        if (status === 'running') statusMatch = state === 'running';
        else if (status === 'exited') statusMatch = state !== 'running';
        const searchMatch = query === '' || name.includes(query) || item.getAttribute('data-image').toLowerCase().includes(query) || item.getAttribute('data-ports').toLowerCase().includes(query);
        if (statusMatch && searchMatch) item.style.display = 'flex'; else item.style.display = 'none';
    });
}

function filterContainers() {
    let status = 'all';
    if (document.getElementById('filter-running').classList.contains('active')) status = 'running';
    if (document.getElementById('filter-exited').classList.contains('active')) status = 'exited';
    filterStatus(status);
}

function toggleStats() {
    showStats = !showStats;
    document.getElementById('stats-btn').textContent = showStats ? 'Stats: ON' : 'Stats: OFF';
    document.getElementById('stats-panel').style.display = showStats ? 'flex' : 'none';
}

function toggleAutoScroll() {
    autoScroll = !autoScroll;
    document.getElementById('scroll-btn').textContent = autoScroll ? 'Scroll: ON' : 'Scroll: OFF';
}

function clearLogs() {
    document.getElementById('logs-view').innerHTML = '';
}

function filterLogs() {
    const query = document.getElementById('log-search').value.toLowerCase();
    document.querySelectorAll('.log-line').forEach(line => {
        if (line.textContent.toLowerCase().includes(query)) line.classList.remove('hidden-by-filter');
        else line.classList.add('hidden-by-filter');
    });
}

function exportLogs(fmt) {
    const id = document.querySelector('.container-item.active').getAttribute('data-id');
    if (!id) return;
    window.location.href = `/api/export/${id}?format=${fmt}`;
}
