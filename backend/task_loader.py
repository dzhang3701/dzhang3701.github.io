"""Load task data for human evaluation."""
import json
import sys
import os
from pathlib import Path

# Add parent directory to path to import from main project
parent_dir = Path(__file__).parent.parent.parent
sys.path.append(str(parent_dir))

from tasks.numerical_tasks import RULES as NUMERICAL_RULES
from tasks.lexical_semantic_tasks import RULES as LEXICAL_RULES
from sample_test_data.data_management import load_cases


def load_task_data(task_id: str, task_category: str):
    """Load sample cases and test cases for a task.

    Args:
        task_id: The task identifier (e.g., "is_prime")
        task_category: Either "numerical" or "lexical"

    Returns:
        dict with sample_cases and test_cases
    """
    # Get the appropriate rules dictionary
    if task_category == "numerical":
        rules = NUMERICAL_RULES
    elif task_category == "lexical":
        rules = LEXICAL_RULES
    else:
        raise ValueError(f"Invalid task category: {task_category}")

    if task_id not in rules:
        raise ValueError(f"Task {task_id} not found in {task_category} rules")

    rule_spec = rules[task_id]

    # Load sample and test cases
    sample_cases = load_cases(task_id, rule_spec, "samples")
    test_cases = load_cases(task_id, rule_spec, "tests")

    # Convert to serializable format
    sample_cases_serialized = {str(k): v for k, v in sample_cases.items()}
    test_cases_serialized = {str(k): v for k, v in test_cases.items()}

    return {
        "sample_cases": sample_cases_serialized,
        "test_cases": test_cases_serialized,
        "rule_spec": {
            "name": rule_spec.name,
            "description": rule_spec.description,
        },
        "rule_spec_obj": rule_spec  # Include the full rule spec object
    }


def query_task(task_id: str, task_category: str, input_value):
    """Query the task with an input and get the output.

    Args:
        task_id: The task identifier
        task_category: Either "numerical" or "lexical"
        input_value: The input to query

    Returns:
        The output from the task's predicate function
    """
    if task_category == "numerical":
        rules = NUMERICAL_RULES
    elif task_category == "lexical":
        rules = LEXICAL_RULES
    else:
        raise ValueError(f"Invalid task category: {task_category}")

    if task_id not in rules:
        raise ValueError(f"Task {task_id} not found in {task_category} rules")

    rule_spec = rules[task_id]

    # Parse input if it's a string representation of a tuple
    if isinstance(input_value, str) and input_value.startswith("("):
        import ast
        input_value = ast.literal_eval(input_value)

    # Execute the predicate
    result = rule_spec.predicate(input_value)

    return result


if __name__ == "__main__":
    # Test loading a task
    data = load_task_data("is_prime", "numerical")
    print(json.dumps(data, indent=2))
