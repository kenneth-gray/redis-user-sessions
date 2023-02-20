import { execSync } from 'node:child_process';

import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createSession,
  readSession,
  updateSession,
  deleteSession,
  getUserSessions,
  updateUserSessions,
  updateSessions,
} from './index';

type RedisClient = ReturnType<typeof createClient>;

describe('redis-user-sessions', () => {
  beforeAll(() => {
    execSync('docker-compose up -d');
  });

  afterAll(() => {
    execSync('docker-compose down');
  });

  describe('createSession', () => {
    it.fails(
      'errors when expires is not a datetime',
      redisTest((client) =>
        createSession({
          client,
          sessionId: '',
          data: {
            expires: '',
            userId: 'Elijah',
          },
        }).then(() => undefined),
      ),
    );

    it.fails(
      'errors when attempting to create the same session with a different userId',
      redisTest(async (client) => {
        const sessionId = 'e8a11617-8781-5103-80ee-1437532c985d';
        const expires = getInXMinutesDate(10).toISOString();

        await createSession({
          client,
          sessionId,
          data: {
            expires,
            userId: 'Danny',
          },
        });

        await createSession({
          client,
          sessionId,
          data: {
            expires,
            userId: 'Ronnie',
          },
        });
      }),
    );

    it(
      'creates session data and adds TTL that maches expires',
      redisTest(async (client) => {
        const inTenMinutesDate = getInXMinutesDate(10);
        const sessionId = '3e4ad771-d2a6-5589-989c-f2de366b9e35';
        const sessionKey = getSessionKey(sessionId);
        const userId = 'Ian';
        const data = {
          expires: inTenMinutesDate.toISOString(),
          userId,
        };

        const returnedSessionId = await createSession({
          client,
          sessionId,
          data,
        });

        expect(returnedSessionId).toEqual(sessionId);

        const sessionData = await getSession(client, sessionId);
        expect(sessionData).toEqual(data);

        const expireTime = await client.pExpireTime(sessionKey);
        expect(expireTime).toEqual(inTenMinutesDate.getTime());
      }),
    );

    it(
      'automatically creates a session id when not provided',
      redisTest(async (client) => {
        const sessionId = await createSession({
          client,
          data: {
            userId: 'Lora',
            expires: getInXMinutesDate(10).toISOString(),
          },
        });

        // Disconnection fail when delay is missing
        await delay();

        expect(typeof sessionId).toEqual('string');
      }),
    );

    it(
      'creates a list of sessions stored on a user id and adds a TTL that matches expiry',
      redisTest(async (client) => {
        const inTenMinutesDate = getInXMinutesDate(10);
        const expectedExpireTimestamp = inTenMinutesDate.getTime();
        const sessionId = '65dbfcb0-0bf3-5cad-a38e-6f7cf1a1e955';
        const userId = 'Vera';
        const userSessionsKey = getUserSessionsKey(userId);

        await createSession({
          client,
          sessionId,
          data: {
            expires: inTenMinutesDate.toISOString(),
            userId,
          },
        });

        const zsetData = await getZsetData(client, userId);
        expect(zsetData).toEqual([sessionId]);

        // Need to delay for non awaited function to update the TTL before checking
        await delay();

        const expireTime = await client.pExpireTime(userSessionsKey);
        expect(expireTime).toEqual(expectedExpireTimestamp);
      }),
    );

    it(
      'updates TTL on list of sessions stored on a user id when session with longer expiry is added',
      redisTest(async (client) => {
        const inTenMinutesDate = getInXMinutesDate(10);
        const inTwentyMinutesDate = getInXMinutesDate(20);
        const expectedExpireTimestamp = inTwentyMinutesDate.getTime();
        const sessionIdA = '0c89ce16-8c75-54ef-bc90-831fec93bc06';
        const sessionIdB = '300e01ee-7f84-5b48-b2b2-3cfa178402ec';
        const userId = 'Glen';
        const userSessionsKey = getUserSessionsKey(userId);

        await createSession({
          client,
          sessionId: sessionIdA,
          data: {
            expires: inTenMinutesDate.toISOString(),
            userId,
          },
        });
        await createSession({
          client,
          sessionId: sessionIdB,
          data: {
            expires: inTwentyMinutesDate.toISOString(),
            userId,
          },
        });

        const zsetData = await getZsetData(client, userId);
        expect(zsetData).toEqual([sessionIdA, sessionIdB]);

        // Need to delay for non awaited function to update the TTL before checking
        await delay();

        const expireTime = await client.pExpireTime(userSessionsKey);
        expect(expireTime).toEqual(expectedExpireTimestamp);
      }),
    );

    it(
      'does not update TTL on list of sessions stored on a user id when session with shorter expiry is added',
      redisTest(async (client) => {
        const inTenMinutesDate = getInXMinutesDate(10);
        const inFiveMinutesDate = getInXMinutesDate(5);
        const expectedExpireTimestamp = inTenMinutesDate.getTime();
        const sessionIdA = '5b4e3211-f8ba-5068-b591-1293097a5a91';
        const sessionIdB = '66aa3d68-c4eb-5674-8979-de491a9ace5c';
        const userId = 'Laura';
        const userSessionsKey = getUserSessionsKey(userId);

        await createSession({
          client,
          sessionId: sessionIdA,
          data: {
            expires: inTenMinutesDate.toISOString(),
            userId,
          },
        });
        await createSession({
          client,
          sessionId: sessionIdB,
          data: {
            expires: inFiveMinutesDate.toISOString(),
            userId,
          },
        });

        const zsetData = await getZsetData(client, userId);
        expect(zsetData).toEqual([sessionIdB, sessionIdA]);

        // Need to delay for non awaited function to update the TTL before checking
        await delay();

        const expireTime = await client.pExpireTime(userSessionsKey);
        expect(expireTime).toEqual(expectedExpireTimestamp);
      }),
    );
  });

  describe('readSession', () => {
    it(
      'returns null if session id does not exist',
      redisTest(async (client) => {
        const result = await readSession({
          client,
          sessionId: 'does-not-exist',
        });

        expect(result).toBeNull();
      }),
    );

    it(
      'returns data created by createSession',
      redisTest(async (client) => {
        const sessionId = '18da8a5b-4784-5ac6-bda8-ea25eb98007a';
        const data = {
          expires: getInXMinutesDate(10).toISOString(),
          userId: 'Dale',
          a: 1,
          b: 2,
        };

        await createSession({ client, sessionId, data });

        const result = await readSession({ client, sessionId });

        expect(result).toEqual(data);
      }),
    );

    it(
      'removes expired sessions from user sessions',
      redisTest(async (client) => {
        const sessionIdA = 'd48776e8-5096-5319-b410-67f17d19f967';
        const sessionIdB = '2a1bd38d-ecb3-5cb5-9ad7-2d03d6d55ec8';
        const userId = 'Cynthia';

        await createSession({
          client,
          sessionId: sessionIdA,
          data: {
            expires: getInXMinutesDate(10).toISOString(),
            userId,
          },
        });

        // Need to delay for non awaited function to update the TTL before checking
        await createSession({
          client,
          sessionId: sessionIdB,
          data: {
            expires: new Date('2020-01-01').toISOString(),
            userId,
          },
        });

        const expiredSessionData = await getSession(client, sessionIdB);
        expect(expiredSessionData).toBeNull();

        const zsetData = await getZsetData(client, userId);
        // Proves that out of data session B is still in zset
        expect(zsetData).toEqual([sessionIdB, sessionIdA]);

        await readSession({ client, sessionId: sessionIdA });

        // Need to delay for non awaited function to remove the expired session
        await delay();

        const zsetData2 = await getZsetData(client, userId);
        expect(zsetData2).toEqual([sessionIdA]);
      }),
    );
  });

  describe('updateSession', () => {
    it.fails(
      'errors when session does not already exist',
      redisTest((client) =>
        updateSession({ client, sessionId: 'does-not-exist', data: {} }),
      ),
    );

    it(
      'shallow updates top level properties',
      redisTest(async (client) => {
        const sessionId = '216f15af-709a-5779-959b-4dd0098c9d25';
        const data = {
          expires: getInXMinutesDate(10).toISOString(),
          userId: 'Hester',
          a: 1,
          b: 2,
        };

        await createSession({ client, sessionId, data });
        await updateSession({ client, sessionId, data: { a: 3, b: 4 } });

        const sessionData = await getSession(client, sessionId);
        expect(sessionData).toEqual({ ...data, a: 3, b: 4 });
      }),
    );

    it.fails(
      'errors when attempting to update the userId',
      redisTest(async (client) => {
        const sessionId = '216f15af-709a-5779-959b-4dd0098c9d25';
        const userId = 'Bessie';
        const data = {
          expires: getInXMinutesDate(10).toISOString(),
          userId,
        };

        await createSession({ client, sessionId, data });
        await updateSession({ client, sessionId, data: { userId: 'Dora' } });
      }),
    );
  });

  describe('deleteSession', () => {
    it(
      'does nothing when session does not exist',
      redisTest(async (client) => {
        await deleteSession({ client, sessionId: 'does-not-exist' });
      }),
    );

    it(
      'deletes session and data from user sessions',
      redisTest(async (client) => {
        let sessionData;
        let zsetData;
        const sessionId = '40b556de-7f16-589f-af0d-c3bc185ad825';
        const userId = 'Alma';

        await createSession({
          client,
          sessionId,
          data: {
            expires: getInXMinutesDate(10).toISOString(),
            userId,
          },
        });

        sessionData = await getSession(client, sessionId);
        zsetData = await getZsetData(client, userId);
        expect(sessionData).not.toBeNull();
        expect(zsetData.length).toEqual(1);

        await deleteSession({ client, sessionId });

        sessionData = await getSession(client, sessionId);
        zsetData = await getZsetData(client, userId);
        expect(sessionData).toBeNull();
        expect(zsetData.length).toEqual(0);
      }),
    );

    it(
      'updates TTL on list of sessions stored on a user id when session with longer expiry is deleted',
      redisTest(async (client) => {
        let expireTime;
        const inTenMinutesDate = getInXMinutesDate(10);
        const inTwentyMinutesDate = getInXMinutesDate(20);
        const sessionIdA = '0c5213f6-0f75-5956-b56a-ea96f8e8b931';
        const sessionIdB = 'c091a101-ddbb-5783-962d-adb50e8fb637';
        const userId = 'Lucile';
        const userSessionsKey = getUserSessionsKey(userId);

        await createSession({
          client,
          sessionId: sessionIdA,
          data: {
            expires: inTenMinutesDate.toISOString(),
            userId,
          },
        });

        // Need to delay for non awaited function to update the TTL
        await delay();

        await createSession({
          client,
          sessionId: sessionIdB,
          data: {
            expires: inTwentyMinutesDate.toISOString(),
            userId,
          },
        });

        // Need to delay for non awaited function to update the TTL
        await delay();

        expireTime = await client.pExpireTime(userSessionsKey);
        expect(expireTime).toEqual(inTwentyMinutesDate.getTime());

        await deleteSession({ client, sessionId: sessionIdB });

        // Need to delay for non awaited function to update the TTL before checking
        await delay();

        expireTime = await client.pExpireTime(userSessionsKey);
        expect(expireTime).toEqual(inTenMinutesDate.getTime());
      }),
    );

    it(
      'does not update TTL on list of sessions stored on a user id when session with shorter expiry is deleted',
      redisTest(async (client) => {
        let expireTime;
        const inTenMinutesDate = getInXMinutesDate(10);
        const inTwentyMinutesDate = getInXMinutesDate(20);
        const sessionIdA = '18380138-eafe-5cac-8034-8003a96b2f0e';
        const sessionIdB = '2e2dcca1-3b4a-5bea-b6aa-83d9dcabb483';
        const userId = 'Jane';
        const userSessionsKey = getUserSessionsKey(userId);

        await createSession({
          client,
          sessionId: sessionIdA,
          data: {
            expires: inTenMinutesDate.toISOString(),
            userId,
          },
        });

        // Need to delay for non awaited function to update the TTL before checking
        await delay();

        await createSession({
          client,
          sessionId: sessionIdB,
          data: {
            expires: inTwentyMinutesDate.toISOString(),
            userId,
          },
        });

        // Need to delay for non awaited function to update the TTL before checking
        await delay();

        expireTime = await client.pExpireTime(userSessionsKey);
        expect(expireTime).toEqual(inTwentyMinutesDate.getTime());

        await deleteSession({ client, sessionId: sessionIdA });

        // Need to delay for non awaited function to update the TTL before checking
        await delay();

        expireTime = await client.pExpireTime(userSessionsKey);
        expect(expireTime).toEqual(inTwentyMinutesDate.getTime());
      }),
    );
  });

  it(
    'session data times out appropriately',
    redisTest(async (client) => {
      const sessionId = '990d69e4-3b70-5504-b8cf-e94b61dec6f5';
      const userId = 'Mina';
      const dateOneSecondAgo = new Date(Date.now() - 1000);

      await createSession({
        client,
        sessionId,
        data: {
          expires: dateOneSecondAgo.toISOString(),
          userId,
        },
      });

      const sessionData = await getSession(client, sessionId);

      expect(sessionData).toBe(null);
    }),
  );

  describe('getUserSessions', () => {
    it(
      'returns sessionIds and their data',
      redisTest(async (client) => {
        const sessionIdA = '0015c21e-1efa-50cb-998e-770c39b1e8a3';
        const sessionIdB = '02ff6702-26c8-5aac-885a-ac7270c31e8e';
        const userId = 'Evelyn';
        const expires = getInXMinutesDate(10).toISOString();
        const sessionDataA = { userId, expires, a: 1, b: 2 };
        const sessionDataB = { userId, expires, c: 3, d: 4 };

        await createSession({
          client,
          sessionId: sessionIdA,
          data: sessionDataA,
        });

        await delay();

        await createSession({
          client,
          sessionId: sessionIdB,
          data: sessionDataB,
        });

        await delay();

        const sessions = await getUserSessions({ client, userId });

        expect(sessions).toEqual([
          { sessionId: sessionIdA, data: sessionDataA },
          { sessionId: sessionIdB, data: sessionDataB },
        ]);
      }),
    );

    it(
      'does not include sessions that have expired and removes them from the user sessions list',
      redisTest(async (client) => {
        const sessionIdA = 'aacbbbf4-0b4e-568e-8cfe-713357310a7e';
        const sessionIdB = 'bbc6d41c-10fd-5481-878a-c46e5abe363c';
        const userId = 'Andre';
        const expiresOneSecondAgo = new Date(Date.now() - 1000).toISOString();
        const sessionDataA = {
          userId,
          expires: getInXMinutesDate(10).toISOString(),
        };
        const sessionDataB = { userId, expires: expiresOneSecondAgo };

        await createSession({
          client,
          sessionId: sessionIdA,
          data: sessionDataA,
        });

        await delay();

        await createSession({
          client,
          sessionId: sessionIdB,
          data: sessionDataB,
        });

        await delay();

        const sessions = await getUserSessions({ client, userId });
        expect(sessions).toEqual([
          { sessionId: sessionIdA, data: sessionDataA },
        ]);

        const zsetData = await getZsetData(client, userId);
        expect(zsetData).toEqual([sessionIdA]);
      }),
    );
  });

  describe('updateUserSessions', () => {
    it(
      'updates all user sessions with the same data',
      redisTest(async (client) => {
        const sessionIdA = 'a2da5e71-8b28-5da2-bd96-fe51ff9c527b';
        const sessionIdB = 'b30fe598-3f75-52e9-9019-da63b1083622';
        const sessionIdC = 'c76cff77-50bd-57b8-a803-e8aa721a2d79';
        const userId = 'Elizabeth';
        const expires = getInXMinutesDate(10).toISOString();
        const sessionDataA = { userId, expires, a: 1 };
        const sessionDataB = { userId, expires, a: 2 };
        const sessionDataC = { userId, expires, a: 3 };

        await createSession({
          client,
          sessionId: sessionIdA,
          data: sessionDataA,
        });

        await delay();

        await createSession({
          client,
          sessionId: sessionIdB,
          data: sessionDataB,
        });

        await delay();

        await createSession({
          client,
          sessionId: sessionIdC,
          data: sessionDataC,
        });

        await delay();

        await updateUserSessions({ client, userId, data: { a: 4 } });

        const sessions = await getUserSessions({ client, userId });

        expect(sessions).toEqual([
          { sessionId: sessionIdA, data: { ...sessionDataA, a: 4 } },
          { sessionId: sessionIdB, data: { ...sessionDataB, a: 4 } },
          { sessionId: sessionIdC, data: { ...sessionDataC, a: 4 } },
        ]);
      }),
    );

    it(
      'does not error or attempt to update sessions that have expired',
      redisTest(async (client) => {
        const sessionIdA = '450bcee7-5b5d-5926-8e97-e2bce4a518b1';
        const sessionIdB = '5325624a-4881-588a-9c0c-679c7fdf9c32';
        const sessionIdC = '63e46800-f58d-5afc-8a4a-4e52d24e0b51';
        const userId = 'Clara';
        const expires = getInXMinutesDate(10).toISOString();
        const expiresOneSecondAgo = new Date(Date.now() - 1000).toISOString();
        const sessionData = { userId, expires };

        await createSession({
          client,
          sessionId: sessionIdA,
          data: sessionData,
        });

        await delay();

        await createSession({
          client,
          sessionId: sessionIdB,
          data: sessionData,
        });

        await delay();

        await createSession({
          client,
          sessionId: sessionIdC,
          data: {
            userId,
            expires: expiresOneSecondAgo,
          },
        });

        await delay();

        await updateUserSessions({ client, userId, data: { new: 'property' } });

        await delay();

        const sessions = await getUserSessions({ client, userId });
        expect(sessions).toEqual([
          { sessionId: sessionIdA, data: { ...sessionData, new: 'property' } },
          { sessionId: sessionIdB, data: { ...sessionData, new: 'property' } },
        ]);

        const empytSessionData = await getSession(client, sessionIdC);
        expect(empytSessionData).toEqual(null);
      }),
    );
  });

  describe('updateSessions', () => {
    it(
      'updates all sessions',
      redisTest(async (client) => {
        const sessionIdA = 'd9a55e6c-fca2-5348-b15b-c8adf362aaa4';
        const sessionIdB = 'cacfeacb-b301-5e52-891f-a4e6df55ac8d';
        const sessionIdC = '3a30d896-778d-5f23-a4bf-ab09eae5aacf';
        const startData = {
          userId: 'Nell',
          expires: getInXMinutesDate(10).toISOString(),
        };
        const updateData = { a: 1 };
        const expectedData = { ...startData, ...updateData };

        await createSession({
          client,
          sessionId: sessionIdA,
          data: startData,
        });
        await createSession({
          client,
          sessionId: sessionIdB,
          data: startData,
        });
        await createSession({
          client,
          sessionId: sessionIdC,
          data: startData,
        });

        await delay();

        await updateSessions({ client, data: updateData });

        await delay();

        const sessionDataA = await getSession(client, sessionIdA);
        const sessionDataB = await getSession(client, sessionIdB);
        const sessionDataC = await getSession(client, sessionIdC);

        expect(sessionDataA).toEqual(expectedData);
        expect(sessionDataB).toEqual(expectedData);
        expect(sessionDataC).toEqual(expectedData);
      }),
    );

    it(
      'updates TTL when expires updates',
      redisTest(async (client) => {
        const sessionIdA = 'a17f0bd9-b59f-526d-8bd7-d20cd30dc0ac';
        const sessionIdB = 'cb888cfd-5066-5f42-8d4c-9fb667c15453';
        const sessionIdC = '1718a628-1c7b-5be0-a4d8-496fc716846a';
        const sessionKeyA = getSessionKey(sessionIdA);
        const sessionKeyB = getSessionKey(sessionIdB);
        const sessionKeyC = getSessionKey(sessionIdC);
        const inTwoMinutesDate = getInXMinutesDate(2);
        const startData = {
          userId: 'Lucille',
          expires: getInXMinutesDate(10).toISOString(),
        };
        const updateData = { expires: inTwoMinutesDate.toISOString() };
        await createSession({
          client,
          sessionId: sessionIdA,
          data: startData,
        });
        await createSession({
          client,
          sessionId: sessionIdB,
          data: startData,
        });
        await createSession({
          client,
          sessionId: sessionIdC,
          data: startData,
        });
        await delay();
        await updateSessions({ client, data: updateData });
        await delay(200);

        const expireTimeA = await client.pExpireTime(sessionKeyA);
        const expireTimeB = await client.pExpireTime(sessionKeyB);
        const expireTimeC = await client.pExpireTime(sessionKeyC);
        expect(expireTimeA).toEqual(inTwoMinutesDate.getTime());
        expect(expireTimeB).toEqual(inTwoMinutesDate.getTime());
        expect(expireTimeC).toEqual(inTwoMinutesDate.getTime());
      }),
    );

    it.fails.only(
      'errors when attempting to update the userId',
      redisTest(async (client) => {
        const sessionIdA = '8cfbab63-91f1-568b-8265-8b54cc3f0fe3';
        const sessionIdB = '112b04ed-c419-551d-abee-996c940ea458';
        const sessionIdC = '662b583c-4ee9-54d9-85dc-35771c421d11';
        const startData = {
          userId: 'Jeanette',
          expires: getInXMinutesDate(10).toISOString(),
        };
        const updateData = { a: 1 };

        await createSession({
          client,
          sessionId: sessionIdA,
          data: startData,
        });
        await createSession({
          client,
          sessionId: sessionIdB,
          data: startData,
        });
        await createSession({
          client,
          sessionId: sessionIdC,
          data: startData,
        });

        await delay();

        console.log('1');

        // TODO: Does not work
        try {
          await updateSessions({ client, data: updateData });
        } catch (error) {
          console.log(error);
        }
      }),
    );
  });
});

function delay(timeout = 10): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

function redisTest(fn: (client: RedisClient) => void | Promise<void>) {
  return async () => {
    const client = createClient();
    client.on('error', (error) => {
      throw error;
    });
    await client.connect();

    let testFailedError = null;
    try {
      await fn(client);
    } catch (error) {
      testFailedError = error;
    }

    await client.flushDb();

    await client.disconnect();

    if (testFailedError) {
      throw testFailedError;
    }
  };
}

async function getSession(client: RedisClient, sessionId: string) {
  const sessionKey = getSessionKey(sessionId);
  const serialisedData = await client.get(sessionKey);
  const sessionData =
    serialisedData == null ? null : JSON.parse(serialisedData);

  return sessionData;
}

async function getZsetData(client: RedisClient, userId: string) {
  const userSessionsKey = getUserSessionsKey(userId);
  const zsetData = await client.zRange(userSessionsKey, 0, -1);

  return zsetData;
}

function getSessionKey(sessionId: string) {
  return `session:${sessionId}`;
}

function getUserSessionsKey(userId: string) {
  return `user:${userId}:sessions`;
}

function getInXMinutesDate(x: number) {
  return new Date(Date.now() + 1000 * 60 * x);
}
