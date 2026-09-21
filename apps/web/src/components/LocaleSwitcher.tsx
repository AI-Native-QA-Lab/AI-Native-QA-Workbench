import { translate, type UiLocale } from "../i18n.js";

export function LocaleSwitcher(props: { locale: UiLocale; onChange: (locale: UiLocale) => void }) {
  const nextLocale: UiLocale = props.locale === "en" ? "zh-CN" : "en";
  return (
    <button type="button" onClick={() => props.onChange(nextLocale)}>
      {translate(props.locale, nextLocale === "zh-CN" ? "chinese" : "english")}
    </button>
  );
}
