from prometheus_client import Counter, Gauge, Histogram

proxy_requests = Counter("proxy_requests_total","Requests via proxy",["provider","type","host","status"])
proxy_inflight = Gauge("proxy_inflight","Inflight requests per proxy",["proxy_id"])
proxy_health = Gauge("proxy_health_score","Computed health score",["proxy_id","provider"])
proxy_latency = Histogram("proxy_latency_ms","Latency in ms",["provider","type","host"],buckets=[50,100,200,300,500,800,1200,2000,5000])
proxy_active_total = Gauge("proxy_active_total","Active proxies")
proxy_burned_total = Gauge("proxy_burned_total","Burned proxies")
proxy_cost_total = Counter("proxy_cost_usd_total","Accumulated proxy cost",["provider"])
