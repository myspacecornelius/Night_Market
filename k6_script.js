import http from 'k6/http';
import { check, sleep } from 'k6';

// Usage: k6 run -e BASE_URL=http://localhost:8000 k6_script.js
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export let options = {
  stages: [
    { duration: '30s', target: 200 },
    { duration: '1m', target: 500 },
    { duration: '2m', target: 1000 },
  ],
};

export default function () {
  // Public feed: rate limited per client, so 429 is an expected answer under load
  let res1 = http.get(`${BASE_URL}/posts/global`);
  check(res1, {
    'status was 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  // Public heatmap: served from the Redis cache after the first request
  let res2 = http.get(`${BASE_URL}/v1/heatmap?zoom=7&window=24h`);
  check(res2, {
    'status was 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  sleep(1);
}
