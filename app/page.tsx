'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [userName, setUserName] = useState('');
  const [theme, setTheme] = useState<'cyan' | 'red'>('cyan');
  const router = useRouter();

  const primaryColor = theme === 'cyan' ? 'cyan' : 'orange';
  const primaryClass = theme === 'cyan' ? 'text-cyan-400' : 'text-orange-300';
  const primaryBorder = theme === 'cyan' ? 'border-cyan-500' : 'border-orange-700';
  const primaryRing = theme === 'cyan' ? 'focus:ring-cyan-500' : 'focus:ring-orange-700';
  const primaryBg = theme === 'cyan' ? 'bg-cyan-600' : 'bg-orange-800';
  const primaryBgHover = theme === 'cyan' ? 'hover:bg-cyan-500' : 'hover:bg-orange-700';
  const gradientColors = theme === 'cyan'
    ? 'from-cyan-400 via-purple-400 to-emerald-400'
    : 'from-orange-300 via-amber-300 to-yellow-300';

  const handleStart = () => {
    if (userName.trim()) {
      // Save user name to session storage
      sessionStorage.setItem('userName', userName);
      // Redirect to levels page
      router.push('/levels');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Theme Toggle */}
        <div className="flex justify-end">
          <button
            onClick={() => setTheme(theme === 'cyan' ? 'red' : 'cyan')}
            className="text-xs font-mono text-gray-400 hover:text-gray-300 px-2 py-1 border border-gray-700 rounded hover:border-gray-600 transition-colors"
          >
            {theme === 'cyan' ? 'red_theme' : 'cyan_theme'}
          </button>
        </div>

        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className={`text-4xl font-bold font-mono text-transparent bg-clip-text bg-gradient-to-r ${gradientColors}`}>
            Black Box Hypothesis Testing
          </h1>
          <p className="text-gray-400 font-mono text-sm">
            Discover hidden rules through strategic queries
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="ml-2 text-xs font-mono text-gray-400">login.sh</span>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-mono text-gray-400 mb-2">
                <span className={primaryClass}>$</span> enter_username
              </label>
              <input
                id="name"
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleStart()}
                className={`w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded font-mono text-gray-100 placeholder-gray-500 focus:outline-none ${primaryBorder} focus:ring-1 ${primaryRing}`}
                placeholder="username"
                autoFocus
              />
            </div>

            <button
              onClick={handleStart}
              disabled={!userName.trim()}
              className={`w-full ${primaryBg} ${primaryBgHover} disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 py-3 px-4 rounded font-mono font-medium transition-colors flex items-center justify-center gap-2`}
            >
              <span>Initialize Session</span>
              <span className="text-xs opacity-60">[Enter]</span>
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
            <span className="text-xs font-mono text-gray-400">readme.md</span>
          </div>
          <div className="p-4">
            <div className="space-y-2 text-sm font-mono text-gray-400">
              <div><span className={primaryClass}>→</span> Random rule will be assigned</div>
              <div><span className={primaryClass}>→</span> Query inputs to observe outputs</div>
              <div><span className={primaryClass}>→</span> Submit hypothesis when ready</div>
              <div><span className={primaryClass}>→</span> Task ends when hypothesis is correct</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
