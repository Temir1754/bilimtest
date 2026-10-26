import { useEffect, useState } from "react";
import { humanError, type AdminApi, type QuestionItem } from "./api";
import { QuestionList } from "./Browser";

/** Экран админа «На проверке»: вопросы, которые учителя отправили на публикацию. */
export function ReviewQueue({ api, onOpen }: { api: AdminApi; onOpen: (id: string, topicId: string) => void }) {
  const [items, setItems] = useState<QuestionItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.questions({ status: "review" }).then(setItems, (e) => setError(humanError(e)));
  }, [api]);

  return (
    <div className="adm-main">
      <h2>На проверке</h2>
      <p className="lede">Откройте вопрос, проверьте его в предпросмотре и нажмите «Опубликовать» или
        «Вернуть на доработку» с комментарием для учителя.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {items === null ? (!error && <p className="loading">Загрузка…</p>)
        : items.length === 0 ? <p className="muted">Ничего не ждёт проверки.</p>
        : <QuestionList items={items} showTopic onOpen={onOpen} />}
    </div>
  );
}
