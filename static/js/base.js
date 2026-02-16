const savedTheme = localStorage.getItem('dockwatch-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span style="font-size:1.2rem;">${icon}</span><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('theme-btn-' + currentTheme);
    if (btn) btn.classList.add('active');

    // Load Alert Config
    fetch('/api/alerts/config').then(r => r.json()).then(data => {
        document.getElementById('conf-cpu').value = data.cpu_limit || 80;
        document.getElementById('conf-mem').value = data.mem_limit || 90;

        // Slack
        document.getElementById('conf-slack').value = data.slack_webhook || '';
        document.getElementById('conf-slack-enabled').checked = data.slack_enabled || false;

        // Discord
        document.getElementById('conf-discord').value = data.discord_webhook || '';
        document.getElementById('conf-discord-enabled').checked = data.discord_enabled || false;

        // Telegram
        document.getElementById('conf-telegram-token').value = data.telegram_bot_token || '';
        document.getElementById('conf-telegram-chat').value = data.telegram_chat_id || '';
        document.getElementById('conf-telegram-enabled').checked = data.telegram_enabled || false;

        // Generic
        document.getElementById('conf-generic').value = data.generic_webhook || '';
        document.getElementById('conf-generic-enabled').checked = data.generic_enabled || false;
    }).catch(() => { });
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dockwatch-theme', theme);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('theme-btn-' + theme);
    if (btn) btn.classList.add('active');
}

function saveAlertSettings() {
    const cpuLimit = parseInt(document.getElementById('conf-cpu').value);
    const memLimit = parseInt(document.getElementById('conf-mem').value);

    // Validate limits
    if (cpuLimit < 1 || cpuLimit > 100) {
        showToast('CPU limit must be between 1 and 100', 'error');
        return;
    }

    if (memLimit < 1 || memLimit > 100) {
        showToast('Memory limit must be between 1 and 100', 'error');
        return;
    }

    const slackWebhook = document.getElementById('conf-slack').value.trim();
    const slackEnabled = document.getElementById('conf-slack-enabled').checked;

    const discordWebhook = document.getElementById('conf-discord').value.trim();
    const discordEnabled = document.getElementById('conf-discord-enabled').checked;

    const telegramToken = document.getElementById('conf-telegram-token').value.trim();
    const telegramChat = document.getElementById('conf-telegram-chat').value.trim();
    const telegramEnabled = document.getElementById('conf-telegram-enabled').checked;

    const genericWebhook = document.getElementById('conf-generic').value.trim();
    const genericEnabled = document.getElementById('conf-generic-enabled').checked;

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

    const payload = {
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
        body: JSON.stringify(payload)
    })
        .then(r => r.json())
        .then(data => {
            showToast('Alert settings saved successfully!', 'success');
            closeSettings();
        })
        .catch(e => {
            showToast('Error saving settings: ' + e.message, 'error');
        });
}

function testNotificationFromSettings() {
    showToast('Sending test notification...', 'info');

    fetch('/api/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                showToast('✅ Test notification sent! Check your channels.', 'success');
            } else {
                showToast('Failed to send test: ' + data.message, 'error');
            }
        })
        .catch(err => {
            showToast('Error sending test: ' + err.message, 'error');
        });
}
