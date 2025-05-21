import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom } from '../utils/rooms';
import { logout } from '../utils/auth';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

function Dashboard({ user }) {
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // Fetch rooms in real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const roomsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setRooms(roomsData);
      console.log('Dashboard.jsx: Fetched rooms:', roomsData);
    }, (err) => {
      console.error('Dashboard.jsx: Rooms fetch error:', err.message);
      setError('Failed to fetch rooms.');
    });
    return () => unsubscribe();
  }, []);

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError('Room name is required');
      return;
    }
    setError(null);
    try {
      const { roomId } = await createRoom(user, roomName);
      console.log('Dashboard.jsx: Navigating to room:', roomId);
      navigate(`/room/${roomId}`);
    } catch (err) {
      setError(err.message);
      console.error('Dashboard.jsx: Create room error:', err.message);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomId.trim()) {
      setError('Room ID is required');
      return;
    }
    setError(null);
    try {
      const { roomId: joinedRoomId } = await joinRoom(user, roomId);
      console.log('Dashboard.jsx: Navigating to joined room:', joinedRoomId);
      navigate(`/room/${joinedRoomId}`);
    } catch (err) {
      setError(err.message);
      console.error('Dashboard.jsx: Join room error:', err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      console.error('Logout failed:', err.message);
      setError('Failed to logout.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-200 via-purple-200 to-pink-200 animate-gradient-x flex flex-col">
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

      {/* Header for Mobile */}
      <header className="flex justify-between items-center p-4 bg-white bg-opacity-90 backdrop-blur-md shadow-md sm:hidden">
        <h2 className="text-xl font-bold text-blue-600">Music Sharing</h2>
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="text-gray-600 hover:text-blue-600 transition"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16m-7 6h7"
            />
          </svg>
        </button>
      </header>

      <div className="flex flex-1 flex-col sm:flex-row">
        {/* Sidebar */}
        <div
          className={`${
            isSidebarOpen ? 'block' : 'hidden'
          } sm:block sm:w-64 bg-white bg-opacity-90 backdrop-blur-md shadow-xl p-4 sm:p-6 transition-all duration-300 fixed sm:static top-0 left-0 h-full z-20 sm:z-auto`}
        >
          <div className="flex justify-between items-center mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              Music Sharing
            </h2>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="sm:hidden text-gray-600 hover:text-blue-600"
            >
              <svg
                className="w-6 h-6"
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
          <div className="mb-4 sm:mb-6">
            <input
              type="text"
              placeholder="Room Name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full border border-gray-300 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm shadow-sm"
            />
            <button
              onClick={handleCreateRoom}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-2 mt-2 rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-md transform hover:scale-105"
            >
              Create Room
            </button>
          </div>
          <form onSubmit={handleJoinRoom} className="mb-4 sm:mb-6">
            <input
              type="text"
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full border border-gray-300 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm shadow-sm"
            />
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-2 mt-2 rounded-lg hover:from-green-600 hover:to-teal-600 transition-all duration-300 shadow-md transform hover:scale-105"
            >
              Join Room
            </button>
          </form>
          {error && (
            <p className="text-red-500 bg-red-100 p-2 rounded-lg mb-4 text-sm">
              {error}
            </p>
          )}
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Friends</h3>
          <ul className="space-y-2">
            {/* Dummy friends, replace with Firestore data later */}
            <li className="text-gray-700 flex items-center space-x-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>Friend 1 - Listening to Song A</span>
            </li>
            <li className="text-gray-700 flex items-center space-x-2">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              <span>Friend 2 - Offline</span>
            </li>
          </ul>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 mb-4 sm:mb-0">
              Welcome, {user.displayName || user.email}
            </h1>
            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-pink-600 transition-all duration-300 shadow-md transform hover:scale-105"
            >
              Logout
            </button>
          </div>

          <div className="bg-white bg-opacity-90 backdrop-blur-md p-4 rounded-xl shadow-lg mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
              Notifications
            </h2>
            <p className="text-gray-600 text-sm sm:text-base">
              Friend X is listening to Song Y
            </p>
          </div>

          <div className="bg-white bg-opacity-90 backdrop-blur-md p-4 rounded-xl shadow-lg mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
              Active Rooms
            </h2>
            <ul className="space-y-2">
              {rooms.map((room) => (
                <li
                  key={room.id}
                  className="text-gray-700 text-sm sm:text-base cursor-pointer hover:text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-all duration-200"
                  onClick={() => navigate(`/room/${room.roomId}`)}
                >
                  {room.name} ({room.users.length} users)
                </li>
              ))}
              {rooms.length === 0 && (
                <p className="text-gray-600 text-sm sm:text-base">
                  No active rooms
                </p>
              )}
            </ul>
          </div>

          <div className="bg-white bg-opacity-90 backdrop-blur-md p-4 rounded-xl shadow-lg">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
              Music Player
            </h2>
            <p className="text-gray-600 text-sm sm:text-base">Song: Example Song</p>
            <div className="flex space-x-4 mt-4">
              <button className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-md transform hover:scale-105">
                Play
              </button>
              <button className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-4 py-2 rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-md transform hover:scale-105">
                Pause
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;