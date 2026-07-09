# Workflow - Resume Screening Agent

1. Load one approved requisition and preserve its stable requirement identifiers.
2. Reject the task as incomplete if the requisition lacks documented, job-relevant criteria.
3. Load one task-scoped resume from an approved source.
4. Parse job-relevant evidence without scoring or comparing the candidate.
5. Remove protected characteristics and proxy signals before requirement matching.
6. Assess each approved requirement as `met`, `not_met`, or `unclear`.
7. Attach a minimal evidence excerpt, source location, and confidence to every finding.
8. Run the fairness check and stop for review if prohibited reasoning is detected.
9. Build a non-binding assessment with neutral interview focus areas for unclear evidence.
10. Set `human_review_required` to `true` and return the assessment to the recruiter review queue.
11. Never rank, reject, advance, hire, contact, or update an external record.
