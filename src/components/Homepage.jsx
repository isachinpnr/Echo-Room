import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithGoogle, signUpWithEmail, loginWithEmail } from '../utils/auth';

function Homepage({ user }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      const user = await loginWithGoogle();
      console.log('Logged in user:', user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (isSignUp) {
        if (!username.trim()) {
          throw new Error('Username is required for sign-up');
        }
        if (username.length < 3 || username.length > 20) {
          throw new Error('Username must be between 3 and 20 characters');
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
          throw new Error('Username can only contain letters, numbers, and underscores');
        }
        await signUpWithEmail(email, password, username);
      } else {
        await loginWithEmail(email, password);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  if (user) {
    return null; // App.jsx handles redirect to Dashboard
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-300 via-purple-300 to-pink-300 animate-gradient-x flex flex-col items-center justify-center p-4 sm:p-6">
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
        `}
      </style>

      <div className="text-center mb-6 sm:mb-8 fade-in">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 drop-shadow-lg">
          Welcome to Music Sharing App!
        </h1>
        <p className="text-base sm:text-lg text-gray-800 mt-2 max-w-md mx-auto">
          Listen to music together in real-time with your friends. Create or join rooms, chat, and vibe!
        </p>
      </div>

      <div className="bg-white bg-opacity-90 backdrop-blur-md p-4 sm:p-6 rounded-xl shadow-2xl w-full max-w-md fade-in" style={{ animationDelay: '0.2s' }}>
        {error && (
          <p className="text-red-500 bg-red-100 p-2 rounded-lg mb-4 text-sm text-center">
            {error}
          </p>
        )}

        <button
          onClick={handleGoogleLogin}
          className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg transform hover:scale-105 mb-4"
        >
          Login with Google
        </button>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-gray-300 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm shadow-sm"
                required
              />
            </div>
          )}
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm shadow-sm"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm shadow-sm"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-3 rounded-lg hover:from-green-600 hover:to-teal-600 transition-all duration-300 shadow-lg transform hover:scale-105"
          >
            {isSignUp ? 'Sign Up' : 'Login'}
          </button>
        </form>

        <p className="mt-4 text-gray-700 text-center text-sm">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-500 hover:underline ml-1"
          >
            {isSignUp ? 'Login' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default Homepage;