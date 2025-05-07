// src/utils/music.js
import { db } from '../firebase';
import { doc, updateDoc, onSnapshot, arrayUnion } from 'firebase/firestore';

export const playSong = async (roomDocId, song) => {
  try {
    if (!song.url.includes('youtube.com')) {
      throw new Error('Invalid YouTube URL');
    }
    const roomRef = doc(db, 'rooms', roomDocId);
    await updateDoc(roomRef, {
      currentSong: {
        url: song.url,
        title: song.title,
        channel: song.channel || 'Unknown Channel',
        thumbnail: song.thumbnail || '',
        addedBy: song.addedBy,
        addedAt: new Date(),
      },
      songHistory: arrayUnion({
        url: song.url,
        title: song.title,
        channel: song.channel || 'Unknown Channel',
        thumbnail: song.thumbnail || '',
        addedBy: song.addedBy,
        addedAt: new Date(),
      }),
    });
    console.log('Playing song:', song.title, 'in room:', roomDocId);
  } catch (error) {
    console.error('Play Song Error:', error.message);
    throw error;
  }
};

export const addToQueue = async (roomDocId, song) => {
  try {
    if (!song.url.includes('youtube.com')) {
      throw new Error('Invalid YouTube URL');
    }
    const roomRef = doc(db, 'rooms', roomDocId);
    await updateDoc(roomRef, {
      songQueue: arrayUnion({
        url: song.url,
        title: song.title,
        channel: song.channel || 'Unknown Channel',
        thumbnail: song.thumbnail || '',
        addedBy: song.addedBy,
        addedAt: new Date(),
      }),
    });
    console.log('Added to queue:', song.title, 'in room:', roomDocId);
  } catch (error) {
    console.error('Add to Queue Error:', error.message);
    throw error;
  }
};

export const listenForMusic = (roomDocId, callback) => {
  try {
    const roomRef = doc(db, 'rooms', roomDocId);
    const unsubscribe = onSnapshot(roomRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const musicState = {
          currentSong: data.currentSong || null,
          songQueue: data.songQueue || [],
          songHistory: data.songHistory || [],
        };
        console.log('Music state updated for room:', roomDocId, musicState);
        callback(musicState);
      } else {
        console.error('Room not found:', roomDocId);
        callback({ currentSong: null, songQueue: [], songHistory: [] });
      }
    }, (error) => {
      console.error('Listen Music Error:', error.message);
      callback({ currentSong: null, songQueue: [], songHistory: [] });
    });
    return unsubscribe;
  } catch (error) {
    console.error('Listen Music Setup Error:', error.message);
    callback({ currentSong: null, songQueue: [], songHistory: [] });
    return () => {};
  }
};

export const searchTracks = async (query) => {
  try {
    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
        query
      )}&type=video&videoCategoryId=10&maxResults=10&key=${apiKey}`
    );
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const tracks = data.items.map((item) => ({
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.default.url,
    }));
    console.log('Fetched YouTube tracks:', tracks);
    return tracks;
  } catch (error) {
    console.error('Search Tracks Error:', error.message);
    throw error;
  }
};

export const getAudioOnlyUrl = async (songUrl) => {
  try {
    console.log('Fetching audio for YouTube URL:', songUrl);
    const response = await fetch(`http://localhost:3001/audio?url=${encodeURIComponent(songUrl)}`);
    if (!response.ok) throw new Error('Failed to fetch audio');
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    console.log('Audio stream URL:', data.audioUrl);
    return data.audioUrl;
  } catch (error) {
    console.error('Get Audio URL Error:', error.message);
    return 'https://samplelib.com/lib/preview/mp3/sample-15s.mp3';
  }
};