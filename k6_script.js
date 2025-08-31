import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 200 },
    { duration: '1m', target: 500 },
    { duration: '2m', target: 1000 },
  ],
};

export default function () {
  // Test a rate-limited endpoint
  let res1 = http.get('http://localhost:8000/api/monitors');
  check(res1, {
    'status was 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  // Test a cached endpoint
  let res2 = http.get('http://localhost:8000/api/metrics/dashboard');
  check(res2, {
    'status was 200': (r) => r.status === 200,
  });

  sleep(1);
}
