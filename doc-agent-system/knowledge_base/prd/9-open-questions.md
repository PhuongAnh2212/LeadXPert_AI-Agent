# 9. Open Questions

| # | Owner (Function) | Question | Status |
|---|------------------|----------|--------|
| 1 | Legal | Do report artifacts fall under the same data retention regulations as the underlying message data, or can they follow a separate retention policy? Initial assumption: separate policy, default 7 years. | Answered — Legal confirmed separate policy is acceptable; 7-year default approved. |
| 2 | Engineering Lead | What is the maximum practical report size (rows) before PDF generation becomes unreliable? Need load testing to confirm the 50,000-row truncation threshold. | Open — load testing scheduled for Phase 1. |
| 3 | Security | Do reports delivered to external email recipients require additional encryption (e.g., password-protected PDF) beyond TLS-in-transit? | Open — Security review scheduled for Week 3. |
| 4 | Engineering Lead | Should the scheduling service be a new microservice or an extension of the existing task queue? Trade-offs: new service offers isolation but adds operational overhead. | Answered — New lightweight service, deployed alongside existing infrastructure. Isolation outweighs overhead given the compliance-critical nature of scheduling reliability. |
| 5 | Customer Success | Which 5 enterprise accounts should be invited to the closed beta? Criteria: active compliance workflow, responsive POC, diverse channel mix. | Open — CS to recommend by end of Week 3. |
| 6 | Design | Should the report template builder be a standalone page or integrated into the existing Search UI as a "Save & Schedule" flow? | Answered — Integrated into Search UI. Users save filters from where they already build queries. Standalone builder deferred to Phase 4 if needed. |

---
