"use strict";

/** Word bank: { word, category } — Thai categories for lobby UX. */
const WORDS = [
  { word: "พิซซ่า", category: "อาหาร" },
  { word: "ซูชิ", category: "อาหาร" },
  { word: "ต้มยำ", category: "อาหาร" },
  { word: "ไอศกรีม", category: "อาหาร" },
  { word: "กาแฟ", category: "เครื่องดื่ม" },
  { word: "ชานม", category: "เครื่องดื่ม" },
  { word: "แมว", category: "สัตว์" },
  { word: "ช้าง", category: "สัตว์" },
  { word: "ปลาโลมา", category: "สัตว์" },
  { word: "ไดโนเสาร์", category: "สัตว์" },
  { word: "ฟุตบอล", category: "กีฬา" },
  { word: "แบดมินตัน", category: "กีฬา" },
  { word: "ว่ายน้ำ", category: "กีฬา" },
  { word: "ภูเขา", category: "สถานที่" },
  { word: "ชายหาด", category: "สถานที่" },
  { word: "โรงเรียน", category: "สถานที่" },
  { word: "โรงภาพยนตร์", category: "สถานที่" },
  { word: "สมาร์ทโฟน", category: "ของใช้" },
  { word: "ร่ม", category: "ของใช้" },
  { word: "กุญแจ", category: "ของใช้" },
  { word: "เปียโน", category: "ดนตรี" },
  { word: "กีตาร์", category: "ดนตรี" },
  { word: "ฝน", category: "ธรรมชาติ" },
  { word: "สายรุ้ง", category: "ธรรมชาติ" },
  { word: "ดวงจันทร์", category: "ธรรมชาติ" },
  { word: "รถไฟ", category: "ยานพาหนะ" },
  { word: "เครื่องบิน", category: "ยานพาหนะ" },
  { word: "จักรยาน", category: "ยานพาหนะ" },
  { word: "หมอ", category: "อาชีพ" },
  { word: "ครู", category: "อาชีพ" },
  { word: "เชฟ", category: "อาชีพ" },
  { word: "ตำรวจ", category: "อาชีพ" }
];

function pickWord(rng = Math.random) {
  const i = Math.floor(rng() * WORDS.length) % WORDS.length;
  return WORDS[i] || WORDS[0];
}

module.exports = { WORDS, pickWord };
