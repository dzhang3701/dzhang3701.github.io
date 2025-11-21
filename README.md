# Human Baseline Evaluation System

A web-based interface for evaluating human performance on pattern discovery tasks.

## Setup

### Prerequisites

- Node.js (v18 or higher)
- Python 3.8+
- pip

**Note:** This application depends on the main project's Python modules. Make sure you have the project's virtual environment activated and all dependencies installed.

### Installation

**Important:** Activate your virtual environment first (e.g., `source ../.venv/bin/activate`) before running these commands.

1. Install main project dependencies (if not already installed):
```bash
cd ..
pip install -r requirements.txt
cd human_baseline
```

2. Install human baseline backend dependencies:
```bash
cd backend
pip install -r requirements.txt
cd ..
```

3. Install Node.js dependencies:
```bash
npm install
```

## Running the Application

**Important:** Make sure your virtual environment is activated before starting the backend.

You need to run both the backend and frontend servers:

### Option 1: Using startup scripts

```bash
# Terminal 1: Start backend (make sure .venv is activated)
source ../.venv/bin/activate
chmod +x start_backend.sh
./start_backend.sh

# Terminal 2: Start frontend
chmod +x start_frontend.sh
./start_frontend.sh
```

### Option 2: Manual start

```bash
# Terminal 1: Start Flask backend (port 5001)
# Activate virtual environment first
source ../.venv/bin/activate
cd backend
python api.py

# Terminal 2: Start Next.js frontend (port 3000)
npm run dev
```

## Access the Application

Open your browser and navigate to:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5001

## How It Works

1. Users enter their name on the login page
2. A random task is selected from the 20 available tasks (10 numerical, 10 lexical)
3. Users can:
   - View sample cases if provided
   - Make queries to explore the pattern
   - View query history
   - Submit hypotheses at any time
4. The helper model grades submitted hypotheses
5. Task ends immediately when hypothesis is correct
6. Results are logged to `logs/human_evaluations.jsonl`

## Task Configuration

Tasks are defined in `tasks.json` with configurations for:
- Query limits (total_queries, query_batch_size)
- Task types (classification, integer-to-integer, etc.)
- Tuple lengths for multi-parameter tasks

## Logs

Evaluation results are stored in:
- `logs/human_evaluations.jsonl` - One JSON object per line containing:
  - User name
  - Task ID and category
  - Query history
  - Submissions with grading results
  - Timestamps
