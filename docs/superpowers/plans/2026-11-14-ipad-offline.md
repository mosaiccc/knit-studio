# iPad offline use

Goal: after one successful online preparation in the installed Home Screen app, the user can close and reopen Knit Studio without a network connection, edit all existing designs, import local files, export and save projects.

Use the existing static application and local IndexedDB workspace. Add a web manifest, home-screen PNG icons, a generated versioned service worker, and a small offline status/help panel. Cache only the packaged application shell. Do not cache sign-in pages, API traffic, or imported personal files. Existing local workspace backup/import remains the device-transfer mechanism.

Updates install into a separate complete cache and wait until all current app windows close. No automatic reload while editing. Readiness requires a controlling worker and a successful completeness check of its cache. Optional persistent-storage permission does not gate readiness or promise permanent storage.

Implementation and verification:

- [x] Write failing worker lifecycle tests; implement complete precaching, offline fetch, login/redirect rejection, failure rollback and cache-only cleanup.
- [x] Write failing offline-status tests; implement registration, clear readiness/error states, retry and nonblocking persistence request.
- [x] Add manifest, icons, installation instructions and a compact responsive status entry; retain original data stores.
- [x] Generate the asset manifest after all assets are final; run the full existing and new tests.
- [x] On a separate test origin, prepare offline, stop only its server, reopen, edit and verify saved changes after another reload. Check local-file import and export while the server is stopped.
- [ ] Copy changes to the original local application and publish exact verified source to the same owner-only Site.

User instructions: install from Safari while connected, open from the new Home Screen icon while connected, wait for “离线已就绪” in that app, import backup there, and then verify reopening in airplane mode. Locally downloaded images/files work offline; cloud-only files need downloading first. Original imported photos are not retained between sessions, while the generated motif is saved. Regular backups remain necessary because browser/OS storage can be removed.

Deployment caveat: the previous release succeeded but the desktop in-app browser reported a TLS connection failure for the private URL. First-time iPad installation requires reaching the HTTPS site; report this separately from local offline verification if it persists.

Verified 2026-11-14: 414 tests pass. The browser cached 46 resources on test port 4194; update preparation displayed the waiting-update notice without reloading. After closing the preview server and confirming the port no longer accepted connections, a new tab loaded the app, restored the project, saved a new dark grid cell, downloaded a valid JSON backup containing that cell, and preserved the change on reload (five colors instead of four). Importing the generated local test PNG also produced a 48 by 48, two-color motif preview without a server. Horizontal and vertical tablet-sized layouts were inspected. These are desktop browser checks, not iPad hardware validation.
