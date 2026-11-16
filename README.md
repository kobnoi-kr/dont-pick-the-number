# DON’T PICK THE NUMBER (NUMVERSE)

เกมออนไลน์ทายเลข โฮสต์สร้างห้อง แล้วให้เพื่อนเข้าด้วยรหัสตัวเลข 6 หลัก มีล็อบบี้สาธารณะและห้องส่วนตัว

## วิธีเปิด (เกม)

ต้องมี Node.js

1. `npm install`
2. `npm start`
3. เปิด http://localhost:8787

ผู้เล่นคนอื่นในวงแลนเดียวกันเปิดที่อยู่ที่เซิร์ฟเวอร์พิมพ์ออกมา แล้วเข้าห้องด้วยรหัส

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
