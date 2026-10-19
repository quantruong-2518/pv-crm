# 0098 · KPI targets are allocated per person, and a person may counter-propose

Status: accepted (partially supersedes 0082 §1 decisions 1 and 3; §5's "no manager–employee relation" superseded by 0101 for KPI; §5's two-person rule kept; §7's catalog and notification bullets done by 0099)
Source: project owner's decision on the design canvas, 15/10/2026

## Context

0082 §1 fixed KPI per ROLE: "No per-person targets", and "No team or manager
relation". The owner now asks for targets handed down to each person, the
person to confirm or propose another value, the manager to deal with that
proposal, and the system to warn of "about to miss" and "about to hit".

## Decision

### 1 · The role target stays the total; the head of sales splits it

The role target agreed under 0082 is unchanged. The head of sales splits it
into an allocation package, one line per person holding that role. A package
goes draft → submitted → agreed, or returned (a reason is required). The
director approves; the approver must differ from the sender (0082 §5's
two-person rule).

### 2 · Sum to the role target only where a sum means something

For a count or money metric at `own` scope, the lines must sum to the role
target before the package can be submitted. For a ratio, hours or days metric,
or any `room`-scope metric, each person's target is independent and is not
summed.

### 3 · The person confirms or counter-proposes

The recipient confirms, or proposes another value with a reason. The head of
sales picks: accept, keep the old level, or offer another level. One open
proposal per (person, metric). A proposal changes a line of a package that is
not yet locked; an agreed package that must change takes a new version.

### 4 · The scorecard has two target sources

Where a person has an approved personal line, their KPI card uses it; where not,
it uses the role target as in 0082.

### 5 · "Subordinate" is still not a relation

The management screen shows everyone holding a role that has KPIs to whoever
holds `kpi.view-all`. No manager–employee table is added.

> Superseded by 0100 §D: teams with a team lead are wanted (decided, not built).

### 6 · Warnings

"About to miss" when the end-of-month forecast is below `slipRatio` of the
target; "about to hit" when attainment is at or above `hitRatio`. Both
thresholds are config. The defaults 0.8 and 0.9 were proposed by the assistant
and the owner has not confirmed the numbers: they are a provisional default.
A forecast is made only for paced metrics and is not invented for any other.

### 7 · Out of scope (deferred)

- Moving the `KPI_CATALOG` into config (assigning metrics to roles in the
  database); formulas stay in code. Needs its own design.
- A per-role "who proposes / who approves / acknowledgement deadline" flow.
- Notification strings through the E4 bell, waiting for the session now editing
  notifications to finish.

## Consequences

- New tables `kpi_allocation`, `kpi_allocation_line`, `kpi_counter`, and a new
  contract.
- The KPI card has two sources of target (§4).
- 0082 §1 decision 1 and decision 3, and its "no per-person targets", are
  partially superseded; the rest of 0082 stands.
