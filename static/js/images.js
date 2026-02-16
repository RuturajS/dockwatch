let allImages = [];

// Load Images
fetch('/api/images')
    .then(r => r.json())
    .then(data => {
        allImages = data;
        renderImages(allImages);
    });

function renderImages(images) {
    const list = document.getElementById('image-list-box');
    list.innerHTML = '';
    images.forEach(img => {
        const item = document.createElement('div');
        item.className = 'container-item';
        item.onclick = () => selectImage(img, item);
        item.innerHTML = `
            <div style="width:100%; overflow:hidden;">
                <div class="container-name">${img.tags[0]}</div>
                <div style="font-size:0.75rem; color:var(--sidebar-text); opacity:0.7;">${img.size_mb} MB | ${img.created}</div>
            </div>
        `;
        list.appendChild(item);
    });
}

function filterImages() {
    const query = document.getElementById('image-search').value.toLowerCase();
    const filtered = allImages.filter(img => img.tags[0].toLowerCase().includes(query) || img.id.toLowerCase().includes(query));
    renderImages(filtered);
}

let currentImage = null;

function selectImage(img, el) {
    currentImage = img;
    document.querySelectorAll('.container-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');

    document.getElementById('selected-image-tag').textContent = img.tags[0];
    document.getElementById('selected-image-id').textContent = img.id;
    document.getElementById('history-view').textContent = 'Loading...';

    // Fetch History
    fetch(`/api/images/history/${img.long_id}`)
        .then(r => r.json())
        .then(data => {
            document.getElementById('history-view').textContent = JSON.stringify(data, null, 2);
        });

    document.getElementById('scan-view').textContent = "No scan run.";
}

function pullImage() {
    const name = document.getElementById('pull-image-name').value;
    if (!name) return;
    const out = document.getElementById('pull-progress');
    out.textContent = "Pulling...";

    fetch('/api/images/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: name })
    }).then(response => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        function read() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    showToast('Image Pull Complete', 'success');
                    setTimeout(() => location.reload(), 1000);
                    return;
                }
                const text = decoder.decode(value);
                const lines = text.split('\n');
                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const d = JSON.parse(line.substring(6));
                            if (d.status) out.textContent = d.status + (d.progress ? ' ' + d.progress : '');
                            if (d.error) {
                                out.textContent = "Error: " + d.error;
                                showToast(d.error, 'error');
                            }
                        } catch (e) { }
                    }
                });
                read();
            });
        }
        read();
    });
}

function scanImage() {
    if (!currentImage) return;
    document.getElementById('scan-view').textContent = "Scanning... (this may take a while)";
    fetch(`/api/images/scan/${currentImage.long_id}`)
        .then(r => r.json())
        .then(data => {
            document.getElementById('scan-view').textContent = JSON.stringify(data, null, 2);
            showToast('Scan Complete', 'success');
        })
        .catch(e => showToast('Scan Failed: ' + e, 'error'));
}

function deleteImage() {
    if (!currentImage) return;
    if (!confirm('Delete image ' + currentImage.tags[0] + '?')) return;
    fetch(`/api/images/${currentImage.long_id}?force=true`, { method: 'DELETE' })
        .then(r => r.json())
        .then(d => {
            if (d.error) showToast(d.error, 'error');
            else {
                showToast("Image Deleted", 'success');
                setTimeout(() => location.reload(), 1000);
            }
        });
}
