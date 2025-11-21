"""Grade human hypotheses using the helper model."""

from inspect_ai.model import get_model, ChatMessageSystem, ChatMessageUser

# Use Gemini 2.5 Flash for rigorous grading
HELPER_MODEL = "google/gemini-2.5-flash"


def _format_pairs(title: str, pairs) -> str:
    """Format dict or list pairs for the grading prompt."""
    if not pairs:
        return f"{title}: none provided."

    lines = [f"{title}:"]
    if isinstance(pairs, dict):
        iterable = pairs.items()
    else:
        iterable = pairs

    for item in iterable:
        if isinstance(item, (list, tuple)) and len(item) == 2:
            inp, out = item
            lines.append(f"- {inp} → {out}")
        else:
            lines.append(f"- {item}")

    return "\n".join(lines)


async def grade_hypothesis(
    hypothesis: str,
    correct_description: str,
    test_cases: dict,
    sample_cases: dict = None,
    query_history: list = None,
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
        content=(
            "You are a careful but fair grader verifying whether the human's hypothesis matches the official rule. "
            "Use the rule description and all provided cases. Accept concise descriptions when they unambiguously describe the same rule "
            "even if they only name the underlying concept (e.g., \"primality\" for a prime/composite rule)."
        )
    )

    sample_block = _format_pairs("Sample cases", sample_cases)
    test_block = _format_pairs("Held-out test cases", test_cases)
    query_block = _format_pairs("Human query history", query_history)

    user_prompt_text = (
        "Determine if the hypothesis is correct.\n\n"
        f"Official rule: {correct_description}\n"
        f"Hypothesis: {hypothesis}\n\n"
        f"{sample_block}\n\n"
        f"{test_block}\n\n"
        f"{query_block}\n\n"
        "Grading guidelines:\n"
        "- Accept whenever the hypothesis would reproduce all outputs AND clearly refers to the exact rule, even if the wording is brief.\n"
        "- Reject responses that are vacuous (e.g., \"the right rule\") or clearly inconsistent with the official rule.\n"
        "- Treat exact references to the governing concept (like \"primality\" or \"parity\") as sufficient when that concept uniquely specifies the behavior.\n"
        "- Semantic equivalents with clear logic are acceptable.\n\n"
        "Answer format: respond with YES or NO as the first word, followed by a short justification."
    )

    user_prompt = ChatMessageUser(content=user_prompt_text)

    # Get the model's response
    response = await model.generate([system_prompt, user_prompt])

    # Extract text from response (handle ContentText objects and lists)
    content = response.message.content
    if isinstance(content, list) and len(content) > 0:
        # Handle list of ContentText objects
        if hasattr(content[0], "text"):
            response_text = content[0].text.strip()
        else:
            response_text = str(content[0]).strip()
    elif hasattr(content, "text"):
        response_text = content.text.strip()
    elif isinstance(content, str):
        response_text = content.strip()
    else:
        response_text = str(content).strip()

    # Parse the response
    success = response_text.upper().startswith("YES")

    return {
        "success": success,
        "explanation": response_text,
        "raw_response": response_text,
    }


if __name__ == "__main__":
    import asyncio

    # Test the grader
    async def test():
        result = await grade_hypothesis(
            hypothesis="Returns 1 if the number is prime, otherwise 0",
            correct_description="1 if prime, 0 otherwise",
            test_cases={"2": 1, "3": 1, "4": 0, "5": 1, "6": 0},
            sample_cases={"7": 1, "9": 0},
        )
        print(result)

    asyncio.run(test())
