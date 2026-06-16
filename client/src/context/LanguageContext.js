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
    useState(
      localStorage.getItem("language") ||
      "en"
    );

  function changeLanguage(lang) {

    localStorage.setItem(
      "language",
      lang
    );

    setLanguage(lang);

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