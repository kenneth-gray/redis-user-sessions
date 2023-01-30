import type { createClient } from 'redis';

import z from 'zod';

const minimumSessionDataSchema = z
  .object({
    expires: z.string().datetime(),
    userId: z.string(),
  })
  // passthrough allows additional keys
  .passthrough();

type MinimumSessionData = z.infer<typeof minimumSessionDataSchema>;
type RedisClient = ReturnType<typeof createClient>;

async function createSession(
  client: RedisClient,
  sessionId: string,
  data: MinimumSessionData,
) {
  const sessionData = minimumSessionDataSchema.parse(data);

  const currentSessionData = await readSession(client, sessionId);
  if (currentSessionData && currentSessionData.userId !== sessionData.userId) {
    throw new Error(
      `Cannot change the userId value in sessions. Session: ${sessionId}`,
    );
  }

  const expiresUnixTimestampMs = Date.parse(sessionData.expires);
  const userSessionsKey = getUserSessionsKey(sessionData.userId);

  await Promise.all([
    client.set(getSessionKey(sessionId), JSON.stringify(sessionData), {
      PXAT: expiresUnixTimestampMs,
    }),
    client.zAdd(userSessionsKey, [
      {
        score: expiresUnixTimestampMs,
        value: sessionId,
      },
    ]),
  ]);

  // No await on purpose - background task
  updateUserSessionsTtl(client, userSessionsKey);
}

async function updateUserSessionsTtl(
  client: RedisClient,
  userSessionsKey: string,
) {
  // Values are session ids, scores are expiry times
  const largestExpiresValueAndScoreArray = await client.zRangeWithScores(
    userSessionsKey,
    -1,
    -1,
  );

  /// No remaining sessions
  if (largestExpiresValueAndScoreArray.length === 0) {
    return;
  }

  const [{ score: largestExpiresUnixTimestampSeconds }] =
    largestExpiresValueAndScoreArray;

  // Set expiry of sorted set to be the largest expires of all user sessions.
  // This allows Redis to automatically purge the remaining sessions if the user
  // never logs in again.
  await client.pExpireAt(userSessionsKey, largestExpiresUnixTimestampSeconds);
}

async function readSession<T extends MinimumSessionData>(
  client: RedisClient,
  sessionId: string,
): Promise<null | T> {
  const serialisedData = await client.get(getSessionKey(sessionId));

  if (serialisedData == null) {
    return null;
  }

  const data: T = JSON.parse(serialisedData);

  // No await on purpose - background task
  removeExpiredSessions(client, data.userId);

  return data;
}

async function updateSessionInternal({
  client,
  sessionId,
  data,
  shouldErrorWhenSessionDoesNotExist,
}: {
  client: RedisClient;
  sessionId: string;
  data: Record<string, unknown>;
  shouldErrorWhenSessionDoesNotExist: boolean;
}) {
  const currentSessionData = await readSession(client, sessionId);

  if (currentSessionData == null) {
    if (shouldErrorWhenSessionDoesNotExist) {
      throw new Error(
        `Session "${sessionId}" does not exist and therefore cannot be updated`,
      );
    } else {
      // Do not attempt to create the session
      return;
    }
  }

  await createSession(client, sessionId, {
    ...currentSessionData,
    ...data,
  });
}

async function updateSession(
  client: RedisClient,
  sessionId: string,
  data: Record<string, unknown>,
) {
  return updateSessionInternal({
    client,
    sessionId,
    data,
    shouldErrorWhenSessionDoesNotExist: true,
  });
}

async function deleteSession(client: RedisClient, sessionId: string) {
  const data = await readSession(client, sessionId);

  // No session
  if (data === null) {
    return;
  }

  const userSessionsKey = getUserSessionsKey(data.userId);

  await Promise.all([
    client.del(getSessionKey(sessionId)),
    client.zRem(userSessionsKey, sessionId),
  ]);

  // No await on purpose - background task
  updateUserSessionsTtl(client, userSessionsKey);
}

function isValidSession(maybeSession: {
  sessionId: string;
  data: null | MinimumSessionData;
}): maybeSession is { sessionId: string; data: MinimumSessionData } {
  return Boolean(maybeSession.data);
}

async function getUserSessions(client: RedisClient, userId: string) {
  const sessionIds = await getSessionIds(client, userId);

  const sessionPromises = sessionIds.map((sessionId) =>
    readSession(client, sessionId).then((sessionData) => ({
      sessionId,
      data: sessionData,
    })),
  );

  const sessions = (await Promise.all(sessionPromises)).filter(isValidSession);

  // If any session was out of date, expired sessions exist
  if (sessionPromises.length !== sessions.length) {
    // No await on purpose - background task
    removeExpiredSessions(client, userId);
  }

  return sessions;
}

async function updateUserSessions(
  client: RedisClient,
  userId: string,
  data: Record<string, unknown>,
) {
  const sessionIds = await getSessionIds(client, userId);

  const promises = sessionIds.map((sessionId) =>
    updateSessionInternal({
      client,
      sessionId,
      data,
      shouldErrorWhenSessionDoesNotExist: false,
    }),
  );

  await Promise.all(promises);
}

function getSessionKey(sessionId: string) {
  return `session:${sessionId}`;
}

function getUserSessionsKey(userId: string) {
  return `user:${userId}:sessions`;
}

async function removeExpiredSessions(client: RedisClient, userId: string) {
  await client.zRemRangeByScore(getUserSessionsKey(userId), '-inf', Date.now());
}

async function getSessionIds(client: RedisClient, userId: string) {
  return client.zRange(getUserSessionsKey(userId), 0, -1);
}

export {
  createSession,
  readSession,
  updateSession,
  deleteSession,
  getUserSessions,
  updateUserSessions,
};
