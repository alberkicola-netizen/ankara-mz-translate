import { createContext, useContext } from "react";
import type { Lang } from "../types";

export const UiLangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
}>({ lang: "en", setLang: () => {} });

export function useUiLang() {
  return useContext(UiLangContext);
}
