# DON’T PICK THE NUMBER (NUMVERSE)

เกมออนไลน์ทายเลข โฮสต์สร้างห้อง แล้วให้เพื่อนเข้าด้วยรหัสตัวเลข 6 หลัก มีล็อบบี้สาธารณะและห้องส่วนตัว

## โครงสร้างโฟลเดอร์

```
public/
  index.html           # User Dashboard
  play.html            # Game engine UI
  css/dashboard.css    # Dashboard theme
  css/style.css        # Game styles
  js/dashboard/        # Dashboard modules
  js/game.js           # Game client
  images/ · audio/
server.js              # HTTP + WebSocket game server
src/auth/              # Auth / friends
src/dashboard/         # Dashboard REST + persist
prisma/                # schema + migrations (games history/stats)
scripts/
```

## วิธีเปิด (เกม)

ต้องมี Node.js

1. `npm install`
2. `npm start`
3. เปิด http://localhost:8787 → **User Dashboard**
4. เล่นเกมที่ `/play.html` (สร้าง/เข้าห้องจาก Dashboard หรือหน้าเกม)

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
| เกมสาธารณะ | โดเมน เช่น `https://numverse.click/` → `/play.html` | ผู้เล่นทั่วไป (เข้าผ่าน IP ถูกบล็อก) |
| Admin Dashboard | `http://127.0.0.1:9100/` เท่านั้น | แอดมิน (bind localhost) |

เข้า Admin จากเครื่องอื่นผ่าน SSH tunnel:

```bash
ssh -L 9100:127.0.0.1:9100 user@your-server
```

แล้วเปิด http://127.0.0.1:9100/ บนเครื่องคุณ

ให้สิทธิ์แอดมิน:

```bash
node scripts/make-admin.js <username>
```

Dashboard API ต้องเป็น role `admin` / `super_admin` / `moderator`

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

- `/` ล็อบบี้เกม (สร้าง Guest อัตโนมัติ)
- `/login.html` `/register.html` `/account.html`
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
| GET | `/api/v1/auth/link/google` | เชื่อม Google กับบัญชีปัจจุบัน |
| GET | `/api/v1/auth/link/discord` | เชื่อม Discord กับบัญชีปัจจุบัน |

Guest Upgrade รักษา User ID เดิม และ rotate session หลังอัปเกรด

### Render

`render.yaml` มี Postgres + migrate/seed ตอน build — ตั้ง `APP_BASE_URL` และ OAuth redirect URI ให้ตรงโดเมนจริง
