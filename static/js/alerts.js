let allAlerts = [];

fetch('/api/alerts/history')
    .then(r => r.json())
    .then(data => {
        allAlerts = data;
        renderAlerts(allAlerts);
    });

function filterAlerts() {
    const dateInput = document.getElementById('alert-date-filter').value;
    if (!dateInput) {
        renderAlerts(allAlerts);
        return;
    }
    const filtered = allAlerts.filter(e => e.timestamp.startsWith(dateInput));
    renderAlerts(filtered);
}

function renderAlerts(data) {
    const tbody = document.getElementById('alert-table-body');
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:10px; text-align:center; color:#8b949e;">No alerts found.</td></tr>';
        return;
    }
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        let color = 'inherit';
        if (row.level.includes('High')) color = 'var(--danger)';
        if (row.level.includes('State')) color = 'var(--accent)';

        let ts = row.timestamp;
        if (!ts.endsWith('Z')) ts += 'Z';

        tr.innerHTML = `
                <td style="padding:10px; color:#8b949e;">${new Date(ts).toLocaleString()}</td>
                <td style="padding:10px; color:${color}; font-weight:600;">${row.level}</td>
                <td style="padding:10px;">${row.container}</td>
                <td style="padding:10px;">${row.message}</td>
            `;
        tbody.appendChild(tr);
    });
}
