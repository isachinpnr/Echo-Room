import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoom } from '../utils/rooms';
import { sendMessage, listenForMessages } from '../utils/chat';
import { playSong, addToQueue, listenForMusic, searchTracks } from '../utils/music';
import { updatePresence, listenForPresence } from '../utils/presence';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';

function Room({ user }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [musicState, setMusicState] = useState({ currentSong: null, songQueue: [], songHistory: [] });
  const [isAudioOnly, setIsAudioOnly] = useState(true);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const [presence, setPresence] = useState({});
  const chatContainerRef = useRef(null);
  const audioRef = useRef(null);
  const fetchTimeoutRef = useRef(null);


  // Debugging useEffect - add this temporarily
  useEffect(() => {
    console.log("Current room state:", room);
    console.log("Current error state:", error);
  }, [room, error]);

  // Simplified room loading with proper error handling
  useEffect(() => {
    let unsubscribe;

    const loadRoom = async () => {
      try {
        // First try to get room directly
        const roomData = await getRoom(roomId);
        console.log("Initial room data:", roomData);

        if (!roomData) {
          throw new Error("Room not found");
        }

        setRoom(roomData);
        setError(null);

        // Then set up realtime listener
        unsubscribe = onSnapshot(doc(db, 'rooms', roomId),
          (doc) => {
            if (doc.exists()) {
              console.log("Room snapshot:", doc.data());
              setRoom({ id: doc.id, ...doc.data() });
            } else {
              setError("Room no longer exists");
              setRoom(null);
            }
          },
          (err) => {
            console.error("Snapshot error:", err);
            setError("Failed to listen for room updates");
          }
        );

      } catch (err) {
        console.error("Room load error:", err.message);
        setError(err.message);
        setRoom(null);
      }
    };

    loadRoom();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [roomId]);

  // Rest of your component remains the same...
  // [Keep all your existing JSX and other useEffects]
  // Extract YouTube video ID
  const getVideoId = (url) => {
    try {
      if (!url) return '';
      const urlObj = new URL(url);
      let videoId = urlObj.searchParams.get('v');
      if (!videoId && urlObj.hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.split('/').pop();
      }
      console.log('Extracted video ID:', videoId || 'None');
      return videoId || '';
    } catch (err) {
      console.error('Invalid URL format:', err.message);
      return '';
    }
  };

  // Fetch audio-only URL from backend with retry
  // Replace the getAudioOnlyUrl function with this optimized version
  const getAudioOnlyUrl = useCallback(async (url, retries = 2) => {
    if (!url) return '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(`http://localhost:3001/audio?url=${encodeURIComponent(url)}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      if (!data.audioUrl) throw new Error('No audio URL returned');
      return data.audioUrl;
    } catch (err) {
      clearTimeout(timeoutId);
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return getAudioOnlyUrl(url, retries - 1);
      }
      setError(`Audio failed: ${err.message}. Try another song or refresh.`);
      return '';
    }
  }, []);

  // Update the audio playback useEffect
  useEffect(() => {
    if (!audioRef.current || !musicState.currentSong || !isAudioOnly) return;

    const controller = new AbortController();
    let isMounted = true;

    const loadAudio = async () => {
      try {
        const audioUrl = await getAudioOnlyUrl(musicState.currentSong.url);
        if (!isMounted || !audioRef.current) return;

        audioRef.current.src = audioUrl;
        audioRef.current.load();

        const playPromise = audioRef.current.play();
        await playPromise.catch(err => {
          if (!isMounted) return;
          console.error('Autoplay error:', err.message);
          setError('Autoplay blocked. Click "Play Audio" or try another song.');
        });
      } catch (err) {
        if (!isMounted) return;
        console.error('Audio load error:', err.message);
      }
    };

    loadAudio();

    return () => {
      isMounted = false;
      controller.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.removeAttribute('src');
      }
    };
  }, [musicState.currentSong, isAudioOnly, getAudioOnlyUrl]);
  // Listen for messages
  useEffect(() => {
    if (!room) return;
    const unsubscribe = listenForMessages(room.id, (fetchedMessages) => {
      setMessages(fetchedMessages);
    });
    return () => unsubscribe();
  }, [room]);

  // Listen for music updates
  useEffect(() => {
    if (!room) return;
    const unsubscribe = listenForMusic(room.id, (fetchedMusicState) => {
      setMusicState(fetchedMusicState);
      console.log('Room.jsx: Music state set:', fetchedMusicState);
    });
    return () => unsubscribe();
  }, [room]);

  // Listen for presence updates
  useEffect(() => {
    if (!room) return;
    const unsubscribe = listenForPresence(room.id, (fetchedPresence) => {
      setPresence(fetchedPresence);
    });
    return () => unsubscribe();
  }, [room]);

  // Update user presence
  useEffect(() => {
    if (!room) return;
    const update = async () => {
      try {
        await updatePresence(room.id, user.uid, 'online');
      } catch (err) {
        console.error('Presence update error:', err.message);
      }
    };
    update();

    const interval = setInterval(update, 30000);
    window.addEventListener('beforeunload', () =>
      updatePresence(room.id, user.uid, 'offline')
    );

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', () =>
        updatePresence(room.id, user.uid, 'offline')
      );
      updatePresence(room.id, user.uid, 'offline');
    };
  }, [room, user.uid]);

  // Progress bar
  useEffect(() => {
    if (!musicState.currentSong || !audioRef.current) return;
    const updateProgress = () => {
      if (audioRef.current) {
        const current = audioRef.current.currentTime;
        const duration = audioRef.current.duration || 15;
        setProgress((current / duration) * 100);
      }
    };
    audioRef.current.addEventListener('timeupdate', updateProgress);
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('timeupdate', updateProgress);
      }
    };
  }, [musicState.currentSong]);

  // Auto-play next song in queue
  useEffect(() => {
    if (!musicState.currentSong || !audioRef.current) return;
    const handleEnded = async () => {
      if (musicState.songQueue.length > 0) {
        const nextSong = musicState.songQueue[0];
        await playSong(room.id, nextSong);
        const roomRef = doc(db, 'rooms', room.id);
        await updateDoc(roomRef, {
          songQueue: musicState.songQueue.slice(1),
        });
      }
    };
    audioRef.current.addEventListener('ended', handleEnded);
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('ended', handleEnded);
      }
    };
  }, [musicState.currentSong, musicState.songQueue, room]);

  // Audio playback logic with cleanup
  useEffect(() => {
    if (!audioRef.current || !musicState.currentSong || !isAudioOnly) return;

    const loadAudio = async () => {
      // Cancel previous fetch
      if (fetchTimeoutRef.current) {
        fetchTimeoutRef.current.abort();
      }

      const controller = new AbortController();
      fetchTimeoutRef.current = controller;

      try {
        const audioUrl = await getAudioOnlyUrl(musicState.currentSong.url);
        if (audioUrl && audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.load(); // Force reload to clear stale URLs
          audioRef.current
            .play()
            .catch((err) => {
              console.error('Autoplay error:', err.message);
              setError('Autoplay blocked. "Play Audio" button daba ya doosra gaana try kar.');
            });
        }
      } catch (err) {
        console.error('Audio load error:', err.message);
      }
    };

    loadAudio();

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.removeAttribute('src');
      }
      if (fetchTimeoutRef.current) {
        fetchTimeoutRef.current.abort();
      }
    };
  }, [musicState.currentSong, isAudioOnly]);

  // Volume control
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      console.log('Volume set to:', volume);
    }
  }, [volume]);

  // Limit song history
  useEffect(() => {
    if (musicState.songHistory?.length > 10) {
      const roomRef = doc(db, 'rooms', room.id);
      updateDoc(roomRef, {
        songHistory: musicState.songHistory.slice(-10),
      });
    }
  }, [musicState.songHistory, room]);

  // Search tracks
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }
    const fetchTracks = async () => {
      try {
        const tracks = await searchTracks(searchQuery);
        setSearchResults(tracks);
        console.log('Room.jsx: Search results set:', tracks);
      } catch (err) {
        setError(err.message);
      }
    };
    const timeout = setTimeout(fetchTracks, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !room) return;

    try {
      await sendMessage(room.id, user, messageText);
      setMessageText('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePlaySong = async (track) => {
    try {
      console.log('Room.jsx: Attempting to play song:', track);
      await playSong(room.id, {
        url: track.url,
        title: track.title,
        channel: track.channel,
        thumbnail: track.thumbnail,
        addedBy: user.uid,
      });
      setSearchResults([]);
      setSearchQuery('');
      console.log('Room.jsx: Played song:', track.title);
    } catch (err) {
      setError(err.message);
      console.error('Room.jsx: Play song error:', err.message);
    }
  };

  const handleAddToQueue = async (track) => {
    try {
      await addToQueue(room.id, {
        url: track.url,
        title: track.title,
        channel: track.channel,
        thumbnail: track.thumbnail,
        addedBy: user.uid,
      });
      setSearchResults([]);
      setSearchQuery('');
      console.log('Room.jsx: Added to queue:', track.title);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleAudioOnly = () => {
    setIsAudioOnly((prev) => !prev);
    console.log('Toggled audio-only mode:', !isAudioOnly);
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    alert('Invite link copied to clipboard!');
  };

  // Manual play button handler
  const handleManualPlay = () => {
    if (audioRef.current && isAudioOnly) {
      audioRef.current
        .play()
        .catch((err) => {
          console.error('Manual play error:', err.message);
          setError('Play failed. Doosra gaana try kar ya browser refresh kar.');
        });
    }
  };

  console.log('Room.jsx: Current room state:', room);
  console.log('Room.jsx: Current error state:', error);
  console.log('Room.jsx: Current messages state:', messages);
  console.log('Room.jsx: Current music state:', musicState);
  console.log('Room.jsx: Current search results:', searchResults);
  console.log('Room.jsx: Audio-only mode:', isAudioOnly);
  console.log('Room.jsx: Current presence:', presence);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-300 via-purple-300 to-red-300 animate-gradient-x flex items-center justify-center">
        <p className="text-red-500 text-xl font-bold">{error}</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-300 via-purple-300 to-red-300 animate-gradient-x flex items-center justify-center">
        <p className="text-gray-700 text-xl font-bold animate-pulse">Loading room...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-300 via-purple-300 to-red-300 animate-gradient-x p-8">
      <style>
        {`
          @keyframes gradient-x {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animate-gradient-x {
            background-size: 200% 200%;
            animation: gradient-x 15s ease infinite;
          }
        `}
      </style>
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-purple-700 to-red-700 drop-shadow-lg animate-pulse">
          Room: {room.name}
        </h1>
        <div className="flex space-x-4">
          <button
            onClick={copyInviteLink}
            className="bg-gradient-to-r from-green-600 to-green-800 text-white px-6 py-3 rounded-full shadow-xl hover:from-green-700 hover:to-green-900 transition-all duration-300 transform hover:scale-110 hover:shadow-2xl"
          >
            Copy Invite Link
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-full shadow-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 transform hover:scale-110 hover:shadow-2xl"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="flex space-x-8">
        <div className="w-1/3">
          <div className="bg-white bg-opacity-85 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 mb-5">Now Playing</h2>
            {musicState.currentSong ? (
              <div className="space-y-5">
                <div className="bg-gradient-to-r from-blue-700 via-purple-700 to-red-700 p-6 rounded-2xl shadow-lg transform hover:scale-102 transition-all duration-300">
                  <div className="flex items-center space-x-4">
                    <img
                      src={musicState.currentSong.thumbnail || 'https://via.placeholder.com/120'}
                      alt="Cover art"
                      className="w-20 h-20 rounded-lg object-cover shadow-md"
                    />
                    <div className="flex-1">
                      <p className="text-white text-lg font-semibold truncate">
                        {musicState.currentSong.title}
                      </p>
                      <p className="text-gray-200 text-sm truncate">
                        {musicState.currentSong.channel}
                      </p>
                    </div>
                  </div>
                  {isAudioOnly ? (
                    <div className="relative mt-4">
                      <audio
                        ref={audioRef}
                        controls
                        className="w-full rounded-lg bg-gray-900 bg-opacity-50"
                      ></audio>
                      <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <div className="flex items-center mt-2">
                        <svg
                          className="w-5 h-5 text-gray-300 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5.586 15H3a1 1 0 01-1-1v-4a1 1 0 011-1h2.586l4-4A1 1 0 0111 6v12a1 1 0 01-1.414.586l-4-4z"
                          />
                        </svg>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={volume}
                          onChange={(e) => setVolume(e.target.value)}
                          className="w-full h-1 bg-gray-700 rounded-full"
                        />
                      </div>
                      <button
                        onClick={handleManualPlay}
                        className="mt-2 w-full bg-gradient-to-r from-green-600 to-green-800 text-white py-2 rounded-full text-base font-medium hover:from-green-700 hover:to-green-900 transition-all duration-300"
                      >
                        Play Audio
                      </button>
                      <p className="text-xs text-gray-300 mt-1">Audio Mode</p>
                    </div>
                  ) : musicState.currentSong && getVideoId(musicState.currentSong.url) ? (
                    <div className="relative mt-4">
                      <iframe
                        width="100%"
                        height="100"
                        src={`https://www.youtube.com/embed/${getVideoId(musicState.currentSong.url)}?autoplay=1`}
                        frameBorder="0"
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                        className="rounded-lg"
                      ></iframe>
                      <p className="text-xs text-gray-300 mt-1">Video Mode</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-base mt-4">No video available</p>
                  )}
                </div>
                <button
                  onClick={toggleAudioOnly}
                  className="w-full bg-gradient-to-r from-purple-600 to-red-600 text-white py-3 rounded-full text-base font-medium hover:from-purple-700 hover:to-red-700 transition-all duration-300 flex items-center justify-center gap-3 transform hover:scale-105 hover:shadow-xl"
                >
                  {isAudioOnly ? (
                    <>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542-7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Switch to Video
                    </>
                  ) : (
                    <>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      Switch to Audio
                    </>
                  )}
                </button>
              </div>
            ) : (
              <p className="text-gray-500 text-base">No song playing</p>
            )}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Search Songs</h3>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search YouTube Music..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full border border-gray-300 p-4 pl-12 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50 text-base transition-all duration-200 shadow-sm"
                />
                <svg
                  className="absolute left-4 top-4 w-6 h-6 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              {searchResults.length > 0 && (
                <ul className="mt-4 max-h-64 overflow-y-auto border border-gray-200 rounded-2xl bg-white shadow-xl backdrop-blur-sm">
                  {searchResults.map((track, index) => (
                    <li
                      key={index}
                      className="p-4 text-base text-gray-700 hover:bg-blue-100 cursor-pointer transition-all duration-200 flex items-center space-x-3 transform hover:scale-102"
                    >
                      <img
                        src={track.thumbnail || 'https://via.placeholder.com/40'}
                        alt="Thumbnail"
                        className="w-10 h-10 rounded-md object-cover"
                      />
                      <div className="flex-1 truncate">
                        <span className="font-medium">{track.title}</span>
                        <span className="text-gray-500"> - {track.channel}</span>
                      </div>
                      <button
                        onClick={() => handlePlaySong(track)}
                        className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-all duration-200 transform hover:scale-110"
                      >
                        <svg
                          className="w-5 h-5 text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M14.752 11.168l-3.197-2.2A1 1 0 0010 9.768v4.464a1 1 0 001.555.832l3.197-2.2a1 1 0 000-1.664z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleAddToQueue(track)}
                        className="p-2 rounded-full bg-green-100 hover:bg-green-200 transition-all duration-200 transform hover:scale-110"
                      >
                        <svg
                          className="w-5 h-5 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {musicState.songQueue.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Song Queue</h3>
                <ul className="space-y-3 max-h-48 overflow-y-auto">
                  {musicState.songQueue.map((song, index) => (
                    <li
                      key={index}
                      className="flex items-center space-x-3 text-base text-gray-700 bg-gray-50 p-3 rounded-lg hover:bg-blue-50 transition-all duration-200"
                    >
                      <img
                        src={song.thumbnail || 'https://via.placeholder.com/40'}
                        alt="Thumbnail"
                        className="w-8 h-8 rounded-md object-cover"
                      />
                      <div className="flex-1 truncate">
                        <span className="font-medium">{song.title}</span>
                        <span className="text-gray-500"> - {song.channel}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {musicState.songHistory.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Song History</h3>
                <ul className="space-y-3 max-h-48 overflow-y-auto">
                  {musicState.songHistory.map((song, index) => (
                    <li
                      key={index}
                      className="flex items-center space-x-3 text-base text-gray-700 bg-gray-50 p-3 rounded-lg hover:bg-blue-50 transition-all duration-200"
                    >
                      <img
                        src={song.thumbnail || 'https://via.placeholder.com/40'}
                        alt="Thumbnail"
                        className="w-8 h-8 rounded-md object-cover"
                      />
                      <div className="flex-1 truncate">
                        <span className="font-medium">{song.title}</span>
                        <span className="text-gray-500"> - {song.channel}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="w-2/3">
          <div className="bg-white bg-opacity-85 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 mb-5">Live Chat</h2>
            <div
              ref={chatContainerRef}
              className="h-80 overflow-y-auto border border-gray-200 p-4 mb-5 rounded-2xl bg-gray-50 scroll-smooth"
            >
              {messages.length === 0 && (
                <p className="text-gray-500 text-base">No messages yet. Start the conversation!</p>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`mb-4 ${message.senderId === user.uid ? 'text-right' : 'text-left'
                    }`}
                >
                  <p className="text-xs text-gray-600 font-medium">
                    {message.senderName} •{' '}
                    {new Date(message.createdAt.seconds * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p
                    className={`inline-block p-4 rounded-xl text-base shadow-md border border-gray-100 ${message.senderId === user.uid
                      ? 'bg-gradient-to-r from-blue-700 to-purple-700 text-white'
                      : 'bg-gray-100 text-gray-800'
                      }`}
                  >
                    {message.text}
                  </p>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="flex space-x-4">
              <input
                type="text"
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="w-full border border-gray-300 p-4 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-600 bg-gray-50 text-base transition-all duration-200 shadow-sm"
              />
              <button
                type="submit"
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-full shadow-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 transform hover:scale-110 hover:shadow-2xl"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div className="bg-white bg-opacity-85 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800 mb-5">Users in Room</h2>
          <ul className="space-y-4">
            {room.users.map((userId) => (
              <li key={userId} className="flex items-center text-base text-gray-700">
                <span
                  className={`w-4 h-4 rounded-full mr-3 ${presence[userId]?.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                    } shadow-md`}
                ></span>
                {userId === user.uid ? user.displayName || user.email : `User ${userId.slice(0, 8)}`}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Room;