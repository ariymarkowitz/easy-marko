---
name: solid-async
description: How to write async code in this Solid 2 app idiomatically — async memos, writable async signals, actions, refresh, Loading — instead of effects that await and write signals, counters against stale results, or hand-rolled caches that trigger re-renders. Use when writing or changing any code that awaits (IndexedDB, File System Access, dynamic imports, fetch) and feeds the UI.
---

# Async in Solid 2

Solid 2 makes async part of the reactive graph: a computation can return a Promise and readers wait for it. Code that works around async by hand is a sign the model isn't being used. Background: `docs/solid-2.0/05-async-data.md` (reads) and `06-actions-optimistic.md` (writes); `01` for `lazy` and `02` for writable memos. `src/state/local-images.ts` and `src/state/granted-folders.ts` follow this guide.

This is for reactive code: `state/`, components and hooks. `lib/` is framework-free, and plain async functions are right there; state code wraps them.

## Smells to replace

| Instead of | Use |
| --- | --- |
| An effect that awaits, then calls a setter | An async memo that returns the value |
| A counter or run id so a late result doesn't overwrite a newer one | Nothing: a recomputation supersedes the one in flight |
| A counter signal bumped when something loads, read to force a re-render | An async memo whose value is the loaded thing |
| A cached promise plus a `reloadX()` that clears it | `createMemo(async …)` plus `refresh(x)` |
| A cache that also sets a `'loading'` state | Return the promise; readers wait |
| A key string built from fields so an effect re-runs | Make the underlying data a signal/store so it can be tracked |
| An async function a click calls that writes state | `action(async function* …)` |
| A busy flag set at the start and cleared in `finally` | A `createOptimistic(false)` flag the action sets; it reverts when the action settles |
| A promise queue so a reload can't overwrite a newer write | Write through an action (see below), then check whether the queue is still needed |

A plain promise cache is still fine for memoising work (such as reading each file once). The smell is using it to *trigger* updates.

## Reading async data

```ts
const access = createMemo((): Access | Promise<Access> => {
  const doc = activeDocument();          // tracked
  if (!doc) return { status: 'unavailable' };
  return accessTo(documentFile(doc), grantedFolders()); // both tracked
});
```

- **Read every dependency before the first `await`.** Only the synchronous part of the compute is tracked. Pass the values into an async helper, or chain memos (reading a pending memo inside another memo just waits for it).
- **Return synchronously when you can.** A memo that returns a promise holds its readers until it settles, even for an already-resolved promise. Return plain values on the fast path (see `showLocalImages`, which returns a string unless an image is still being read).
- **Module-level memos need an owner:** create them inside `createRoot(() => …)`. Add `{ lazy: true }` so they don't run at import. Note that lazy memos are torn down when their last subscriber goes and recomputed on the next read.
- **A setter on derived async data:** function-form `createSignal(async () => …)` is a writable async signal. Actions can set it directly; `refresh()` re-runs its function (see `granted-folders.ts`).
- **Write to async data only from actions.** Observed on rc.7: a plain `set` on a writable async signal while a `refresh` of it is in flight is lost, because the stale result lands over it. The same write inside an action is applied after the refresh lands.
- **Browser state that isn't reactive** (permissions, IndexedDB written by other tabs) needs `refresh(x)` at the moment it may have changed, such as after `requestPermission` or on window focus.

## Writing: actions

```ts
const askAgain = action(async function* (folder: FileSystemDirectoryHandle) {
  if ((await folder.requestPermission({ mode: 'read' })) !== 'granted') return;
  yield;                  // resume in the action's transition after an await
  yield refresh(access);  // wait for the re-check to land
});
```

- Everything up to the first `await` runs synchronously when the action is called, so `requestPermission` and `showDirectoryPicker` still get the user gesture. Keep them before any `await`.
- After an `await`, `yield;` before writing signals so the writes join the action's transition.
- `yield otherAction(...)` and `yield refresh(x)` wait for them.
- Actions don't queue: calling one again while it runs starts a second one alongside it. Guard or serialise yourself if overlapping runs would conflict (such as two read-modify-writes of the same IndexedDB record).
- For a "working…" indicator, set a `createOptimistic(false)` flag to true in the action. It reverts by itself when the action settles, so there is no `finally`. Don't use `isPending` for this.
- Callers can `await` the action, but derived async values that depend on its writes may land a little later. In tests, wait for the output (`vi.waitFor`), not just the action.

## Rendering async values

- **Effects don't wait for a promise their compute returns** (checked on rc.7: the value is dropped). Put a memo in between: `createEffect(createMemo(() => maybeAsync()), apply)`. The same goes for JSX: read an async value through a memo, e.g. `const html = createMemo(() => withLocalImages(block().html))` in a `<For>` callback, then `innerHTML={html()}`.
- **Without a `<Loading>` boundary, the first render waits** for pending async it reads, and dev warns `ASYNC_OUTSIDE_LOADING_BOUNDARY`. Wrap the subtree in `<Loading fallback={…}>` so the rest of the app mounts. After first load, updates keep showing the old content until the new value is ready; use `isPending(() => x())` for an "updating" indicator.
- **`isPending(() => x())`** is true only while a *changed* input is being answered. A bare `refresh(x)` is quiet; to make a reload read as pending, call `affects(x)` before `refresh(x)`.
- **Errors** from async computations go to `<Errored>` or an effect's `error` option, not to a status field. The app has no `<Errored>` boundary yet, so catch expected failures (missing files, denied permissions, IndexedDB errors) inside the computation and return a value that says so, as `readFolders` and `locateFile` do.

## Reading outside the graph

- In an event handler or action, reading an async memo **before its first value throws `NotReadyError`**. During a later recomputation it returns the previous value. Don't guard handlers on async state that may not have loaded; refresh unconditionally, or read it only where the UI that calls the handler already depends on it.
- `await resolve(() => x())` gives a settled value in imperative code (such as the HTML export). It can't be called in a reactive scope.
- In tests, observe async values the way the app does, with an effect over a memo inside `createRoot`, and assert with `vi.waitFor`. Polling with `resolve()` returned out-of-date values for the local-images chain.

## Checking

Behaviour of the prerelease runtime can differ from the RFCs. When relying on a detail, confirm it with a throwaway vitest file in `src/` (delete it afterwards), and check dev diagnostics against `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`.
