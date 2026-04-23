const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for all routes (SPA support)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'UI running' });
});

// Start server
app.listen(PORT, () => {
    console.log('====================================');
    console.log('Rook-Ceph UI started on port', PORT);
    console.log('Open http://localhost:' + PORT + ' in your browser');
    console.log('====================================');
});
