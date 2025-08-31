-- KEYS[1] = bucket key
-- ARGV: capacity, refill_per_sec, now_ms, cost, ttl_seconds
-- returns: {allowed(1/0), remaining_tokens, retry_after_ms}

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])            -- tokens per second
local now_ms = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])            -- usually 1
local ttl = tonumber(ARGV[5])

local bucket = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(bucket[1])
local ts = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  ts = now_ms
else
  local delta = math.max(0, now_ms - ts) / 1000.0
  local refill = delta * rate
  tokens = math.min(capacity, tokens + refill)
  ts = now_ms
end

local allowed = 0
local retry_after_ms = 0

if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  allowed = 0
  local needed = cost - tokens
  retry_after_ms = math.ceil((needed / rate) * 1000.0)
end

redis.call("HMSET", key, "tokens", tokens, "ts", ts)
redis.call("EXPIRE", key, ttl)

return {allowed, tokens, retry_after_ms}