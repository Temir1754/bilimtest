// Шифрование резервной копии паролем (DECISIONS.md №105): GitHub-репозиторий публичный, копия в GitHub
// хранится только зашифрованной. Папка backups/… → один файл: сжатый JSON всех таблиц, AES-256-GCM,
// ключ из пароля через scrypt. Без пароля открыть нельзя.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const MAGIC = Buffer.from("BTBACKUP1");

/** Файлы копии (имя → содержимое) → зашифрованный файл. */
export function seal(files: Record<string, string>, password: string): Buffer {
  if (password.length < 12) throw new Error("Пароль копии — не короче 12 знаков");
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
  const body = Buffer.concat([c.update(gzipSync(JSON.stringify(files))), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}

/** Зашифрованный файл → файлы копии. Неверный пароль или испорченный файл — ошибка. */
export function unseal(data: Buffer, password: string): Record<string, string> {
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Это не файл копии Білімтест");
  let o = MAGIC.length;
  const salt = data.subarray(o, (o += 16)), iv = data.subarray(o, (o += 12)), tag = data.subarray(o, (o += 16));
  const d = createDecipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
  d.setAuthTag(tag);
  try {
    return JSON.parse(gunzipSync(Buffer.concat([d.update(data.subarray(o)), d.final()])).toString("utf8"));
  } catch {
    throw new Error("Неверный пароль или файл копии повреждён");
  }
}
