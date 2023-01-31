# redis-user-sessions

Helper functions for managing redis user sessions.

## Benefits

- Adds appropriate TTL for redis keys based on the required `expires` property on a session
- Tracks sessions across user ids (using appropriate TTLs), making it easy to allow users see what sessions are currently active and manage deletion of their own sessions (when exposed to the user)

## Installation

```sh
npm install redis-user-sessions
```

## Example usage

```ts
import { createClient } = from 'redis';
import { createSession } = from 'redis-user-sessions';

(async () => {
  // Create and connect redis client
  const client = createClient();
  client.on('error', (error) => {
    throw error;
  });
  await client.connect();

  // Create session data
  const anyOtherData = { role: 'admin' };
  await createSession({
    client,
    sessionId: 'session-id',
    data: {
      expires: new Date().toISOString(),
      userId: 'user-id-for-eva',
      ...anyOtherData,
    },
  });
})();
```

## API

### createSession

Creates session data keyed on the session id provided.

`async function createSession({ client, sessionId, data })`

<!-- https://www.tablesgenerator.com/markdown_tables -->

| Property       | Type          | Default          | Description                                                                                                                                             |
| -------------- | ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| client         | `RedisClient` | _required_       | Redis client created using `createClient` from the `redis` npm package. Must already be connected to Redis.                                             |
| sessionId      | `string`      | _auto generated_ | Unique identifier for the session.                                                                                                                      |
| data           | `object`      | _required_       | Object that must contain the following properties: `userId` (string), `expires` (ISO 8601 timestamp). It can contain any other serialisable properties. |
| `return value` | `undefined`   | N/A              | N/A                                                                                                                                                     |

### readSession

Read session data keyed on the session id provided.

`async function readSession({ client, sessionId })`

<!-- https://www.tablesgenerator.com/markdown_tables -->

| Property       | Type              | Default    | Description                                                                                                                                                                                             |
| -------------- | ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| client         | `RedisClient`     | _required_ | Redis client created using `createClient` from the `redis` npm package. Must already be connected to Redis.                                                                                             |
| sessionId      | `string`          | _required_ | Unique identifier for the session.                                                                                                                                                                      |
| `return value` | `object` / `null` | N/A        | Object that must contain the following properties: `userId` (string), `expires` (ISO 8601 timestamp). It can contain any other serialisable properties. Returns `null` when the session does not exist. |

### updateSession

Updates existing sessions keyed on the session id provided. If the session does not exist the promise will be rejected.

`async function updateSession({ client, sessionId, data })`

<!-- https://www.tablesgenerator.com/markdown_tables -->

| Property       | Type          | Default    | Description                                                                                                 |
| -------------- | ------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| client         | `RedisClient` | _required_ | Redis client created using `createClient` from the `redis` npm package. Must already be connected to Redis. |
| sessionId      | `string`      | _required_ | Unique identifier for the session.                                                                          |
| data           | `object`      | _required_ | Object can contain any serialisable properties.                                                             |
| `return value` | `undefined`   | N/A        | N/A                                                                                                         |

### deleteSession

Deletes an existin session keyed on the session id provided. If the session does not exist nothing happens.

`async function deleteSession({ client, sessionId })`

<!-- https://www.tablesgenerator.com/markdown_tables -->

| Property       | Type          | Default    | Description                                                                                                 |
| -------------- | ------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| client         | `RedisClient` | _required_ | Redis client created using `createClient` from the `redis` npm package. Must already be connected to Redis. |
| sessionId      | `string`      | _required_ | Unique identifier for the session.                                                                          |
| `return value` | `undefined`   | N/A        | N/A                                                                                                         |

### getUserSessions

Get all sessions for a particular user id.

`async function getUserSessions({ client, userId })`

<!-- https://www.tablesgenerator.com/markdown_tables -->

| Property       | Type                         | Default    | Description                                                                                                                                                                                                      |
| -------------- | ---------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| client         | `RedisClient`                | _required_ | Redis client created using `createClient` from the `redis` npm package. Must already be connected to Redis.                                                                                                      |
| userId         | `string`                     | _required_ | Unique identifier for the user.                                                                                                                                                                                  |
| `return value` | `Array<{ sessionId, data }>` | N/A        | `sessionId` is a string. `data` is an object which will contain the following properties: `userId` (string), `expires` (ISO 8601 timestamp). The data object can also contain any other serialisable properties. |

### updateUserSessions

Update all sessions tied to a specific user id.

`async function updateUserSessions({ client, userId, data })`

<!-- https://www.tablesgenerator.com/markdown_tables -->

| Property       | Type          | Default    | Description                                                                                                 |
| -------------- | ------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| client         | `RedisClient` | _required_ | Redis client created using `createClient` from the `redis` npm package. Must already be connected to Redis. |
| userId         | `string`      | _required_ | Unique identifier for the user.                                                                             |
| data           | `object`      | _required_ | Object can contain any serialisable properties.                                                             |
| `return value` | `undefined`   | N/A        | N/A                                                                                                         |
