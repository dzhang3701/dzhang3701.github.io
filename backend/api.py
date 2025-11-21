"""Flask API for human baseline evaluation."""
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import asyncio
from datetime import datetime
from pathlib import Path
import uuid

from task_loader import load_task_data, query_task
from grader import grade_hypothesis

app = Flask(__name__)
# Enable CORS for frontend (localhost and GitHub Pages)
CORS(app, origins=[
    "http://localhost:3000",
    "https://dzhang3701.github.io",
    "http://127.0.0.1:3000"
])

# Store for active sessions
sessions = {}

# Log directory
LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "human_evaluations.jsonl"


@app.route("/api/start-task", methods=["POST"])
def start_task():
    """Initialize a new task session for a user."""
    data = request.json
    user_name = data.get("user_name")
    task_id = data.get("task_id")
    task_category = data.get("task_category")

    # Load task data
    task_data = load_task_data(task_id, task_category)

    # Create session
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "user_name": user_name,
        "task_id": task_id,
        "task_category": task_category,
        "sample_cases": task_data["sample_cases"],
        "test_cases": task_data["test_cases"],
        "rule_description": task_data["rule_spec"]["description"],
        "rule_spec": task_data["rule_spec_obj"],  # Store the actual rule spec object
        "query_history": [],
        "queries_used": 0,
        "submissions": [],
        "start_time": datetime.now().isoformat(),
    }

    # Load task config from tasks.json
    with open(Path(__file__).parent.parent / "tasks.json") as f:
        tasks = json.load(f)

    # Find the task config
    task_config = None
    for task in tasks[task_category]:
        if task["id"] == task_id:
            task_config = task
            break

    # Get input and output specs from rule_spec
    rule_spec = task_data["rule_spec_obj"]
    input_spec = rule_spec.input_spec()
    output_spec = rule_spec.output_spec()

    return jsonify({
        "session_id": session_id,
        "input_spec": input_spec,
        "output_spec": output_spec,
        "sample_cases": task_data["sample_cases"],
        "test_cases_count": len(task_data["test_cases"]),
        "total_queries": task_config["total_queries"],
        "query_batch_size": task_config["query_batch_size"],
    })


@app.route("/api/query", methods=["POST"])
def handle_query():
    """Process a query from the user."""
    import ast
    from rule_specifications import IntegerTupleClassificationSpec, IntegerTupleIntegerSpec

    data = request.json
    session_id = data.get("session_id")
    inputs = data.get("inputs")  # List of inputs

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    rule_spec = session["rule_spec"]

    # Load task config
    with open(Path(__file__).parent.parent / "tasks.json") as f:
        tasks = json.load(f)

    task_config = None
    for task in tasks[session["task_category"]]:
        if task["id"] == session["task_id"]:
            task_config = task
            break

    # Validate batch (same logic as model sees)
    if not inputs:
        return jsonify({"error": "Query batch must contain at least one input."}), 400

    if len(inputs) > task_config["query_batch_size"]:
        # Check for missing parentheses error (same as model sees)
        if isinstance(rule_spec, (IntegerTupleClassificationSpec, IntegerTupleIntegerSpec)):
            return jsonify({"error": "MISSING PARENTHESES: Wrap each tuple in parentheses, e.g. ['(1, 2)', ...]."}), 400
        return jsonify({"error": f"Batch size {len(inputs)} exceeds limit. You may query at most {task_config['query_batch_size']} inputs."}), 400

    # Check query limits
    remaining = task_config["total_queries"] - session["queries_used"]
    if remaining <= 0:
        return jsonify({"error": "No queries remaining."}), 400
    if len(inputs) > remaining:
        return jsonify({"error": f"Only {remaining} queries remaining. Reduce batch size."}), 400

    # Process queries (same logic as model sees)
    results = []
    for inp in inputs:
        try:
            # Try to parse string representation (e.g., "(1, 2)")
            try:
                normalized_input = ast.literal_eval(inp)
            except Exception:
                normalized_input = inp

            # Validate input using rule spec
            is_valid, error_msg = rule_spec.validate_input(normalized_input)
            if not is_valid:
                return jsonify({"error": f"Invalid input {normalized_input}: {error_msg}"}), 400

            # Query the task
            output = query_task(session["task_id"], session["task_category"], normalized_input)
            session["query_history"].append((str(normalized_input), output))
            session["queries_used"] += 1
            results.append({"input": str(normalized_input), "output": output})

        except Exception as e:
            return jsonify({"error": str(e)}), 400

    return jsonify({
        "results": results,
        "queries_used": session["queries_used"],
        "queries_remaining": task_config["total_queries"] - session["queries_used"]
    })


@app.route("/api/submit-hypothesis", methods=["POST"])
def submit_hypothesis():
    """Submit and grade a hypothesis."""
    data = request.json
    session_id = data.get("session_id")
    hypothesis = data.get("hypothesis")

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]

    # Grade the hypothesis
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        result = loop.run_until_complete(
            grade_hypothesis(
                hypothesis=hypothesis,
                correct_description=session["rule_description"],
                test_cases=session["test_cases"],
                sample_cases=session["sample_cases"],
                query_history=session["query_history"]
            )
        )
    finally:
        loop.close()

    # Record submission
    submission = {
        "hypothesis": hypothesis,
        "queries_at_submission": session["queries_used"],
        "timestamp": datetime.now().isoformat(),
        "grading_result": result
    }
    session["submissions"].append(submission)

    # Always log when hypothesis is submitted
    log_session(session_id)

    return jsonify({
        "success": result["success"],
        "explanation": result["explanation"],
        "task_complete": result["success"]  # End immediately if successful
    })


def log_session(session_id: str):
    """Log session data to JSONL file."""
    if session_id not in sessions:
        return

    session = sessions[session_id]

    log_entry = {
        "user_name": session["user_name"],
        "task_id": session["task_id"],
        "task_category": session["task_category"],
        "rule_description": session["rule_description"],
        "queries_used": session["queries_used"],
        "query_history": session["query_history"],
        "submissions": session["submissions"],
        "start_time": session["start_time"],
        "end_time": datetime.now().isoformat(),
        "success": any(s["grading_result"]["success"] for s in session["submissions"]),
    }

    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(log_entry) + "\n")


@app.route("/api/end-task", methods=["POST"])
def end_task():
    """End the task and log results."""
    data = request.json
    session_id = data.get("session_id")

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    log_session(session_id)

    # Clean up session
    del sessions[session_id]

    return jsonify({"success": True})


if __name__ == "__main__":
    app.run(port=5001, debug=True)
