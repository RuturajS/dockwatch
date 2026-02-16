let allAlerts = [];

// Load alert history
fetch('/api/alerts/history')
    .then(r => r.json())
    .then(data => {
        allAlerts = data;
        renderAlerts(allAlerts);
    })
    .catch(err => {
        console.error('Failed to load alerts:', err);
        document.getElementById('alert-table-body').innerHTML =
            '<tr><td colspan="4" style="padding:20px; text-align:center; color:var(--danger);">Failed to load alerts</td></tr>';
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

function testNotification() {
    showToast('Sending test notification...', 'info');

    fetch('/api/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                showToast('✅ Test notification sent! Check your configured channels.', 'success');
                // Reload alert history to show the test
                setTimeout(() => {
                    fetch('/api/alerts/history')
                        .then(r => r.json())
                        .then(data => {
                            allAlerts = data;
                            renderAlerts(allAlerts);
                        });
                }, 1000);
            } else {
                showToast('Failed to send test: ' + data.message, 'error');
            }
        })
        .catch(err => {
            showToast('Error sending test: ' + err.message, 'error');
        });
}

function renderAlerts(data) {
    const tbody = document.getElementById('alert-table-body');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:#8b949e;">No alerts found.</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        tr.style.transition = 'background 0.1s';
        tr.onmouseenter = () => tr.style.background = 'var(--hover-bg)';
        tr.onmouseleave = () => tr.style.background = 'transparent';

        let color = 'inherit';
        let icon = '📋';

        if (row.level.includes('High')) {
            color = 'var(--danger)';
            icon = '🚨';
        } else if (row.level.includes('State')) {
            color = 'var(--accent)';
            icon = '🔄';
        } else if (row.level.includes('Info')) {
            color = '#58a6ff';
            icon = 'ℹ️';
        }

        let ts = row.timestamp;
        if (!ts.endsWith('Z')) ts += 'Z';

        tr.innerHTML = `
            <td style="padding:12px; color:#8b949e; font-size:0.85rem; font-family:monospace;">
                ${new Date(ts).toLocaleString()}
            </td>
            <td style="padding:12px; color:${color}; font-weight:600;">
                ${icon} ${row.level}
            </td>
            <td style="padding:12px; font-family:monospace; font-size:0.85rem;">
                ${row.container}
            </td>
            <td style="padding:12px;">
                ${row.message}
            </td>
        `;
        tbody.appendChild(tr);
    });
}
