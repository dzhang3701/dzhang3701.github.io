'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface TaskProgress {
  task_id: string;
  completed: boolean;
  queries_used?: number;
  total_queries?: number;
  success?: boolean;
}

export default function LevelsPage() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [theme, setTheme] = useState<'cyan' | 'red'>('cyan');
  const [taskProgress, setTaskProgress] = useState<Record<string, TaskProgress>>({});
  const [numericalTasks, setNumericalTasks] = useState<any[]>([]);
  const [lexicalTasks, setLexicalTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const colors = theme === 'cyan'
    ? {
      primary: 'cyan',
      primaryClass: 'text-cyan-400',
      primaryBg: 'bg-cyan-600',
      primaryBgHover: 'hover:bg-cyan-500',
      primaryBorder: 'border-cyan-500',
      success: 'emerald',
      successClass: 'text-emerald-400',
      successBg: 'bg-emerald-600',
      successBgHover: 'hover:bg-emerald-500',
    }
    : {
      primary: 'red',
      primaryClass: 'text-red-400',
      primaryBg: 'bg-red-600',
      primaryBgHover: 'hover:bg-red-500',
      primaryBorder: 'border-red-500',
      success: 'yellow',
      successClass: 'text-yellow-400',
      successBg: 'bg-yellow-600',
      successBgHover: 'hover:bg-yellow-500',
    };

  useEffect(() => {
    // Get user name
    const name = sessionStorage.getItem('userName');
    if (!name) {
      router.push('/');
      return;
    }
    setUserName(name);

    // Load tasks.json
    fetch('/tasks.json')
      .then(res => res.json())
      .then(tasks => {
        setNumericalTasks(tasks.numerical || []);
        setLexicalTasks(tasks.lexical || []);
      });

    // Load task progress from localStorage
    const storageKey = `taskProgress_${name}`;
    const progress = JSON.parse(localStorage.getItem(storageKey) || '{}');
    setTaskProgress(progress);

    setLoading(false);
  }, [router]);

  const handleRandomTask = () => {
    const allTasks = [...numericalTasks, ...lexicalTasks];
    const incompleteTasks = allTasks.filter(t => !taskProgress[t.id]?.completed);

    if (incompleteTasks.length === 0) {
      alert('You have completed all tasks!');
      return;
    }

    const randomTask = incompleteTasks[Math.floor(Math.random() * incompleteTasks.length)];

    // Store selected task in sessionStorage
    const category = numericalTasks.some(t => t.id === randomTask.id) ? 'numerical' : 'lexical';
    sessionStorage.setItem('selectedTask', JSON.stringify({
      task_id: randomTask.id,
      task_category: category
    }));

    router.push('/task');
  };

  const renderTaskBox = (task: any, index: number, category: 'numerical' | 'lexical') => {
    const progress = taskProgress[task.id];
    const isCompleted = progress?.completed || false;
    const queriesUsed = progress?.queries_used || 0;
    const totalQueries = task.total_queries || 0;

    return (
      <div
        key={task.id}
        className={`relative bg-gray-900 border-2 ${
          isCompleted ? 'border-emerald-500/50' : 'border-gray-700'
        } rounded-lg p-4 flex flex-col items-center justify-center transition-all hover:border-gray-600`}
      >
        {/* Task Number */}
        <div className={`text-2xl font-mono font-bold ${
          isCompleted ? colors.successClass : 'text-gray-500'
        }`}>
          {index + 1}
        </div>

        {/* Progress */}
        {isCompleted && (
          <div className="mt-2 text-xs font-mono text-gray-400">
            {queriesUsed}/{totalQueries} queries
          </div>
        )}

        {/* Completion Badge */}
        {isCompleted && (
          <div className="absolute top-2 right-2">
            <div className={`w-2 h-2 rounded-full ${
              theme === 'cyan' ? 'bg-emerald-500' : 'bg-yellow-500'
            }`}></div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 font-mono">Loading tasks...</div>
      </div>
    );
  }

  const completedCount = Object.values(taskProgress).filter(p => p.completed).length;
  const totalCount = numericalTasks.length + lexicalTasks.length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top Bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="flex justify-between items-center max-w-[1400px] mx-auto">
          <div className="flex items-center gap-4">
            <div className={`${colors.primaryClass} font-mono text-lg`}>Black Box Hypothesis Testing</div>
            <div className="text-gray-500">|</div>
            <div className="text-gray-400 text-sm font-mono">{userName}</div>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setTheme(theme === 'cyan' ? 'red' : 'cyan')}
              className="text-xs font-mono text-gray-400 hover:text-gray-300 px-2 py-1 border border-gray-700 rounded hover:border-gray-600 transition-colors"
            >
              {theme === 'cyan' ? 'red_theme' : 'cyan_theme'}
            </button>
            <div className="text-sm font-mono">
              <span className="text-gray-500">Progress:</span>{' '}
              <span className={`${colors.successClass} font-semibold`}>{completedCount}</span>
              <span className="text-gray-600">/</span>
              <span className="text-gray-400">{totalCount}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-6 space-y-8">
        {/* Instructions */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
            <span className="text-xs font-mono text-gray-400">instructions.md</span>
          </div>
          <div className="p-4">
            <div className="space-y-3 text-sm font-mono text-gray-300">
              <div className={`${colors.primaryClass} font-semibold`}>TASK:</div>
              <div className="text-gray-400">
                Your goal is to discover the hidden rule by making strategic queries. The hidden rule can be numerical or string-based. None of the rules rely on meanings, semantics, or real world context. Numbers are to be interpreted mathematically, and strings are to be interpreted as a sequence of lexicographic characters.
              </div>
              <div className="text-gray-400">
                You'll learn through observation - each query reveals the output for that input.
              </div>

              <div className={`${colors.primaryClass} font-semibold mt-4`}>STRATEGY GUIDELINES:</div>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>Start by querying a wide set of examples to gather information</li>
                <li>Convert observations into hypotheses about the function structure</li>
                <li>Refine your hypotheses with strategic queries</li>
                <li>Actively seek disconfirming evidence</li>
                <li>When you think you know the rule, test corner cases that could break it</li>
                <li>Choose queries that maximally reduce uncertainty</li>
                <li>Prefer simpler explanations over complex ones</li>
              </ul>

              <div className={`${colors.primaryClass} font-semibold mt-4`}>SUBMISSION RULES:</div>
              <div className="text-gray-400">
                You may submit a hypothesis once at the very start before querying, and then once after each additional query.
              </div>
            </div>
          </div>
        </div>

        {/* Start Random Task Button */}
        <div className="flex justify-center">
          <button
            onClick={handleRandomTask}
            className={`${colors.successBg} ${colors.successBgHover} text-gray-100 font-mono text-sm py-3 px-6 rounded transition-colors flex items-center gap-2`}
          >
            <span>Start Random Task</span>
            <span className="text-xs opacity-60">
              ({totalCount - completedCount} remaining)
            </span>
          </button>
        </div>

        {/* Numerical Tasks */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={`${colors.primaryClass} font-mono text-lg font-semibold`}>
              Numerical Tasks
            </div>
            <div className="h-px flex-1 bg-gray-800"></div>
          </div>
          <div className="grid grid-cols-10 gap-3">
            {numericalTasks.map((task, idx) => renderTaskBox(task, idx, 'numerical'))}
          </div>
        </div>

        {/* Lexical/Semantic Tasks */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={`${colors.primaryClass} font-mono text-lg font-semibold`}>
              String Tasks
            </div>
            <div className="h-px flex-1 bg-gray-800"></div>
          </div>
          <div className="grid grid-cols-10 gap-3">
            {lexicalTasks.map((task, idx) => renderTaskBox(task, idx, 'lexical'))}
          </div>
        </div>

        {/* Legend */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs font-mono text-gray-400 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                theme === 'cyan' ? 'bg-emerald-500' : 'bg-yellow-500'
              }`}></div>
              <span>Completed task</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-700"></div>
              <span>Incomplete task</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
