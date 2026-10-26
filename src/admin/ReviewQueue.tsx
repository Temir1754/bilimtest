import { useEffect, useState } from "react";
import { humanError, type AdminApi, type QuestionItem } from "./api";
import { QuestionList } from "./Browser";
import { useT } from "./lang";

/** Экран админа «На проверке»: вопросы, которые учителя отправили на публикацию. */
export function ReviewQueue({ api, onOpen }: { api: AdminApi; onOpen: (id: string, topicId: string) => void }) {
  const { t } = useT();
  const [items, setItems] = useState<QuestionItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.questions({ status: "review" }).then(setItems, setError);
  }, [api]);

  return (
    <div className="adm-main">
      <h2>{t.review.title}</h2>
      <p className="lede">{t.review.lede}</p>
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      {items === null ? (error === null && <p className="loading">{t.loading}</p>)
        : items.length === 0 ? <p className="muted">{t.review.empty}</p>
        : <QuestionList items={items} showTopic onOpen={onOpen} />}
    </div>
  );
}
