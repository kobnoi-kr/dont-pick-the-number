/** Compress an image file to a JPEG data URL for contact attachments. */
export function compressContactImage(file, opts = {}) {
  const maxSide = opts.maxSide || 960;
  const quality = opts.quality == null ? 0.72 : opts.quality;
  const maxChars = opts.maxChars || 350000;
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      return reject(new Error("invalid_file"));
    }
    if (file.size > 8 * 1024 * 1024) return reject(new Error("too_large"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length > maxChars) return reject(new Error("too_large"));
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
