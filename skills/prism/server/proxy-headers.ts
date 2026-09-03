export function prismProxyResponseHeaders(headers: Headers): {
  ordinary: Array<[string, string]>;
  setCookies: string[];
} {
  const ordinary = [...headers].filter(
    ([name]) => !["content-length", "content-encoding", "set-cookie"].includes(name),
  );
  return { ordinary, setCookies: headers.getSetCookie() };
}
