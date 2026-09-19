---
name: solid-async
description: How to write async code in this Solid 2 app idiomatically — async memos, refresh, actions, optimistic flags, Loading — instead of effects that await and write signals, counters against stale results, or hand-rolled caches that trigger re-renders. Use when writing or changing any code that awaits (IndexedDB, File System Access, dynamic imports, fetch) and feeds the UI.
---

# Async in Solid 2

A computation can return a Promise and its readers wait for it, so code that works around async by hand isn't using the model. Examples: `src/state/local-images.ts`, `src/state/stored-list.ts`, and the file handles and file actions in `src/state/documents.ts`. Background: `docs/solid-2.0/05-async-data.md` (reads), `06-actions-optimistic.md` (writes).

This applies to `state/`, components and hooks. `lib/` stays framework-free with plain async functions, which state code wraps.

## Smells to replace

| Instead of | Use |
| --- | --- |
| An effect that awaits, then calls a setter | An async memo that returns the value |
| A counter or run id against late results | Nothing: a recomputation supersedes the one in flight |
| A counter signal bumped to force a re-render when something loads | An async memo whose value is the loaded thing |
| A cached promise plus a `reloadX()` that clears it | `createMemo(async …)` plus `refresh(x)` |
| A `'loading'` state | Return the promise; readers wait |
| A key string built so an effect re-runs | Track the underlying signal/store |
| A click handler's async function that writes state after awaits | `action(async function* …)` |
| A busy flag cleared in `finally` | A `createOptimistic(false)` flag set in the action; it reverts when the action settles. Not `isPending` |
| A promise queue so a reload can't overwrite a newer write | Write the storage, then `refresh`. Queue only read-modify-writes that can overlap |

A promise cache that memoises work (reading each file once) is fine; one that *triggers* updates isn't.

## Reading

- **Read every dependency before the first `await`**; only the synchronous part is tracked. Pass values to an async helper, or chain memos (a memo reading a pending memo waits).
- **Return synchronously when you can.** Even a resolved promise holds readers until the next tick (see `showLocalImages`).
- **Module-level memos:** `createMemo(fn, { lazy: true })`, no `createRoot` (an unowned memo disposes itself when unobserved; a module-level root never does).
- **Stored data (IndexedDB) is an async memo of the read.** Change it by writing storage, then `await refresh(x)`, which settles once `x` shows the change (`createStoredList`, `fileHandles`). Never also set it in memory: on rc.7 a write to a writable async signal is lost if a refresh of it is in flight, even from an action. If storage can fail, make the read fall back to the tab's last copy (`listStore`, `readHandles`).
- **Non-reactive browser state** (permissions, other tabs' IndexedDB writes) needs `refresh(x)` when it may have changed: after `requestPermission`, on focus.

## Writing: actions

```ts
const askAgain = action(async function* (folder: FileSystemDirectoryHandle) {
  if ((await folder.requestPermission({ mode: 'read' })) !== 'granted') return;
  yield;                  // resume in the action's transition after an await
  yield refresh(access);  // wait for the re-check to land
});
```

- Code before the first `await` runs synchronously, so pickers and `requestPermission` keep the user gesture there.
- After an `await`, `yield;` before writing signals. `yield otherAction()` / `yield refresh(x)` wait for them.
- **Writes in the same tick as an action call join its transition and are held until it settles** (rc.7), even writes made just before the call. Later ticks aren't held. So only make actions of functions that write state after awaits; ones that only write storage and refresh, or only call actions, stay plain async. `flush()` first if a caller must write in the same tick.
- Actions don't queue; serialise overlapping runs yourself if they'd conflict.
- In tests, wait for derived output with `vi.waitFor`, not just the action's promise.

## Rendering

- **Effects and JSX drop a promise their compute returns.** Put a memo between: `createEffect(createMemo(() => maybeAsync()), apply)`; in JSX, `const html = createMemo(() => withLocalImages(rendered()))` then `innerHTML={html()}`.
- **Wrap async subtrees in `<Loading>`**, or the first render waits and dev warns `ASYNC_OUTSIDE_LOADING_BOUNDARY`. After first load, old content stays until the new value is ready.
- `isPending(() => x())` is true only while a *changed* input is answered; a bare `refresh` is quiet unless preceded by `affects(x)`.
- There's no `<Errored>` boundary: catch expected failures inside the computation and return a value that says so (`locateFile`).

## Outside the graph

- In handlers and actions, reading an async memo before its first value throws `NotReadyError` (later it returns the previous value). Don't guard handlers on it; `latest(x)` gives undefined instead, where "not loaded" can mean "nothing".
- `await resolve(() => x())` gives a settled value in imperative code, not in reactive scopes.
- In tests, observe async values like the app does (effect over a memo in `createRoot`, `vi.waitFor`); polling `resolve()` gave stale values.

## Checking

The prerelease runtime can differ from the RFCs. Confirm a detail you rely on with a throwaway vitest file in `src/` (then delete it), and look up dev diagnostics in `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`.
