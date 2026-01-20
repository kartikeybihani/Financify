let lastDeepLink: string | null = null;

export const setLastDeepLink = (url: string) => {
  lastDeepLink = url;
};

export const consumeLastDeepLink = () => {
  const url = lastDeepLink;
  lastDeepLink = null;
  return url;
};
