let allAlerts = [];
let currentConfig = {};

// Load configuration
fetch('/api/alerts/config')
    .then(r => r.json())
    .then(data => {
        currentConfig = data;
        loadConfig(data);
    });

// Load alert history
fetch('/api/alerts/history')
    .then(r => r.json())
    .then(data => {
        allAlerts = data;
        renderAlerts(allAlerts);
    });

function loadConfig(config) {
    document.getElementById('cpu-limit').value = config.cpu_limit || 80;
    document.getElementById('mem-limit').value = config.mem_limit || 90;

    // Slack
    document.getElementById('slack-webhook').value = config.slack_webhook || '';
    document.getElementById('slack-enabled').checked = config.slack_enabled == 1;

    // Discord
    document.getElementById('discord-webhook').value = config.discord_webhook || '';
    document.getElementById('discord-enabled').checked = config.discord_enabled == 1;

    // Telegram
    document.getElementById('telegram-token').value = config.telegram_bot_token || '';
    document.getElementById('telegram-chat').value = config.telegram_chat_id || '';
    document.getElementById('telegram-enabled').checked = config.telegram_enabled == 1;

    // Generic
    document.getElementById('generic-webhook').value = config.generic_webhook || '';
    document.getElementById('generic-enabled').checked = config.generic_enabled == 1;
}

function toggleWebhook(service) {
    const enabled = document.getElementById(`${service}-enabled`).checked;
    const webhookInput = document.getElementById(`${service}-webhook`);

    if (enabled && webhookInput) {
        const url = webhookInput.value.trim();
        if (!url) {
            showToast(`Please enter a ${service} webhook URL first`, 'error');
            document.getElementById(`${service}-enabled`).checked = false;
            return;
        }

        // Validate URL format
        if (!isValidUrl(url)) {
            showToast(`Please enter a valid URL for ${service}`, 'error');
            document.getElementById(`${service}-enabled`).checked = false;
            return;
        }
    }

    // For Telegram, check both token and chat ID
    if (service === 'telegram' && enabled) {
        const token = document.getElementById('telegram-token').value.trim();
        const chat = document.getElementById('telegram-chat').value.trim();

        if (!token || !chat) {
            showToast('Please enter both Telegram Bot Token and Chat ID', 'error');
            document.getElementById('telegram-enabled').checked = false;
            return;
        }
    }
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function saveConfig() {
    const cpuLimit = parseInt(document.getElementById('cpu-limit').value);
    const memLimit = parseInt(document.getElementById('mem-limit').value);

    // Validate limits
    if (cpuLimit < 1 || cpuLimit > 100) {
        showToast('CPU limit must be between 1 and 100', 'error');
        return;
    }

    if (memLimit < 1 || memLimit > 100) {
        showToast('Memory limit must be between 1 and 100', 'error');
        return;
    }

    // Get webhook values
    const slackWebhook = document.getElementById('slack-webhook').value.trim();
    const slackEnabled = document.getElementById('slack-enabled').checked;

    const discordWebhook = document.getElementById('discord-webhook').value.trim();
    const discordEnabled = document.getElementById('discord-enabled').checked;

    const telegramToken = document.getElementById('telegram-token').value.trim();
    const telegramChat = document.getElementById('telegram-chat').value.trim();
    const telegramEnabled = document.getElementById('telegram-enabled').checked;

    const genericWebhook = document.getElementById('generic-webhook').value.trim();
    const genericEnabled = document.getElementById('generic-enabled').checked;

    // Validate enabled webhooks have URLs
    if (slackEnabled && !slackWebhook) {
        showToast('Slack is enabled but webhook URL is missing', 'error');
        return;
    }

    if (discordEnabled && !discordWebhook) {
        showToast('Discord is enabled but webhook URL is missing', 'error');
        return;
    }

    if (telegramEnabled && (!telegramToken || !telegramChat)) {
        showToast('Telegram is enabled but token or chat ID is missing', 'error');
        return;
    }

    if (genericEnabled && !genericWebhook) {
        showToast('Generic webhook is enabled but URL is missing', 'error');
        return;
    }

    // Validate URL formats for enabled webhooks
    if (slackEnabled && !isValidUrl(slackWebhook)) {
        showToast('Invalid Slack webhook URL', 'error');
        return;
    }

    if (discordEnabled && !isValidUrl(discordWebhook)) {
        showToast('Invalid Discord webhook URL', 'error');
        return;
    }

    if (genericEnabled && !isValidUrl(genericWebhook)) {
        showToast('Invalid generic webhook URL', 'error');
        return;
    }

    const config = {
        cpu_limit: cpuLimit,
        mem_limit: memLimit,
        slack_webhook: slackWebhook,
        slack_enabled: slackEnabled ? 1 : 0,
        discord_webhook: discordWebhook,
        discord_enabled: discordEnabled ? 1 : 0,
        telegram_bot_token: telegramToken,
        telegram_chat_id: telegramChat,
        telegram_enabled: telegramEnabled ? 1 : 0,
        generic_webhook: genericWebhook,
        generic_enabled: genericEnabled ? 1 : 0
    };

    fetch('/api/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'updated') {
                showToast('Configuration saved successfully!', 'success');
                currentConfig = config;
            } else {
                showToast('Failed to save configuration', 'error');
            }
        })
        .catch(err => {
            showToast('Error saving configuration: ' + err.message, 'error');
        });
}

function testNotification() {
    // Check if at least one notification method is enabled
    const anyEnabled =
        document.getElementById('slack-enabled').checked ||
        document.getElementById('discord-enabled').checked ||
        document.getElementById('telegram-enabled').checked ||
        document.getElementById('generic-enabled').checked;

    if (!anyEnabled) {
        showToast('Please enable at least one notification method first', 'error');
        return;
    }

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
                showToast('Failed to send test notification: ' + data.message, 'error');
            }
        })
        .catch(err => {
            showToast('Error sending test notification: ' + err.message, 'error');
        });
}

function renderAlerts(data) {
    const tbody = document.getElementById('alert-table-body');
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:10px; text-align:center; color:#8b949e;">No alerts found.</td></tr>';
        return;
    }

    // Show only last 20 alerts in the table
    const recentAlerts = data.slice(0, 20);

    recentAlerts.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        let color = 'inherit';
        if (row.level.includes('High')) color = 'var(--danger)';
        if (row.level.includes('State')) color = 'var(--accent)';
        if (row.level.includes('Info')) color = '#58a6ff';

        let ts = row.timestamp;
        if (!ts.endsWith('Z')) ts += 'Z';

        tr.innerHTML = `
                <td style="padding:10px; color:#8b949e; font-size:0.75rem;">${new Date(ts).toLocaleString()}</td>
                <td style="padding:10px; color:${color}; font-weight:600;">${row.level}</td>
                <td style="padding:10px;">${row.container}</td>
                <td style="padding:10px;">${row.message}</td>
            `;
        tbody.appendChild(tr);
    });
}
