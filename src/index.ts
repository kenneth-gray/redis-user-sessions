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

async function createSessionData(
  client: RedisClient,
  sessionId: string,
  data: MinimumSessionData,
) {
  const sessionData = minimumSessionDataSchema.parse(data);

  const currentSessionData = await readSessionData(client, sessionId);
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

async function readSessionData<T extends MinimumSessionData>(
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

async function updateSessionData(
  client: RedisClient,
  sessionId: string,
  data: Record<string, unknown>,
) {
  const currentSessionData = await readSessionData(client, sessionId);

  if (currentSessionData == null) {
    throw new Error(
      `Session "${sessionId}" does not exist and therefore cannot be updated`,
    );
  }

  await createSessionData(client, sessionId, {
    ...currentSessionData,
    ...data,
  });
}

async function deleteSessionData(client: RedisClient, sessionId: string) {
  const data = await readSessionData(client, sessionId);

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

async function getSessions(client: RedisClient, userId: string) {
  const sessionIds = await client.zRange(getUserSessionsKey(userId), 0, -1);

  const result: Array<{ sessionId: string; data: MinimumSessionData }> = [];
  for (const sessionId of sessionIds) {
    const sessionData = await readSessionData(client, sessionId);

    // This would happen if the session had expired
    if (sessionData == null) {
      continue;
    }

    result.push({ sessionId, data: sessionData });
  }

  return result;
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

export {
  createSessionData,
  readSessionData,
  updateSessionData,
  deleteSessionData,
  getSessions,
};
