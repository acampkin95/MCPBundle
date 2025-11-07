export const shellQuote = (value: string): string => {
  const safe = value.replace(/'/g, "'\"'\"'");
  return `'${safe}'`;
};

export const buildCommand = (parts: string[]): string => parts.join(" ");
