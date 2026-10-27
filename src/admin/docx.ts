// Тест из Word (.docx) → вопросы (DECISIONS.md №91). Файл разбирается прямо в браузере.
// Формат: «§1. Тема»; «1. Вопрос» (жирный); следующие абзацы — варианты (обычно маркированный список);
// в конце — ключ «$1 1A. 2D. $38-39 1C 2D» (буквы латиницей или кириллицей).
// Номера вопросов бывают набраны руками или поставлены автоматической нумерацией Word — понимаем оба.
import { letterIndex, parseKey, topicKey, type Draft, type DraftSet, type FileTopic } from "./drafts";

/** Абзац документа: текст, жирный ли он, какой это список. */
export interface Para {
  text: string;
  bold: boolean;
  list: "decimal" | "bullet" | "other" | null;
}

const W = "w:";
const attr = (el: Element | null | undefined, name: string) => el?.getAttribute(W + name) ?? null;
const kids = (el: Element, name: string) => Array.from(el.getElementsByTagName(W + name));
const off = (el: Element | undefined) => !el || ["0", "false"].includes(attr(el, "val") ?? "");

/** word/document.xml (+ word/numbering.xml) → абзацы. */
export function docxParas(documentXml: string, numberingXml?: string): Para[] {
  const parser = new DOMParser();
  // Вид списка: numId → abstractNum → формат номера на уровне ilvl.
  const formats = new Map<string, string>();
  if (numberingXml) {
    const nx = parser.parseFromString(numberingXml, "application/xml");
    const abstract = new Map<string, Element>();
    for (const a of kids(nx.documentElement, "abstractNum")) abstract.set(attr(a, "abstractNumId") ?? "", a);
    for (const n of kids(nx.documentElement, "num")) {
      const a = abstract.get(attr(kids(n, "abstractNumId")[0], "val") ?? "");
      for (const lvl of a ? kids(a, "lvl") : []) {
        formats.set(`${attr(n, "numId")}/${attr(lvl, "ilvl")}`, attr(kids(lvl, "numFmt")[0], "val") ?? "");
      }
    }
  }
  const doc = parser.parseFromString(documentXml, "application/xml");
  return kids(doc.documentElement, "p").map((p) => {
    let text = "";
    let boldChars = 0;
    for (const r of kids(p, "r")) {
      let s = "";
      for (const c of Array.from(r.childNodes) as Element[]) {
        if (c.nodeName === "w:t") s += c.textContent ?? "";
        else if (c.nodeName === "w:tab" || c.nodeName === "w:br") s += " ";
      }
      const b = r.getElementsByTagName("w:rPr")[0]?.getElementsByTagName("w:b")[0];
      if (!off(b) && s.trim()) boldChars += s.trim().length;
      text += s;
    }
    const numPr = p.getElementsByTagName("w:pPr")[0]?.getElementsByTagName("w:numPr")[0];
    let list: Para["list"] = null;
    if (numPr) {
      const id = attr(kids(numPr, "numId")[0], "val");
      const fmt = formats.get(`${id}/${attr(kids(numPr, "ilvl")[0], "val") ?? "0"}`) ?? "";
      if (id !== "0") list = fmt === "decimal" ? "decimal" : fmt === "bullet" || !fmt ? "bullet" : "other";
    }
    const clean = text.replace(/\s+/g, " ").trim();
    return { text: clean, bold: clean.length > 0 && boldChars >= clean.replace(/\s/g, "").length / 2, list };
  });
}

/** Читает файл .docx в абзацы. Библиотека распаковки загружается только здесь. */
export async function readDocx(file: File): Promise<Para[]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (f) => f.name === "word/document.xml" || f.name === "word/numbering.xml",
  });
  const doc = zip["word/document.xml"];
  if (!doc) throw new Error("not a docx");
  const num = zip["word/numbering.xml"];
  return docxParas(strFromU8(doc), num ? strFromU8(num) : undefined);
}

const TOPIC = /^§\s*(\d+(?:\s*[-–—,]\s*\d+)*)\s*[.)]?\s*(.*)$/;
const QNUM = /^(\d{1,3})\s*[.)]\s*(.+)$/;
// Метка варианта в начале строки: «A) », «в. », «– », «• ».
const MARK = /^(?:[A-EА-Еa-eа-е]\s*[).]\s+|[-–—•·▪●○◦]\s*)/;

/** Абзацы → темы, вопросы и ответы из ключа. */
export function parseTest(paras: Para[]): DraftSet {
  const topics: FileTopic[] = [];
  const drafts: Draft[] = [];
  let topic: FileTopic | null = null;
  let q: Draft | null = null;
  let expected = 1;
  let keyText = "";

  const startTopic = (t: FileTopic) => { topics.push(t); topic = t; q = null; expected = 1; };
  for (const p of paras) {
    const t = p.text;
    if (!t) continue;
    if (keyText || /^\$\s*\d/.test(t)) { keyText += ` ${t}`; continue; } // ключ — до конца файла
    const tm = TOPIC.exec(t);
    if (tm) { startTopic({ key: topicKey(tm[1]), label: `§${tm[1].replace(/\s+/g, "")}`, title: tm[2].trim() }); continue; }

    const cur = q as Draft | null;
    const typed = QNUM.exec(t);
    const isQuestion = typed ? p.bold || p.list !== "bullet" || !cur
      : p.list === "decimal" ? p.bold || !cur || cur.options.length >= 3
      : p.bold && (!cur || cur.options.length >= 2);
    if (!isQuestion && cur && !cur.options.length && p.bold) { cur.text += ` ${t}`; continue; } // вопрос в два абзаца
    if (isQuestion) {
      if (!topic) startTopic({ key: "", label: "", title: "" });
      const d: Draft = { id: `q${drafts.length + 1}`, topic: topic!.key, num: expected, text: typed ? typed[2].trim() : t, options: [],
        correct: null };
      if (typed) {
        const found = Number(typed[1]);
        if (found !== expected) d.numbering = { found, expected };
        d.num = found;
      }
      expected = d.num! + 1;
      drafts.push(d);
      q = d;
      continue;
    }
    if (cur) cur.options.push(t.replace(MARK, "").trim());
  }

  // Ответы из ключа. Если в файле нет тем «§», а в ключе одна тема — её ответы относятся ко всем вопросам.
  const key = parseKey(keyText);
  for (const d of drafts) {
    const answers = key.get(d.topic) ?? (d.topic === "" && key.size === 1 ? [...key.values()][0] : undefined);
    const letter = d.num === null ? undefined : answers?.get(d.num);
    if (!letter) continue;
    const idx = letterIndex(letter)!;
    if (idx < d.options.length) d.correct = idx;
    else d.keyLetter = letter;
  }
  return { topics, drafts, noKey: key.size === 0 };
}
