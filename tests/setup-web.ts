if (typeof window !== "undefined" && !window.localStorage) {
  let values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
      clear: () => {
        values = new Map<string, string>();
      },
    } as unknown as Storage,
  });
}
