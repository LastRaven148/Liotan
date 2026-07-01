import {
  createContext,
  useContext,
  useMemo,
  useState
} from "react";

import en from "../locales/en";
import ru from "../locales/ru";

const LanguageContext =
  createContext(null);

const dictionaries = {
  en,
  ru
};

export function LanguageProvider({
  children
}) {

  const [language, setLanguage] =
    useState(() => {
      const stored = localStorage.getItem("language");
      return stored === "ru" || stored === "en" ? stored : "en";
    });

  function changeLanguage(lang) {

    const nextLang =
      lang === "ru" || lang === "en"
        ? lang
        : "en";

    localStorage.setItem(
      "language",
      nextLang
    );

    setLanguage(nextLang);

  }

  const value =
    useMemo(() => {

      return {
        language,
        setLanguage: changeLanguage,
        t: dictionaries[language] || en
      };

    }, [
      language
    ]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );

}

export function useLanguage() {

  return useContext(LanguageContext);

}