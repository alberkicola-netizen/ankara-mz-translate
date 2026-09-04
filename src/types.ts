export type ReviewStatus = "starter" | "reviewed" | "frozen";

export type CategoryId =
  | "greeting"
  | "pain"
  | "breathing"
  | "bleeding"
  | "fetal"
  | "contractions"
  | "neonatal"
  | "pediatric"
  | "allergies"
  | "medications"
  | "orientation"
  | "emergency"
  | "vitals"
  | "feeding"
  | "staff";

export type Phrase = {
  id: string;
  category: CategoryId;
  tags: string[];
  pt: string;
  tr: string;
  en: string;
  reviewStatus: ReviewStatus;
  critical?: boolean;
};

export type Lang = "pt" | "tr" | "en";

/** Languages available inside a translation session (UI stays pt/tr/en). */
export type SessionLang = Lang | "fr" | "pt-BR" | "pt-PT" | "pt-AO";
