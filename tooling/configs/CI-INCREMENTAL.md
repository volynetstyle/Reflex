# Incremental CI evidence

The registry job computes SHA-256 keys from tracked input bytes and executable
permissions. Each package includes its workspace dependency closure, including
peer, development and optional dependencies and source references to maintained
packages. Inputs outside maintained package directories are shared, so changes
to workflows, tooling, scripts, root configs or the lockfile invalidate all keys.
Nested apps own their own inputs. Markdown documentation is excluded except
AGENTS.md; generated outputs and untracked files are not CI inputs.

Package checks and installed consumer qualification restore successful evidence
with an exact actions/cache key. There are no fallback restore keys. Cache misses
run the existing full checks; failed jobs do not save evidence. Hits skip pnpm
installation, builds, browser installation and tests, then upload the original
reports and logs. The required aggregate checks log hashes, the complete registry,
successful jobs and each package report's input fingerprint against the current
registry plan. A cached result retains its original execution timestamps.

Consumer keys include all published packages and their dependency closures. OS,
architecture, Node major and pnpm version are separate key components. GitHub's
normal branch and pull-request cache scope applies. Cache eviction or restricted
access leads to a full execution. Scheduled and manually dispatched CI bypasses
evidence reuse, ensuring regular fresh execution. Static config contracts remain
fresh on every run; benchmark measurement results are not reused.

The first run after this change is cold and populates successful keys. Incremental
reuse speeds subsequent runs with matching inputs; it does not interrupt jobs
already running or resolve config-parity failures.
