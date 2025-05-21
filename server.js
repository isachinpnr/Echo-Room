const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/audio', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    const info = await ytdl.getInfo(url);
    const audioFormat = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });
    console.log('Audio stream URL:', audioFormat.url);
    res.json({ audioUrl: audioFormat.url });
  } catch (error) {
    console.error('Server Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch audio' });
  }
});

app.listen(3001, () => console.log('Proxy server running on port 3001'));