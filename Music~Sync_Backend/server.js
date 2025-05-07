const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json());

// Process management
const activeProcesses = new Set();

// Cleanup function
const cleanupProcesses = () => {
  console.log('Cleaning up child processes...');
  activeProcesses.forEach(process => {
    try {
      process.kill('SIGTERM');
    } catch (err) {
      console.error('Error killing process:', err);
    }
  });
  activeProcesses.clear();
};

// Process cleanup handlers
process.on('exit', cleanupProcesses);
process.on('SIGINT', cleanupProcesses);
process.on('SIGTERM', cleanupProcesses);

// Improved yt-dlp wrapper with strict resource control
const getAudioUrl = async (url, timeout = 10000) => {
  const controller = new AbortController();
  const { signal } = controller;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const command = `yt-dlp --get-url --format "bestaudio[ext=m4a]" --no-cache-dir --no-playlist --no-warnings "${url}"`;
    const childProcess = exec(command, { signal });

    activeProcesses.add(childProcess);

    const { stdout, stderr } = await execPromise(command, {
      timeout,
      signal
    });

    clearTimeout(timeoutId);
    activeProcesses.delete(childProcess);

    const audioUrl = stdout.trim();
    if (!audioUrl || !audioUrl.startsWith('http')) {
      throw new Error('Invalid audio URL returned');
    }
    return audioUrl;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Audio endpoint with improved error handling
app.get('/audio', async (req, res) => {
  const { url } = req.query;

  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
  }

  try {
    const audioUrl = await getAudioUrl(url);
    res.json({ audioUrl });
  } catch (error) {
    console.error(`Error fetching audio for ${url}: ${error.message}`);
    res.status(500).json({
      error: 'Could not fetch audio',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    activeProcesses: activeProcesses.size
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. Try a different port.`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

// Error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  cleanupProcesses();
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  cleanupProcesses();
  process.exit(1);
});

// Add this to your server.js
app.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});