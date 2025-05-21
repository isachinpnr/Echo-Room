import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoom } from '../utils/rooms';
import { sendMessage, listenForMessages } from '../utils/chat';
import { playSong, addToQueue, listenForMusic, searchTracks } from '../utils/music';
import { updatePresence, listenForPresence, cleanupPresence } from '../utils/presence';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, getDoc, setDoc, arrayUnion, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import YouTube from 'react-youtube';
import debounce from 'lodash.debounce';
import toast from 'react-hot-toast';
import { getUsername } from '../utils/users';

function Room({ user }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [playerError, setPlayerError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [musicState, setMusicState] = useState({ currentSong: null, songQueue: [], songHistory: [] });
  const [presence, setPresence] = useState({});
  const [videoQuality, setVideoQuality] = useState('auto');
  const [trendingSongs, setTrendingSongs] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isChangingQuality, setIsChangingQuality] = useState(false);
  const chatContainerRef = useRef(null);
  const playerRef = useRef(null);
  const listenersRef = useRef({});

  // Set trending songs
  useEffect(() => {
    setTrendingSongs([
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        channel: 'Rick Astley',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
      },
      {
        url: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
        title: 'Gangnam Style',
        channel: 'PSY',
        thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/default.jpg',
      },
    ]);
  }, []);

  // Extract YouTube video ID
  const getVideoId = (url) => {
    try {
      if (!url || typeof url !== 'string') {
        console.error('Invalid URL: URL is empty or not a string');
        toast.error('Invalid video URL');
        return '';
      }
      const urlObj = new URL(url);
      let videoId = urlObj.searchParams.get('v');
      if (!videoId && urlObj.hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.split('/').pop().split('?')[0];
      }
      if (!videoId || videoId.length !== 11) {
        console.error('Invalid video ID extracted:', videoId);
        toast.error('Invalid video ID');
        return '';
      }
      console.log('Extracted video ID:', videoId);
      return videoId;
    } catch (err) {
      console.error('getVideoId error:', err.message);
      toast.error('Failed to parse video URL');
      return '';
    }
  };

  // Fetch room data
  useEffect(() => {
    if (!roomId) {
      setError('Room ID galat hai.');
      toast.error('Room ID galat hai.');
      return;
    }

    let unsubscribe = null;
    const fetchRoom = async () => {
      try {
        const roomData = await getRoom(roomId);
        if (!roomData) {
          setError('Room nahi mila.');
          toast.error('Room nahi mila.');
          return;
        }
        setRoom(roomData);
        setError(null);

        const roomsRef = collection(db, 'rooms');
        const q = query(roomsRef, where('roomId', '==', roomId));
        unsubscribe = onSnapshot(q, (snapshot) => {
          if (snapshot.empty) {
            setError('Room nahi mila.');
            toast.error('Room nahi mila.');
            setRoom(null);
          } else {
            const roomDoc = snapshot.docs[0];
            const roomData = { id: roomDoc.id, ...roomDoc.data() };
            setRoom(roomData);
            setError(null);
            console.log('Room updated:', roomData);
          }
        }, (err) => {
          console.error('Room fetch error:', err.message, err.code);
          if (err.code === 'permission-denied') {
            setError('Room access karne ki permission nahi hai. Login check karo.');
            toast.error('Room access karne ki permission nahi hai. Login check karo.');
          } else {
            setError('Room fetch karne mein error.');
            toast.error('Room fetch karne mein error.');
          }
        });
      } catch (err) {
        console.error('Room fetch error:', err.message, err.code);
        if (err.code === 'permission-denied') {
          setError('Room access karne ki permission nahi hai. Login check karo.');
          toast.error('Room access karne ki permission nahi hai. Login check karo.');
        } else {
          setError('Room load karne mein error.');
          toast.error('Room load karne mein error.');
        }
      }
    };

    fetchRoom();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [roomId]);

  // Clean up old messages
  useEffect(() => {
    if (!room?.id) return;

    const cleanupMessages = async () => {
      try {
        const messagesRef = collection(db, 'rooms', room.id, 'messages');
        const oneHourAgo = Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000));
        const q = query(messagesRef, where('createdAt', '<', oneHourAgo));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        console.log(`Deleted ${deletePromises.length} old messages`);
      } catch (err) {
        console.error('Cleanup messages error:', err.message);
        // Suppress toast to avoid spamming users
      }
    };

    // Run immediately on mount
    cleanupMessages();
    // Run every 30 seconds
    const interval = setInterval(cleanupMessages, 30 * 1000);
    return () => clearInterval(interval);
  }, [room?.id]);

  // Fetch user favorites
  useEffect(() => {
    if (!user?.uid) return;

    const playlistRef = doc(db, 'playlists', user.uid);
    const unsubscribe = onSnapshot(playlistRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setFavorites(data.favorites || []);
      } else {
        setFavorites([]);
      }
    }, (err) => {
      console.error('Favorites listener error:', err.message, err.code);
      setError('Failed to load favorites.');
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Listen for chat messages
  useEffect(() => {
    if (!room?.id) return;
    if (listenersRef.current.messages) listenersRef.current.messages();

    const unsubscribe = listenForMessages(room.id, (fetchedMessages) => {
      setMessages((prev) => {
        const firestoreMessages = fetchedMessages.map((fm) => ({
          id: fm.id,
          text: fm.text || '[Blank Message]',
          senderId: fm.senderId,
          senderName: fm.senderName,
          createdAt: fm.createdAt instanceof Timestamp ? fm.createdAt.toDate() : new Date(fm.createdAt || Date.now()),
          isLocal: false,
        }));

        const seenIds = new Set(prev.map((m) => m.id));
        const newMessages = firestoreMessages.filter((m) => !seenIds.has(m.id));
        const updatedMessages = [...prev, ...newMessages].sort(
          (a, b) => (a.createdAt.getTime() || 0) - (b.createdAt.getTime() || 0)
        );

        return updatedMessages;
      });
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }
      }, 100);
    });
    listenersRef.current.messages = unsubscribe;

    return () => {
      if (listenersRef.current.messages) {
        listenersRef.current.messages();
        delete listenersRef.current.messages;
      }
    };
  }, [room?.id]);

  // Listen for music state
  useEffect(() => {
    if (!room?.id) return;
    if (listenersRef.current.music) listenersRef.current.music();

    const unsubscribe = listenForMusic(room.id, (fetchedMusicState) => {
      setMusicState(fetchedMusicState);
    });
    listenersRef.current.music = unsubscribe;

    return () => {
      if (listenersRef.current.music) {
        listenersRef.current.music();
        delete listenersRef.current.music;
      }
    };
  }, [room?.id]);

  // Update user presence
  useEffect(() => {
    if (!room?.id || !user?.uid) return;

    const update = async () => {
      try {
        const username = await getUsername(user.uid);
        const displayName = username || user.displayName || user.email.split('@')[0];
        await updatePresence(room.id, user.uid, 'online', displayName);
      } catch (err) {
        console.error('Presence update error:', err.message);
      }
    };
    update();

    const interval = setInterval(update, 10000);
    const handleUnload = async () => {
      try {
        await cleanupPresence(room.id, user.uid);
      } catch (err) {
        console.error('Presence cleanup error:', err.message);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      cleanupPresence(room.id, user.uid).catch(err => {
        console.error('Presence cleanup error:', err.message);
      });
    };
  }, [room?.id, user?.uid]);

  // Listen for user presence
  useEffect(() => {
    if (!room?.id) return;
    if (listenersRef.current.presence) listenersRef.current.presence();

    const unsubscribe = listenForPresence(room.id, (fetchedPresence) => {
      setPresence(fetchedPresence);
      console.log('Presence state updated:', fetchedPresence);
    });
    listenersRef.current.presence = unsubscribe;

    return () => {
      if (listenersRef.current.presence) {
        listenersRef.current.presence();
        delete listenersRef.current.presence;
      }
    };
  }, [room?.id]);

  // Handle YouTube player state change
  const handleStateChange = async (event) => {
    if (event.data === 0 && musicState.songQueue.length > 0) {
      try {
        const nextSong = musicState.songQueue[0];
        const roomRef = doc(db, 'rooms', room.id);
        await Promise.all([
          playSong(room.id, nextSong),
          updateDoc(roomRef, {
            songQueue: musicState.songQueue.slice(1),
          }),
        ]);
      } catch (err) {
        console.error('Error playing next song:', err.message, err.code);
        setError('Failed to play next song.');
        toast.error('Failed to play next song.');
      }
    }
  };

  // Trim song history
  useEffect(() => {
    if (musicState.songHistory?.length > 10 && room?.id) {
      const roomRef = doc(db, 'rooms', room.id);
      updateDoc(roomRef, {
        songHistory: musicState.songHistory.slice(-10),
      }).catch((err) => {
        console.error('Error updating song history:', err.message, err.code);
      });
    }
  }, [musicState.songHistory, room?.id]);

  // Handle search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }
    const debouncedSearch = debounce(async (query) => {
      try {
        const tracks = await searchTracks(query);
        setSearchResults(tracks);
      } catch (err) {
        console.error('Search error:', err.message, err.code);
        setError('Failed to search songs.');
        toast.error('Failed to search songs.');
      }
    }, 500);
    debouncedSearch(searchQuery);
    return () => debouncedSearch.cancel();
  }, [searchQuery]);

  // Initialize YouTube player
  const onPlayerReady = (event) => {
    playerRef.current = event.target;
    try {
      if (!playerRef.current) {
        throw new Error('Player reference is undefined');
      }
      setTimeout(() => {
        try {
          const availableQualities = playerRef.current.getAvailableQualityLevels();
          console.log('Available quality levels:', availableQualities);
          if (availableQualities.length === 0) {
            console.warn('No quality levels available, using default');
            playerRef.current.playVideo();
            setVideoQuality('auto');
            toast.success('Playing video in default quality');
            return;
          }
          if (playerRef.current.setPlaybackQuality && availableQualities.includes(videoQuality)) {
            playerRef.current.setPlaybackQuality(videoQuality);
          } else {
            console.warn('Quality not supported, falling back to auto');
            playerRef.current.setPlaybackQuality('auto');
            setVideoQuality('auto');
          }
          playerRef.current.playVideo();
          console.log('Player initialized with quality:', videoQuality);
          setPlayerError(null);
          toast.success(`Video quality set to ${videoQuality}`);
        } catch (err) {
          console.error('Set quality error:', err.message, err.stack);
          setPlayerError('Failed to set video quality. Playing in default mode.');
          toast.error('Failed to set video quality. Playing in default mode.');
          playerRef.current.playVideo();
        }
      }, 1500);
    } catch (err) {
      console.error('Player ready error:', err.message, err.stack);
      setPlayerError('Failed to initialize player.');
      toast.error('Failed to initialize player.');
    }
  };

  // Handle YouTube player errors
  const onPlayerError = (event) => {
    console.error('YouTube player error code:', event.data);
    const errorMessages = {
      2: 'Invalid video ID',
      5: 'HTML5 player error',
      100: 'Video not found',
      101: 'Video not allowed in embedded players',
      150: 'Video not allowed in embedded players',
    };
    const message = errorMessages[event.data] || 'Cannot play this video.';
    setPlayerError(message);
    toast.error(message);
  };

  // Change video quality with validation
  const handleQualityChange = async (quality, retryCount = 2) => {
    setIsChangingQuality(true);
    setVideoQuality(quality);
    if (playerRef.current) {
      try {
        const availableQualities = playerRef.current.getAvailableQualityLevels();
        console.log('Available qualities:', availableQualities);
        if (!availableQualities.includes(quality) && quality !== 'auto') {
          throw new Error(`Quality ${quality} not available for this video`);
        }
        if (playerRef.current.setPlaybackQuality) {
          playerRef.current.setPlaybackQuality(quality);
        }
        playerRef.current.playVideo();
        toast.success(`Quality set to ${quality}`);
        console.log('Quality changed to:', quality);
        setPlayerError(null);
      } catch (err) {
        console.error('Quality change error:', err.message, err.stack);
        if (retryCount > 0) {
          console.log(`Retrying quality change... Attempts left: ${retryCount}`);
          setTimeout(() => handleQualityChange(quality, retryCount - 1), 1000);
          return;
        }
        setPlayerError(`Failed to change video quality: ${err.message}. Using default quality.`);
        toast.error(`Failed to change quality: ${err.message}. Using default quality.`);
        if (playerRef.current) {
          playerRef.current.setPlaybackQuality('auto');
          playerRef.current.playVideo();
        }
      } finally {
        setIsChangingQuality(false);
      }
    } else {
      setPlayerError('Player not ready.');
      toast.error('Player not ready. Try again.');
      setIsChangingQuality(false);
    }
  };

  // Check if song is in favorites
  const isSongInFavorites = (song) => {
    return favorites.some(
      (fav) => fav.url === song.url && fav.title === song.title
    );
  };

  // Add song to favorites
  const addToFavorites = async (song) => {
    if (!user?.uid) {
      setError('Please log in to add songs to favorites.');
      toast.error('Please log in to add songs to favorites.');
      return;
    }
    if (!song?.url || !song?.title) {
      setError('Invalid song data.');
      toast.error('Invalid song data.');
      return;
    }
    if (isSongInFavorites(song)) {
      toast.error('This song is already in your favorites!');
      return;
    }

    try {
      const playlistRef = doc(db, 'playlists', user.uid);
      const playlistDoc = await getDoc(playlistRef);

      if (playlistDoc.exists()) {
        await updateDoc(playlistRef, {
          favorites: arrayUnion({
            url: song.url,
            title: song.title,
            channel: song.channel,
            thumbnail: song.thumbnail,
            addedAt: new Date(),
          }),
        });
      } else {
        await setDoc(playlistRef, {
          userId: user.uid,
          favorites: [{
            url: song.url,
            title: song.title,
            channel: song.channel,
            thumbnail: song.thumbnail,
            addedAt: new Date(),
          }],
          createdAt: new Date(),
        });
      }
      toast.success('Song added to Favorites!');
    } catch (err) {
      console.error('Error adding to favorites:', err.message, err.code);
      setError('Failed to add to favorites.');
      toast.error('Failed to add to favorites.');
    }
  };

  // Remove song from favorites
  const removeFromFavorites = async (song) => {
    if (!user?.uid) {
      setError('Please log in to manage favorites.');
      toast.error('Please log in to manage favorites.');
      return;
    }

    try {
      const playlistRef = doc(db, 'playlists', user.uid);
      const playlistDoc = await getDoc(playlistRef);
      if (playlistDoc.exists()) {
        const updatedFavorites = playlistDoc.data().favorites.filter(
          (fav) => fav.url !== song.url || fav.title !== song.title
        );
        await updateDoc(playlistRef, {
          favorites: updatedFavorites,
        });
        toast.success('Song removed from Favorites!');
      }
    } catch (err) {
      console.error('Error removing from favorites:', err.message, err.code);
      setError('Failed to remove from favorites.');
      toast.error('Failed to remove from favorites.');
    }
  };

  // Send chat message with retry logic
  const handleSendMessage = async (e, retryCount = 2) => {
    e.preventDefault();
    if (!messageText.trim()) {
      toast.error('Message khali nahi ho sakta.');
      return;
    }
    if (!room?.id || !user?.uid || !user?.email) {
      toast.error('Room ya user info galat hai.');
      return;
    }

    setIsSendingMessage(true);
    try {
      const messageDoc = await sendMessage(room.id, user, messageText);
      setMessages((prev) => {
        const newMessage = {
          id: messageDoc.id,
          text: messageText.trim(),
          senderId: user.uid,
          senderName: user.displayName || user.email.split('@')[0],
          createdAt: new Date(),
          isLocal: false,
        };
        if (prev.some((m) => m.id === messageDoc.id)) return prev;
        return [...prev, newMessage];
      });
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
      setMessageText('');
      toast.success('Message bhej diya!');
    } catch (err) {
      console.error('Message bhejne mein error:', err.message, err.code);
      toast.error(`Message bhejne mein fail: ${err.message}`);
      if (err.code === 'unavailable' && retryCount > 0) {
        setTimeout(() => handleSendMessage(e, retryCount - 1), 1000);
      }
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Play song
  const handlePlaySong = async (track, retryCount = 3) => {
    try {
      if (!room?.id) throw new Error('Room not loaded');
      await playSong(room.id, {
        url: track.url,
        title: track.title,
        channel: track.channel,
        thumbnail: track.thumbnail,
        addedBy: user.uid,
      });
      setSearchResults([]);
      setSearchQuery('');
      setPlayerError(null);
      toast.success(`Playing ${track.title}`);
    } catch (err) {
      console.error('Play song error:', err.message, err.code);
      if (retryCount > 0) {
        console.log(`Retrying playSong... Attempts left: ${retryCount}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return handlePlaySong(track, retryCount - 1);
      }
      setError('Failed to play song.');
      toast.error('Failed to play song.');
    }
  };

  // Add song to queue
  const handleAddToQueue = async (track) => {
    try {
      if (!room?.id) throw new Error('Room not loaded');
      await addToQueue(room.id, {
        url: track.url,
        title: track.title,
        channel: track.channel,
        thumbnail: track.thumbnail,
        addedBy: user.uid,
      });
      setSearchResults([]);
      setSearchQuery('');
      toast.success('Song added to queue!');
    } catch (err) {
      console.error('Add to queue error:', err.message, err.code);
      setError('Failed to add to queue.');
      toast.error('Failed to add to queue.');
    }
  };

  // Copy room invite link
  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied!');
  };

  // Render error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 animate-gradient-x flex items-center justify-center p-4">
        <div className="bg-white bg-opacity-90 backdrop-blur-lg p-6 rounded-2xl shadow-2xl w-full max-w-md">
          <p className="text-red-500 text-xl font-bold text-center">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 w-full shadow-md transform hover:scale-105"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Render loading state
  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 animate-gradient-x flex items-center justify-center p-4">
        <p className="text-gray-700 text-xl font-bold animate-pulse">Loading room...</p>
      </div>
    );
  }

  // Main UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 animate-gradient-x p-4 sm:p-6 relative overflow-hidden">
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
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .fade-in {
            animation: fadeIn 0.8s ease-out forwards;
          }
          @keyframes slideIn {
            from { opacity: 0; transform: translateX(-20px); }
            to { opacity: 1; transform: translateX(0); }
          }
          .slide-in {
            animation: slideIn 0.5s ease-out forwards;
          }
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
          .pulse {
            animation: pulse 2s infinite;
          }
          .neumorphic {
            background: rgba(255, 255, 255, 0.1);
            box-shadow: 6px 6px 12px rgba(0, 0, 0, 0.15), -6px -6px 12px rgba(255, 255, 255, 0.2);
            border-radius: 16px;
          }
          .glassmorphic {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 16px;
          }
          .glow {
            box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
          }
          .spinner {
            border: 2px solid #f3f3f3;
            border-top: 2px solid #3498db;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .chat-container {
            scrollbar-width: thin;
            scrollbar-color: #888 #f1f1f1;
          }
          .chat-container::-webkit-scrollbar {
            width: 6px;
          }
          .chat-container::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
          }
          .chat-container::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 3px;
          }
          .chat-container::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
          .message-bubble {
            max-width: 75%;
            line-height: 1.4;
            padding: 8px 12px;
            border-radius: 18px;
            font-size: 0.9rem;
            display: inline-block;
            word-break: break-word;
            transition: transform 0.2s ease;
          }
          .message-bubble:hover {
            transform: scale(1.02);
          }
          .sender-bubble {
            border-bottom-right-radius: 4px;
          }
          .receiver-bubble {
            border-bottom-left-radius: 4px;
          }
          @media (max-width: 640px) {
            .message-bubble {
              max-width: 80%;
              font-size: 0.85rem;
              padding: 6px 10px;
            }
          }
        `}
      </style>

      {/* Floating Action Button */}
      <button
        onClick={copyInviteLink}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-green-600 to-teal-600 text-white p-4 rounded-full shadow-lg hover:from-green-700 hover:to-teal-700 transition-all duration-300 transform hover:scale-110 glow z-50"
        aria-label="Copy Invite Link"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 fade-in">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-purple-700 to-pink-700 drop-shadow-lg mb-4 sm:mb-0">
          Room: {room.name}
        </h1>
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
          <button
            onClick={copyInviteLink}
            className="bg-gradient-to-r from-green-600 to-teal-600 text-white px-5 py-2 rounded-lg hover:from-green-700 hover:to-teal-700 transition-all duration-300 shadow-md transform hover:scale-105 w-full sm:w-auto glow"
          >
            Copy Invite
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-5 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-md transform hover:scale-105 w-full sm:w-auto glow"
          >
            Dashboard
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glassmorphic p-6 rounded-2xl shadow-2xl mb-6 sticky top-0 z-10 fade-in">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Search Songs</h3>
        <div className="relative">
          <input
            type="text"
            placeholder="Search YouTube Music... 🎵"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-gray-300 p-3 pl-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-base shadow-sm transition-all duration-300 glow"
          />
          <svg
            className="absolute left-3 top-3.5 w-5 h-5 text-gray-500"
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
          <div className="mt-4 flex overflow-x-auto space-x-4 pb-3">
            {searchResults.map((track, index) => (
              <div
                key={index}
                className="flex-shrink-0 w-44 bg-gray-50 p-3 rounded-lg shadow-md hover:shadow-xl transition-all duration-300 glow slide-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <img
                  src={track.thumbnail || 'https://via.placeholder.com/40'}
                  alt="Thumbnail"
                  className="w-full h-28 object-cover rounded-md mb-3"
                />
                <p className="text-sm font-medium truncate">{track.title}</p>
                <p className="text-xs text-gray-500 truncate">{track.channel}</p>
                <div className="flex space-x-2 mt-3">
                  <button
                    onClick={() => handlePlaySong(track)}
                    className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-all duration-200 transform hover:scale-105 glow"
                    aria-label="Play Song"
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
                    className="p-2 rounded-full bg-green-100 hover:bg-green-200 transition-all duration-200 transform hover:scale-105 glow"
                    aria-label="Add to Queue"
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
                  <button
                    onClick={() => addToFavorites(track)}
                    disabled={isSongInFavorites(track)}
                    className={`p-2 rounded-full transition-all duration-200 transform hover:scale-105 ${isSongInFavorites(track)
                        ? 'bg-purple-200 cursor-not-allowed'
                        : 'bg-purple-100 hover:bg-purple-200'
                      } glow`}
                    aria-label={isSongInFavorites(track) ? 'Already in Favorites' : 'Add to Favorites'}
                  >
                    <svg
                      className={`w-5 h-5 ${isSongInFavorites(track) ? 'text-purple-600' : 'text-purple-600'}`}
                      fill={isSongInFavorites(track) ? 'currentColor' : 'none'}
                      stroke={isSongInFavorites(track) ? 'none' : 'currentColor'}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap={isSongInFavorites(track) ? undefined : 'round'}
                        strokeLinejoin={isSongInFavorites(track) ? undefined : 'round'}
                        strokeWidth={isSongInFavorites(track) ? undefined : '2'}
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Video Player */}
        <div className="lg:col-span-2 space-y-6 fade-in" style={{ animationDelay: '0.2s' }}>
          {/* Video Player */}
          <div className="glassmorphic p-6 rounded-2xl shadow-2xl glow">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Now Playing</h2>
            {playerError ? (
              <div className="bg-red-100 bg-opacity-80 p-4 rounded-lg text-red-700 text-center">
                <p>{playerError}</p>
                <button
                  onClick={() => {
                    setPlayerError(null);
                    if (musicState.currentSong) {
                      handlePlaySong(musicState.currentSong);
                    }
                  }}
                  className="mt-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-all duration-300 glow"
                >
                  Retry
                </button>
              </div>
            ) : musicState.currentSong ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <img
                    src={musicState.currentSong.thumbnail || 'https://via.placeholder.com/100'}
                    alt="Cover art"
                    className="w-20 h-20 rounded-lg object-cover shadow-md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 text-base font-semibold truncate">
                      {musicState.currentSong.title}
                    </p>
                    <p className="text-gray-600 text-sm truncate">
                      {musicState.currentSong.channel}
                    </p>
                  </div>
                  <button
                    onClick={() => addToFavorites(musicState.currentSong)}
                    disabled={isSongInFavorites(musicState.currentSong)}
                    className={`p-2 rounded-full transition-all duration-200 transform hover:scale-105 ${isSongInFavorites(musicState.currentSong)
                        ? 'bg-purple-200 cursor-not-allowed'
                        : 'bg-purple-100 hover:bg-purple-200'
                      } glow`}
                    aria-label={isSongInFavorites(musicState.currentSong) ? 'Already in Favorites' : 'Add to Favorites'}
                  >
                    <svg
                      className={`w-6 h-6 ${isSongInFavorites(musicState.currentSong) ? 'text-purple-600' : 'text-purple-600'}`}
                      fill={isSongInFavorites(musicState.currentSong) ? 'currentColor' : 'none'}
                      stroke={isSongInFavorites(musicState.currentSong) ? 'none' : 'currentColor'}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap={isSongInFavorites(musicState.currentSong) ? undefined : 'round'}
                        strokeLinejoin={isSongInFavorites(musicState.currentSong) ? undefined : 'round'}
                        strokeWidth={isSongInFavorites(musicState.currentSong) ? undefined : '2'}
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                      />
                    </svg>
                  </button>
                </div>
                {musicState.currentSong && getVideoId(musicState.currentSong.url) ? (
                  <div className="relative">
                    <YouTube
                      videoId={getVideoId(musicState.currentSong.url)}
                      opts={{
                        height: '280',
                        width: '100%',
                        playerVars: {
                          autoplay: 1,
                          playsinline: 1,
                          enablejsapi: 1,
                        },
                      }}
                      onReady={onPlayerReady}
                      onError={onPlayerError}
                      onStateChange={handleStateChange}
                      className="rounded-lg overflow-hidden shadow-xl border border-gray-100 glow"
                    />
                    <div className="absolute top-3 right-3 bg-gray-800 bg-opacity-80 text-white text-sm px-3 py-1 rounded-full">
                      Video Mode
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No video available. Please select another song.</p>
                )}
                <div className="flex items-center space-x-3">
                  <label className="text-gray-600 text-sm font-medium">Quality:</label>
                  <div className="relative">
                    <select
                      value={videoQuality}
                      onChange={(e) => handleQualityChange(e.target.value)}
                      disabled={isChangingQuality}
                      className="neumorphic text-gray-800 text-sm px-4 py-2 rounded-lg focus:outline-none hover:bg-gray-100 transition-all duration-200 glow disabled:opacity-50"
                    >
                      <option value="auto">Auto</option>
                      <option value="tiny">144p</option>
                      <option value="small">240p</option>
                      <option value="medium">360p</option>
                      <option value="large">480p</option>
                      <option value="hd720">720p</option>
                      <option value="hd1080">1080p</option>
                    </select>
                    {isChangingQuality && (
                      <div className="absolute right-2 top-2 spinner" />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No song playing</p>
            )}
          </div>

          {/* Song Queue */}
          {musicState.songQueue.length > 0 && (
            <div className="glassmorphic p-6 rounded-2xl shadow-2xl glow">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Song Queue</h3>
              <div className="flex overflow-x-auto space-x-4 pb-3">
                {musicState.songQueue.map((song, index) => (
                  <div
                    key={index}
                    className="flex-shrink-0 w-44 bg-gray-50 p-3 rounded-lg shadow-md hover:shadow-xl transition-all duration-300 glow slide-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <img
                      src={song.thumbnail || 'https://via.placeholder.com/40'}
                      alt="Thumbnail"
                      className="w-full h-28 object-cover rounded-md mb-3"
                    />
                    <p className="text-sm font-medium truncate">{song.title}</p>
                    <p className="text-xs text-gray-500 truncate">{song.channel}</p>
                    <div className="flex space-x-2 mt-3">
                      <button
                        onClick={() => handlePlaySong(song)}
                        className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-all duration-200 transform hover:scale-105 glow"
                        aria-label="Play Song"
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
                        onClick={() => addToFavorites(song)}
                        disabled={isSongInFavorites(song)}
                        className={`p-2 rounded-full transition-all duration-200 transform hover:scale-105 ${isSongInFavorites(song)
                            ? 'bg-purple-200 cursor-not-allowed'
                            : 'bg-purple-100 hover:bg-purple-200'
                          } glow`}
                        aria-label={isSongInFavorites(song) ? 'Already in Favorites' : 'Add to Favorites'}
                      >
                        <svg
                          className={`w-5 h-5 ${isSongInFavorites(song) ? 'text-purple-600' : 'text-purple-600'}`}
                          fill={isSongInFavorites(song) ? 'currentColor' : 'none'}
                          stroke={isSongInFavorites(song) ? 'none' : 'currentColor'}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap={isSongInFavorites(song) ? undefined : 'round'}
                            strokeLinejoin={isSongInFavorites(song) ? undefined : 'round'}
                            strokeWidth={isSongInFavorites(song) ? undefined : '2'}
                            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Song History */}
          {musicState.songHistory.length > 0 && (
            <div className="glassmorphic p-6 rounded-2xl shadow-2xl glow">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Song History</h3>
              <div className="flex overflow-x-auto space-x-4 pb-3">
                {musicState.songHistory.map((song, index) => (
                  <div
                    key={index}
                    className="flex-shrink-0 w-44 bg-gray-50 p-3 rounded-lg shadow-md hover:shadow-xl transition-all duration-300 glow slide-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <img
                      src={song.thumbnail || 'https://via.placeholder.com/40'}
                      alt="Thumbnail"
                      className="w-full h-28 object-cover rounded-md mb-3"
                    />
                    <p className="text-sm font-medium truncate">{song.title}</p>
                    <p className="text-xs text-gray-500 truncate">{song.channel}</p>
                    <div className="flex space-x-2 mt-3">
                      <button
                        onClick={() => handlePlaySong(song)}
                        className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-all duration-200 transform hover:scale-105 glow"
                        aria-label="Play Song"
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
                        onClick={() => handleAddToQueue(song)}
                        className="p-2 rounded-full bg-green-100 hover:bg-green-200 transition-all duration-200 transform hover:scale-105 glow"
                        aria-label="Add to Queue"
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
                      <button
                        onClick={() => addToFavorites(song)}
                        disabled={isSongInFavorites(song)}
                        className={`p-2 rounded-full transition-all duration-200 transform hover:scale-105 ${isSongInFavorites(song)
                            ? 'bg-purple-200 cursor-not-allowed'
                            : 'bg-purple-100 hover:bg-purple-200'
                          } glow`}
                        aria-label={isSongInFavorites(song) ? 'Already in Favorites' : 'Add to Favorites'}
                      >
                        <svg
                          className={`w-5 h-5 ${isSongInFavorites(song) ? 'text-purple-600' : 'text-purple-600'}`}
                          fill={isSongInFavorites(song) ? 'currentColor' : 'none'}
                          stroke={isSongInFavorites(song) ? 'none' : 'currentColor'}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap={isSongInFavorites(song) ? undefined : 'round'}
                            strokeLinejoin={isSongInFavorites(song) ? undefined : 'round'}
                            strokeWidth={isSongInFavorites(song) ? undefined : '2'}
                            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Favorites */}
          {favorites.length > 0 && (
            <div className="glassmorphic p-6 rounded-2xl shadow-2xl glow">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Your Favorites</h3>
              <div className="flex overflow-x-auto space-x-4 pb-3">
                {favorites.map((song, index) => (
                  <div
                    key={index}
                    className="flex-shrink-0 w-44 bg-gray-50 p-3 rounded-lg shadow-md hover:shadow-xl transition-all duration-300 glow slide-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <img
                      src={song.thumbnail || 'https://via.placeholder.com/40'}
                      alt="Thumbnail"
                      className="w-full h-28 object-cover rounded-md mb-3"
                    />
                    <p className="text-sm font-medium truncate">{song.title}</p>
                    <p className="text-xs text-gray-500 truncate">{song.channel}</p>
                    <div className="flex space-x-2 mt-3">
                      <button
                        onClick={() => handlePlaySong(song)}
                        className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-all duration-200 transform hover:scale-105 glow"
                        aria-label="Play Song"
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
                        onClick={() => handleAddToQueue(song)}
                        className="p-2 rounded-full bg-green-100 hover:bg-green-200 transition-all duration-200 transform hover:scale-105 glow"
                        aria-label="Add to Queue"
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
                      <button
                        onClick={() => removeFromFavorites(song)}
                        className="p-2 rounded-full bg-red-100 hover:bg-red-200 transition-all duration-200 transform hover:scale-105 glow"
                        aria-label="Remove from Favorites"
                      >
                        <svg
                          className="w-5 h-5 text-red-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Chat & Users */}
        <div className="lg:col-span-1 space-y-6 fade-in" style={{ animationDelay: '0.4s' }}>
          {/* Chat Section */}
          <div className="glassmorphic p-4 rounded-2xl shadow-2xl sticky top-4 glow">
            <h2 className="text-lg font-bold text-gray-800 mb-3 px-2">Live Chat</h2>
            <div
              ref={chatContainerRef}
              className="h-[50vh] sm:h-[60vh] overflow-y-auto p-3 mb-3 rounded-xl bg-gray-50 bg-opacity-20 chat-container"
            >
              {messages.length === 0 && (
                <p className="text-gray-400 text-sm text-center animate-pulse font-medium">
                  Koi message nahi! Chatting shuru kar, bhai! 🚀
                </p>
              )}
              {messages.map((message, index) => (
                <div
                  key={`${message.id}-${index}`}
                  className={`mb-3 flex ${message.senderId === user.uid ? 'justify-end' : 'justify-start'} slide-in`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={`max-w-[75%] ${message.senderId === user.uid ? 'text-right' : 'text-left'}`}>
                    <p className="text-xs text-gray-500 font-medium mb-1 px-2">
                      {message.senderName || 'Unknown'} •{' '}
                      {message.createdAt && !isNaN(message.createdAt.getTime())
                        ? message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Just now'}
                    </p>
                    <p
                      className={`message-bubble ${message.senderId === user.uid
                          ? 'sender-bubble bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                          : 'receiver-bubble bg-gray-100 text-gray-900'
                        }`}
                    >
                      {message.text || '[Blank Message]'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 italic text-center sm:text-left mb-3 px-3">
              Note: Messages will auto-delete after 1 hour.
            </p>
            <form onSubmit={handleSendMessage} className="flex items-center gap-2 px-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type karo, bhai..."
                className="flex-1 h-10 px-4 rounded-full bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all duration-200 text-sm"
                disabled={isSendingMessage}
              />
              <button
                type="submit"
                className="h-10 w-10 flex items-center justify-center bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full shadow-md hover:from-blue-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 shrink-0"
                disabled={isSendingMessage}
              >
                {isSendingMessage ? (
                  <div className="spinner" />
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </form>
          </div>

          {/* Users Section */}
          <div className="glassmorphic p-6 rounded-2xl shadow-2xl glow">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Users in Room</h2>
            <ul className="space-y-3">
              {Object.keys(presence).length === 0 && (
                <li className="text-gray-500 text-sm">No users online</li>
              )}
              {Object.entries(presence)
                .filter(([_, data]) => data.status === 'online') // Only show online users
                .map(([userId, data]) => (
                  <li key={userId} className="flex items-center text-sm text-gray-700">
                    <img
                      src={userId === user.uid ? user.photoURL || 'https://via.placeholder.com/30' : 'https://via.placeholder.com/30'}
                      alt="Avatar"
                      className="w-8 h-8 rounded-full mr-3 pulse"
                    />
                    <span className="w-3 h-3 rounded-full bg-green-500 mr-3 shadow-md"></span>
                    <span className="truncate">
                      {data.displayName || (userId === user.uid ? user.displayName || user.email.split('@')[0] : 'Anonymous')}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Trending Songs */}
      {trendingSongs.length > 0 && (
        <div className="mt-6 fade-in" style={{ animationDelay: '0.6s' }}>
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Trending Songs</h3>
          <div className="flex overflow-x-auto space-x-4 pb-3">
            {trendingSongs.map((song, index) => (
              <div
                key={index}
                className="flex-shrink-0 w-44 bg-gray-50 p-3 rounded-lg shadow-md hover:shadow-xl transition-all duration-300 glow slide-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <img
                  src={song.thumbnail || 'https://via.placeholder.com/40'}
                  alt="Thumbnail"
                  className="w-full h-28 object-cover rounded-md mb-3"
                />
                <p className="text-sm font-medium truncate">{song.title}</p>
                <p className="text-xs text-gray-500 truncate">{song.channel}</p>
                <div className="flex space-x-2 mt-3">
                  <button
                    onClick={() => handlePlaySong(song)}
                    className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-all duration-200 transform hover:scale-105 glow"
                    aria-label="Play Song"
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
                    onClick={() => handleAddToQueue(song)}
                    className="p-2 rounded-full bg-green-100 hover:bg-green-200 transition-all duration-200 transform hover:scale-105 glow"
                    aria-label="Add to Queue"
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
                  <button
                    onClick={() => addToFavorites(song)}
                    disabled={isSongInFavorites(song)}
                    className={`p-2 rounded-full transition-all duration-200 transform hover:scale-105 ${isSongInFavorites(song)
                        ? 'bg-purple-200 cursor-not-allowed'
                        : 'bg-purple-100 hover:bg-purple-200'
                      } glow`}
                    aria-label={isSongInFavorites(song) ? 'Already in Favorites' : 'Add to Favorites'}
                  >
                    <svg
                      className={`w-5 h-5 ${isSongInFavorites(song) ? 'text-purple-600' : 'text-purple-600'}`}
                      fill={isSongInFavorites(song) ? 'currentColor' : 'none'}
                      stroke={isSongInFavorites(song) ? 'none' : 'currentColor'}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap={isSongInFavorites(song) ? undefined : 'round'}
                        strokeLinejoin={isSongInFavorites(song) ? undefined : 'round'}
                        strokeWidth={isSongInFavorites(song) ? undefined : '2'}
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Room;