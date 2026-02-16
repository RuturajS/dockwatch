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
    const payload = {
        cpu_limit: document.getElementById('conf-cpu').value,
        mem_limit: document.getElementById('conf-mem').value,

        slack_webhook: document.getElementById('conf-slack').value,
        slack_enabled: document.getElementById('conf-slack-enabled').checked ? 1 : 0,

        discord_webhook: document.getElementById('conf-discord').value,
        discord_enabled: document.getElementById('conf-discord-enabled').checked ? 1 : 0,

        telegram_bot_token: document.getElementById('conf-telegram-token').value,
        telegram_chat_id: document.getElementById('conf-telegram-chat').value,
        telegram_enabled: document.getElementById('conf-telegram-enabled').checked ? 1 : 0,

        generic_webhook: document.getElementById('conf-generic').value,
        generic_enabled: document.getElementById('conf-generic-enabled').checked ? 1 : 0
    };
    fetch('/api/alerts/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(r => {
            showToast('Alert settings saved!', 'success');
            closeSettings();
        })
        .catch(e => showToast('Error saving settings', 'error'));
}
