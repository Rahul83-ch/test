# Rook-Ceph Management UI

A modern, user-friendly web interface for managing Rook-Ceph storage clusters. This UI provides a comprehensive dashboard for monitoring cluster health, managing OSDs, discovering disks, and performing maintenance operations.

## 🎯 Features

- **Dashboard**: Real-time cluster health and storage statistics
- **OSD Management**: Monitor and control Object Storage Daemons
- **Node Management**: Discover volumes and free disks
- **Disk Management**: Clean OSD disks and safely purge OSDs
- **Operator Control**: Restart Rook-Ceph operator
- **Beautiful UI**: Modern gradient design with responsive layout
- **Real-time Status**: API connection monitoring with status indicators
- **Toast Notifications**: User-friendly notifications for all operations

## 📋 Prerequisites

- Node.js 18+ (for local development)
- Docker & Docker Compose (for containerized deployment)
- Running Rook-Ceph Backend API on port 3000
- Access to Kubernetes cluster (for K8s deployment)

## 🚀 Quick Start

### Option 1: Local Development (Recommended for POC)

#### 1. Clone/Extract the project
```bash
cd rook-ceph-ui
```

#### 2. Install dependencies
```bash
npm install
```

#### 3. Start the UI server
```bash
npm start
```

The UI will be available at: **http://localhost:3001**

#### 4. Access the dashboard
- Open http://localhost:3001 in your browser
- If backend API is running on localhost:3000, it will automatically connect
- You should see "API Connected" indicator in the top-right

---

### Option 2: Docker Compose (Local Testing)

If you have both backend and frontend in the same directory:

```bash
# From the parent directory containing both services
docker-compose -f rook-ceph-ui/docker-compose.yml up -d
```

Access the UI at: **http://localhost:3001**

---

### Option 3: Docker Build & Run (Individual)

#### Build the UI image
```bash
cd rook-ceph-ui
docker build -t rook-ceph-ui:latest .
```

#### Run the container
```bash
docker run -d \
  --name rook-ceph-ui \
  -p 3001:3001 \
  rook-ceph-ui:latest
```

---

### Option 4: Kubernetes Deployment

#### 1. Build and push image to registry
```bash
docker build -t your-registry/rook-ceph-ui:latest .
docker push your-registry/rook-ceph-ui:latest
```

#### 2. Create Kubernetes deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rook-ceph-ui
  namespace: rook-ceph
spec:
  replicas: 1
  selector:
    matchLabels:
      app: rook-ceph-ui
  template:
    metadata:
      labels:
        app: rook-ceph-ui
    spec:
      containers:
      - name: ui
        image: your-registry/rook-ceph-ui:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: rook-ceph-ui
  namespace: rook-ceph
spec:
  type: ClusterIP
  ports:
  - port: 3001
    targetPort: 3001
  selector:
    app: rook-ceph-ui
```

#### 3. Port Forward to access
```bash
kubectl port-forward -n rook-ceph svc/rook-ceph-ui 3001:3001
```

Access at: **http://localhost:3001**

---

## 🔧 Configuration

### Environment Variables

The UI automatically detects the API endpoint based on the current URL:

- **Local development**: Uses `http://localhost:3000`
- **Docker**: Uses container hostname and port 3000
- **Kubernetes**: Configure via environment or directly in the code

### API Configuration

Edit `public/app.js` to change the API endpoint:

```javascript
const API_BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
    ? 'http://localhost:3000'
    : `http://${window.location.hostname}:3000`;
```

---

## 📖 Usage Guide

### Dashboard
- **Cluster Health**: Shows overall cluster status (HEALTH_OK, HEALTH_WARN, etc.)
- **Storage Statistics**: Displays pools, placement groups, objects, and usage
- **Services Status**: Shows number of monitors, managers, and OSD status
- **Recovery Status**: Alerts about degraded or misplaced objects

### OSDs Management
- **OSD Summary**: Total hosts and OSDs count
- **OSD Control**: Mark OSDs in/out with a single click
- **Host Grouping**: OSDs organized by host for easy navigation

### Node Management
- **Volume Discovery**: Find Ceph volumes on any node
- **Free Disks Detection**: Identify disks available for Ceph use
- **Real-time Status**: Watch job execution with live logs

### Disk Management
- **Disk Cleanup**: Safely wipe and prepare disks for Ceph
- **OSD Purge**: Safely remove OSDs from cluster
- **Job Monitoring**: View detailed cleanup operation logs

### Operator Management
- **Operator Restart**: Trigger rook-ceph-operator restart
- **Pod Cycling**: Automatically handles pod recreation
- **Status Monitoring**: Confirmation of successful restart

---

## 🎨 UI Features

### Responsive Design
- Works on desktop, tablet, and mobile
- Collapsible sidebar on smaller screens
- Touch-friendly buttons and controls

### Intuitive Navigation
- Sidebar navigation with emoji icons
- Clear page titles
- Breadcrumb-style navigation

### Rich Feedback
- Toast notifications for all operations
- Success/error/info message types
- Auto-dismissing notifications (3 seconds)

### Real-time Status
- API connection indicator (top-right)
- Green dot when connected, red when disconnected
- Auto health check every 10 seconds

---

## 🛠️ Troubleshooting

### "API Disconnected" Error
1. Ensure backend API is running on port 3000
2. Check network connectivity between UI and API
3. Verify firewall rules allow traffic on port 3000
4. Try accessing http://localhost:3000/api/health directly

### Operations Hanging or Timing Out
1. Some operations (disk cleanup) take 10-15 seconds
2. Check backend logs for any errors
3. Ensure Kubernetes pods have sufficient resources
4. Try restarting the backend API

### Port Already in Use
```bash
# Find and kill process using port 3001
lsof -ti:3001 | xargs kill -9

# Or use a different port
PORT=3002 npm start
```

### Docker Build Issues
```bash
# Clear cache and rebuild
docker build --no-cache -t rook-ceph-ui:latest .
```

---

## 📊 Architecture

```
rook-ceph-ui/
├── public/
│   ├── index.html          # Main HTML structure
│   ├── style.css           # Modern gradient styling
│   └── app.js              # JavaScript logic & API client
├── server.js               # Express.js server
├── package.json            # Dependencies
├── Dockerfile              # Container image
├── docker-compose.yml      # Multi-container setup
└── README.md               # This file
```

### Technology Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend Communication**: Fetch API (no external deps)
- **UI Framework**: Custom responsive grid system
- **Styling**: CSS Grid, Flexbox, Gradients
- **Server**: Express.js (minimal footprint)

---

## 🔒 Security Notes

⚠️ **For POC Only**: This UI has no authentication enabled as per requirements (using K8s port-forward for access control).

For production deployment:
1. Add authentication/authorization
2. Use HTTPS/TLS
3. Implement RBAC
4. Add rate limiting
5. Enable CORS properly
6. Secure sensitive endpoints

---

## 📈 Performance

- **Lightweight**: No heavy frameworks, pure JavaScript
- **Fast Load**: Static assets only
- **Low Memory**: ~128MB typical usage
- **Responsive UI**: Smooth animations and transitions
- **Optimized API Calls**: Smart data fetching and caching

---

## 🤝 API Integration

The UI connects to the Rook-Ceph Backend API with these endpoints:

```
GET  /api/health                              # Health check
GET  /api/ceph/health                         # Cluster health
GET  /api/osds                                # OSD list
POST /api/osd/{id}/out                        # Mark OSD out
POST /api/osd/{id}/in                         # Mark OSD in
POST /api/operator/restart                    # Restart operator
POST /api/node/ceph-volume/raw-list           # Discover volumes
POST /api/node/free-disks                     # Find free disks
POST /api/disk/clean-osd                      # Clean disk
POST /api/osd/purge-safe                      # Purge OSD
```

---

## 📝 License

POC - For evaluation and testing purposes only.

---

## 🚀 Future Enhancements

- Add persistent storage pools management
- Implement pool creation/deletion
- Add monitoring graphs and charts
- Real-time cluster events stream
- Advanced filtering and search
- Cluster benchmarking tools
- Backup and restore management

---

## 📧 Support

For issues, questions, or feedback:
1. Check the Troubleshooting section above
2. Review backend API logs: `kubectl logs -n rook-ceph deployment/rook-ceph-operator`
3. Check browser console for JavaScript errors (F12)
4. Verify network connectivity using browser DevTools

---

**Happy Ceph Managing! 🚀**
