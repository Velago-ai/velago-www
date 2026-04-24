import type { UserProfile } from "./api-auth";

type RequiredField =
  | "email"
  | "first_name"
  | "last_name"
  | "phone"
  | "address"
  | "city"
  | "postcode"
  | "country";

const LABELS: Record<RequiredField, string> = {
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone",
  address: "Street",
  city: "City",
  postcode: "Postcode",
  country: "Country",
};

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function defaultAddress(profile: UserProfile | null | undefined): Record<string, unknown> {
  const saved = (profile?.saved_addresses ?? {}) as Record<string, unknown>;
  return (saved.default ?? {}) as Record<string, unknown>;
}

function normalizedPlan(profile: UserProfile | null | undefined): string {
  return asTrimmed(profile?.plan).toLowerCase();
}

export function isFreePlan(profile: UserProfile | null | undefined): boolean {
  return normalizedPlan(profile) === "free";
}

export function isProPlan(profile: UserProfile | null | undefined): boolean {
  return normalizedPlan(profile) === "pro";
}

export function getMissingProFields(profile: UserProfile | null | undefined): RequiredField[] {
  const addr = defaultAddress(profile);
  const required: Record<RequiredField, string> = {
    email: asTrimmed(profile?.email),
    first_name: asTrimmed(profile?.first_name ?? profile?.given_name),
    last_name: asTrimmed(profile?.last_name ?? profile?.family_name),
    phone: asTrimmed(profile?.phone ?? profile?.phone_number),
    address: asTrimmed(addr.address),
    city: asTrimmed(addr.city),
    postcode: asTrimmed(addr.postcode),
    country: asTrimmed(addr.country),
  };

  return (Object.keys(required) as RequiredField[]).filter((key) => !required[key]);
}

export function getMissingProFieldLabels(profile: UserProfile | null | undefined): string[] {
  return getMissingProFields(profile).map((key) => LABELS[key]);
}

export function isProProfileComplete(profile: UserProfile | null | undefined): boolean {
  return getMissingProFields(profile).length === 0;
}

