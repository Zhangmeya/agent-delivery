import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./public/locales/en/common.json";
import zhCnCommon from "./public/locales/zh-CN/common.json";

const storageEntries = new Map<string, string>();

function installStorageMock(target: Record<string, unknown>) {
  Object.defineProperty(target, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storageEntries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageEntries.set(key, String(value));
      },
      removeItem: (key: string) => {
        storageEntries.delete(key);
      },
      clear: () => {
        storageEntries.clear();
      },
    },
  });
}

if (
  typeof globalThis.localStorage?.getItem !== "function"
  || typeof globalThis.localStorage?.setItem !== "function"
  || typeof globalThis.localStorage?.removeItem !== "function"
  || typeof globalThis.localStorage?.clear !== "function"
) {
  installStorageMock(globalThis);
}

if (typeof window !== "undefined" && window.localStorage !== globalThis.localStorage) {
  installStorageMock(window as unknown as Record<string, unknown>);
}

if (!i18n.isInitialized) {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "zh-CN"],
    defaultNS: "common",
    ns: ["common"],
    keySeparator: false,
    nsSeparator: false,
    returnNull: false,
    interpolation: {
      escapeValue: false,
    },
    resources: {
      en: { common: enCommon },
      "zh-CN": { common: zhCnCommon },
    },
    react: {
      useSuspense: false,
    },
  });
}
