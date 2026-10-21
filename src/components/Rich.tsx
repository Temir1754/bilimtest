import { Fragment, useEffect, useState } from "react";
import type katexType from "katex";
import { hasMath, parseMath } from "../lib/text";

// KaTeX (~270 КБ вместе со шрифтами) загружается только когда на экране есть формула.
let katex: typeof katexType | null = null;
let loading: Promise<void> | null = null;
function loadKatex() {
  return (loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => {
    katex = m.default;
  }));
}

/** Текст с формулами \( … \) и \[ … \]. */
export function Rich({ text }: { text: string }) {
  const need = hasMath(text);
  const [, setReady] = useState(katex !== null);
  useEffect(() => {
    if (need && !katex) loadKatex().then(() => setReady(true));
  }, [need]);
  if (!need) return <>{text}</>;
  return (
    <>
      {parseMath(text).map((p, i) =>
        !p.math ? (
          <Fragment key={i}>{p.text}</Fragment>
        ) : katex ? (
          <span key={i} dangerouslySetInnerHTML={{
            __html: katex.renderToString(p.text, { displayMode: p.display, throwOnError: false }),
          }} />
        ) : (
          <code key={i}>{p.text}</code>
        ),
      )}
    </>
  );
}

/** Текст вопроса: первая строка — вопрос, остальное — блок кода (как на старом сайте). */
export function QuestionText({ text }: { text: string }) {
  const i = text.indexOf("\n");
  if (i < 0) return <p className="qtext"><Rich text={text} /></p>;
  return (
    <>
      <p className="qtext"><Rich text={text.slice(0, i)} /></p>
      <pre className="code">{text.slice(i + 1)}</pre>
    </>
  );
}
