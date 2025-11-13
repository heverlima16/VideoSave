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

function cleanYoutubeUrl(url) {
    try {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        return url;
    } catch (e) {
        return url;
    }
}

function detectPlatform(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return 'youtube';
    } else if (url.includes('tiktok.com') || url.includes('vt.tiktok.com')) {
        return 'tiktok';
    } else if (url.includes('instagram.com')) {
        return 'instagram';
    } else if (url.includes('facebook.com') || url.includes('fb.watch')) {
        return 'facebook';
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
        return 'twitter';
    }
    return 'unknown';
}

app.post('/api/video-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });
        
        const platform = detectPlatform(url);
        const cleanUrl = platform === 'youtube' ? cleanYoutubeUrl(url) : url;
        
        console.log(`Obteniendo información de ${platform}:`, cleanUrl);
        
        const command = `yt-dlp --dump-json --no-playlist "${cleanUrl}"`;
        const { stdout } = await execPromise(command, { maxBuffer: 1024 * 1024 * 10 });
        const videoInfo = JSON.parse(stdout);
        
        let videoFormats;
        
        if (platform === 'tiktok') {
            videoFormats = videoInfo.formats
                .filter(f => f.vcodec !== 'none')
                .map(f => ({
                    format_id: f.format_id,
                    quality: f.format_note || f.format || 'video',
                    resolution: f.resolution || `${f.width}x${f.height}` || 'N/A',
                    height: f.height || 0,
                    ext: f.ext || 'mp4',
                    fps: f.fps || 30,
                    filesize: f.filesize ? (f.filesize / 1024 / 1024).toFixed(2) : 'N/A',
                    vcodec: f.vcodec,
                    acodec: f.acodec
                }))
                .sort((a, b) => b.height - a.height);
        } else {
            videoFormats = videoInfo.formats
                .filter(f => {
                    return f.ext === 'mp4' && f.vcodec !== 'none' && f.height;
                })
                .map(f => ({
                    format_id: f.format_id,
                    quality: f.format_note || `${f.height}p`,
                    resolution: `${f.width}x${f.height}`,
                    height: f.height,
                    ext: f.ext,
                    fps: f.fps || 30,
                    filesize: f.filesize ? (f.filesize / 1024 / 1024).toFixed(2) : 'N/A',
                    vcodec: f.vcodec,
                    acodec: f.acodec
                }))
                .sort((a, b) => b.height - a.height);
        }
        
        const uniqueFormats = [];
        const seenHeights = new Set();
        
        for (const format of videoFormats) {
            if (!seenHeights.has(format.height)) {
                seenHeights.add(format.height);
                uniqueFormats.push(format);
            }
        }
        
        res.json({
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            duration: videoInfo.duration,
            author: videoInfo.uploader || videoInfo.creator || videoInfo.channel || 'Desconocido',
            platform: platform,
            formats: uniqueFormats.slice(0, 15)
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/quick-download', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });
        
        const platform = detectPlatform(url);
        const cleanUrl = platform === 'youtube' ? cleanYoutubeUrl(url) : url;
        
        console.log(`Descarga rápida de ${platform}:`, cleanUrl);
        
        const timestamp = Date.now();
        const outputTemplate = path.join(DOWNLOADS_DIR, `%(title)s_${timestamp}.%(ext)s`);
        
        let command;
        if (platform === 'tiktok') {
            command = `yt-dlp -f "best" -o "${outputTemplate}" "${cleanUrl}"`;
        } else {
            command = `yt-dlp -f "bestvideo[ext=mp4][height<=2160]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${cleanUrl}"`;
        }
        
        await execPromise(command, { maxBuffer: 1024 * 1024 * 200 });
        
        const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.includes(`_${timestamp}`));
        if (files.length === 0) throw new Error('Archivo no encontrado');
        
        const filepath = path.join(DOWNLOADS_DIR, files[0]);
        const filename = files[0].replace(`_${timestamp}`, '');
        
        res.download(filepath, filename, (err) => {
            if (err) console.error('Error al enviar:', err);
            setTimeout(() => {
                try {
                    fs.unlinkSync(filepath);
                    console.log('Archivo eliminado:', files[0]);
                } catch (e) {
                    console.error('Error al eliminar:', e);
                }
            }, 10000);
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/download', async (req, res) => {
    try {
        const { url, format_id } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });
        
        const platform = detectPlatform(url);
        const cleanUrl = platform === 'youtube' ? cleanYoutubeUrl(url) : url;
        
        console.log(`Descargando ${platform}:`, cleanUrl, 'Formato:', format_id || 'mejor');
        
        const timestamp = Date.now();
        const outputTemplate = path.join(DOWNLOADS_DIR, `%(title)s_${timestamp}.%(ext)s`);
        
        let command;
        if (platform === 'tiktok') {
            if (format_id) {
                command = `yt-dlp -f "${format_id}" -o "${outputTemplate}" "${cleanUrl}"`;
            } else {
                command = `yt-dlp -f "best" -o "${outputTemplate}" "${cleanUrl}"`;
            }
        } else {
            if (format_id) {
                command = `yt-dlp -f "${format_id}+bestaudio[ext=m4a]/bestaudio" --merge-output-format mp4 -o "${outputTemplate}" "${cleanUrl}"`;
            } else {
                command = `yt-dlp -f "bestvideo[ext=mp4][height<=2160]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${cleanUrl}"`;
            }
        }
        
        await execPromise(command, { maxBuffer: 1024 * 1024 * 200 });
        
        const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.includes(`_${timestamp}`));
        if (files.length === 0) throw new Error('Archivo no encontrado');
        
        const filepath = path.join(DOWNLOADS_DIR, files[0]);
        const filename = files[0].replace(`_${timestamp}`, '');
        
        res.download(filepath, filename, (err) => {
            if (err) console.error('Error:', err);
            setTimeout(() => {
                try {
                    fs.unlinkSync(filepath);
                    console.log('Eliminado:', files[0]);
                } catch (e) {
                    console.error('Error:', e);
                }
            }, 10000);
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
    console.log(`📁 Descargas: ${DOWNLOADS_DIR}`);
});
