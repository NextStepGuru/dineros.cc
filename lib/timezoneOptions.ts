export type TimezoneOption = {
  label: string;
  value: number;
  /** Short display name (e.g. for summaries). */
  name: string;
  countries: number[];
};

/**
 * Timezone presets mapped to UN M.49 numeric country ids (same as `/api/countries`).
 * Used by profile edit and admin user editing; keep a single source of truth here.
 */
export const ALL_TIMEZONE_OPTIONS: readonly TimezoneOption[] = [
  {
    label: "Pacific Time (PST/PDT) - UTC-8/-7",
    value: -480,
    name: "PST/PDT",
    countries: [840], // United States
  },
  {
    label: "Mountain Time (MST/MDT) - UTC-7/-6",
    value: -420,
    name: "MST/MDT",
    countries: [840, 124], // United States, Canada
  },
  {
    label: "Central Time (CST/CDT) - UTC-6/-5",
    value: -360,
    name: "CST/CDT",
    countries: [840, 124, 484], // United States, Canada, Mexico
  },
  {
    label: "Eastern Time (EST/EDT) - UTC-5/-4",
    value: -300,
    name: "EST/EDT",
    countries: [840, 124], // United States, Canada
  },
  {
    label: "Atlantic Time (AST/ADT) - UTC-4/-3",
    value: -240,
    name: "AST/ADT",
    countries: [124, 52, 212, 308], // Canada, Barbados, Dominica, Grenada
  },
  {
    label: "Newfoundland Time (NST/NDT) - UTC-3.5/-2.5",
    value: -210,
    name: "NST/NDT",
    countries: [124], // Canada
  },
  {
    label: "Argentina Time (ART) - UTC-3",
    value: -180,
    name: "ART",
    countries: [32, 76, 858], // Argentina, Brazil, Uruguay
  },
  {
    label: "UTC - UTC+0",
    value: 0,
    name: "UTC",
    countries: [826, 372, 620, 288, 694], // United Kingdom, Ireland, Portugal, Ghana, Sierra Leone
  },
  {
    label: "Central European Time (CET/CEST) - UTC+1/+2",
    value: 60,
    name: "CET/CEST",
    countries: [
      276, 250, 380, 724, 528, 56, 756, 40, 348, 616, 203, 703, 705, 191, 688,
      499, 807, 70, 100, 438, 442, 470, 674, 336,
    ], // Germany, France, Italy, Spain, Netherlands, Belgium, Switzerland, Austria, Hungary, Poland, Czech Republic, Slovakia, Slovenia, Croatia, Serbia, Montenegro, North Macedonia, Bosnia and Herzegovina, Bulgaria, Liechtenstein, Luxembourg, Malta, San Marino, Vatican City
  },
  {
    label: "Eastern European Time (EET/EEST) - UTC+2/+3",
    value: 120,
    name: "EET/EEST",
    countries: [300, 246, 233, 428, 440, 642, 804, 112, 818], // Greece, Finland, Estonia, Latvia, Lithuania, Romania, Ukraine, Belarus, Egypt
  },
  {
    label: "Moscow Time (MSK) - UTC+3",
    value: 180,
    name: "MSK",
    countries: [643, 762], // Russia, Tajikistan
  },
  {
    label: "Gulf Standard Time (GST) - UTC+4",
    value: 240,
    name: "GST",
    countries: [784, 512, 414, 634], // United Arab Emirates, Oman, Kuwait, Qatar
  },
  {
    label: "Pakistan Standard Time (PKT) - UTC+5",
    value: 300,
    name: "PKT",
    countries: [586, 356, 398, 860, 417], // Pakistan, India, Kazakhstan, Uzbekistan, Kyrgyzstan
  },
  {
    label: "Bangladesh Standard Time (BST) - UTC+6",
    value: 360,
    name: "BST",
    countries: [50], // Bangladesh
  },
  {
    label: "Indochina Time (ICT) - UTC+7",
    value: 420,
    name: "ICT",
    countries: [764, 704, 418, 116], // Thailand, Vietnam, Laos, Cambodia
  },
  {
    label: "China Standard Time (CST) - UTC+8",
    value: 480,
    name: "CST",
    countries: [156, 458, 702, 608, 96, 344], // China, Malaysia, Singapore, Philippines, Brunei, Hong Kong
  },
  {
    label: "Japan Standard Time (JST) - UTC+9",
    value: 540,
    name: "JST",
    countries: [392, 410], // Japan, South Korea
  },
  {
    label: "Australian Eastern Time (AEST/AEDT) - UTC+10/+11",
    value: 600,
    name: "AEST/AEDT",
    countries: [36], // Australia
  },
  {
    label: "New Zealand Time (NZST/NZDT) - UTC+12/+13",
    value: 720,
    name: "NZST/NZDT",
    countries: [554], // New Zealand
  },
];
