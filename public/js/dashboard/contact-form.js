import { api } from "./api.js";
import { compressContactImage } from "./contact-image.js";

/** Wire #contactForm modal (user + admin dashboards). */
export function wireContactForm() {
  const btn = document.getElementById("contactAdminBtn");
  const modal = document.getElementById("contactModal");
  if (!btn || !modal) return;
  const form = document.getElementById("contactForm");
  const cancel = document.getElementById("contactCancel");
  const msg = document.getElementById("contactMsg");
  const fileInput = document.getElementById("contactImage");
  const preview = document.getElementById("contactImagePreview");
  let pendingImage = null;

  const clearImage = () => {
    pendingImage = null;
    if (fileInput) fileInput.value = "";
    if (preview) {
      preview.removeAttribute("src");
      preview.classList.remove("on");
    }
  };

  const open = () => {
    if (msg) msg.textContent = "";
    clearImage();
    modal.classList.remove("hidden");
    const ta = document.getElementById("contactMessage");
    if (ta) requestAnimationFrame(() => ta.focus());
  };
  const close = () => {
    modal.classList.add("hidden");
    clearImage();
  };

  btn.onclick = open;
  if (cancel) cancel.onclick = close;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  if (fileInput) {
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        clearImage();
        return;
      }
      if (msg) msg.textContent = "กำลังเตรียมรูป…";
      try {
        pendingImage = await compressContactImage(file);
        if (preview) {
          preview.src = pendingImage;
          preview.classList.add("on");
        }
        if (msg) msg.textContent = "";
      } catch (err) {
        clearImage();
        if (msg) {
          msg.textContent =
            err && err.message === "too_large"
              ? "รูปใหญ่เกินไป ลองเลือกรูปที่เล็กกว่า"
              : "ใช้ไฟล์รูปภาพเท่านั้น (PNG/JPG/WebP)";
        }
      }
    };
  }

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const subject = (document.getElementById("contactSubject")?.value || "").trim();
      const message = (document.getElementById("contactMessage")?.value || "").trim();
      if (message.length < 5 && !pendingImage) {
        if (msg) msg.textContent = "พิมพ์ข้อความอย่างน้อย 5 ตัวอักษร หรือแนบรูป";
        return;
      }
      if (msg) msg.textContent = "กำลังส่ง…";
      const payload = { subject, message };
      if (pendingImage) payload.imageData = pendingImage;
      const r = await api("/api/v1/contact", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (!r.res.ok) {
        if (msg) {
          msg.textContent =
            r.res.status === 429
              ? "ส่งบ่อยเกินไป ลองใหม่ภายหลัง"
              : r.res.status === 413
                ? "ไฟล์ใหญ่เกินไป"
                : (r.data && r.data.error) || "ส่งไม่สำเร็จ";
        }
        return;
      }
      if (msg) msg.textContent = "ส่งแล้ว";
      form.reset();
      clearImage();
      setTimeout(close, 800);
    };
  }
}
