// 대체 경로: G1이 HTTPS로 Supabase에 직접 못 보낼 때 노트북에서 실행.
// G1 HTTP URL을 http://<노트북IP>:8080/g1 로 지정하면 받은 그대로 수신 함수에 전달한다.
// 실행: node relay.mjs
import http from 'node:http'

const TARGET = 'https://hnnsiqgiibqgiyskdxyj.supabase.co/functions/v1/g1-ingest?key=postic'
const PORT = 8080

http
  .createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      res.writeHead(200).end()
      if (req.method !== 'POST') return
      try {
        const r = await fetch(TARGET, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        console.log(new Date().toISOString(), body.length, 'bytes →', await r.text())
      } catch (e) {
        console.error('forward failed', e.message)
      }
    })
  })
  .listen(PORT, () => console.log(`relay listening on :${PORT}/g1 → ${TARGET}`))
