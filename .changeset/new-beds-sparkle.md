---
'redis-user-sessions': patch
---

Improve `getSessions` so that redis can read multiple keys without using a waterfall await approach
