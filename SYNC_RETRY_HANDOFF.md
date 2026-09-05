# Shopping sync retry handoff

## Final independent verification — 2026-09-05

- Full suite: 450 passed, 0 failed. Syntax, whitespace, and live-main freshness checks passed.
- Isolated Chrome at 360px EN/ES and 1280px verified the existing shopping transfer flow and optional receipt access without regression.
- Browser recovery checks passed for failed GET retry without PUT, duplicate/reconnect coalescing, durable clear across restart with remote additions, failed PUT retry, late failed GET after successful PUT, and a real 15-second PUT timeout with recovery.
- Browser-simulated storage exhaustion at both initial capture and after the server response preserved in-memory intent, showed a truthful warning, produced no unhandled runtime error, and recovered after storage became writable.
- Controlled v174-to-v175 worker update, reload, and offline shell reopening passed. All browser writes used synthetic household data, not production records.

## Reproduced problem

A grocery `GET` failure displayed Retry, but Retry always called the grocery save path. With no local edit, that could issue an unnecessary `PUT` of the cached list. Repeated taps/reconnects were not coalesced, writes had no bounded duration, successful malformed responses could settle state, and a late failed read could replace a newer successful-save status.

## Implemented

- Recovery records whether the failed operation was a read or a pending write.
- Failed reads retry `GET` and never manufacture a pending edit. If a real pending journal exists, the successful read merges it with remote data before the normal write.
- Failed pending writes retry `PUT` through the existing serialized conflict-aware save coordinator.
- Retry taps and the `online` event share one in-flight recovery request; Retry is visibly disabled while it runs.
- Grocery writes opt into a 15-second timeout. Other POST/PUT callers remain unchanged and unbounded by default; existing GET timeout behavior remains.
- Browser quota/security failures keep the in-memory Shopping intent, resolve without an unhandled rejection, and show a truthful device-storage warning instead of claiming the edit was saved offline.
- Valid versioned envelopes are required before a `200` read/write can settle local state or clear the journal.
- A grocery edit invalidates an older read, and both late success and late failure are ignored.
- English and Spanish statuses distinguish offline, timeout, access (401/403), rate limit (429), service (5xx), malformed response, and unknown local/client failure without showing raw server text.
- Grocery retry no longer overwrites the unrelated shared-menu retry action.

## Compatibility and safety

- No server schema, Blob key, endpoint, household-access rule, or persisted browser key changed.
- Existing `dinner-groceries-pending-v1` intent remains the only durable retry journal.
- Retries are user/reconnect triggered and finite; there is no polling or automatic loop.
- The v175 service-worker/app/style versions remain aligned.

## Verification

- Full automated suite: 450 tests passed, 0 failed; focused API, versioned-collection, language, and sync tests also passed.
- Browser checks passed at 360px in English and Spanish and at 1280px, including read-only retry, duplicate retry/reconnect coalescing, reload recovery, pending-write retry, stale-read protection, and the real 15-second write timeout.
- Browser quota failures passed both before the request and after a successful response: the warning stayed truthful, pending intent recovered, and no runtime error escaped.
- The v174-to-v175 controlled service-worker update, reload, and offline reopen checks passed.

## Honest remaining gap

The exact response from the affected phone and production function logs were not available. The reproduced client defects are covered and fixed, but this does not claim that an independent production/Netlify cause was identified. Production verification should confirm the phone's actual response/status after deployment.
