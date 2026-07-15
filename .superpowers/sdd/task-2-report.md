# CAP-0104 Task 2 Report

## Status

Second fix wave complete on `dev`. Final HEAD: this report's commit (exact SHA
recorded in the handoff).

## Changed files

- `packages/spotlight-client/src/node/capabilities/skillDirectoryLoader.ts`
  - Added the exact V1 Skill/file/expanded-byte limits.
  - Added stable loader error codes and a typed error class.
  - Added a recursive `lstat`/sorted-`readdir` loader with lexical containment checks, symlink and non-regular rejection, byte-preserving `readFile()`, POSIX relative paths, absolute watched paths, and UTF-8 byte ordering.
- `packages/spotlight-client/src/node/index.ts`
  - Exported the loader API from the Node-only entry point.
- `packages/spotlight-client/tests/skillDirectoryLoader.test.ts`
  - Added focused ordering, exact-byte, accounting, unsafe-entry, path-escape, and exact-limit-overflow coverage.

No Vite composition or browser/root export was changed.

## TDD evidence

### Initial RED

Command:

```bash
pnpm --filter @inupedia/spotlight-client test -- skillDirectoryLoader.test.ts
```

Result: exit `1`; `1` test file failed, `8/8` tests failed. The expected cause was observed: `loadCanonicalSkillsV1 is not a function` and `CAPABILITY_SKILL_LIMITS_V1` was undefined because the module/export did not yet exist.

### First implementation check

Result: exit `1`; `7/8` tests passed. The remaining mismatch was test-only: Node `readFile()` correctly returned a `Buffer`, while Vitest treated it as constructor-distinct from the fixture's plain `Uint8Array` despite identical bytes. The assertion was corrected to compare byte values without changing production behavior.

### Ordering regression RED

Self-review identified that sorted `Dirent[]` traversal alone does not guarantee full relative-path UTF-8 ordering. A regression fixture using `a./dot.txt` and `a/slash.txt` was added first.

Result: exit `1`; `7/8` tests passed. The expected ordering failure showed `a/slash.txt` before `a./dot.txt`. The minimal fix sorts retained files by complete relative POSIX path using the required UTF-8 byte comparator.

### Focused GREEN

Command:

```bash
pnpm --filter @inupedia/spotlight-client test -- skillDirectoryLoader.test.ts
pnpm --filter @inupedia/spotlight-client typecheck
```

Result: exit `0`; `1/1` focused test file passed, `8/8` tests passed; both TypeScript configurations passed with no diagnostics.

### Full verification

Command:

```bash
pnpm --filter @inupedia/spotlight-client test
pnpm --filter @inupedia/spotlight-client typecheck
git diff --check
```

Result: exit `0`; `13/13` test files passed, `162/162` tests passed; typecheck passed; `git diff --check` reported no whitespace errors.

## Self-review

- Skill count is checked before any directory walk.
- Each candidate is lexically contained within its Skill directory; each Skill directory is lexically contained within the project root.
- Skill roots and every entry use `lstat`; symlinks, FIFOs, and all other non-file/non-directory entries are rejected before `readFile()`.
- File count increments before reading/retaining the file; expanded bytes increment from the actual `readFile()` Buffer before retaining it; comparisons use `>` so exactly 200 Skills, 2,000 files, and 20 MiB remain allowed.
- Skill names, complete relative file paths, every `Dirent[]`, and absolute `watchedFiles` use stable UTF-8 byte ordering.
- Serialized file paths are POSIX-relative and file payloads retain exact binary bytes.
- Loader exports exist only under `src/node/index.ts`; root and Vite entry points remain unchanged.

## Concerns

None within the specified Task 2 scope.

## Fix Wave: TOCTOU, bounded reads, and deterministic input rejection

### RED evidence

After adding focused race, bounded-read, exact-boundary, and duplicate/overlap fixtures, the existing implementation was run unchanged:

```bash
pnpm --filter @inupedia/spotlight-client test -- skillDirectoryLoader.test.ts
```

Result: exit `1`; `1` test file failed, `10/16` tests passed and `6/16` failed. The expected failures proved that duplicate Skill names, duplicate directories, and parent/child directories were accepted; the loader used unbounded `readFile()` for a 20 MiB + 1 byte input; and file/Skill-root swaps reached a path-based outside-content read attempt that the fixtures blocked before observing sentinel bytes.

A self-review regression then added `a`, `a-elsewhere`, and `a/child` to prove that UTF-8 sorting can place an unrelated sibling between overlapping directories:

```bash
pnpm --filter @inupedia/spotlight-client test -- skillDirectoryLoader.test.ts
```

Result: exit `1`; `16/17` tests passed and the non-adjacent parent/child overlap test failed as expected. The initial adjacent-only validation was replaced with deterministic pairwise validation over the maximum 200 entries.

### GREEN evidence

Commands:

```bash
pnpm --filter @inupedia/spotlight-client test -- skillDirectoryLoader.test.ts
pnpm --filter @inupedia/spotlight-client test
pnpm --filter @inupedia/spotlight-client typecheck
git diff --check
```

Result: exit `0`; the focused file passed `18/18` tests, the full client suite passed `13/13` files and `172/172` tests, both TypeScript configurations passed with no diagnostics, and `git diff --check` reported no whitespace errors.

The focused coverage now proves exactly 200 Skills, 2,000 files, and 20 MiB succeed; 201 Skills, 2,001 files, and 20 MiB + 1 byte fail with the existing stable limit codes. A sparse file 1 MiB over the byte limit proves the loader invokes no unbounded `readFile()` and reads exactly the remaining 20 MiB budget plus the one-byte overflow probe.

### Implementation rationale

- Skill definitions are rejected before filesystem traversal when names repeat, resolved directories repeat, or any resolved directories have a parent/child overlap. Inputs are UTF-8 sorted before deterministic validation and output.
- Each Skill root and traversed directory is pinned by canonical path plus `dev`/`ino`. Directory identity and canonical path are revalidated around `readdir()`, before entries, after child traversal, and after traversal so a parent/root replacement is rejected before file content reads.
- Files are opened through a handle with `O_NOFOLLOW` when Node exposes it. Platforms without that flag use the explicit safe fallback of pre-read canonical containment plus opened-handle/path `dev`/`ino` identity and parent-directory pin validation; there is no path-only read fallback.
- File content is read from the opened handle in 64 KiB chunks with a hard cap of the remaining expanded-byte budget plus one overflow byte. The loader validates handle/path identity, canonical containment, parent identity, and size both before and after reading, then retains bytes only after all checks pass.
- Race fixtures intercept the vulnerable boundary and block any actual outside-content read; assertions require zero outside-read attempts after the fix.

### Concerns

None within the CAP-0104 Task 2 fix scope.

## Second Fix Wave: stable enumeration and canonical identity preflight

### RED evidence

Four focused regressions were added before production changes: a Skill-root
swap immediately before directory enumeration, same-size in-place file
mutation, a canonical duplicate reached through a symlinked ancestor, and a
canonical parent/child overlap reached through a symlinked ancestor.

Command:

```bash
pnpm --filter @inupedia/spotlight-client test -- skillDirectoryLoader.test.ts
```

Result: exit `1`; `18/22` tests passed and the four new tests failed for the
expected reasons. The old implementation never invoked the `opendir()` hook,
accepted both canonical alias forms, and returned bytes after a same-inode,
same-size mutation because it compared only identity and size.

### GREEN evidence

Commands:

```bash
pnpm --filter @inupedia/spotlight-client test -- skillDirectoryLoader.test.ts
pnpm --filter @inupedia/spotlight-client test
pnpm --filter @inupedia/spotlight-client typecheck
git diff --check
```

Result: exit `0`; the focused loader file passed `21/21` tests, the full client
suite passed `13/13` files and `175/175` tests, both TypeScript configurations
passed with no diagnostics, and `git diff --check` reported no whitespace
errors.

### Implementation rationale

- Every Skill root is pinned to its canonical path and filesystem snapshot
  before any Skill content is enumerated. Pairwise validation then rejects
  canonical duplicates, canonical parent/child overlaps, and same `dev`/`ino`
  aliases, including aliases reached through symlinked ancestors.
- Directory enumeration uses an opened `Dir` from `opendir()` and explicit
  `Dir.read()` calls. The original path's canonical path, identity,
  `mtimeNs`, and `ctimeNs` are validated before opening, after opening, after
  enumeration, between entries, and after child traversal. Entry-derived
  errors are sanitized, and no entry is processed until the post-enumeration
  validation succeeds.
- File snapshots now compare `dev`, `ino`, size, `mtimeNs`, and `ctimeNs`
  across the path-before-open, opened handle, path-after-open, handle-after-read,
  and path-after-read observations. Same-inode and same-size in-place mutation
  therefore fails closed before bytes are retained.
- The deterministic pre-enumeration race fixture swaps the original Skill root
  immediately before the first `Dir.read()`. It proves that the opened handle
  observes no outside filename, no outside bytes are read, and the stable unsafe
  error contains neither outside names nor content.

### Controller adjudication

The controller rejected a universal macOS fail-closed policy because Node does
not expose portable descriptor-relative child opens and `/dev/fd/<fd>` is not a
directory-enumeration backend on the supported macOS runtime. The accepted
portable boundary follows the written requirement of preventing outside
content reads and disclosure: stable `opendir()` enumeration, bracketed
identity/canonical/timestamp validation, sanitized errors, and handle-backed
file reads with pre/post identity checks. This preserves normal macOS loading
while closing the demonstrated pre-enumeration race.

### Concerns

None within the controller-adjudicated CAP-0104 Task 2 boundary.
