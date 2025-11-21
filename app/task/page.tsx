'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface QueryResult {
  input: string;
  output: any;
}

interface TaskData {
  session_id: string;
  input_spec: string;
  output_spec: string;
  sample_cases: Record<string, any>;
  test_cases_count: number;
  total_queries: number;
  query_batch_size: number;
  rule_description: string;
}

export default function TaskPage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
  const [userName, setUserName] = useState('');
  const [taskData, setTaskData] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [queryInputs, setQueryInputs] = useState<string[]>(['']);
  const [queryHistory, setQueryHistory] = useState<QueryResult[]>([]);
  const [queriesUsed, setQueriesUsed] = useState(0);
  const [failedQueries, setFailedQueries] = useState(0);
  const [hypothesis, setHypothesis] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{ success: boolean; explanation: string } | null>(null);
  const [taskCompleted, setTaskCompleted] = useState(false);
  const [theme, setTheme] = useState<'cyan' | 'red'>('cyan');
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [correctRule, setCorrectRule] = useState<string>('');

  const colors = theme === 'cyan'
    ? {
      primary: 'cyan',
      primaryClass: 'text-cyan-400',
      primaryBg: 'bg-cyan-600',
      primaryBgHover: 'hover:bg-cyan-500',
      primaryBorder: 'border-cyan-500',
      primaryRing: 'focus:ring-cyan-500',
      secondary: 'purple',
      secondaryClass: 'text-purple-400',
      secondaryBg: 'bg-purple-600',
      secondaryBgHover: 'hover:bg-purple-500',
      secondaryBorder: 'border-purple-500',
      secondaryRing: 'focus:ring-purple-500',
      success: 'emerald',
      successClass: 'text-emerald-400',
      successBg: 'bg-emerald-500/20',
      successBorder: 'border-emerald-500/50',
      successBgFull: 'bg-emerald-950/50',
      successBorderFull: 'border-emerald-500/50',
      successBgStrong: 'bg-emerald-900/50',
    }
    : {
      primary: 'orange',
      primaryClass: 'text-orange-300',
      primaryBg: 'bg-orange-800',
      primaryBgHover: 'hover:bg-orange-700',
      primaryBorder: 'border-orange-700',
      primaryRing: 'focus:ring-orange-700',
      secondary: 'amber',
      secondaryClass: 'text-amber-300',
      secondaryBg: 'bg-amber-800',
      secondaryBgHover: 'hover:bg-amber-700',
      secondaryBorder: 'border-amber-700',
      secondaryRing: 'focus:ring-amber-700',
      success: 'yellow',
      successClass: 'text-yellow-300',
      successBg: 'bg-yellow-500/10',
      successBorder: 'border-yellow-700/40',
      successBgFull: 'bg-yellow-950/30',
      successBorderFull: 'border-yellow-700/40',
      successBgStrong: 'bg-yellow-900/30',
    };

  useEffect(() => {
    // Get user name from session storage
    const name = sessionStorage.getItem('userName');
    if (!name) {
      router.push('/');
      return;
    }
    setUserName(name);

    // Select random task from tasks.json
    fetch('/tasks.json')
      .then(res => res.json())
      .then(tasks => {
        const allTasks = [...tasks.numerical, ...tasks.lexical];
        const randomTask = allTasks[Math.floor(Math.random() * allTasks.length)];

        // Determine category
        const category = tasks.numerical.some((t: any) => t.id === randomTask.id)
          ? 'numerical'
          : 'lexical';

        // Start task session
        return fetch(`${API_URL}/api/start-task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_name: name,
            task_id: randomTask.id,
            task_category: category
          })
        });
      })
      .then(res => res.json())
      .then(data => {
        setTaskData(data);
        setCorrectRule(data.rule_description);
        setQueryInputs(new Array(data.query_batch_size).fill(''));
        setLoading(false);
      })
      .catch(err => {
        console.error('Error starting task:', err);
        alert('Failed to start task. Please try again.');
        router.push('/');
      });
  }, [router]);

  // Timer countdown
  useEffect(() => {
    if (taskCompleted || loading) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Timer expired - record as failed query
          handleTimerExpired();
          return 60; // Reset timer
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [taskCompleted, loading, queriesUsed]);

  const handleTimerExpired = () => {
    if (!taskData) return;

    // Record failed query
    setFailedQueries(prev => prev + 1);
    setQueriesUsed(prev => prev + 1);

    // Add to history with failed marker
    setQueryHistory(prev => [...prev, {
      input: '[TIMEOUT]',
      output: 'Query timed out - no query made'
    }]);

    // Clear inputs and reset timer
    setQueryInputs(new Array(taskData.query_batch_size).fill(''));
    setTimeRemaining(60);
  };

  const handleQuery = async () => {
    if (!taskData) return;

    // Filter out empty inputs
    const inputs = queryInputs.filter(inp => inp.trim() !== '');
    if (inputs.length === 0) {
      alert('Please enter at least one input to query.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: taskData.session_id,
          inputs: inputs
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Query failed');
        return;
      }

      // Update query history and queries used
      setQueryHistory(prev => [...prev, ...data.results]);
      setQueriesUsed(data.queries_used);

      // Clear input fields and reset timer
      setQueryInputs(new Array(taskData.query_batch_size).fill(''));
      setTimeRemaining(60);

    } catch (err) {
      console.error('Query error:', err);
      alert('Failed to process query. Please try again.');
    }
  };

  const handleSubmitHypothesis = async () => {
    if (!taskData || !hypothesis.trim()) {
      alert('Please enter your hypothesis.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/submit-hypothesis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: taskData.session_id,
          hypothesis: hypothesis
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Submission failed');
        setSubmitting(false);
        return;
      }

      setEvaluationResult({
        success: data.success,
        explanation: data.explanation
      });

      // End immediately if successful
      if (data.task_complete) {
        setTaskCompleted(true);
      } else {
        setHypothesis('');
      }

      setSubmitting(false);

    } catch (err) {
      console.error('Submission error:', err);
      alert('Failed to submit hypothesis. Please try again.');
      setSubmitting(false);
    }
  };

  const handleEndTask = async () => {
    if (!taskData) return;

    try {
      await fetch(`${API_URL}/api/end-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: taskData.session_id
        })
      });
    } catch (err) {
      console.error('Error ending task:', err);
    }

    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-xl font-semibold text-gray-700">Loading task...</div>
      </div>
    );
  }

  if (!taskData) {
    return null;
  }

  const queriesRemaining = taskData.total_queries - queriesUsed;

  // Build system prompt (same as models see)
  const systemPrompt = `Discover the hidden rule through strategic queries.

Input: ${taskData.input_spec}
Output: ${taskData.output_spec}
Query budget: ${taskData.total_queries}
Batch limit: up to ${taskData.query_batch_size} input(s) per query call. You must not exceed this limit.

TASK:
Your goal is to discover the hidden rule by making strategic queries. The hidden rule can be numerical or string-based. None of the rules rely on meanings, semantics, or real world context. Numbers are to be interpreted mathematically, and strings are to be interpreted as a sequence of lexicographic characters.
You'll learn through observation - each query reveals the output for that input.

STRATEGY GUIDELINES:
- Start by querying a wide set of examples to gather information about the function
- Convert observations into a set of hypotheses about the structure of the function
- Refine your hypotheses with strategic queries
- Actively seek disconfirming evidence
- When you think you know the rule, test corner cases that could break it
- Choose queries that maximally reduce uncertainty
- Prefer simpler explanations over complex ones`;

  // Build sample cases message (same as models see)
  const sampleCasesMessage = Object.keys(taskData.sample_cases).length > 0
    ? "Sample pairs:\n" + Object.entries(taskData.sample_cases)
      .map(([inp, out]) => `${inp} → ${out}`)
      .join("\n")
    : "No sample cases provided.";

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  };

  const handleHypothesisKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.metaKey && !submitting && hypothesis.trim()) {
      e.preventDefault();
      handleSubmitHypothesis();
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top Bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="flex justify-between items-center max-w-[1800px] mx-auto">
          <div className="flex items-center gap-4">
            <div className={`${colors.primaryClass} font-mono text-lg`}>Black Box Hypothesis Evaluation</div>
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
            {!taskCompleted && (
              <div className={`text-sm font-mono ${timeRemaining <= 10 ? 'text-red-400' : 'text-gray-400'}`}>
                <span className="text-gray-500">Timer:</span>{' '}
                <span className="font-semibold">{timeRemaining}s</span>
              </div>
            )}
            <div className="text-sm font-mono">
              <span className="text-gray-500">Queries:</span>{' '}
              <span className={`${colors.successClass} font-semibold`}>{queriesUsed}</span>
              <span className="text-gray-600">/</span>
              <span className="text-gray-400">{taskData.total_queries}</span>
            </div>
            {failedQueries > 0 && (
              <div className="text-sm font-mono">
                <span className="text-gray-500">Failed:</span>{' '}
                <span className="text-red-400 font-semibold">{failedQueries}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - System Prompt and Hypothesis */}
          <div className="space-y-6">
            {/* System Prompt */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-2 text-xs font-mono text-gray-400">system.prompt</span>
              </div>
              <div className="p-4 max-h-96 overflow-y-auto">
                <div className={`text-xs font-mono ${colors.secondaryClass} mb-2`}>// SYSTEM</div>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{systemPrompt}</pre>
              </div>
            </div>

            {/* Hypothesis Submission */}
            {!taskCompleted && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                  <span className="text-xs font-mono text-gray-400">hypothesis.txt</span>
                </div>
                <div className="p-4">
                  <textarea
                    value={hypothesis}
                    onChange={(e) => setHypothesis(e.target.value)}
                    onKeyDown={handleHypothesisKeyPress}
                    className={`w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded font-mono text-sm text-gray-100 placeholder-gray-500 focus:outline-none ${colors.secondaryBorder} focus:ring-1 ${colors.secondaryRing} resize-none`}
                    rows={6}
                    placeholder="Describe your hypothesis..."
                  />
                  <button
                    onClick={handleSubmitHypothesis}
                    disabled={submitting || !hypothesis.trim()}
                    className={`mt-3 w-full ${colors.secondaryBg} ${colors.secondaryBgHover} disabled:bg-gray-700 disabled:text-gray-500 text-gray-100 font-mono text-sm py-2 px-4 rounded transition-colors flex items-center justify-center gap-2`}
                  >
                    <span>{submitting ? 'Evaluating...' : 'Submit Hypothesis'}</span>
                    <span className="text-xs opacity-60">[Cmd+Enter]</span>
                  </button>
                </div>
              </div>
            )}

            {/* Evaluation Result */}
            {evaluationResult && (
              <div className={`border rounded-lg overflow-hidden ${evaluationResult.success
                  ? `${colors.successBgFull} ${colors.successBorderFull}`
                  : 'bg-red-950/50 border-red-500/50'
                }`}>
                <div className={`px-4 py-2 border-b ${evaluationResult.success
                    ? `${colors.successBgStrong} ${colors.successBorderFull}`
                    : 'bg-red-900/50 border-red-500/50'
                  }`}>
                  <span className={`text-xs font-mono ${evaluationResult.success ? colors.successClass : 'text-red-400'
                    }`}>
                    {evaluationResult.success ? '[PASS] evaluation.result' : '[FAIL] evaluation.result'}
                  </span>
                </div>
                <div className="p-4">
                  <pre className={`text-sm font-mono whitespace-pre-wrap ${evaluationResult.success ? 'text-' + colors.success + '-300' : 'text-red-300'
                    }`}>
                    {evaluationResult.explanation}
                  </pre>
                </div>
              </div>
            )}

            {/* Task Completed */}
            {taskCompleted && (
              <div className={`bg-gray-900 border ${colors.successBorder} rounded-lg overflow-hidden`}>
                <div className={`${colors.successBg} px-4 py-2 border-b ${colors.successBorder}`}>
                  <span className={`text-xs font-mono ${colors.successClass}`}>task.complete</span>
                </div>
                <div className="p-6">
                  <div className={`text-2xl font-mono ${colors.successClass} mb-4 text-center`}>TASK COMPLETE</div>
                  <p className="text-gray-400 mb-6 font-mono text-sm text-center">Thank you for participating</p>

                  {/* Reveal correct rule */}
                  <div className="bg-gray-800 border border-gray-700 rounded p-4 mb-6">
                    <div className="text-xs font-mono text-gray-500 mb-2">Correct Rule:</div>
                    <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">{correctRule}</pre>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={handleEndTask}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-100 font-mono text-sm py-2 px-6 rounded transition-colors"
                    >
                      Exit
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Top Row - Samples and History side by side */}
            <div className="grid grid-cols-2 gap-4">
              {/* Sample Cases */}
              <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                  <span className="text-xs font-mono text-gray-400">samples.txt</span>
                </div>
                <div className="p-3 max-h-64 overflow-y-auto">
                  <div className={`text-xs font-mono ${colors.successClass} mb-2`}>// USER</div>
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{sampleCasesMessage}</pre>
                </div>
              </div>

              {/* Query History */}
              {queryHistory.length > 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                  <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                    <span className="text-xs font-mono text-gray-400">query_history.log</span>
                  </div>
                  <div className="p-3 max-h-64 overflow-y-auto">
                    <div className="space-y-1">
                      {queryHistory.map((result, idx) => (
                        <div key={idx} className="font-mono text-xs">
                          <span className="text-gray-500">{String(idx + 1).padStart(3, '0')}</span>
                          <span className="text-gray-600 mx-1">│</span>
                          <span className={colors.primaryClass}>{result.input}</span>
                          <span className="text-gray-600 mx-1">→</span>
                          <span className={colors.successClass}>{JSON.stringify(result.output)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                  <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                    <span className="text-xs font-mono text-gray-400">query_history.log</span>
                  </div>
                  <div className="p-3 max-h-64 flex items-center justify-center">
                    <span className="text-xs font-mono text-gray-600">No queries yet</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom - Interaction */}
            <div className="space-y-6">
              {/* Query Interface */}
              {!taskCompleted && queriesRemaining > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                  <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                    <span className="text-xs font-mono text-gray-400">query.input</span>
                  </div>
                  <div className="p-4">
                    <div className="space-y-3">
                      {queryInputs.map((input, idx) => (
                        <div key={idx} className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-mono text-xs">
                            {String(queriesUsed + idx + 1).padStart(3, '0')}
                          </div>
                          <input
                            type="text"
                            value={input}
                            onChange={(e) => {
                              const newInputs = [...queryInputs];
                              newInputs[idx] = e.target.value;
                              setQueryInputs(newInputs);
                            }}
                            onKeyPress={handleKeyPress}
                            className={`w-full pl-12 pr-4 py-2 bg-gray-800 border border-gray-700 rounded font-mono text-sm text-gray-100 placeholder-gray-500 focus:outline-none ${colors.primaryBorder} focus:ring-1 ${colors.primaryRing}`}
                            placeholder={taskData.input_spec}
                          />
                        </div>
                      ))}
                      <button
                        onClick={handleQuery}
                        className={`w-full ${colors.primaryBg} ${colors.primaryBgHover} text-gray-900 font-mono text-sm py-2 px-4 rounded transition-colors flex items-center justify-center gap-2`}
                      >
                        <span>Execute Query</span>
                        <span className="text-xs opacity-60">[Enter]</span>
                        <span className="text-xs ml-auto opacity-60">{queriesRemaining} left</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
