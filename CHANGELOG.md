# redis-user-sessions

## 1.0.3

### Patch Changes

- e5e65c2: Improve `updateSessions` so that it makes less calls to redis
- e5e65c2: `getSessions` now keeps the user sessions list in sync with the available sessions
- e5e65c2: Improve `getSessions` so that redis can read multiple keys without using a waterfall await approach

## 1.0.2

### Patch Changes

- 53bdfad: Initial documentation for redis-user-sessions

## 1.0.1

### Patch Changes

- 3bb7d6a: Update package.json metadata

## 1.0.0

### Major Changes

- 790f33b: First major release of redis-user-sessions.
