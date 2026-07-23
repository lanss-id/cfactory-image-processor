# Image Processor (Async Image Processing Web App)

Async image processing service. Upload gambar, diproses di background worker (resize, compress, convert WebP), hasil siap diunduh. Stack persis match CFactory: Bun + Hono + Prisma + PostgreSQL + BullMQ + Redis + Sharp + React.

## Quick Start

```bash
git clone https://github.com/lanss-id/cfactory-image-processor.git
cd cfactory-image-processor

cp .env.example .env

docker compose up --build
```

Buka `http://localhost:5173`. Upload gambar, tunggu proses, download WebP hasil.

## Arsitektur

```
┌──────────────┐     POST /api/images      ┌──────────────────┐
│   Frontend   │ >──────────────────────────│   API Server     │
│   React/Vite │<────── GET /api/images/:id │   Hono (Bun)     │
│   :5173      │     /status + /download    │   :3000          │
└──────────────┘                            └────────┬─────────┘
                                                     │ push job
                                                     v
                                            ┌──────────────────┐
                                            │   BullMQ Queue   │
                                            │   (Redis)        │
                                            └────────┬─────────┘
                                                     │ consume
                                                     v
                                            ┌──────────────────┐     ┌──────────────┐
                                            │   Worker (Sharp) │─────│  Local Disk  │
                                            │   resize, webp,  │     │  uploads/    │
                                            │   save           │     │  results/    │
                                            └────────┬─────────┘     └──────────────┘
                                                     │ update status
                                                     v
                                            ┌──────────────────┐
                                            │   PostgreSQL     │
                                            │   (via Prisma)   │
                                            └──────────────────┘
```

**Prinsip:** API server gak nyentuh Sharp. Worker proses sendiri. CPU-intensive task gak ngeblock request lain.

### Job Lifecycle

```
pending > processing > completed
                  |
                  v failed
```

| State | Artinya |
|---|---|
| `pending` | Job masuk antrian, nunggu worker |
| `processing` | Worker mulai resize dan webp |
| `completed` | File hasil siap diunduh |
| `failed` | Ada error, `errorMessage` berisi detail |

### Polling Strategy (Frontend)

```
1s, 1.5s, 2.25s, 3.38s, 5.06s, 7.59s, 8s (cap)
```

Exponential backoff. Nunggu lebih efisien daripada polling tiap detik. Cap di 8 detik biar gak delay.

## Tech Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Runtime | Bun | Match CFactory, native TS, startup cepat |
| Backend | Hono | Match CFactory |
| ORM | Prisma | Match CFactory |
| DB | PostgreSQL | Match CFactory |
| Queue | BullMQ + Redis | Match CFactory, reliable job queue |
| Image proc | Sharp | Native binding, performant, industry standard |
| Frontend | React + Vite | Match CFactory |
| Container | Docker Compose | Bonus point |
| Test | Vitest | Ringan, kompatibel Bun/TS |

## API Contract

### POST /api/images

Upload gambar. Langsung return `jobId`, gak nunggu proses selesai.

**Request:** `multipart/form-data`, field `image`

| Atribut | Batasan |
|---|---|
| Format | JPG, PNG, WebP |
| Max size | 20 MB |
| Validasi | MIME type + magic bytes (cegah spoof extension) |

**Response 202:**
```json
{ "jobId": "cmrx...", "status": "pending" }
```

**400 (format salah):**
```json
{ "error": "Unsupported type: image/gif. Use JPG, PNG, or WebP." }
```

**413 (kebesaran):**
```json
{ "error": "File too large. Max 20MB." }
```

### GET /api/images/:jobId/status

**Response 200:**
```json
{
  "jobId": "cmrx...",
  "status": "completed",
  "originalSize": 2789,
  "resultSize": 946,
  "createdAt": "2026-07-23T10:00:00Z",
  "errorMessage": null
}
```

**404:**
```json
{ "error": "not found" }
```

### GET /api/images/:jobId/download

Stream file hasil (WebP) sebagai download attachment.

| Status Job | HTTP | Response |
|---|---|---|
| completed | 200 | File stream, Content-Type: image/webp |
| pending / processing | 409 | { "error": "Job belum selesai diproses" } |
| failed | 422 | { "error": "<errorMessage>" } |
| Not found | 404 | { "error": "not found" } |

### Monitoring

| Endpoint | Deskripsi |
|---|---|
| GET /api/health | Health check |
| GET /admin/queues | Bull Board UI (lihat antrian, retry, failed jobs) |

## Worker Pipeline (Sharp)

Urutan proses sesuai spesifikasi: resize, compress, convert to WebP

```typescript
await sharp(filePath)
  .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 80 })
  .toFile(outputPath);
```

| Opsi | Efek |
|---|---|
| fit: inside | Preserve aspect ratio, gak crop |
| withoutEnlargement: true | Gak perbesar gambar yg udah kurang dari 1280px |
| quality: 80 | Balance visual quality vs file size |

### Retry & Error Handling

```
Attempt 1 gagal > tunggu 2s
Attempt 2 gagal > tunggu 4s
Attempt 3 gagal > status = FAILED (errorMessage disimpan)
```

BullMQ handle stalled job detection. Kalo worker crash di tengah proses, job otomatis di-reassign ke worker lain setelah lock timeout (30 detik).

## Storage

### Sekarang (Local Disk)

| Direktori | Isi |
|---|---|
| uploads/ | File original upload |
| results/ | File WebP hasil proses |

Bind mount Docker volume. Gampang testing, docker compose down -v reset semua.

### Nanti (S3)

Interface StorageProvider udah siap. Tinggal implement S3StorageProvider dengan method save() dan getUrl(). Ganti binding di src/index.ts.

## Frontend

### States

| State | UI |
|---|---|
| idle | Dropzone + input file |
| uploading | Progress bar XHR upload |
| pending | Spinner + elapsed timer + poll count |
| processing | Spinner + elapsed timer |
| completed | Preview thumbnail + stat original/result/reduction % + download button |
| failed | Error message + try again button |

### Client-side Validation (fail fast)

Sebelum upload ke server:

Size check: file di atas 20MB langsung error, gak perlu transfer

Type check: format gak didukung langsung reject

Server validasi tetap jalan sebagai defense-in-depth.

## Testing

```bash
bun test
```

9 tests, 9 pass.

Cakupan: MIME type allowlist, 20MB size cap, empty file, status code, magic bytes spoof detection.

## Docker Compose

```yaml
services:
  postgres:   # :5432
  redis:      # :6379
  api:        # :3000
  worker:     # (no port)
  frontend:   # :5173
```

```bash
docker compose up --build
```

Satu command, semua jalan. Gak perlu install Bun, Node, PostgreSQL, Redis lokal.

## Environment Variables

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/imageapp
REDIS_URL=redis://redis:6379
```

`.env.example` udah include. Sesuain POSTGRES_PASSWORD kalo mau ganti.

## Deployment (Production)

### Live Demo

| Service | URL |
|---|---|
| Frontend | [cfactory.lanss.my.id](https://cfactory.lanss.my.id) |
| API Health | [api-cfactory.lanss.my.id/api/health](https://api-cfactory.lanss.my.id/api/health) |
| Bull Board | [api-cfactory.lanss.my.id/admin/queues](https://api-cfactory.lanss.my.id/admin/queues) |

### VPS

Backend jalan di VPS pake bun run src/index.ts + bun run src/worker.ts. Tunnel via Cloudflare (cloudflared) biar HTTPS otomatis tanpa manage cert.

### Vercel

Frontend deploy ke Vercel. vercel.json rewrite /api/* ke tunnel domain (https://api-cfactory.lanss.my.id/api/*). Full HTTPS chain.

## Keputusan Arsitektur (Trade-off)

### Kenapa BullMQ bukan polling database?

Redis queue transactional (job gak ilang kalo worker restart). Delayed retry built-in (gak perlu cron). BullMQ gak bebanin PostgreSQL buat polling dan lock. Tapi butuh Redis instance (1 container tambahan).

### Kenapa local storage untuk MVP?

Setup S3 butuh AWS account, IAM, bucket config (makan waktu). Interface StorageProvider udah siap (S3 tinggal implement). Untuk assessment 5 hari, local storage cukup. docker compose down -v gampang reset.

### Kenapa retry 3x exponential backoff?

3 attempts cover transient error (Sharp OOM, disk I/O spike, Redis hiccup). Exponential backoff kasih sistem recovery time. Kalo gagal 3x berturut-turut, kemungkinan error permanen (file corrupt) jadi gak perlu diulang.

### Kenapa client-side validation?

User langsung tau error tanpa nunggu upload 50MB. Bandwidth server gak kepake buat file yang bakal ditolak. Server tetap validasi (defense-in-depth) untuk curl atau kirim manual.

## License & Credits

Dibuat oleh [Alan (Maulana Kayyis Purnadiva)](https://lanss.my.id) untuk CFactory Technical Assessment. Stack pilihan match persis CFactory production stack: Bun, Hono, Prisma, PostgreSQL, BullMQ, Redis, Sharp, React, TypeScript.