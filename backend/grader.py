"""Grade human hypotheses using the helper model."""
import sys
import os
from pathlib import Path

# Add parent directory to path
parent_dir = Path(__file__).parent.parent.parent
sys.path.append(str(parent_dir))

from inspect_ai.model import get_model, ChatMessageSystem, ChatMessageUser
from config import HELPER_MODEL


async def grade_hypothesis(
    hypothesis: str,
    correct_description: str,
    test_cases: dict,
    sample_cases: dict = None,
    query_history: list = None
) -> dict:
    """Grade a human's hypothesis using the helper model.

    Args:
        hypothesis: The human's description of the pattern
        correct_description: The actual rule description
        test_cases: The test cases with correct answers
        sample_cases: Optional sample cases shown to the human
        query_history: Optional history of queries made

    Returns:
        dict with success (bool) and explanation (str)
    """
    # Initialize the helper model
    model = get_model(HELPER_MODEL)

    # Create the grading prompt
    system_prompt = ChatMessageSystem(
        content="You are grading whether a human has correctly identified a pattern/rule. "
        "Your job is to determine if their hypothesis correctly describes the rule, "
        "even if their wording is different from the official description. "
        "Focus on semantic correctness, not exact wording."
    )

    user_prompt_text = f"""Task: Determine if the human correctly identified the pattern.

Official Rule Description: {correct_description}

Human's Hypothesis: {hypothesis}

Test Cases (showing the correct pattern):
{chr(10).join([f"{k} → {v}" for k, v in list(test_cases.items())[:10]])}
"""

    if sample_cases:
        user_prompt_text += f"\n\nSample Cases (shown to human):\n{chr(10).join([f'{k} → {v}' for k, v in sample_cases.items()])}"

    if query_history:
        user_prompt_text += f"\n\nHuman's Query History (showing their exploration):\n{chr(10).join([f'{inp} → {out}' for inp, out in query_history[:20]])}"

    user_prompt_text += "\n\nDoes the human's hypothesis correctly describe the rule? Respond with YES or NO, followed by a brief explanation."

    user_prompt = ChatMessageUser(content=user_prompt_text)

    # Get the model's response
    response = await model.generate([system_prompt, user_prompt])

    response_text = str(response.message.content).strip()

    # Parse the response
    success = response_text.upper().startswith("YES")

    return {
        "success": success,
        "explanation": response_text,
        "raw_response": response_text
    }


if __name__ == "__main__":
    import asyncio

    # Test the grader
    async def test():
        result = await grade_hypothesis(
            hypothesis="Returns 1 if the number is prime, otherwise 0",
            correct_description="1 if prime, 0 otherwise",
            test_cases={"2": 1, "3": 1, "4": 0, "5": 1, "6": 0},
            sample_cases={"7": 1, "9": 0}
        )
        print(result)

    asyncio.run(test())
