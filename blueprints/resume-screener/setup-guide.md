# Setup guide - Resume Screening Agent

```bash
uv sync
python3 run.py
python3 evals/run.py
```

To implement for real:

1. Connect `get_requisition` to an approved source with stable criteria identifiers.
2. Connect `get_resume` through task-scoped authorization and data minimization.
3. Implement protected-attribute and proxy redaction before any requirement matching.
4. Keep ranking, hiring dispositions, and candidate contact outside the agent.
5. Keep applicant-tracking writes approval-gated.
6. Add matched-profile tests that vary only protected or proxy signals and require identical findings.
7. Add recruiter-reviewed quality tests for every supported job family.
8. Define retention, audit access, incident response, and appeal procedures.
9. Complete security, privacy, employment-law, and accessibility reviews for each deployment jurisdiction.
10. Run root validation before sharing.

```bash
python3 ../../scripts/validate.py
node ../../scripts/validate-risk-tiers.mjs
```
