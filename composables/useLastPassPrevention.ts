export const useLastPassPrevention = () => {
  const lastPassAttributes = {
    autocomplete: "off",
    "data-lpignore": "true",
    "data-form-type": "other",
    "data-lastpass-ignore": "true",
    "data-1p-ignore": "true",
    autocorrect: "off",
    autocapitalize: "off",
    spellcheck: "false",
  };

  return {
    lastPassAttributes,
  };
};
