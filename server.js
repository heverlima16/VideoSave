const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

function spawnYtDlp(args, timeoutMs = 10 * 60 * 1000) {
    return new Promise((resolve, reject) => {
        const proc = spawn('yt-dlp', args);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error('Tiempo de espera agotado. El video puede ser demasiado largo.'));
        }, timeoutMs);

        proc.on('close', code => {
            clearTimeout(timer);
            if (code === 0) resolve(stdout);
            else reject(new Error(parseYtDlpError(stderr)));
        });

        proc.on('error', err => {
            clearTimeout(timer);
            reject(new Error(`yt-dlp no encontrado: ${err.message}`));
        });
    });
}

function parseYtDlpError(stderr) {
    if (stderr.includes('Private video')) return 'El video es privado';
    if (stderr.includes('Video unavailable') || stderr.includes('This video is unavailable')) return 'El video no está disponible';
    if (stderr.includes('Sign in to confirm')) return 'El video requiere inicio de sesión (restringido por edad o región)';
    if (stderr.includes('This video has been removed')) return 'El video fue eliminado';
    if (stderr.includes('age-restricted')) return 'El video tiene restricción de edad';
    if (stderr.includes('Unsupported URL') || stderr.includes('Unable to extract')) return 'URL no soportada. Verifica el enlace.';
    if (stderr.includes('HTTP Error 403')) return 'Acceso denegado. El video puede ser privado o regional.';
    if (stderr.includes('HTTP Error 404')) return 'Video no encontrado (404)';
    if (stderr.includes('Connection') || stderr.includes('Network')) return 'Error de red. Verifica tu conexión.';
    if (stderr.includes('No video formats found')) return 'No se encontraron formatos de video disponibles.';

    const lines = stderr.trim().split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('[debug]') && l.includes('ERROR'));
    const errorLine = lines[lines.length - 1] || stderr.trim().split('\n').pop() || 'Error desconocido';
    return errorLine.replace(/^ERROR:\s*/i, '').substring(0, 300);
}

function validateUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Solo se permiten URLs http/https');
        }
        return parsed.href;
    } catch {
        throw new Error('URL inválida. Asegúrate de incluir https://');
    }
}

function detectPlatform(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('tiktok.com') || url.includes('vt.tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('facebook.com') || url.includes('fb.watch')) return 'facebook';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    return 'generic';
}

function cleanYoutubeUrl(url) {
    try {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
    } catch { /* keep original */ }
    return url;
}

function prepareUrl(url, platform) {
    return platform === 'youtube' ? cleanYoutubeUrl(url) : url;
}

function cleanupFile(filepath, delayMs = 60000) {
    setTimeout(() => {
        fs.unlink(filepath, err => {
            if (err && err.code !== 'ENOENT') {
                console.error('Error al eliminar temporal:', filepath);
            }
        });
    }, delayMs);
}

function buildDownloadArgs(platform, url, formatId, outputTemplate) {
    const baseArgs = [
        '--no-playlist',
        '--no-warnings',
        '--restrict-filenames',
        '-o', outputTemplate
    ];

    if (platform === 'tiktok') {
        const fmt = formatId ? ['-f', formatId] : ['-f', 'bestvideo+bestaudio/best'];
        return [...fmt, ...baseArgs, url];
    }

    if (formatId) {
        return [
            '-f', `${formatId}+bestaudio/bestaudio`,
            '--merge-output-format', 'mp4',
            ...baseArgs,
            url
        ];
    }

    // Best available quality, prefer mp4 container, fallback to merge
    return [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        ...baseArgs,
        url
    ];
}

async function downloadVideo(platform, url, formatId) {
    const uid = crypto.randomBytes(8).toString('hex');
    const outputTemplate = path.join(DOWNLOADS_DIR, `%(title)s__${uid}.%(ext)s`);
    const args = buildDownloadArgs(platform, url, formatId, outputTemplate);

    await spawnYtDlp(args, 20 * 60 * 1000);

    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.includes(`__${uid}.`));
    if (files.length === 0) throw new Error('El archivo no se encontró tras la descarga');

    const filepath = path.join(DOWNLOADS_DIR, files[0]);
    const filename = files[0].replace(`__${uid}`, '');
    return { filepath, filename };
}

// ── Endpoints ──────────────────────────────────────────────────────────────

app.post('/api/video-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });

        const validUrl = validateUrl(url);
        const platform = detectPlatform(validUrl);
        const cleanUrl = prepareUrl(validUrl, platform);

        console.log(`[info] ${platform}: ${cleanUrl}`);

        const stdout = await spawnYtDlp(
            ['--dump-json', '--no-playlist', '--no-warnings', cleanUrl],
            30000
        );

        const info = JSON.parse(stdout);
        const formats = info.formats || [];

        let videoFormats;

        if (platform === 'tiktok') {
            videoFormats = formats
                .filter(f => f.vcodec && f.vcodec !== 'none')
                .map(f => ({
                    format_id: f.format_id,
                    quality: f.format_note || 'video',
                    resolution: f.resolution || (f.width && f.height ? `${f.width}x${f.height}` : 'N/A'),
                    height: f.height || 0,
                    ext: f.ext || 'mp4',
                    fps: f.fps || 30,
                    filesize: f.filesize ? parseFloat((f.filesize / 1024 / 1024).toFixed(1)) : null,
                    hasAudio: !!(f.acodec && f.acodec !== 'none')
                }))
                .sort((a, b) => b.height - a.height);
        } else {
            // Include all video-only and muxed formats (mp4 + webm) for full quality range
            videoFormats = formats
                .filter(f => f.vcodec && f.vcodec !== 'none' && f.height >= 144)
                .map(f => ({
                    format_id: f.format_id,
                    quality: f.format_note || `${f.height}p`,
                    resolution: f.width && f.height ? `${f.width}x${f.height}` : `${f.height}p`,
                    height: f.height,
                    ext: f.ext,
                    fps: f.fps || 30,
                    filesize: f.filesize ? parseFloat((f.filesize / 1024 / 1024).toFixed(1)) : null,
                    hasAudio: !!(f.acodec && f.acodec !== 'none')
                }))
                .sort((a, b) => b.height - a.height || (b.fps || 30) - (a.fps || 30));
        }

        // Deduplicate by height+fps tier, keep first (best)
        const seen = new Map();
        const uniqueFormats = [];
        for (const f of videoFormats) {
            const key = `${f.height}_${f.fps > 30 ? 'hfr' : 'std'}`;
            if (!seen.has(key)) {
                seen.set(key, true);
                uniqueFormats.push(f);
            }
        }

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            author: info.uploader || info.creator || info.channel || 'Desconocido',
            platform,
            formats: uniqueFormats.slice(0, 15)
        });
    } catch (error) {
        console.error('[video-info]', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/quick-download', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });

        const validUrl = validateUrl(url);
        const platform = detectPlatform(validUrl);
        const cleanUrl = prepareUrl(validUrl, platform);

        console.log(`[quick-download] ${platform}: ${cleanUrl}`);

        const { filepath, filename } = await downloadVideo(platform, cleanUrl, null);

        res.download(filepath, filename, err => {
            if (err) console.error('[quick-download] envío:', err.message);
            cleanupFile(filepath);
        });
    } catch (error) {
        console.error('[quick-download]', error.message);
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

app.post('/api/download', async (req, res) => {
    try {
        const { url, format_id } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });

        if (format_id && !/^[\w.+\-]+$/.test(format_id)) {
            return res.status(400).json({ error: 'Formato inválido' });
        }

        const validUrl = validateUrl(url);
        const platform = detectPlatform(validUrl);
        const cleanUrl = prepareUrl(validUrl, platform);

        console.log(`[download] ${platform} format=${format_id || 'best'}: ${cleanUrl}`);

        const { filepath, filename } = await downloadVideo(platform, cleanUrl, format_id || null);

        res.download(filepath, filename, err => {
            if (err) console.error('[download] envío:', err.message);
            cleanupFile(filepath);
        });
    } catch (error) {
        console.error('[download]', error.message);
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

// ── Playlist / Collection ──────────────────────────────────────────────────

function sanitizeName(name) {
    return String(name || 'Coleccion')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/^\.+/, '')
        .slice(0, 80).trim() || 'Coleccion';
}

const QUALITY_FORMATS = {
    '2160': 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best',
    '1080': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '720':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]',
    '480':  'bestvideo[height<=480]+bestaudio/best[height<=480]',
    '360':  'bestvideo[height<=360]+bestaudio/best[height<=360]',
};

// Spawn yt-dlp and emit each output line to a callback (for progress parsing)
function spawnYtDlpStream(args, onLine, timeoutMs = 20 * 60 * 1000) {
    return new Promise((resolve, reject) => {
        const proc = spawn('yt-dlp', args);
        let buf = '', stderr = '';
        const flush = (data) => {
            buf += data.toString();
            const parts = buf.split('\n');
            buf = parts.pop();
            parts.forEach(l => onLine(l));
        };
        proc.stderr.on('data', d => { flush(d); stderr += d.toString(); });
        proc.stdout.on('data', d => flush(d));
        const timer = setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('Tiempo de espera agotado')); }, timeoutMs);
        proc.on('close', code => {
            clearTimeout(timer);
            if (buf) onLine(buf);
            if (code === 0) resolve();
            else reject(new Error(parseYtDlpError(stderr)));
        });
        proc.on('error', err => { clearTimeout(timer); reject(new Error(`yt-dlp no encontrado: ${err.message}`)); });
    });
}

// Active download jobs
const activeJobs = new Map();

function jobEmit(job, event, data) {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    job.log.push(chunk);
    job.clients.forEach(c => { try { c.write(chunk); } catch {} });
}

function resolveVideoUrl(entry) {
    if (entry.webpage_url?.startsWith('http')) return entry.webpage_url;
    if (entry.url?.startsWith('http')) return entry.url;
    if (entry.id) {
        const key = (entry.ie_key || '').toLowerCase();
        if (key.includes('tiktok')) return `https://www.tiktok.com/video/${entry.id}`;
        if (key.includes('instagram')) return `https://www.instagram.com/p/${entry.id}/`;
        return `https://www.youtube.com/watch?v=${entry.id}`;
    }
    return null;
}

async function runPlaylistJob(jobId, url, limit, formatStr, safeTitle) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    const playlistDir = path.join(DOWNLOADS_DIR, `playlist_${jobId}`);
    const zipPath    = path.join(DOWNLOADS_DIR, `playlist_${jobId}.zip`);

    try {
        fs.mkdirSync(playlistDir, { recursive: true });

        // 1. Get playlist entries
        jobEmit(job, 'status', { message: 'Obteniendo lista de videos...' });
        const infoOut = await spawnYtDlp(
            ['--flat-playlist', '--dump-single-json', '--no-warnings', '--ignore-errors', url],
            120000
        );
        const data = JSON.parse(infoOut.trim());
        const rawEntries = (data._type === 'playlist' || data.entries) ? (data.entries || []) : [data];
        const entries = rawEntries.filter(Boolean).slice(0, limit);

        if (!entries.length) throw new Error('No se encontraron videos en esta colección');

        if (!safeTitle || safeTitle === 'Coleccion') {
            safeTitle = sanitizeName(data.title || 'Coleccion');
            job.safeTitle = safeTitle;
        }

        jobEmit(job, 'playlist', {
            total: entries.length,
            title: data.title || 'Colección',
            videos: entries.map((e, i) => ({ index: i + 1, title: e.title || `Video ${i + 1}` }))
        });

        // 2. Download one by one
        let downloaded = 0;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const idx   = i + 1;
            const title = entry.title || `Video ${idx}`;
            const videoUrl = resolveVideoUrl(entry);

            if (!videoUrl) {
                jobEmit(job, 'video_error', { index: idx, title, error: 'URL no disponible' });
                continue;
            }

            jobEmit(job, 'video_start', { index: idx, total: entries.length, title });

            try {
                const out = path.join(playlistDir, `${String(idx).padStart(2, '0')}_%(title)s.%(ext)s`);
                await spawnYtDlpStream(
                    ['-f', formatStr, '--merge-output-format', 'mp4', '--no-warnings', '--restrict-filenames', '-o', out, videoUrl],
                    (line) => {
                        // "[download]  45.2% of 1.23GiB at 5.00MiB/s ETA 00:30"
                        const m = line.match(/\[download\]\s+([\d.]+)%(?:.*?at\s+(\S+))?(?:.*?ETA\s+(\S+))?/);
                        if (m) jobEmit(job, 'video_progress', { index: idx, percent: parseFloat(m[1]), speed: m[2] || null, eta: m[3] || null });
                    },
                    30 * 60 * 1000
                );
                downloaded++;
                jobEmit(job, 'video_done', { index: idx, title });
            } catch (err) {
                jobEmit(job, 'video_error', { index: idx, title, error: err.message });
            }
        }

        if (downloaded === 0) throw new Error('No se pudo descargar ningún video');

        // 3. Zip
        jobEmit(job, 'zip_start', { downloaded, total: entries.length });
        await new Promise((resolve, reject) => {
            const output  = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 0 } });
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(playlistDir, safeTitle);
            archive.finalize();
        });

        job.zipPath = zipPath;
        job.status  = 'done';
        jobEmit(job, 'done', { filename: `${safeTitle}.zip`, downloaded, total: entries.length });

    } catch (err) {
        console.error(`[job ${jobId}]`, err.message);
        job.status = 'error';
        jobEmit(job, 'job_error', { message: err.message });
    } finally {
        fs.rm(playlistDir, { recursive: true, force: true }, () => {});
        job.clients.forEach(c => { try { c.end(); } catch {} });
        job.clients = [];
        // Auto-clean after 1 h
        setTimeout(() => {
            const j = activeJobs.get(jobId);
            if (j?.zipPath) fs.unlink(j.zipPath, () => {});
            activeJobs.delete(jobId);
        }, 60 * 60 * 1000);
    }
}

app.post('/api/playlist-job', async (req, res) => {
    try {
        const { url, max_videos = 10, quality = 'best', playlist_title = '' } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });

        const validUrl  = validateUrl(url);
        const limit     = Math.min(Math.max(1, parseInt(max_videos) || 10), 50);
        const formatStr = QUALITY_FORMATS[String(quality)] || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
        const safeTitle = sanitizeName(playlist_title || 'Coleccion');
        const jobId     = crypto.randomBytes(8).toString('hex');

        activeJobs.set(jobId, { clients: [], log: [], status: 'running', zipPath: null, safeTitle });
        runPlaylistJob(jobId, validUrl, limit, formatStr, safeTitle); // fire & forget

        res.json({ jobId });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/playlist-progress/:jobId', (req, res) => {
    const job = activeJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    job.log.forEach(chunk => { try { res.write(chunk); } catch {} });
    if (job.status !== 'running') { res.end(); return; }

    job.clients.push(res);
    req.on('close', () => { job.clients = job.clients.filter(c => c !== res); });
});

app.get('/api/playlist-file/:jobId', (req, res) => {
    const job = activeJobs.get(req.params.jobId);
    if (!job?.zipPath || job.status !== 'done') return res.status(404).json({ error: 'Archivo no disponible' });
    res.download(job.zipPath, `${job.safeTitle}.zip`, err => {
        if (err) console.error('[playlist-file]', err.message);
    });
});

app.post('/api/playlist-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });

        const validUrl = validateUrl(url);
        console.log(`[playlist-info] ${validUrl}`);

        // --dump-single-json emits ONE JSON object (playlist or video), never mixed lines
        const stdout = await spawnYtDlp([
            '--flat-playlist',
            '--dump-single-json',
            '--no-warnings',
            '--ignore-errors',
            validUrl
        ], 120000);

        const data = JSON.parse(stdout.trim());

        // Playlist → data.entries array; single video → wrap it
        const rawEntries = (data._type === 'playlist' || data.entries)
            ? (data.entries || [])
            : [data];

        const entries = rawEntries.filter(Boolean);
        if (entries.length === 0) return res.status(400).json({ error: 'No se encontraron videos en esta colección' });

        const playlistTitle = data.title || data.playlist_title || 'Colección';

        res.json({
            count: entries.length,
            playlist_title: playlistTitle,
            entries: entries.slice(0, 50).map((e, i) => ({
                index: i + 1,
                id: e.id,
                title: e.title || 'Sin título',
                duration: e.duration || null,
                thumbnail: e.thumbnail || null,
            }))
        });
    } catch (error) {
        console.error('[playlist-info]', error.message);
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/health', (_req, res) => res.json({ status: 'OK' }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
    console.log(`📁 Descargas: ${DOWNLOADS_DIR}`);
});
