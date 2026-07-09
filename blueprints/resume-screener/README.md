# Resume Screening Agent

Assesses one resume against one approved job requisition and prepares an evidence-cited summary for recruiter review.

This is a governed starter, not a hiring decision system.
It provides the contract, prompt, mock tools, runtime gate, and deterministic checks needed to build a fairer screening aid without granting it authority over candidates.

## Best fit

Recruiting teams with documented, job-relevant requirements that want a consistent first-pass assessment while keeping every hiring decision with a human recruiter.

## Not for

Ranking candidate pools, inferring protected characteristics, using proxy signals, automatically rejecting or advancing candidates, contacting candidates, or changing applicant-tracking records without approval.

## Risk level

`RG-2 - Structured Output`

The agent produces a non-binding assessment for review.
It cannot make a hiring decision or change any external system.

## Governance boundary

The boundary lives in `rihalguard.json`.

The important rules are:

- Evaluate only documented, job-relevant requirements.
- Ignore protected characteristics and proxy signals.
- Cite resume evidence for every finding.
- Mark missing or ambiguous evidence as `unclear`.
- Require a recruiter to review every assessment.
- Never rank, reject, advance, contact, or otherwise act on a candidate.

Typical review triggers:

- Missing role criteria, conflicting evidence, low confidence, unclear required qualifications, or suspected protected-attribute leakage.

Expected evidence:

- Requirement identifier, requirement status, source excerpt, source location, confidence, and review reason.

## Files

| File | Purpose |
| --- | --- |
| `rihalguard.json` | Risk, scope, tool policy, data handling, and recruiter-review triggers |
| `blueprint.json` | Starter metadata and file references |
| `system-prompt.md` | Fairness, evidence, and authority rules |
| `tools.json` | Mock tool registry and tool risk labels |
| `workflow.md` | Screening and review flow |
| `examples.md` | Clean, ambiguous, proxy-signal, and unsafe scenarios |
| `run.py` | Policy-gated mock runtime |
| `evals/run.py` | Deterministic policy and fairness checks |

## Run

```bash
uv sync
python3 run.py
python3 evals/run.py
```

Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` to run the optional LLM tool-use loop.
Without an API key, `run.py` stays in local policy-gate demo mode.

## Adaptation path

1. Replace the mock requisition reader with an approved, access-controlled source.
2. Replace the mock resume reader with a task-scoped source that minimizes candidate data.
3. Keep candidate decisions and external writes absent or approval-gated.
4. Add role-specific quality tests and matched-profile fairness tests.
5. Validate retention, access, audit, and employment-law requirements with the responsible teams.
6. Run the root validator before sharing.

```bash
python3 ../../scripts/validate.py
```

## Implementation note

Prompt instructions are not sufficient controls for employment workflows.
Production use needs data minimization, access control, runtime tool enforcement, recruiter accountability, ongoing quality review, and jurisdiction-specific legal review.
