import type { ExpenseCategory } from "@shared/types";
import type { ProviderTransaction } from "./types";

// Keyword → category rules. First match wins; order matters (more specific
// first). Matched case-insensitively against " merchant description rawCategory "
// (wrapped in spaces). Short/ambiguous keywords are padded with spaces so they
// match whole words only (e.g. " ee " matches the EE network but not "coffee").
const RULES: { category: ExpenseCategory; keywords: string[] }[] = [
  {
    category: "groceries",
    keywords: [
      "tesco",
      "sainsbury",
      "asda",
      "aldi",
      "lidl",
      "waitrose",
      "morrison",
      "co-op",
      "co op",
      "iceland",
      "ocado",
      "grocery",
      "groceries",
      "supermarket",
    ],
  },
  {
    category: "transport",
    keywords: [
      "uber",
      " bolt ",
      " tfl ",
      "transport for london",
      "trainline",
      "national rail",
      "railway",
      " rail ",
      "shell",
      " bp ",
      " esso ",
      "petrol",
      "fuel",
      "parking",
      " ncp ",
      " bus ",
      "taxi",
      "car park",
    ],
  },
  {
    category: "utilities",
    keywords: [
      "octopus energy",
      "british gas",
      " edf",
      "e.on",
      " eon ",
      " ovo ",
      "scottish power",
      "thames water",
      " water ",
      "vodafone",
      " ee ",
      " o2 ",
      " three ",
      " sky ",
      "virgin media",
      "broadband",
      "internet",
      " mobile",
      "electric",
      "utilit",
    ],
  },
  {
    category: "housing",
    keywords: [
      "rent",
      "mortgage",
      "council tax",
      "landlord",
      "letting",
      "service charge",
    ],
  },
  {
    category: "health",
    keywords: [
      "pharmacy",
      "boots",
      "superdrug",
      " nhs",
      "dental",
      "dentist",
      "optician",
      "specsavers",
      "doctor",
      "clinic",
      "hospital",
    ],
  },
  {
    category: "school",
    keywords: [
      "school",
      "nursery",
      "tuition",
      "college",
      "university",
      " pta ",
      "uniform",
    ],
  },
  {
    category: "leisure",
    keywords: [
      "netflix",
      "spotify",
      "disney",
      "amazon prime",
      "cinema",
      "odeon",
      " vue ",
      "restaurant",
      " pub ",
      " bar ",
      "cafe",
      "coffee",
      "costa",
      "starbucks",
      "greggs",
      "mcdonald",
      "kfc",
      "nando",
      "deliveroo",
      "just eat",
      " gym ",
      "leisure",
      "entertainment",
      "hotel",
      "airbnb",
    ],
  },
];

/** Best-effort auto-category for a bank transaction. */
export function categorize(tx: ProviderTransaction): ExpenseCategory {
  // Income and internal transfers aren't spending categories.
  if (tx.direction === "credit") return "other";

  const haystack =
    ` ${tx.merchant ?? ""} ${tx.description} ${tx.rawCategory ?? ""} `.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => haystack.includes(k))) {
      return rule.category;
    }
  }
  return "other";
}
