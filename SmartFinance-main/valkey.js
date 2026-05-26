const Valkey = require('iovalkey');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let client = null;
let isConnected = false;
let isRedisAvailable = true; // Flag to track if caching should be attempted

// Railway Valkey/Redis plugin sets REDIS_URL. Fallback to local Valkey or default.
const REDIS_URL = process.env.REDIS_URL || process.env.VALKEY_URL || 'redis://127.0.0.1:6379';

async function initValkey() {
    if (!isRedisAvailable) return;

    try {
        client = new Valkey(REDIS_URL, {
            maxRetriesPerRequest: 1, // Be aggressive in failing so app stays responsive
            connectTimeout: 2000,
            commandTimeout: 2000,
            retryStrategy: (times) => {
                if (times > 3) {
                    console.warn('[Valkey] Max retries reached. Caching disabled for this session.');
                    isRedisAvailable = false;
                    return null; // Stop retrying
                }
                return Math.min(times * 100, 1000);
            }
        });

        client.on('error', (err) => {
            console.warn('[Valkey] Connection error:', err.message);
            isConnected = false;
            // Don't kill the app, just log and disable cache if it persists
        });

        client.on('connect', () => {
            console.log('[Valkey] Connected to Redis/Valkey');
            isConnected = true;
            isRedisAvailable = true;
        });

        client.on('ready', () => {
            isConnected = true;
        });

        client.on('close', () => {
            isConnected = false;
        });

    } catch (err) {
        console.warn('[Valkey] Initialization failed:', err.message);
        isConnected = false;
        isRedisAvailable = false;
    }
}

function isValkeyConnected() {
    return isConnected && client !== null && isRedisAvailable;
}

function debugCache(...args) {
    if (process.env.SF_CACHE_DEBUG !== '1') return;
    console.log('[Valkey]', ...args);
}

async function getCache(key) {
    if (!isValkeyConnected()) {
        return null;
    }
    try {
        const value = await client.get(key);
        if (value === null) {
            return null;
        }
        return JSON.parse(value);
    } catch (err) {
        console.warn('[Valkey] getCache error for key', key, ':', err.message);
        return null;
    }
}

async function setCache(key, value, ttlSeconds) {
    if (!isValkeyConnected()) {
        return false;
    }
    try {
        const serialized = JSON.stringify(value);
        if (ttlSeconds) {
            await client.set(key, serialized, 'EX', ttlSeconds);
        } else {
            await client.set(key, serialized);
        }
        debugCache('set', key, ttlSeconds ? `${ttlSeconds}s` : 'no-ttl');
        return true;
    } catch (err) {
        console.warn('[Valkey] setCache error for key', key, ':', err.message);
        return false;
    }
}

async function deleteCache(key) {
    if (!isValkeyConnected()) {
        return false;
    }
    try {
        await client.del(key);
        return true;
    } catch (err) {
        console.warn('[Valkey] deleteCache error for key', key, ':', err.message);
        return false;
    }
}

async function deleteCachePattern(pattern) {
    if (!isValkeyConnected()) {
        return 0;
    }
    try {
        let cursor = '0';
        let deletedCount = 0;
        const batchSize = 100;

        do {
            const [newCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
            cursor = newCursor;

            if (keys && keys.length > 0) {
                await client.del(...keys);
                deletedCount += keys.length;
            }
        } while (cursor !== '0');

        return deletedCount;
    } catch (err) {
        console.warn('[Valkey] deleteCachePattern error for pattern', pattern, ':', err.message);
        return 0;
    }
}

async function flushTag(tag) {
    debugCache('flush tag', tag);
    return deleteCachePattern(`sf:${tag}:*`);
}

async function getKeyCount() {
    if (!isValkeyConnected()) {
        return 0;
    }
    try {
        const count = await client.dbSize();
        return count;
    } catch (err) {
        console.warn('[Valkey] getKeyCount error:', err.message);
        return 0;
    }
}

async function getMemoryInfo() {
    if (!isValkeyConnected()) {
        return 'unknown';
    }
    try {
        const info = await client.info('memory');
        const memUsed = info.match(/used_memory_human:(\S+)/);
        return memUsed ? memUsed[1] : 'unknown';
    } catch (err) {
        console.warn('[Valkey] getMemoryInfo error:', err.message);
        return 'unknown';
    }
}

async function flushAll() {
    if (!isValkeyConnected()) {
        return false;
    }
    try {
        await client.flushall();
        return true;
    } catch (err) {
        console.warn('[Valkey] flushAll error:', err.message);
        return false;
    }
}

initValkey();

module.exports = {
    isValkeyConnected,
    isRedisAvailable: () => isRedisAvailable,
    getCache,
    setCache,
    deleteCache,
    deleteCachePattern,
    flushTag,
    flushAll,
    getKeyCount,
    getMemoryInfo
};
