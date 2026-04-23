// API Configuration
// Try to get from environment or use defaults
let API_BASE_URL = 'http://localhost:3000'; // Default


console.log('API Base URL:', API_BASE_URL);

// State Management
const state = {
    currentPage: 'dashboard',
    apiConnected: false,
    nodes: []
};

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const refreshBtn = document.getElementById('refresh-btn');
const apiStatus = document.getElementById('api-status');

// Page Navigation
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;
        showPage(page);
    });
});

function showPage(pageName) {
    state.currentPage = pageName;

    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });

    pages.forEach(page => {
        page.classList.toggle('active', page.id === pageName);
    });

    const titleMap = {
        dashboard: 'Dashboard',
        osds: 'OSDs Management',
        nodes: 'Node Management',
        disks: 'Disk Management',
        operators: 'Operator Management'
    };

    document.getElementById('page-title').textContent = titleMap[pageName] || 'Dashboard';

    loadPageData(pageName);
}

// API Calls
async function apiCall(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (body) options.body = JSON.stringify(body);

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Check API Health
async function checkApiHealth() {
    try {
        const response = await apiCall('/api/health');
        setApiStatus(true);
        return response;
    } catch (error) {
        setApiStatus(false);
        console.error('API health check failed:', error);
        return null;
    }
}

function setApiStatus(connected) {
    state.apiConnected = connected;
    const statusDot = apiStatus.querySelector('.status-dot');
    const statusText = apiStatus.querySelector('span');

    if (connected) {
        statusDot.classList.remove('error');
        statusDot.classList.add('connected');
        statusText.textContent = 'API Connected';
    } else {
        statusDot.classList.remove('connected');
        statusDot.classList.add('error');
        statusText.textContent = 'API Disconnected';
    }
}

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };

    toast.innerHTML = `
        <span class="icon">${iconMap[type]}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Load Page Data
function loadPageData(page) {
    if (page === 'dashboard') loadDashboard();
    else if (page === 'osds') loadOsds();
    else if (page === 'nodes') loadNodes();
    else if (page === 'disks') {
    loadDisks();
    loadPurgeOsds();   // ✅ ADD THIS LINE
}

}

// Dashboard
async function loadDashboard() {
    try {
        const health = await apiCall('/api/ceph/health');
        if (!health || health.status !== 'success') {
            showToast('Failed to load dashboard data', 'error');
            return;
        }

        updateClusterHealth(health);
        updateStorageStats(health);
        updateServicesStatus(health);
        updateRecoveryStatus(health);

    } catch (error) {
        showToast('Error loading dashboard: ' + error.message, 'error');
    }
}

function updateClusterHealth(data) {
    const cluster = data.cluster;
    const healthStatus = document.getElementById('cluster-health');
    const healthDetails = document.getElementById('health-details');

    const isHealthy = cluster.health === 'HEALTH_OK';
    const statusClass =
        cluster.health === 'HEALTH_OK'
            ? 'healthy'
            : cluster.health === 'HEALTH_WARN'
            ? 'warning'
            : 'error';

    healthStatus.innerHTML = `
        <div class="status-circle ${statusClass}">${isHealthy ? '✓' : '⚠'}</div>
        <span>${cluster.health}</span>
    `;

    healthDetails.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Cluster ID:</span>
            <span class="detail-value">${cluster.id || 'N/A'}</span>
        </div>
    `;
}

function updateStorageStats(data) {
    const storage = data.storage;
    const statsGrid = document.getElementById('storage-stats');

    statsGrid.innerHTML = `
        <div class="stat-box"><div class="stat-value">${storage.pools}</div><div class="stat-label">Pools</div></div>
        <div class="stat-box"><div class="stat-value">${storage.placement_groups}</div><div class="stat-label">Placement Groups</div></div>
        <div class="stat-box"><div class="stat-value">${storage.objects}</div><div class="stat-label">Objects</div></div>
        <div class="stat-box"><div class="stat-value">${storage.usage}</div><div class="stat-label">Usage</div></div>
    `;
}

function updateServicesStatus(data) {
    const services = data.services;
    const servicesGrid = document.getElementById('services-status');

    servicesGrid.innerHTML = `
        <div class="service-item"><div class="service-name">🖥️ Monitors</div><div class="service-status">${services.monitors}</div></div>
        <div class="service-item"><div class="service-name">⚙️ Manager</div><div class="service-status">${services.manager}</div></div>
        <div class="service-item"><div class="service-name">💾 OSDs</div><div class="service-status">${services.osds.up}/${services.osds.total} up</div></div>
    `;
}

function updateRecoveryStatus(data) {
    const recovery = data.recovery;
    const recoveryStatus = document.getElementById('recovery-status');

    recoveryStatus.innerHTML = `
        <div class="recovery-item">
            Degraded: ${recovery.degraded} | Misplaced: ${recovery.misplaced}
        </div>
    `;
}

// =========================
// OSDs
// =========================
async function loadOsds() {
    try {
        const osds = await apiCall('/api/osds');

        if (!osds || osds.status !== 'success') {
            showToast('Failed to load OSDs', 'error');
            return;
        }

        const summary = osds.summary;
        document.getElementById('osds-summary').innerHTML = `
            <div class="stat-box">
                <div class="stat-value">${summary.total_hosts}</div>
                <div class="stat-label">Total Hosts</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${summary.total_osds}</div>
                <div class="stat-label">Total OSDs</div>
            </div>
        `;

        const hostFilter = document.getElementById('host-filter');

        if (hostFilter) {
            let options = `<option value="">All Hosts</option>`;

            Object.keys(osds.hosts).forEach(host => {
                options += `<option value="${host}">${host}</option>`;
            });

            hostFilter.innerHTML = options;

            hostFilter.onchange = () => {
                renderOsdsList(osds.hosts, hostFilter.value);
            };
        }

        renderOsdsList(osds.hosts);

    } catch (error) {
        showToast('Error loading OSDs: ' + error.message, 'error');
    }
}

function renderOsdsList(hosts, filterHost = '') {
    const osdsList = document.getElementById('osds-list');
    let html = '';

    for (const [hostName, hostData] of Object.entries(hosts)) {

        if (filterHost && hostName !== filterHost) continue;

        html += `
            <div class="host-group">
                <div class="host-header">
                    <span>🖥️ ${hostName}</span>
                    <span>${hostData.total_osds} OSDs</span>
                </div>
        `;

        for (const osd of hostData.osds) {

            const isIn = osd.in_out === 'in';
            const daemonUp = osd.status === 'up';

            const btnText = isIn ? '⬇️ Mark Out' : '⬆️ Mark In';
            const btnClass = isIn ? 'btn-danger' : 'btn-primary';

            html += `
                <div class="osd-item">
                    <div class="osd-info">
                        <div class="osd-name">OSD ${osd.osd_id}</div>
                        <div class="osd-details">
                            Cluster: ${isIn ? 'IN' : 'OUT'} |
                            Daemon: ${daemonUp ? 'UP' : 'DOWN'} |
                            Weight: ${osd.weight}
                        </div>
                    </div>
                    <div class="osd-actions">
                        <button class="btn ${btnClass} btn-small"
                            onclick="toggleOsdStatus(${osd.osd_id}, '${osd.in_out}')">
                            ${btnText}
                        </button>
                    </div>
                </div>
            `;
        }

        html += `</div>`;
    }

    osdsList.innerHTML = html || `<div>No OSDs found</div>`;
}

async function toggleOsdStatus(osdId, currentState) {
    try {
        const endpoint =
            currentState === 'in'
                ? `/api/osd/${osdId}/out`
                : `/api/osd/${osdId}/in`;

        await apiCall(endpoint, 'POST');

        showToast(
            currentState === 'in'
                ? `OSD ${osdId} marked OUT`
                : `OSD ${osdId} marked IN`,
            'success'
        );

        setTimeout(loadOsds, 1000);

    } catch (error) {
        showToast('OSD action failed', 'error');
    }
}

// =========================
// Nodes
// =========================
async function loadNodes() {
    try {
        const osds = await apiCall('/api/osds');

        if (osds && osds.hosts) {
            state.nodes = Object.keys(osds.hosts);
            updateNodeSelectors();
        }

    } catch (error) {
        showToast('Error loading nodes: ' + error.message, 'error');
    }

    document.getElementById('discover-btn').onclick = discoverVolumes;
    document.getElementById('free-disk-btn').onclick = findFreeDisks;
}

function updateNodeSelectors() {
    const selectors = [
        document.getElementById('node-selector'),
        document.getElementById('free-disk-node'),
        document.getElementById('clean-node')
    ];

    const options = state.nodes.map(node => `<option value="${node}">${node}</option>`).join('');

    selectors.forEach(selector => {
        if (selector) {
            selector.innerHTML = `<option value="">Select a node...</option>${options}`;
        }
    });
}

async function discoverVolumes() {
    const node = document.getElementById('node-selector').value;
    const btn = document.getElementById('discover-btn');
    const output = document.getElementById('discovery-results');

    if (!node) return showToast('Please select a node', 'error');

    btn.disabled = true;
    btn.innerText = 'Processing...';
    output.innerHTML = '⏳ Discovering volumes...';

    try {
        const result = await apiCall('/api/node/ceph-volume/raw-list', 'POST', { node });

        let html = `
            <h4>✅ Discovery Completed</h4>
            <p><strong>Node:</strong> ${result.node}</p>
            <p><strong>Total OSDs:</strong> ${result.total_osds}</p>
            <table class="result-table">
                <tr>
                    <th>OSD ID</th>
                    <th>Device</th>
                    <th>Type</th>
                </tr>
        `;

        result.osds.forEach(osd => {
            html += `
                <tr>
                    <td>${osd.osd_id}</td>
                    <td>${osd.device}</td>
                    <td>${osd.type}</td>
                </tr>
            `;
        });

        html += `</table>`;

        output.innerHTML = html;
        showToast('Discovery completed', 'success');

    } catch (error) {
        output.innerHTML = '❌ Failed to discover volumes';
        showToast('Error discovering volumes', 'error');
    }

    btn.disabled = false;
    btn.innerText = 'Discover Volumes';
}

async function findFreeDisks() {
    const node = document.getElementById('free-disk-node').value;
    const btn = document.getElementById('free-disk-btn');
    const output = document.getElementById('free-disks-results');

    if (!node) {
        showToast('Please select a node', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Processing...';
    output.innerHTML = '⏳ Checking free disks...';

    try {
        const result = await apiCall('/api/node/free-disks', 'POST', { node });

        let rows = '';

        // FREE disks
        result.free_disks.forEach(disk => {
            rows += `
                <tr>
                    <td>${disk.name}</td>
                    <td>${disk.path}</td>
                    <td>${disk.size}</td>
                    <td style="color:#27ae60;font-weight:bold;">FREE</td>
                    <td>Ready for Ceph</td>
                </tr>
            `;
        });

        // BLOCKED disks
        result.blocked_disks.forEach(disk => {
            rows += `
                <tr>
                    <td>${disk.name}</td>
                    <td>${disk.path}</td>
                    <td>${disk.size}</td>
                    <td style="color:#e74c3c;font-weight:bold;">BLOCKED</td>
                    <td>${disk.reason}</td>
                </tr>
            `;
        });

        output.innerHTML = `
            <h4>✅ Disk Scan Completed</h4>
            <p><strong>Node:</strong> ${result.node}</p>
            <p><strong>Free:</strong> ${result.summary.free_for_ceph}</p>
            <p><strong>Blocked:</strong> ${result.summary.blocked}</p>

            <h4>All Disks</h4>

            <table class="result-table">
                <tr>
                    <th>Name</th>
                    <th>Path</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Reason</th>
                </tr>
                ${rows}
            </table>
        `;

        showToast('Disk scan completed', 'success');

    } catch (error) {
        output.innerHTML = '❌ Failed to check disks';
        showToast('Error checking disks', 'error');
    }

    btn.disabled = false;
    btn.innerText = 'Find Free Disks';
}

// =========================
// Disks
// =========================
async function loadDisks() {
    try {
        const osds = await apiCall('/api/osds');

        if (osds && osds.hosts) {
            state.nodes = Object.keys(osds.hosts);
            updateNodeSelectors();
        }

    } catch (error) {
        showToast('Error loading disk management', 'error');
    }

    document.getElementById('clean-btn').onclick = cleanDisk;
    document.getElementById('purge-btn').onclick = purgeOsd;
}

async function cleanDisk() {
    const node = document.getElementById('clean-node').value;
    const disk = document.getElementById('clean-disk').value;
    const output = document.getElementById('clean-results');

    if (!node || !disk) {
        showToast('Please select node and enter disk path', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to clean and wipe disk ${disk} on node ${node}?`)) {
        return;
    }

    output.classList.remove('success', 'error');
    output.classList.add('loading');

    output.innerHTML = `
        <div class="output-status">
            <span class="loading-spinner"></span>
            <span>Cleaning disk in progress...</span>
        </div>
    `;

    try {
        const result = await apiCall('/api/disk/clean-osd', 'POST', {
            node,
            disk
        });

        output.innerHTML = `
            <div class="success-title">✅ Disk Cleanup Completed</div>

            <div class="info-box"><b>Node:</b> ${result.node}</div>
            <div class="info-box"><b>Disk:</b> ${result.disk}</div>
            <div class="info-box"><b>Status:</b> ${result.message}</div>
            <div class="info-box"><b>Job:</b> ${result.job}</div>
            <div class="info-box"><b>Pod:</b> ${result.pod}</div>

            <h4>Cleanup Logs</h4>
            <pre>${result.logs || 'No logs available'}</pre>
        `;

        output.classList.remove('loading');
        output.classList.add('success');

        showToast(`Disk ${disk} cleaned successfully`, 'success');

    } catch (error) {
        output.innerHTML = `
            <div class="success-title">❌ Disk Cleanup Failed</div>
            <pre>${error.message}</pre>
        `;

        output.classList.remove('loading');
        output.classList.add('error');

        showToast('Error cleaning disk: ' + error.message, 'error');
    }
}

async function purgeOsd() {
    const osdId = document.getElementById('purge-osd-id').value;
    const force = document.getElementById('purge-force').checked;
    const output = document.getElementById('purge-results');

    if (osdId === '') {
        showToast('Please select OSD ID', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to purge OSD ${osdId}?`)) {
        return;
    }

    output.classList.remove('success', 'error');
    output.classList.add('loading');

    output.innerHTML = `
        <div class="output-status">
            <span class="loading-spinner"></span>
            <span>Purging OSD in progress...</span>
        </div>
    `;

    try {
        const result = await apiCall('/api/osd/purge-safe', 'POST', {
            osd_id: parseInt(osdId),
            force
        });

        output.innerHTML = `
            <div class="success-title">✅ OSD Purge Completed</div>

            <div class="info-box"><b>OSD ID:</b> ${result.osd_id}</div>
            <div class="info-box"><b>Force Mode:</b> ${result.force ? 'Yes' : 'No'}</div>
            <div class="info-box"><b>Status:</b> ${result.status}</div>

            <h4>Purge Steps</h4>
            <ul>
                ${(result.logs || []).map(log => `<li>${log}</li>`).join('')}
            </ul>
        `;

        output.classList.remove('loading');
        output.classList.add('success');

        showToast(`OSD ${osdId} purged successfully`, 'success');

    } catch (error) {
        output.innerHTML = `
            <div class="success-title">❌ OSD Purge Failed</div>
            <pre>${error.message}</pre>
        `;

        output.classList.remove('loading');
        output.classList.add('error');

        showToast('Error purging OSD: ' + error.message, 'error');
    }
}

// =========================
// Operator
// =========================
async function restartOperator() {
    try {
        const result = await apiCall('/api/operator/restart', 'POST');
        document.getElementById('operator-results').textContent = JSON.stringify(result, null, 2);
        showToast('Operator restarted', 'success');
    } catch (error) {
        showToast('Restart failed', 'error');
    }
}

async function loadPurgeOsds() {
    try {
        const res = await apiCall('/api/osds');

        const select = document.getElementById('purge-osd-id');

        if (!res || res.status !== "success" || !res.hosts) {
            select.innerHTML = `<option value="">No OSDs found</option>`;
            return;
        }

        let options = `<option value="">Select OSD to purge...</option>`;

        Object.entries(res.hosts).forEach(([node, hostData]) => {
            (hostData.osds || []).forEach(osd => {

                options += `
                    <option value="${osd.osd_id}">
                        OSD ${osd.osd_id} (${node} | ${osd.in_out.toUpperCase()} | ${osd.status.toUpperCase()})
                    </option>
                `;
            });
        });

        select.innerHTML = options;

    } catch (err) {
        console.error(err);
        document.getElementById('purge-osd-id').innerHTML =
            `<option value="">Failed to load OSDs</option>`;
    }
}

// Refresh
refreshBtn.addEventListener('click', () => {
    checkApiHealth();
    loadPageData(state.currentPage);
    showToast('Data refreshed', 'info');
});

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    const restartBtn = document.getElementById('restart-operator-btn');
    if (restartBtn) restartBtn.onclick = restartOperator;

    checkApiHealth();
    showPage('dashboard');

    setInterval(checkApiHealth, 10000);
});