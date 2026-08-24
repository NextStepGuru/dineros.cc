export const LAST_PASS_ALLOW_ATTR = "data-lp-allow";
export const LAST_PASS_ALLOW_PAGE_ATTR = "data-lp-allow-page";
export const LAST_PASS_READONLY_ATTR = "data-lp-readonly";

export const LAST_PASS_ALLOW_PATHS = ["/login", "/signup"] as const;

export const LAST_PASS_PREVENTION_ATTRS: Record<string, string> = {
  autocomplete: "off",
  "data-lpignore": "true",
  "data-form-type": "other",
  "data-lastpass-ignore": "true",
  "data-1p-ignore": "true",
  autocorrect: "off",
  autocapitalize: "off",
  spellcheck: "false",
};

export const LAST_PASS_FORM_PREVENTION_ATTRS: Record<string, string> = {
  autocomplete: "off",
  "data-lpignore": "true",
  "data-form-type": "other",
  "data-lastpass-ignore": "true",
};

export function isLastPassAllowlistedPath(path: string): boolean {
  const normalized = path.replace(/\/+$/, "") || "/";
  return (LAST_PASS_ALLOW_PATHS as readonly string[]).includes(normalized);
}

export function isLastPassAllowlistedElement(el: Element): boolean {
  if (el.closest(`[${LAST_PASS_ALLOW_ATTR}]`)) {
    return true;
  }
  return document.documentElement.hasAttribute(LAST_PASS_ALLOW_PAGE_ATTR);
}

export const useLastPassPrevention = () => {
  return {
    lastPassAttributes: LAST_PASS_PREVENTION_ATTRS,
  };
};
