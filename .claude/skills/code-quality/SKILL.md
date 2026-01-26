---
name: code-quality
description: >
  Enforces architecture, design patterns, and code limits for this TypeScript npm plugin.
  Use when writing, reviewing, or refactoring code.
---

# Architecture Pattern: Ports & Adapters

```
┌─────────────────────────────────────────────────┐
│                 Core Logic                      │
│            (pure, no I/O, testable)             │
└────────────────────┬────────────────────────────┘
                     │ depends on
                     ▼
┌─────────────────────────────────────────────────┐
│                   Ports                         │
│         (interfaces, abstract contracts)        │
└────────────────────┬────────────────────────────┘
                     │ implemented by
                     ▼
┌─────────────────────────────────────────────────┐
│                  Adapters                       │
│    (concrete implementations with real I/O)    │
└─────────────────────────────────────────────────┘
```

## Design Rules

1. **Depend on abstractions** - Core takes interfaces, not concrete classes
2. **Inject dependencies** - Pass via constructor/function params, not import
3. **Pure core** - Business logic has zero I/O (network, fs, timers)
4. **I/O at edges** - Only adapters and entry points touch external systems
5. **No adapter-to-adapter deps** - Adapters are independent, composed at entry

## Layering

| Layer | I/O Allowed | Depends On |
|-------|-------------|------------|
| Entry point / Plugin | yes | everything |
| Orchestration | via ports only | operations, ports |
| Operations | via ports only | algorithms, ports |
| Algorithms | **no** | types only |
| Adapters | yes (their domain) | ports, types |
| Types | **no** | nothing |

**Forbidden:**
- Pure modules importing I/O modules
- Circular dependencies
- Concrete classes in function signatures (use interfaces)

## ESLint Limits (Enforced)

| Limit | Value |
|-------|-------|
| Lines per file | 200 |
| Lines per function | 60 |
| Statements per function | 20 |
| Parameters per function | 5 |
| Nesting depth | 4 |
| Cyclomatic complexity | 15 |

## Splitting Strategy

Limits exist to enforce **separation of concerns**. When exceeded:

**DO:**
- Identify distinct responsibilities in the file
- Extract each responsibility to its own module
- Name modules by what they do, not by "helpers" or "utils"
- Keep related code together in the new module

**NEVER:**
- Delete or inline code just to hit the number
- Combine methods to reduce line count
- Make minimal hacks to pass the linter
- Break functionality to meet limits

## TypeScript

- Explicit return types on exported functions
- Explicit `public`/`private` on class members
- `import type` for type-only imports
- No `any` - use `unknown` + type guards
- No non-null assertions (`!`)
- Prefer `??` over `||`, `?.` over `&&`

## Error Handling

- Custom error classes per domain
- Validate at boundaries (entry points, adapters), not in core
- Result objects for expected failures: `{ success, error?, data? }`

## Checklist

- [ ] Dependencies are interfaces, injected not imported?
- [ ] Pure functions have zero I/O?
- [ ] Within ESLint limits (200/60/20/5/4/15)?
- [ ] Layering respected (no upward deps)?
