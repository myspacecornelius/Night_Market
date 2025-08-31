import asyncio, json, os, hashlib
from datetime import datetime, timezone
try:
    import redis.asyncio as redis
except ImportError as e:
    raise SystemExit("pip install redis>=5") from e

REDIS_URL=os.getenv("REDIS_URL","redis://localhost:6379/0")

def make_id(data:dict)->str:
    basis=data.get("username") or data.get("url") or "unknown"
    sticky=data.get("sticky_session_id") or "none"
    h=hashlib.sha256(basis.encode()).hexdigest()[:10]
    return f"{data.get('provider','na')}:{data.get('proxy_type','na')}:{sticky}:{h}"

async def main():
    r=await redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
    legacy_active=await r.smembers("proxies:active")
    legacy_burned=await r.smembers("proxies:burned")
    moved=0
    for url in set(legacy_active)|set(legacy_burned):
        hkey=f"proxy:{url}"
        data=await r.hgetall(hkey)
        if not data: 
            continue
        if data.get("response_times") and isinstance(data["response_times"], str):
            try: json.loads(data["response_times"])
            except: data["response_times"]="[]"
        pid=make_id(data)
        await r.hset(f"snpd:proxy:{pid}", mapping=data|{"status": ("burned" if url in legacy_burned else "active")})
        await r.sadd(("snpd:proxies:active" if url in legacy_active else "snpd:proxies:burned"), pid)
        await r.delete(hkey)
        moved+=1
    if legacy_active: await r.delete("proxies:active")
    if legacy_burned: await r.delete("proxies:burned")
    await r.hset("snpd:migrations", mapping={"2025_08_16_proxy_key_migration":"ok","at":datetime.now(timezone.utc).isoformat()})
    await r.close()
    print(f"moved {moved} proxy records")

if __name__=="__main__":
    asyncio.run(main())
