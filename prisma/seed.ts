import { PrismaClient } from "@prisma/client";
import { accounts } from "./backup/accounts";
import { accountRegisters } from "./backup/accountRegisters";
import { users } from "./backup/users";
import { userSocials } from "./backup/userSocials";
import { intervals } from "./backup/intervals";
import { accountTypes } from "./backup/accountTypes";
import { userAccounts } from "./backup/userAccounts";
import { budgets } from "./backup/budgets";
import { categories } from "./backup/categories";
import { reoccurrences } from "./backup/reoccurrences";
import { reoccurrenceSkips } from "./backup/reoccurrenceSkips";
import { registerEntry } from "./backup/registerEntry";
import HashService from "../server/services/HashService";
// Countries data
const countries = [
  { id: 4, name: "Afghanistan", code: "AF", code3: "AFG" },
  { id: 8, name: "Albania", code: "AL", code3: "ALB" },
  { id: 12, name: "Algeria", code: "DZ", code3: "DZA" },
  { id: 16, name: "American Samoa", code: "AS", code3: "ASM" },
  { id: 20, name: "Andorra", code: "AD", code3: "AND" },
  { id: 24, name: "Angola", code: "AO", code3: "AGO" },
  { id: 28, name: "Antigua and Barbuda", code: "AG", code3: "ATG" },
  { id: 32, name: "Argentina", code: "AR", code3: "ARG" },
  { id: 36, name: "Australia", code: "AU", code3: "AUS" },
  { id: 40, name: "Austria", code: "AT", code3: "AUT" },
  { id: 44, name: "Bahamas", code: "BS", code3: "BHS" },
  { id: 48, name: "Bahrain", code: "BH", code3: "BHR" },
  { id: 50, name: "Bangladesh", code: "BD", code3: "BGD" },
  { id: 52, name: "Barbados", code: "BB", code3: "BRB" },
  { id: 56, name: "Belgium", code: "BE", code3: "BEL" },
  { id: 60, name: "Bermuda", code: "BM", code3: "BMU" },
  { id: 64, name: "Bhutan", code: "BT", code3: "BTN" },
  { id: 68, name: "Bolivia", code: "BO", code3: "BOL" },
  { id: 70, name: "Bosnia and Herzegovina", code: "BA", code3: "BIH" },
  { id: 72, name: "Botswana", code: "BW", code3: "BWA" },
  { id: 76, name: "Brazil", code: "BR", code3: "BRA" },
  { id: 84, name: "Belize", code: "BZ", code3: "BLZ" },
  { id: 96, name: "Brunei", code: "BN", code3: "BRN" },
  { id: 100, name: "Bulgaria", code: "BG", code3: "BGR" },
  { id: 104, name: "Myanmar", code: "MM", code3: "MMR" },
  { id: 108, name: "Burundi", code: "BI", code3: "BDI" },
  { id: 112, name: "Belarus", code: "BY", code3: "BLR" },
  { id: 116, name: "Cambodia", code: "KH", code3: "KHM" },
  { id: 120, name: "Cameroon", code: "CM", code3: "CMR" },
  { id: 124, name: "Canada", code: "CA", code3: "CAN" },
  { id: 132, name: "Cape Verde", code: "CV", code3: "CPV" },
  { id: 136, name: "Cayman Islands", code: "KY", code3: "CYM" },
  { id: 140, name: "Central African Republic", code: "CF", code3: "CAF" },
  { id: 144, name: "Sri Lanka", code: "LK", code3: "LKA" },
  { id: 148, name: "Chad", code: "TD", code3: "TCD" },
  { id: 152, name: "Chile", code: "CL", code3: "CHL" },
  { id: 156, name: "China", code: "CN", code3: "CHN" },
  { id: 170, name: "Colombia", code: "CO", code3: "COL" },
  { id: 174, name: "Comoros", code: "KM", code3: "COM" },
  { id: 178, name: "Congo", code: "CG", code3: "COG" },
  {
    id: 180,
    name: "Democratic Republic of the Congo",
    code: "CD",
    code3: "COD",
  },
  { id: 184, name: "Cook Islands", code: "CK", code3: "COK" },
  { id: 188, name: "Costa Rica", code: "CR", code3: "CRI" },
  { id: 191, name: "Croatia", code: "HR", code3: "HRV" },
  { id: 192, name: "Cuba", code: "CU", code3: "CUB" },
  { id: 196, name: "Cyprus", code: "CY", code3: "CYP" },
  { id: 203, name: "Czech Republic", code: "CZ", code3: "CZE" },
  { id: 204, name: "Benin", code: "BJ", code3: "BEN" },
  { id: 208, name: "Denmark", code: "DK", code3: "DNK" },
  { id: 212, name: "Dominica", code: "DM", code3: "DMA" },
  { id: 214, name: "Dominican Republic", code: "DO", code3: "DOM" },
  { id: 218, name: "Ecuador", code: "EC", code3: "ECU" },
  { id: 222, name: "El Salvador", code: "SV", code3: "SLV" },
  { id: 226, name: "Equatorial Guinea", code: "GQ", code3: "GNQ" },
  { id: 231, name: "Ethiopia", code: "ET", code3: "ETH" },
  { id: 232, name: "Eritrea", code: "ER", code3: "ERI" },
  { id: 233, name: "Estonia", code: "EE", code3: "EST" },
  { id: 234, name: "Faroe Islands", code: "FO", code3: "FRO" },
  { id: 238, name: "Falkland Islands", code: "FK", code3: "FLK" },
  { id: 242, name: "Fiji", code: "FJ", code3: "FJI" },
  { id: 246, name: "Finland", code: "FI", code3: "FIN" },
  { id: 250, name: "France", code: "FR", code3: "FRA" },
  { id: 254, name: "French Guiana", code: "GF", code3: "GUF" },
  { id: 258, name: "French Polynesia", code: "PF", code3: "PYF" },
  { id: 262, name: "Djibouti", code: "DJ", code3: "DJI" },
  { id: 266, name: "Gabon", code: "GA", code3: "GAB" },
  { id: 268, name: "Georgia", code: "GE", code3: "GEO" },
  { id: 270, name: "Gambia", code: "GM", code3: "GMB" },
  { id: 276, name: "Germany", code: "DE", code3: "DEU" },
  { id: 288, name: "Ghana", code: "GH", code3: "GHA" },
  { id: 292, name: "Gibraltar", code: "GI", code3: "GIB" },
  { id: 296, name: "Kiribati", code: "KI", code3: "KIR" },
  { id: 300, name: "Greece", code: "GR", code3: "GRC" },
  { id: 304, name: "Greenland", code: "GL", code3: "GRL" },
  { id: 308, name: "Grenada", code: "GD", code3: "GRD" },
  { id: 312, name: "Guadeloupe", code: "GP", code3: "GLP" },
  { id: 316, name: "Guam", code: "GU", code3: "GUM" },
  { id: 320, name: "Guatemala", code: "GT", code3: "GTM" },
  { id: 324, name: "Guinea", code: "GN", code3: "GIN" },
  { id: 328, name: "Guyana", code: "GY", code3: "GUY" },
  { id: 332, name: "Haiti", code: "HT", code3: "HTI" },
  { id: 336, name: "Vatican City", code: "VA", code3: "VAT" },
  { id: 340, name: "Honduras", code: "HN", code3: "HND" },
  { id: 344, name: "Hong Kong", code: "HK", code3: "HKG" },
  { id: 348, name: "Hungary", code: "HU", code3: "HUN" },
  { id: 352, name: "Iceland", code: "IS", code3: "ISL" },
  { id: 356, name: "India", code: "IN", code3: "IND" },
  { id: 360, name: "Indonesia", code: "ID", code3: "IDN" },
  { id: 364, name: "Iran", code: "IR", code3: "IRN" },
  { id: 368, name: "Iraq", code: "IQ", code3: "IRQ" },
  { id: 372, name: "Ireland", code: "IE", code3: "IRL" },
  { id: 376, name: "Israel", code: "IL", code3: "ISR" },
  { id: 380, name: "Italy", code: "IT", code3: "ITA" },
  { id: 384, name: "Ivory Coast", code: "CI", code3: "CIV" },
  { id: 388, name: "Jamaica", code: "JM", code3: "JAM" },
  { id: 392, name: "Japan", code: "JP", code3: "JPN" },
  { id: 398, name: "Kazakhstan", code: "KZ", code3: "KAZ" },
  { id: 400, name: "Jordan", code: "JO", code3: "JOR" },
  { id: 404, name: "Kenya", code: "KE", code3: "KEN" },
  { id: 408, name: "North Korea", code: "KP", code3: "PRK" },
  { id: 410, name: "South Korea", code: "KR", code3: "KOR" },
  { id: 414, name: "Kuwait", code: "KW", code3: "KWT" },
  { id: 417, name: "Kyrgyzstan", code: "KG", code3: "KGZ" },
  { id: 418, name: "Laos", code: "LA", code3: "LAO" },
  { id: 422, name: "Lebanon", code: "LB", code3: "LBN" },
  { id: 426, name: "Lesotho", code: "LS", code3: "LSO" },
  { id: 428, name: "Latvia", code: "LV", code3: "LVA" },
  { id: 430, name: "Liberia", code: "LR", code3: "LBR" },
  { id: 434, name: "Libya", code: "LY", code3: "LBY" },
  { id: 438, name: "Liechtenstein", code: "LI", code3: "LIE" },
  { id: 440, name: "Lithuania", code: "LT", code3: "LTU" },
  { id: 442, name: "Luxembourg", code: "LU", code3: "LUX" },
  { id: 446, name: "Macao", code: "MO", code3: "MAC" },
  { id: 450, name: "Madagascar", code: "MG", code3: "MDG" },
  { id: 454, name: "Malawi", code: "MW", code3: "MWI" },
  { id: 458, name: "Malaysia", code: "MY", code3: "MYS" },
  { id: 462, name: "Maldives", code: "MV", code3: "MDV" },
  { id: 466, name: "Mali", code: "ML", code3: "MLI" },
  { id: 470, name: "Malta", code: "MT", code3: "MLT" },
  { id: 474, name: "Martinique", code: "MQ", code3: "MTQ" },
  { id: 478, name: "Mauritania", code: "MR", code3: "MRT" },
  { id: 480, name: "Mauritius", code: "MU", code3: "MUS" },
  { id: 484, name: "Mexico", code: "MX", code3: "MEX" },
  { id: 492, name: "Monaco", code: "MC", code3: "MCO" },
  { id: 496, name: "Mongolia", code: "MN", code3: "MNG" },
  { id: 498, name: "Moldova", code: "MD", code3: "MDA" },
  { id: 499, name: "Montenegro", code: "ME", code3: "MNE" },
  { id: 500, name: "Montserrat", code: "MS", code3: "MSR" },
  { id: 504, name: "Morocco", code: "MA", code3: "MAR" },
  { id: 508, name: "Mozambique", code: "MZ", code3: "MOZ" },
  { id: 512, name: "Oman", code: "OM", code3: "OMN" },
  { id: 516, name: "Namibia", code: "NA", code3: "NAM" },
  { id: 520, name: "Nauru", code: "NR", code3: "NRU" },
  { id: 524, name: "Nepal", code: "NP", code3: "NPL" },
  { id: 528, name: "Netherlands", code: "NL", code3: "NLD" },
  { id: 540, name: "New Caledonia", code: "NC", code3: "NCL" },
  { id: 548, name: "Vanuatu", code: "VU", code3: "VUT" },
  { id: 554, name: "New Zealand", code: "NZ", code3: "NZL" },
  { id: 558, name: "Nicaragua", code: "NI", code3: "NIC" },
  { id: 562, name: "Niger", code: "NE", code3: "NER" },
  { id: 566, name: "Nigeria", code: "NG", code3: "NGA" },
  { id: 570, name: "Niue", code: "NU", code3: "NIU" },
  { id: 574, name: "Norfolk Island", code: "NF", code3: "NFK" },
  { id: 578, name: "Norway", code: "NO", code3: "NOR" },
  { id: 580, name: "Northern Mariana Islands", code: "MP", code3: "MNP" },
  { id: 583, name: "Micronesia", code: "FM", code3: "FSM" },
  { id: 584, name: "Marshall Islands", code: "MH", code3: "MHL" },
  { id: 585, name: "Palau", code: "PW", code3: "PLW" },
  { id: 586, name: "Pakistan", code: "PK", code3: "PAK" },
  { id: 591, name: "Panama", code: "PA", code3: "PAN" },
  { id: 598, name: "Papua New Guinea", code: "PG", code3: "PNG" },
  { id: 600, name: "Paraguay", code: "PY", code3: "PRY" },
  { id: 604, name: "Peru", code: "PE", code3: "PER" },
  { id: 608, name: "Philippines", code: "PH", code3: "PHL" },
  { id: 612, name: "Pitcairn Islands", code: "PN", code3: "PCN" },
  { id: 616, name: "Poland", code: "PL", code3: "POL" },
  { id: 620, name: "Portugal", code: "PT", code3: "PRT" },
  { id: 624, name: "Guinea-Bissau", code: "GW", code3: "GNB" },
  { id: 626, name: "Timor-Leste", code: "TL", code3: "TLS" },
  { id: 630, name: "Puerto Rico", code: "PR", code3: "PRI" },
  { id: 634, name: "Qatar", code: "QA", code3: "QAT" },
  { id: 638, name: "Réunion", code: "RE", code3: "REU" },
  { id: 642, name: "Romania", code: "RO", code3: "ROU" },
  { id: 643, name: "Russia", code: "RU", code3: "RUS" },
  { id: 646, name: "Rwanda", code: "RW", code3: "RWA" },
  { id: 652, name: "Saint Barthélemy", code: "BL", code3: "BLM" },
  { id: 654, name: "Saint Helena", code: "SH", code3: "SHN" },
  { id: 659, name: "Saint Kitts and Nevis", code: "KN", code3: "KNA" },
  { id: 660, name: "Anguilla", code: "AI", code3: "AIA" },
  { id: 662, name: "Saint Lucia", code: "LC", code3: "LCA" },
  { id: 663, name: "Saint Martin", code: "MF", code3: "MAF" },
  { id: 666, name: "Saint Pierre and Miquelon", code: "PM", code3: "SPM" },
  {
    id: 670,
    name: "Saint Vincent and the Grenadines",
    code: "VC",
    code3: "VCT",
  },
  { id: 674, name: "San Marino", code: "SM", code3: "SMR" },
  { id: 678, name: "São Tomé and Príncipe", code: "ST", code3: "STP" },
  { id: 682, name: "Saudi Arabia", code: "SA", code3: "SAU" },
  { id: 686, name: "Senegal", code: "SN", code3: "SEN" },
  { id: 688, name: "Serbia", code: "RS", code3: "SRB" },
  { id: 690, name: "Seychelles", code: "SC", code3: "SYC" },
  { id: 694, name: "Sierra Leone", code: "SL", code3: "SLE" },
  { id: 702, name: "Singapore", code: "SG", code3: "SGP" },
  { id: 703, name: "Slovakia", code: "SK", code3: "SVK" },
  { id: 704, name: "Vietnam", code: "VN", code3: "VNM" },
  { id: 705, name: "Slovenia", code: "SI", code3: "SVN" },
  { id: 706, name: "Somalia", code: "SO", code3: "SOM" },
  { id: 710, name: "South Africa", code: "ZA", code3: "ZAF" },
  { id: 716, name: "Zimbabwe", code: "ZW", code3: "ZWE" },
  { id: 724, name: "Spain", code: "ES", code3: "ESP" },
  { id: 728, name: "South Sudan", code: "SS", code3: "SSD" },
  { id: 729, name: "Sudan", code: "SD", code3: "SDN" },
  { id: 732, name: "Western Sahara", code: "EH", code3: "ESH" },
  { id: 740, name: "Suriname", code: "SR", code3: "SUR" },
  { id: 744, name: "Svalbard and Jan Mayen", code: "SJ", code3: "SJM" },
  { id: 748, name: "Eswatini", code: "SZ", code3: "SWZ" },
  { id: 752, name: "Sweden", code: "SE", code3: "SWE" },
  { id: 756, name: "Switzerland", code: "CH", code3: "CHE" },
  { id: 760, name: "Syria", code: "SY", code3: "SYR" },
  { id: 762, name: "Tajikistan", code: "TJ", code3: "TJK" },
  { id: 764, name: "Thailand", code: "TH", code3: "THA" },
  { id: 768, name: "Togo", code: "TG", code3: "TGO" },
  { id: 772, name: "Tokelau", code: "TK", code3: "TKL" },
  { id: 776, name: "Tonga", code: "TO", code3: "TON" },
  { id: 780, name: "Trinidad and Tobago", code: "TT", code3: "TTO" },
  { id: 784, name: "United Arab Emirates", code: "AE", code3: "ARE" },
  { id: 788, name: "Tunisia", code: "TN", code3: "TUN" },
  { id: 792, name: "Turkey", code: "TR", code3: "TUR" },
  { id: 795, name: "Turkmenistan", code: "TM", code3: "TKM" },
  { id: 796, name: "Turks and Caicos Islands", code: "TC", code3: "TCA" },
  { id: 798, name: "Tuvalu", code: "TV", code3: "TUV" },
  { id: 800, name: "Uganda", code: "UG", code3: "UGA" },
  { id: 804, name: "Ukraine", code: "UA", code3: "UKR" },
  { id: 807, name: "North Macedonia", code: "MK", code3: "MKD" },
  { id: 818, name: "Egypt", code: "EG", code3: "EGY" },
  { id: 826, name: "United Kingdom", code: "GB", code3: "GBR" },
  { id: 831, name: "Guernsey", code: "GG", code3: "GGY" },
  { id: 832, name: "Jersey", code: "JE", code3: "JEY" },
  { id: 833, name: "Isle of Man", code: "IM", code3: "IMN" },
  { id: 834, name: "Tanzania", code: "TZ", code3: "TZA" },
  { id: 840, name: "United States", code: "US", code3: "USA" },
  { id: 850, name: "US Virgin Islands", code: "VI", code3: "VIR" },
  { id: 854, name: "Burkina Faso", code: "BF", code3: "BFA" },
  { id: 858, name: "Uruguay", code: "UY", code3: "URY" },
  { id: 860, name: "Uzbekistan", code: "UZ", code3: "UZB" },
  { id: 862, name: "Venezuela", code: "VE", code3: "VEN" },
  { id: 876, name: "Wallis and Futuna", code: "WF", code3: "WLF" },
  { id: 882, name: "Samoa", code: "WS", code3: "WSM" },
  { id: 887, name: "Yemen", code: "YE", code3: "YEM" },
  { id: 894, name: "Zambia", code: "ZM", code3: "ZMB" },
];

import { fieldEncryptionExtension } from "prisma-field-encryption";
import dotenv from "dotenv";
dotenv.config();

export const prisma = new PrismaClient().$extends(
  fieldEncryptionExtension({
    encryptionKey: process.env.DB_ENCRYPTION_KEY,
    decryptionKeys: process.env.DB_DECRYPTION_KEYS?.split(",") || [],
  })
);

async function main() {
  console.log("start");

  // Seed countries first
  console.log("🌍 Seeding countries...");
  await prisma.country.createMany({
    data: countries,
    skipDuplicates: true,
  });
  console.log(`✅ Seeded ${countries.length} countries`);

  await prisma.account.createMany({
    data: accounts,
  });

  await prisma.user.createMany({
    data: users,
  });

  await prisma.userAccount.createMany({
    data: userAccounts,
  });

  await prisma.userSocial.createMany({
    data: userSocials,
  });

  await prisma.accountType.createMany({
    data: accountTypes,
  });

  await prisma.interval.createMany({
    data: intervals,
  });

  await prisma.budget.createMany({
    data: budgets,
  });

  await prisma.accountRegister.createMany({
    data: accountRegisters,
  });

  await prisma.reoccurrence.createMany({
    data: reoccurrences,
  });

  await prisma.reoccurrenceSkip.createMany({
    data: reoccurrenceSkips,
  });

  await prisma.registerEntry.createMany({
    data: registerEntry,
  });

  await prisma.category.createMany({
    data: categories,
  });

  // await prisma.registerEntry.updateMany({
  //   data: {
  //     plaidId: null,
  //     plaidIdHash: null,
  //   },
  // });

  // await prisma.accountRegister.updateMany({
  //   data: {
  //     plaidId: null,
  //     plaidIdHash: null,
  //     plaidAccessToken: null,
  //     plaidAccessTokenHash: null,
  //     plaidLastSyncAt: null,
  //   },
  // });

  const hashService = new HashService();

  await prisma.user.updateMany({
    data: {
      password: await hashService.hash("Carter$1Noah$1"),
      config: {},
      settings: {},
    },
  });
}

main()
  .catch((e) => {
    console.log("HERE");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    console.log("Finally");
    await prisma.$disconnect();
  });
