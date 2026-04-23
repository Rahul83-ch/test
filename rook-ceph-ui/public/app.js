// API Configuration
const API_BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
    ? 'http://localhost:3000'
    : `http://${window.location.hostname}:3000`;

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
    
    // Update active nav item
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });
    
    // Update active page
    pages.forEach(page => {
        page.classList.toggle('active', page.id === pageName);
    });
    
    // Update title
    const titleMap = {
        dashboard: 'Dashboard',
        osds: 'OSDs Management',
        nodes: 'Node Management',
        disks: 'Disk Management',
        operators: 'Operator Management'
    };
    
    document.getElementById('page-title').textContent = titleMap[pageName] || 'Dashboard';
    
    // Load page data
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
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
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
async function loadPageData(page) {
    if (page === 'dashboard') {
        loadDashboard();
    } else if (page === 'osds') {
        loadOsds();
    } else if (page === 'nodes') {
        loadNodes();
    } else if (page === 'disks') {
        loadDisks();
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
    const statusClass = cluster.health === 'HEALTH_OK' ? 'healthy' : cluster.health === 'HEALTH_WARN' ? 'warning' : 'error';
    
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
        <div class="stat-box">
            <div class="stat-value">${storage.pools}</div>
            <div class="stat-label">Pools</div>
        </div>
        <div class="stat-box" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <div class="stat-value">${storage.placement_groups}</div>
            <div class="stat-label">Placement Groups</div>
        </div>
        <div class="stat-box" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
            <div class="stat-value">${storage.objects}</div>
            <div class="stat-label">Objects</div>
        </div>
        <div class="stat-box" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
            <div class="stat-value">${storage.usage}</div>
            <div class="stat-label">Usage</div>
        </div>
    `;
}

function updateServicesStatus(data) {
    const services = data.services;
    const servicesGrid = document.getElementById('services-status');
    
    servicesGrid.innerHTML = `
        <div class="service-item">
            <div class="service-name">🖥️ Monitors</div>
            <div class="service-status">${services.monitors} daemons running</div>
        </div>
        <div class="service-item">
            <div class="service-name">⚙️ Manager</div>
            <div class="service-status">${services.manager || 'N/A'}</div>
        </div>
        <div class="service-item">
            <div class="service-name">📁 Metadata Server</div>
            <div class="service-status">${services.metadata_server || 'N/A'}</div>
        </div>
        <div class="service-item">
            <div class="service-name">💾 Object Storage Daemons</div>
            <div class="service-status">${services.osds.up}/${services.osds.total} up</div>
        </div>
    `;
}

function updateRecoveryStatus(data) {
    const recovery = data.recovery;
    const recoveryStatus = document.getElementById('recovery-status');
    
    const degraded = recovery.degraded === 'None' ? null : recovery.degraded;
    const misplaced = recovery.misplaced === 'None' ? null : recovery.misplaced;
    
    let html = '';
    if (!degraded && !misplaced) {
        html = '<div class="recovery-item">✓ No recovery needed - cluster is healthy</div>';
    } else {
        if (degraded) {
            html += `<div class="recovery-item warning">⚠️ Degraded: ${degraded}</div>`;
        }
        if (misplaced) {
            html += `<div class="recovery-item warning">⚠️ Misplaced: ${misplaced}</div>`;
        }
    }
    
    recoveryStatus.innerHTML = html;
}

// OSDs
async function loadOsds() {
    try {
        const osds = await apiCall('/api/osds');
        if (!osds || osds.status !== 'success') {
            showToast('Failed to load OSDs', 'error');
            return;
        }
        
        const summary = osds.summary;
        const summaryHtml = document.getElementById('osds-summary');
        
        summaryHtml.innerHTML = `
            <div class="stat-box">
                <div class="stat-value">${summary.total_hosts}</div>
                <div class="stat-label">Total Hosts</div>
            </div>
            <div class="stat-box" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                <div class="stat-value">${summary.total_osds}</div>
                <div class="stat-label">Total OSDs</div>
            </div>
        `;
        
        // Build OSD List
        const osdsList = document.getElementById('osds-list');
        let html = '';
        
        for (const [hostName, hostData] of Object.entries(osds.hosts)) {
            html += `
                <div class="host-group">
                    <div class="host-header">
                        <span>🖥️ ${hostName}</span>
                        <span>${hostData.total_osds} OSDs</span>
                    </div>
            `;
            
            for (const osd of hostData.osds) {
                html += `
                    <div class="osd-item">
                        <div class="osd-info">
                            <div class="osd-name">OSD ${osd.osd_id}</div>
                            <div class="osd-details">
                                Weight: ${osd.weight} | Status: ${osd.status} | Reweight: ${osd.reweight}
                            </div>
                        </div>
                        <div class="osd-actions">
                            <button class="btn btn-primary btn-small" onclick="toggleOsdStatus(${osd.osd_id}, '${osd.status}')">
                                ${osd.status === 'up' ? '⬇️ Out' : '⬆️ In'}
                            </button>
                        </div>
                    </div>
                `;
            }
            
            html += '</div>';
        }
        
        osdsList.innerHTML = html;
    } catch (error) {
        showToast('Error loading OSDs: ' + error.message, 'error');
    }
}

async function toggleOsdStatus(osdId, currentStatus) {
    try {
        const endpoint = currentStatus === 'up' ? `/api/osd/${osdId}/out` : `/api/osd/${osdId}/in`;
        const result = await apiCall(endpoint, 'POST');
        
        showToast(`OSD ${osdId} ${currentStatus === 'up' ? 'marked out' : 'marked in'}`, 'success');
        loadOsds();
    } catch (error) {
        showToast(`Error toggling OSD ${osdId}: ${error.message}`, 'error');
    }
}

// Nodes
async function loadNodes() {
    try {
        const osds = await apiCall('/api/osds');
        if (osds && osds.hosts) {
            state.nodes = Object.keys(osds.hosts);
            
            // Update node selectors
            updateNodeSelectors();
        }
    } catch (error) {
        showToast('Error loading nodes: ' + error.message, 'error');
    }
    
    // Setup event listeners
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
        selector.innerHTML = `<option value="">Select a node...</option>${options}`;
    });
}

async function discoverVolumes() {
    const node = document.getElementById('node-selector').value;
    if (!node) {
        showToast('Please select a node', 'error');
        return;
    }
    
    const output = document.getElementById('discovery-results');
    output.innerHTML = '<div class="output-status"><span class="icon">⏳</span><span>Discovering volumes...</span></div>';
    output.classList.remove('success', 'error');
    output.classList.add('loading');
    
    try {
        const result = await apiCall('/api/node/ceph-volume/raw-list', 'POST', { node });
        
        let text = `Node: ${result.node}\nJob: ${result.job}\nPod: ${result.pod}\nFound: ${result.total_osds} OSDs\n\n`;
        text += 'OSDs Discovered:\n';
        text += result.osds.map(osd => 
            `  OSD ID: ${osd.osd_id}\n  Device: ${osd.device}\n  Type: ${osd.type}\n  UUID: ${osd.osd_uuid}\n`
        ).join('\n');
        
        output.textContent = text;
        output.classList.remove('loading');
        output.classList.add('success');
        showToast(`Discovered ${result.total_osds} OSDs on ${node}`, 'success');
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.classList.remove('loading');
        output.classList.add('error');
        showToast('Error discovering volumes: ' + error.message, 'error');
    }
}

async function findFreeDisks() {
    const node = document.getElementById('free-disk-node').value;
    if (!node) {
        showToast('Please select a node', 'error');
        return;
    }
    
    const output = document.getElementById('free-disks-results');
    output.innerHTML = '<div class="output-status"><span class="icon">⏳</span><span>Finding free disks...</span></div>';
    output.classList.remove('success', 'error');
    output.classList.add('loading');
    
    try {
        const result = await apiCall('/api/node/free-disks', 'POST', { node });
        
        let text = `Node: ${result.node}\n\n`;
        text += `Summary:\n  Free for Ceph: ${result.summary.free_for_ceph}\n  Blocked: ${result.summary.blocked}\n\n`;
        
        text += 'Free Disks:\n';
        result.free_disks.forEach(disk => {
            text += `  Name: ${disk.name}\n  Path: ${disk.path}\n  Size: ${disk.size}\n\n`;
        });
        
        text += 'Blocked Disks:\n';
        result.blocked_disks.forEach(disk => {
            text += `  Name: ${disk.name}\n  Path: ${disk.path}\n  Size: ${disk.size}\n  Reason: ${disk.reason}\n\n`;
        });
        
        output.textContent = text;
        output.classList.remove('loading');
        output.classList.add('success');
        showToast(`Found ${result.summary.free_for_ceph} free disks`, 'success');
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.classList.remove('loading');
        output.classList.add('error');
        showToast('Error finding free disks: ' + error.message, 'error');
    }
}

// Disks Management
async function loadDisks() {
    try {
        const osds = await apiCall('/api/osds');
        if (osds && osds.hosts) {
            state.nodes = Object.keys(osds.hosts);
            updateNodeSelectors();
        }
    } catch (error) {
        showToast('Error loading disk management: ' + error.message, 'error');
    }
    
    document.getElementById('clean-btn').onclick = cleanDisk;
    document.getElementById('purge-btn').onclick = purgeOsd;
}

async function cleanDisk() {
    const node = document.getElementById('clean-node').value;
    const disk = document.getElementById('clean-disk').value;
    
    if (!node || !disk) {
        showToast('Please select node and enter disk path', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to clean and wipe disk ${disk} on node ${node}? This cannot be undone!`)) {
        return;
    }
    
    const output = document.getElementById('clean-results');
    output.innerHTML = '<div class="output-status"><span class="icon">⏳</span><span>Cleaning disk...</span></div>';
    output.classList.remove('success', 'error');
    output.classList.add('loading');
    
    try {
        const result = await apiCall('/api/disk/clean-osd', 'POST', { node, disk });
        
        let text = `Node: ${result.node}\nDisk: ${result.disk}\nJob: ${result.job}\nPod: ${result.pod}\n\n`;
        text += `${result.message}\n\n`;
        text += 'Job Output:\n';
        text += result.logs;
        
        output.textContent = text;
        output.classList.remove('loading');
        output.classList.add('success');
        showToast(`Disk ${disk} cleaned successfully`, 'success');
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.classList.remove('loading');
        output.classList.add('error');
        showToast('Error cleaning disk: ' + error.message, 'error');
    }
}

async function purgeOsd() {
    const osdId = document.getElementById('purge-osd-id').value;
    const force = document.getElementById('purge-force').checked;
    
    if (osdId === '') {
        showToast('Please enter an OSD ID', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to purge OSD ${osdId}? This cannot be undone!`)) {
        return;
    }
    
    const output = document.getElementById('purge-results');
    output.innerHTML = '<div class="output-status"><span class="icon">⏳</span><span>Purging OSD...</span></div>';
    output.classList.remove('success', 'error');
    output.classList.add('loading');
    
    try {
        const result = await apiCall('/api/osd/purge-safe', 'POST', { osd_id: parseInt(osdId), force });
        
        let text = `OSD ID: ${osdId}\nForce: ${force}\n\n`;
        text += 'Purge Log:\n';
        result.logs.forEach(log => {
            text += `  • ${log}\n`;
        });
        
        output.textContent = text;
        output.classList.remove('loading');
        output.classList.add('success');
        showToast(`OSD ${osdId} purged successfully`, 'success');
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.classList.remove('loading');
        output.classList.add('error');
        showToast('Error purging OSD: ' + error.message, 'error');
    }
}

// Operators
document.addEventListener('DOMContentLoaded', () => {
    const restartBtn = document.getElementById('restart-operator-btn');
    if (restartBtn) {
        restartBtn.onclick = restartOperator;
    }
});

async function restartOperator() {
    if (!confirm('Are you sure you want to restart the Rook-Ceph operator? This may temporarily affect Ceph operations.')) {
        return;
    }
    
    const output = document.getElementById('operator-results');
    output.innerHTML = '<div class="output-status"><span class="icon">⏳</span><span>Restarting operator...</span></div>';
    output.classList.remove('success', 'error');
    output.classList.add('loading');
    
    try {
        const result = await apiCall('/api/operator/restart', 'POST');
        
        let text = `Status: ${result.status}\nMessage: ${result.message}\n\nOperator restart has been triggered. Pods will be cycling now.`;
        
        output.textContent = text;
        output.classList.remove('loading');
        output.classList.add('success');
        showToast('Operator restart triggered successfully', 'success');
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.classList.remove('loading');
        output.classList.add('error');
        showToast('Error restarting operator: ' + error.message, 'error');
    }
}

// Refresh Button
refreshBtn.addEventListener('click', () => {
    checkApiHealth();
    loadPageData(state.currentPage);
    showToast('Data refreshed', 'info');
});

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    checkApiHealth();
    showPage('dashboard');
    
    // Refresh health check every 10 seconds
    setInterval(checkApiHealth, 10000);
});
