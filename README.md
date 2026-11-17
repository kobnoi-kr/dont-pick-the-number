# NUMVERSE

แพลตฟอร์มเล่นเกมด้วยรหัสห้อง 6 หลัก — ตอนนี้มี **หาเลข** และ **วงล้อ**

## โครงสร้างโฟลเดอร์

```
public/
  landing.html         # หน้าแรก (Logo / Profile / Start)
  app.html             # User Dashboard
  admin.html           # Admin Dashboard (Phase 2)
  play.html            # Game runtime
  css/ · js/ · images/ · audio/
server.js              # HTTP + WebSocket game server
src/auth/              # Auth / friends
src/dashboard/         # Dashboard REST + persist
prisma/                # schema + migrations
scripts/
```

## วิธีเปิด (เกม)

ต้องมี Node.js

1. `npm install`
2. `npm start`
3. เปิด http://localhost:8787 → **Landing** → Start เข้า User Dashboard
4. เล่นเกมที่ `/play.html` (สร้าง/เข้าห้องจาก My Rooms หรือ Library)

### เปิดสาธารณะ แต่เข้าได้แค่โดเมน

ตั้งใน `.env`:

```env
APP_BASE_URL=https://numverse.click
ENFORCE_HOST=1
ALLOWED_HOSTS=numverse.click,www.numverse.click
```

เมื่อเปิดแล้ว การเข้า `http://<IP>:<PORT>` จะถูกปฏิเสธ / ส่งต่อไปโดเมน — เล่นผ่าน `https://numverse.click` เท่านั้น  
`localhost` ยังใช้ได้ตอนทดสอบบนเครื่อง

### Public vs Admin

| ช่องทาง | ที่อยู่ | ใครเข้าได้ |
|---|---|---|
| Landing + User Dashboard | `https://numverse.click/` → `/app.html` | ผู้เล่นทั่วไป |
| Game runtime | `/play.html` | ผู้เล่นในห้อง |
| Admin Dashboard | `/admin.html` (admin/super_admin) หรือ `http://127.0.0.1:9100/` บนเครื่องเซิร์ฟเวอร์ | แอดมิน |

ให้สิทธิ์แอดมิน:

```bash
node scripts/make-admin.js <username|email>
```

## Auth (Guest-First + OAuth + Email)

Auth เปิดเมื่อตั้ง `DATABASE_URL` (ดู `.env.example`)

```bash
cp .env.example .env
# แก้ DATABASE_URL + AUTH_SECRET (+ Google/Discord/SMTP ถ้าต้องการ)
npm install
npx prisma migrate deploy
npm run db:seed
npm start
```

หน้าเว็บ:

- `/` Landing
- `/app.html` User Dashboard
- `/play.html` เกม
- `/login.html` `/register.html` · account/friends → `/app.html#profile` / `#friends`
- `/admin.html` Admin Dashboard (role-gated)
- `/reset-password.html` `/verify-email.html`

API หลัก:

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/guest` | Guest session |
| GET | `/api/v1/auth/me` | Session ปัจจุบัน |
| POST | `/api/v1/auth/logout` | Logout |
| POST | `/api/v1/auth/register` | สมัคร / อัปเกรด Guest ด้วย Email |
| POST | `/api/v1/auth/login` | Email login (ต้องยืนยันอีเมลแล้ว) |
| GET | `/api/v1/auth/google` | Google OAuth |
| GET | `/api/v1/auth/discord` | Discord OAuth |
| GET | `/api/v1/games/catalog` | คลังเกม |
| GET | `/api/v1/dashboard/summary` | Overview stats |
| GET | `/api/v1/announcements/active` | ประกาศที่ publish แล้ว |
| GET/PATCH… | `/api/v1/admin/*` | Admin Dashboard APIs (role + permission) |

Guest Upgrade รักษา User ID เดิม และ rotate session หลังอัปเกรด

### Render

`render.yaml` ตั้ง `EMBEDDED_PG=0`, `PUBLIC_DASHBOARD=1`, `DASHBOARD_ADMIN_ONLY=0` — ตั้ง `DATABASE_URL` และ OAuth ใน Render dashboard ให้ตรงโดเมนจริง
