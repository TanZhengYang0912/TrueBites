// ISO 3166-1 alpha-2 -> flag emoji, via the regional indicator symbol trick:
// each letter maps to its Unicode "regional indicator" counterpart (A -> 🇦,
// B -> 🇧, ...) and a pair of them renders as that country's flag.
function flagEmoji(isoCode) {
  return [...isoCode.toUpperCase()]
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

// Country calling codes for the profile phone field's dropdown. Malaysia
// leads the list since that's this app's home market; the rest are sorted
// alphabetically by country name. Not the full ITU table (a few
// shared-code/rare territories are omitted), but broad enough to cover
// "all the different countries" a user would realistically pick from.
const RAW_COUNTRY_CODES = [
  { code: "MY", name: "Malaysia", dial: "+60" },
  { code: "AF", name: "Afghanistan", dial: "+93" },
  { code: "AL", name: "Albania", dial: "+355" },
  { code: "DZ", name: "Algeria", dial: "+213" },
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "AU", name: "Australia", dial: "+61" },
  { code: "AT", name: "Austria", dial: "+43" },
  { code: "BH", name: "Bahrain", dial: "+973" },
  { code: "BD", name: "Bangladesh", dial: "+880" },
  { code: "BE", name: "Belgium", dial: "+32" },
  { code: "BR", name: "Brazil", dial: "+55" },
  { code: "BN", name: "Brunei", dial: "+673" },
  { code: "KH", name: "Cambodia", dial: "+855" },
  { code: "CA", name: "Canada", dial: "+1" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "CN", name: "China", dial: "+86" },
  { code: "CO", name: "Colombia", dial: "+57" },
  { code: "HR", name: "Croatia", dial: "+385" },
  { code: "CZ", name: "Czech Republic", dial: "+420" },
  { code: "DK", name: "Denmark", dial: "+45" },
  { code: "EG", name: "Egypt", dial: "+20" },
  { code: "FI", name: "Finland", dial: "+358" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "GR", name: "Greece", dial: "+30" },
  { code: "HK", name: "Hong Kong", dial: "+852" },
  { code: "HU", name: "Hungary", dial: "+36" },
  { code: "IN", name: "India", dial: "+91" },
  { code: "ID", name: "Indonesia", dial: "+62" },
  { code: "IE", name: "Ireland", dial: "+353" },
  { code: "IL", name: "Israel", dial: "+972" },
  { code: "IT", name: "Italy", dial: "+39" },
  { code: "JP", name: "Japan", dial: "+81" },
  { code: "JO", name: "Jordan", dial: "+962" },
  { code: "KE", name: "Kenya", dial: "+254" },
  { code: "KW", name: "Kuwait", dial: "+965" },
  { code: "LA", name: "Laos", dial: "+856" },
  { code: "MO", name: "Macau", dial: "+853" },
  { code: "MX", name: "Mexico", dial: "+52" },
  { code: "MM", name: "Myanmar", dial: "+95" },
  { code: "NP", name: "Nepal", dial: "+977" },
  { code: "NL", name: "Netherlands", dial: "+31" },
  { code: "NZ", name: "New Zealand", dial: "+64" },
  { code: "NG", name: "Nigeria", dial: "+234" },
  { code: "NO", name: "Norway", dial: "+47" },
  { code: "OM", name: "Oman", dial: "+968" },
  { code: "PK", name: "Pakistan", dial: "+92" },
  { code: "PH", name: "Philippines", dial: "+63" },
  { code: "PL", name: "Poland", dial: "+48" },
  { code: "PT", name: "Portugal", dial: "+351" },
  { code: "QA", name: "Qatar", dial: "+974" },
  { code: "RO", name: "Romania", dial: "+40" },
  { code: "RU", name: "Russia", dial: "+7" },
  { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "RS", name: "Serbia", dial: "+381" },
  { code: "SG", name: "Singapore", dial: "+65" },
  { code: "ZA", name: "South Africa", dial: "+27" },
  { code: "KR", name: "South Korea", dial: "+82" },
  { code: "ES", name: "Spain", dial: "+34" },
  { code: "LK", name: "Sri Lanka", dial: "+94" },
  { code: "SE", name: "Sweden", dial: "+46" },
  { code: "CH", name: "Switzerland", dial: "+41" },
  { code: "TW", name: "Taiwan", dial: "+886" },
  { code: "TH", name: "Thailand", dial: "+66" },
  { code: "TR", name: "Turkey", dial: "+90" },
  { code: "AE", name: "United Arab Emirates", dial: "+971" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "US", name: "United States", dial: "+1" },
  { code: "VN", name: "Vietnam", dial: "+84" },
];

export const COUNTRY_CODES = RAW_COUNTRY_CODES.map((c) => ({ ...c, flag: flagEmoji(c.code) }));

export const DEFAULT_COUNTRY = COUNTRY_CODES[0]; // Malaysia

// Splits a stored "+60123456789"-style number into its dial code and the
// rest, for prefilling the dropdown + input when editing an existing phone.
// Longest-prefix match first (e.g. "+1" is a prefix of nothing else here,
// but this keeps multi-digit codes like "+673" from being mis-split by a
// shorter code that happens to also match).
export function splitStoredPhone(stored) {
  if (!stored) return { dial: DEFAULT_COUNTRY.dial, digits: "" };
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length);
  const match = sorted.find((c) => stored.startsWith(c.dial));
  if (!match) return { dial: DEFAULT_COUNTRY.dial, digits: stored.replace(/\D/g, "") };
  return { dial: match.dial, digits: stored.slice(match.dial.length).replace(/\D/g, "") };
}
