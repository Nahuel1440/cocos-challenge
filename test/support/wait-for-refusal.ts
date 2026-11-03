const POLL_INTERVAL_MS = 25;

export const waitForRefusal = async (
  url: string,
  limitMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    const answered = await fetch(url).then(
      () => true,
      () => false,
    );
    if (!answered) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
};
