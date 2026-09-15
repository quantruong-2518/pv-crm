# 0044 · Import mapping profile is chosen by source first, not guessed by column heuristics

Status: accepted
Source: docs/ban-giao-lead.md — section "Luật rút ra: CHỌN NGUỒN TRƯỚC"

## Context

Importing the Apollo lead file (`LEAD APOLLO.xlsx`, 71 columns, 19 rows,
Korean customers) through the real intake endpoints exposed the limits of
`guessMapping`, the column-alias heuristic used for file imports.

## Decision

Guessing columns by alias is the wrong tool for a 71-column file. The correct
flow is: **choose the source → load that source's mapping profile → only
then read the file.**

A mapping profile is **configuration data, not code** — adding ZoomInfo or
Lusha later means loading a new profile, not shipping a deploy.

## Consequences

This work belongs to the **column-matching step on the FE side**; it does
not touch the API. Apollo's 71-column file is the first mapping profile;
`guessMapping` remains available as a fallback for sources with no profile
yet, but a source with a defined profile skips the heuristic entirely.
