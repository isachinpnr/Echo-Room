const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3001;
const execPromise = util.promisify(exec);

// Initialize failedSongs as a Set to track failed URLs
const failedSongs = new Set();

app.use(cors());
app.use(express.json());

// Serve static files (if needed for frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Function to update yt-dlp
async function updateYtdlp() {
  try {
    await execPromise('yt-dlp --update');
    console.log('yt-dlp updated successfully');
  } catch (error) {
    console.error('Failed to update yt-dlp:', error.message);
  }
}

// Function to fetch audio URL with retries
async function fetchAudioUrl(videoUrl, retries = 3) {
  if (failedSongs.has(videoUrl)) {
    console.log(`Skipping ${videoUrl} as it previously failed`);
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const command = `yt-dlp --get-url --format bestaudio --no-cache-dir --no-playlist --no-progress --no-warnings --no-check-certificate "${videoUrl}"`;
      console.log(`Executing yt-dlp command: ${command}`);
      const { stdout } = await execPromise(command);
      const audioUrl = stdout.trim();
      if (audioUrl) {
        console.log(`Fetched audio URL: ${audioUrl}`);
        return audioUrl;
      }
    } catch (error) {
      console.error(`Retry (${attempt}/${retries}) failed for URL ${videoUrl}: ${error.message}`);
      if (attempt === retries) {
        console.error(`All retries failed for ${videoUrl}`);
        failedSongs.add(videoUrl);
        return null;
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return null;
}

// Endpoint to fetch audio URL
app.get('/audio', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.includes('youtube.com')) {
    return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
  }

  try {
    // Ensure yt-dlp is updated
    await updateYtdlp();

    const audioUrl = await fetchAudioUrl(url);
    if (audioUrl) {
      res.json({ audioUrl });
    } else {
      res.status(500).json({ error: 'Failed to fetch audio URL after retries' });
    }
  } catch (error) {
    console.error('Error in /audio endpoint:', error.message);
    res.status(500).json({ error: 'Server error while fetching audio URL' });
  }
});

// Endpoint to clear failed songs (optional, for debugging)
app.post('/clear-failed', (req, res) => {
  failedSongs.clear();
  console.log('Cleared failedSongs Set');
  res.json({ message: 'Failed songs cleared' });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});