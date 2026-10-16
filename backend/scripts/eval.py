"""Run eval/questions.yaml through the real chat pipeline and print pass/fail.

Uses the configured providers and the current database, so seed first:
    docker compose exec backend python scripts/seed.py
    docker compose exec backend python scripts/eval.py [-v]

Exit code is 1 if any question fails, so it can gate CI.
"""
import argparse
import asyncio
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.chat import answer  # noqa: E402

QUESTIONS = Path(__file__).resolve().parent.parent / "eval" / "questions.yaml"


def check(case: dict, result) -> list[str]:
    problems: list[str] = []
    text = result.answer.lower()
    if case.get("expect_unknown"):
        if not result.unanswered:
            problems.append("expected 'I don't know' but got an answer")
        return problems
    if result.unanswered:
        return ["answered 'I don't know'"]
    for fact in case.get("expect_facts", []):
        options = fact if isinstance(fact, list) else [fact]
        if not any(str(o).lower() in text for o in options):
            problems.append(f"missing {' / '.join(map(str, options))}")
    want = case.get("expect_citation")
    if want and want not in {c.document_title for c in result.citations}:
        problems.append(f"no citation to '{want}'")
    return problems


async def main(verbose: bool) -> int:
    cases = yaml.safe_load(QUESTIONS.read_text())
    rows = []
    for case in cases:
        result = await answer(case["question"], employee_name="eval")
        problems = check(case, result)
        rows.append((case, result, problems))
        if verbose:
            print(f"\nQ: {case['question']}\nA: {result.answer}\n")

    width = max(len(c["question"]) for c, _, _ in rows)
    print(f"\n{'RESULT':<6}  {'QUESTION':<{width}}  {'TOP SIM':>7}  {'CITES':<12}  NOTES")
    print("-" * (width + 50))
    for case, result, problems in rows:
        status = "PASS" if not problems else "FAIL"
        sim = f"{result.top_similarity:.3f}" if result.top_similarity is not None else "   -"
        cites = ",".join(str(c.index) for c in result.citations) or "-"
        print(f"{status:<6}  {case['question']:<{width}}  {sim:>7}  {cites:<12}  {'; '.join(problems)}")

    passed = sum(1 for *_, p in rows if not p)
    print(f"\n{passed}/{len(rows)} passed")
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-v", "--verbose", action="store_true", help="print every answer")
    sys.exit(asyncio.run(main(parser.parse_args().verbose)))
