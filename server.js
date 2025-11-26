const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files (HTML/CSS/JS) from the current directory
app.use(express.static(__dirname));

// --- API Routes (Future Proofing) ---

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

/**
 * 模拟云端同步接口
 * Future Idea: 当用户登录后，前端 LocalStorage 的数据会 POST 到这里存入数据库
 */
app.post('/api/sync', (req, res) => {
    const { userId, projects, tasks } = req.body;
    console.log(`[Sync] Received data for user ${userId || 'guest'}: ${projects?.length} projects`);
    
    // Simulate DB latency
    setTimeout(() => {
        res.json({ success: true, message: 'Data synced successfully (mock)' });
    }, 500);
});

/**
 * 服务端 CSV 导出服务
 * 优势：解决浏览器兼容性问题，处理复杂编码(如中文乱码)，减轻前端计算压力
 */
app.post('/api/export-csv', (req, res) => {
    try {
        const { projectName, tasks } = req.body;

        // Add BOM for Excel UTF-8 compatibility
        let csvContent = '\uFEFF'; 
        csvContent += 'Task Content,Priority,Status,Created At\n';

        tasks.forEach(task => {
            // Escape quotes for CSV format
            const safeContent = task.content ? `"${task.content.replace(/"/g, '""')}"` : '""';
            csvContent += `${safeContent},${task.priority},${task.status},${task.createdAt}\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment(`${projectName.replace(/\s+/g, '_')}_export.csv`);
        return res.send(csvContent);

    } catch (error) {
        console.error('Export failed:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 UI Debug Board running locally!`);
    console.log(`👉 Access via browser: http://localhost:${PORT}`);
    console.log(`   (Press Ctrl+C to stop)`);
});