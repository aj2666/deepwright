"""Exercise the actual pinned CI gate on disposable skill fixtures."""

import json
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parent.parent
RUNNER = ROOT / "scripts" / "check-skills.sh"
VALIDATORS = {
    "Schema & Repository Governance",
    "PII Scan",
    "License Compliance",
    "QUALITY",
    "Unicode Smuggling Detection",
    "SCRIPT_LINT",
}


def skill_source(name):
    # No per-skill author: this intentionally exercises Deepwright's policy.
    return f'''---
name: {name}
description: "Summarize a supplied error message. Use when a developer asks what a failure means."
license: MIT
---

# Error explanation

## Purpose

Explain what the supplied error establishes and what still needs investigation.

## Prerequisites

Start from the error message and any supplied caller context; do not invent missing logs.

## Instructions

1. Read the supplied error and explain its likely cause.
2. Keep uncertainty visible; ask for missing context if the cause is unclear.
3. Return the failing operation, the supported explanation, and the next useful check.

## Examples

Example: For a missing input file, explain which path failed and suggest checking it.

## Limitations

An error message may identify a failing operation without establishing its root cause.

## Troubleshooting

If the message is incomplete, ask for the missing line or caller context and keep the explanation tentative.
'''


class SkillGateTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="deepwright-skill-gate-")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.target = self.root / "skills"
        self.target.mkdir()
        self.reports = self.root / "reports"

    def skill(self, name, source=None):
        directory = self.target / name
        directory.mkdir()
        (directory / "SKILL.md").write_text(
            skill_source(name) if source is None else source, encoding="utf-8"
        )
        return directory

    def run_gate(self):
        return subprocess.run(
            ["sh", str(RUNNER), str(self.target), str(self.reports)],
            text=True, capture_output=True, timeout=60, check=False,
        )

    def report(self, name):
        files = list((self.reports / name).glob("skillevaluator-output-*.json"))
        self.assertEqual(len(files), 1, "Each evaluated skill needs one fresh report")
        return json.loads(files[0].read_text(encoding="utf-8"))

    def test_complete_gate_accepts_valid_skill_with_package_attribution(self):
        self.skill("explain-error")
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = self.report("explain-error")
        self.assertTrue(report["overall_passed"])
        self.assertEqual(report["overall_status"], "passed")
        self.assertEqual({entry["validator"] for entry in report["results"]}, VALIDATORS)
        self.assertFalse(report["incomplete_scans"])

    def test_catalog_reports_both_valid_and_invalid_skills_and_fails(self):
        self.skill("valid-error")
        source = skill_source("invalid-error")
        source = "\n".join(line for line in source.splitlines() if not line.startswith("description:"))
        self.skill("invalid-error", source)
        result = self.run_gate()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertTrue(self.report("valid-error")["overall_passed"])
        self.assertFalse(self.report("invalid-error")["overall_passed"])

    def test_hidden_unicode_payload_fails(self):
        self.skill("hidden-payload", skill_source("hidden-payload") + "\n\U000e0041\n")
        result = self.run_gate()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        findings = [f for r in self.report("hidden-payload")["results"] for f in r["findings"]]
        self.assertTrue(any(f["check_name"] == "ascii_smuggling_payload" for f in findings))

    def test_attribution_exception_does_not_allow_malformed_supplied_authors(self):
        source = skill_source("invalid-author").replace(
            "license: MIT", "license: MIT\nmetadata:\n  author: malformed-author"
        )
        self.skill("invalid-author", source)
        result = self.run_gate()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        findings = [f for r in self.report("invalid-author")["results"] for f in r["findings"]]
        self.assertTrue(any(f["check_name"] == "author_format" for f in findings))

    def test_excessive_instruction_context_fails_quality(self):
        self.skill("oversized-guide", skill_source("oversized-guide") + "\n" + "Repeated guidance. " * 1500)
        result = self.run_gate()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        results = self.report("oversized-guide")["results"]
        quality = next(r for r in results if r["validator"] == "QUALITY")
        self.assertFalse(quality["passed"])

    def test_below_a_grade_fails_even_with_valid_schema(self):
        self.skill("minimal-guide", """---
name: minimal-guide
description: "Use to explain an error message."
license: MIT
---
# Error explanation
Explain the supplied error message.
""")
        result = self.run_gate()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        report = self.report("minimal-guide")
        schema = next(r for r in report["results"] if r["validator"] == "Schema & Repository Governance")
        self.assertTrue(schema["passed"])
        score = report["quality_summary"][0]["overall_score"]
        self.assertGreaterEqual(score, 70)
        self.assertLess(score, 90)

    def test_empty_catalog_is_not_a_pass(self):
        result = self.run_gate()
        self.assertNotEqual(result.returncode, 0)

    def test_existing_reports_are_not_reused_or_overwritten(self):
        self.skill("explain-error")
        self.reports.mkdir()
        marker = self.reports / "previous-run.txt"
        marker.write_text("previous evidence", encoding="utf-8")
        result = self.run_gate()
        self.assertEqual(result.returncode, 2)
        self.assertEqual(marker.read_text(encoding="utf-8"), "previous evidence")


if __name__ == "__main__":
    unittest.main()
