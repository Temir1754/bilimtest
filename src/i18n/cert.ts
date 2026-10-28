import type { Lang } from "../lib/types";

// Тексты страницы сертификата автора /cert/id (DECISIONS.md №103).
const kk = {
  title: "Сертификат",
  givenTo: "Осы сертификат берілді",
  text: (n: number) => `Білімтест білім беру платформасына ${n} тест сұрағын құрастырып жариялағаны үшін`,
  grades: (g: number[]) => `${g.join(", ")}-сынып`,
  number: "Нөмірі", date: "Берілген күні", check: "Тексеру",
  valid: (no: string) => `Сертификат шынайы, ${no}`,
  print: "Басып шығару / PDF сақтау",
  loading: "Жүктелуде…", notFound: "Мұндай сертификат табылмады.", failed: "Сертификатты жүктеу мүмкін болмады. Кейінірек көріңіз.",
};

export type CertText = typeof kk;

const ru: CertText = {
  title: "Сертификат",
  givenTo: "Настоящий сертификат выдан",
  text: (n) => `за составление и публикацию ${n} тестовых вопросов на образовательной платформе Білімтест`,
  grades: (g) => `${g.join(", ")} класс`,
  number: "Номер", date: "Дата выдачи", check: "Проверка",
  valid: (no) => `Сертификат подлинный, ${no}`,
  print: "Печать / сохранить в PDF",
  loading: "Загрузка…", notFound: "Такой сертификат не найден.", failed: "Не удалось загрузить сертификат. Попробуйте позже.",
};

const en: CertText = {
  title: "Certificate",
  givenTo: "This certificate is awarded to",
  text: (n) => `for creating and publishing ${n} test questions on the Bilimtest education platform`,
  grades: (g) => `grade ${g.join(", ")}`,
  number: "Number", date: "Issued", check: "Verify",
  valid: (no) => `The certificate is genuine, ${no}`,
  print: "Print / save as PDF",
  loading: "Loading…", notFound: "Certificate not found.", failed: "Could not load the certificate. Try later.",
};

export const CERT: Record<Lang, CertText> = { kk, ru, en };
