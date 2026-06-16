import {
  createContext,
  useContext,
  useState,
  useCallback
} from "react";

import Toast from "../components/common/Toast";

const ToastContext =
  createContext(null);

export function ToastProvider({
  children
}) {

  const [toast, setToast] =
    useState("");

  const showToast =
    useCallback((message) => {

      setToast(message);

      setTimeout(() => {
        setToast("");
      }, 2500);

    }, []);

  return (
    <ToastContext.Provider
      value={{
        toast,
        showToast
      }}
    >
      {children}

      <Toast message={toast} />

    </ToastContext.Provider>
  );

}

export function useToastContext() {

  const context =
    useContext(ToastContext);

  if (!context) {
    throw new Error(
      "useToastContext must be used inside ToastProvider"
    );
  }

  return context;

}