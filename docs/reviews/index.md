# Reviews

Assessments requested by the project owner. Each report names its review date,
source revision, evidence, limitations, and recommendations. Findings are
snapshots to recheck against current code; recommendations are not accepted ADRs.

- [Architecture, performance, and vector search](./architecture-performance-and-vector-search.md)
  — concrete correctness, recovery, query, and scaling findings; source locations;
  verification evidence; and the recommendation to retain PostgreSQL search and
  evaluate pgvector only for a confirmed semantic retrieval feature.
