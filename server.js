const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(limiter);

// Validate YouTube URL
const isValidYouTubeUrl = (url) => {
  try {
    return url && (url.includes('youtube.com') || url.includes('youtu.be'));
  } catch (e) {
    return false;
  }
};

// Improved function with proper timeout handling
const getAudioInfoWithTimeout = async (url) => {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Request timeout after 10 seconds'));
    }, 10000);
  });

  try {
    const info = await Promise.race([
      ytdl.getInfo(url),
      timeoutPromise
    ]);
    clearTimeout(timeout);
    return info;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
};

// Audio endpoint with improved error handling
app.get('/audio', async (req, res) => {
  try {
    const url = req.query.url;
    
    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({ 
        error: 'Invalid YouTube URL',
        validFormats: [
          'https://www.youtube.com/watch?v=VIDEO_ID',
          'https://youtu.be/VIDEO_ID'
        ]
      });
    }

    // Validate video ID first
    let videoId;
    try {
      videoId = ytdl.getURLVideoID(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid YouTube video ID' });
    }

    // Get info with proper timeout handling
    const info = await getAudioInfoWithTimeout(url);

    const audioFormat = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });

    if (!audioFormat || !audioFormat.url) {
      throw new Error('No audio format available');
    }

    console.log('Successfully fetched audio URL for:', url);
    res.json({ 
      audioUrl: audioFormat.url,
      videoId,
      title: info.videoDetails.title,
      duration: info.videoDetails.lengthSeconds
    });

  } catch (error) {
    console.error('Audio fetch error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch audio',
      details: error.message,
      solution: 'Try again later or check the URL'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  } else {
    console.error('Server error:', error.message);
  }
  process.exit(1);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);