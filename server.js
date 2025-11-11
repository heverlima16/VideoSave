const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = promisify(exec);
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR);
}

app.post('/api/video-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });
        
        const command = `yt-dlp --dump-json --no-playlist "${url}"`;
        const { stdout } = await execPromise(command);
        const videoInfo = JSON.parse(stdout);
        
        const formats = videoInfo.formats
            .filter(f => f.ext === 'mp4' && f.vcodec !== 'none')
            .map(f => ({
                format_id: f.format_id,
                quality: f.format_note || f.quality,
                resolution: f.resolution || 'audio',
                filesize: f.filesize ? (f.filesize / 1024 / 1024).toFixed(2) : 'N/A'
            }));
        
        res.json({
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            duration: videoInfo.duration,
            author: videoInfo.uploader,
            formats: formats.slice(0, 10)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/download', async (req, res) => {
    try {
        const { url, format_id } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });
        
        const timestamp = Date.now();
        const outputTemplate = path.join(DOWNLOADS_DIR, `video_${timestamp}.%(ext)s`);
        
        let command = format_id 
            ? `yt-dlp -f ${format_id} -o "${outputTemplate}" "${url}"`
            : `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${outputTemplate}" "${url}"`;
        
        await execPromise(command, { maxBuffer: 1024 * 1024 * 100 });
        
        const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(`video_${timestamp}`));
        if (files.length === 0) throw new Error('Archivo no encontrado');
        
        const filepath = path.join(DOWNLOADS_DIR, files[0]);
        res.download(filepath, files[0], () => {
            setTimeout(() => fs.unlinkSync(filepath), 5000);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
});
